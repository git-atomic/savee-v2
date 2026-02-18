#!/usr/bin/env python
"""
Migration script to fix mis-typed sources that should be "blocks".

It catches old rows that were created as "home" or "user", plus bulk placeholder
rows like "bulk_import_*", then updates them to source_type="blocks".
"""
import asyncio
import argparse
import sys
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import update, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.models.sources import Source, SourceTypeEnum


async def find_sources_to_fix(session: AsyncSession) -> List[Dict[str, Any]]:
    """
    Find sources that should be blocks type but are currently mis-typed.
    
    Criteria:
    - source_type is 'home' or 'user'
    - and source URL/username clearly indicates blocks-style source:
      - source URL contains '/i/'
      - source URL contains bulk_import_
      - source username is bulk_import_*
    
    Returns list of dicts with source info.
    """
    query = text("""
        SELECT
            s.id,
            s.url,
            s.username,
            s.source_type,
            COALESCE((
                SELECT COUNT(*)
                FROM blocks b
                WHERE b.source_id = s.id
                  AND b.url LIKE '%/i/%'
            ), 0) AS block_count
        FROM sources s
        WHERE s.source_type IN ('home', 'user')
          AND (
            LOWER(COALESCE(s.url, '')) LIKE '%/i/%'
            OR LOWER(COALESCE(s.url, '')) LIKE '%bulk_import_%'
            OR LOWER(COALESCE(s.username, '')) LIKE 'bulk_import_%'
          )
        ORDER BY s.id
    """)
    
    result = await session.execute(query)
    rows = result.fetchall()
    
    sources = []
    for row in rows:
        sources.append({
            'id': row[0],
            'url': row[1],
            'username': row[2],
            'source_type': row[3],
            'block_count': row[4]
        })
    
    return sources


async def get_block_urls_for_source(session: AsyncSession, source_id: int) -> List[str]:
    """Get all /i/ URLs from blocks for a given source."""
    query = text("""
        SELECT DISTINCT url
        FROM blocks
        WHERE source_id = :source_id
        AND url LIKE '%/i/%'
        ORDER BY url
        LIMIT 50
    """)
    
    result = await session.execute(query, {'source_id': source_id})
    rows = result.fetchall()
    return [row[0] for row in rows if row[0]]


async def update_source_to_blocks(
    session: AsyncSession,
    source_id: int,
    current_url: str,
    current_type: str,
    current_username: str | None,
    dry_run: bool = False
) -> bool:
    """
    Update a source to blocks type.
    
    If the current URL doesn't look like a bulk_import_ placeholder,
    generate a new one based on timestamp and source_id to ensure uniqueness.
    """
    # Check if URL already looks like a bulk import placeholder
    needs_url_update = 'bulk_import_' not in current_url.lower()
    
    if needs_url_update:
        # Generate a unique placeholder URL using timestamp and source_id
        timestamp = int(datetime.now().timestamp())
        new_url = f"https://savee.com/bulk_import_{timestamp}_{source_id}"
    else:
        new_url = current_url
    
    if dry_run:
        print(f"  [DRY RUN] Would update source {source_id}:")
        print(f"    - source_type: '{current_type}' -> 'blocks'")
        if current_username:
            print(f"    - username: '{current_username}' -> null")
        if needs_url_update:
            print(f"    - url: '{current_url}' -> '{new_url}'")
        else:
            print(f"    - url: '{current_url}' (no change needed)")
        if current_username and current_username.lower().startswith("bulk_import_"):
            print(f"    - would delete stale savee_users row: '{current_username}'")
        return True
    
    # Update the source
    stmt = (
        update(Source)
        .where(Source.id == source_id)
        .values(
            source_type=SourceTypeEnum.blocks,
            username=None,
            url=new_url
        )
    )
    
    await session.execute(stmt)

    if current_username and current_username.lower().startswith("bulk_import_"):
        await session.execute(
            text("DELETE FROM savee_users WHERE username = :username"),
            {"username": current_username},
        )

    await session.commit()
    
    print(f"  [OK] Updated source {source_id}:")
    print(f"    - source_type: '{current_type}' -> 'blocks'")
    if current_username:
        print(f"    - username: '{current_username}' -> null")
    if needs_url_update:
        print(f"    - url: '{current_url}' -> '{new_url}'")
    if current_username and current_username.lower().startswith("bulk_import_"):
        print(f"    - deleted stale savee_users row for username '{current_username}'")
    
    return True


async def main(dry_run: bool = False):
    """Main migration function."""
    print("=" * 60)
    print("Fix Blocks Type Migration Script")
    print("=" * 60)
    print()
    
    if dry_run:
        print("[DRY RUN MODE] - No changes will be made")
        print()
    
    # Create database connection
    engine = create_async_engine(
        settings.async_database_url,
        connect_args=settings.asyncpg_connect_args
    )
    Session = async_sessionmaker(engine, expire_on_commit=False)
    
    try:
        async with Session() as session:
            # Find sources that need fixing
            print("Searching for sources that need type correction...")
            sources_to_fix = await find_sources_to_fix(session)
            
            if not sources_to_fix:
                print("[OK] No sources found that need fixing.")
                return 0
            
            print(f"Found {len(sources_to_fix)} source(s) that need fixing:")
            print()
            
            # Process each source
            updated_count = 0
            for source in sources_to_fix:
                source_id = source['id']
                current_url = source['url']
                current_username = source.get('username')
                current_type = source['source_type']
                block_count = source['block_count']
                
                print(f"Source ID: {source_id}")
                print(f"  Current type: {current_type}")
                print(f"  Current URL: {current_url}")
                if current_username:
                    print(f"  Current username: {current_username}")
                print(f"  Blocks with /i/ URLs: {block_count}")
                
                # Show sample URLs
                block_urls = await get_block_urls_for_source(session, source_id)
                if block_urls:
                    print(f"  Sample URLs:")
                    for url in block_urls[:3]:
                        print(f"    - {url}")
                    if len(block_urls) > 3:
                        print(f"    ... and {len(block_urls) - 3} more")
                
                # Update the source
                success = await update_source_to_blocks(
                    session,
                    source_id,
                    current_url,
                    current_type,
                    current_username,
                    dry_run=dry_run
                )
                
                if success:
                    updated_count += 1
                
                print()
            
            print("=" * 60)
            if dry_run:
                print(f"DRY RUN: Would update {updated_count} source(s)")
            else:
                print(f"[OK] Successfully updated {updated_count} source(s)")
            print("=" * 60)
            
            return 0
            
    except Exception as e:
        print(f"[ERROR] Error during migration: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fix old jobs with wrong source_type (home/user -> blocks)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry-run mode (no changes will be made)"
    )
    
    args = parser.parse_args()
    
    exit_code = asyncio.run(main(dry_run=args.dry_run))
    sys.exit(exit_code)
