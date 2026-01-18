#!/usr/bin/env python
"""
Migration script to fix old jobs that were created before the "blocks" type was implemented.

This script identifies sources with source_type='home' that contain blocks with /i/ URLs
and updates them to source_type='blocks' with appropriate placeholder URLs.
"""
import asyncio
import argparse
import sys
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.models.sources import Source, SourceTypeEnum


async def find_sources_to_fix(session: AsyncSession) -> List[Dict[str, Any]]:
    """
    Find sources that should be blocks type but are currently marked as 'home'.
    
    Criteria:
    - source_type = 'home'
    - Has at least one block with a URL containing '/i/'
    
    Returns list of dicts with source info.
    """
    # Query to find sources that match our criteria
    query = text("""
        SELECT DISTINCT s.id, s.url, s.source_type, COUNT(b.id) as block_count
        FROM sources s
        INNER JOIN blocks b ON b.source_id = s.id
        WHERE s.source_type = 'home'
        AND b.url LIKE '%/i/%'
        GROUP BY s.id, s.url, s.source_type
        ORDER BY s.id
    """)
    
    result = await session.execute(query)
    rows = result.fetchall()
    
    sources = []
    for row in rows:
        sources.append({
            'id': row[0],
            'url': row[1],
            'source_type': row[2],
            'block_count': row[3]
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
        print(f"    - source_type: 'home' -> 'blocks'")
        if needs_url_update:
            print(f"    - url: '{current_url}' -> '{new_url}'")
        else:
            print(f"    - url: '{current_url}' (no change needed)")
        return True
    
    # Update the source
    stmt = (
        update(Source)
        .where(Source.id == source_id)
        .values(
            source_type=SourceTypeEnum.blocks,
            url=new_url
        )
    )
    
    await session.execute(stmt)
    await session.commit()
    
    print(f"  [OK] Updated source {source_id}:")
    print(f"    - source_type: 'home' -> 'blocks'")
    if needs_url_update:
        print(f"    - url: '{current_url}' -> '{new_url}'")
    
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
                block_count = source['block_count']
                
                print(f"Source ID: {source_id}")
                print(f"  Current type: {source['source_type']}")
                print(f"  Current URL: {current_url}")
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
        description="Fix old jobs with wrong source_type (home -> blocks)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry-run mode (no changes will be made)"
    )
    
    args = parser.parse_args()
    
    exit_code = asyncio.run(main(dry_run=args.dry_run))
    sys.exit(exit_code)
