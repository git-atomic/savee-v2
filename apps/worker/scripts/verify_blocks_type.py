#!/usr/bin/env python
"""Verify that sources have been correctly updated to blocks type"""
import sys
from pathlib import Path
from typing import List, Dict, Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings


async def verify_sources() -> None:
    """Verify sources with blocks type"""
    engine = create_async_engine(
        settings.async_database_url,
        connect_args=settings.asyncpg_connect_args
    )
    Session = async_sessionmaker(engine, expire_on_commit=False)
    
    try:
        async with Session() as session:
            # Get all sources with blocks type
            query = text("""
                SELECT s.id, s.url, s.source_type, 
                       COUNT(b.id) as block_count
                FROM sources s
                LEFT JOIN blocks b ON b.source_id = s.id
                WHERE s.source_type = 'blocks'
                GROUP BY s.id, s.url, s.source_type
                ORDER BY s.id
            """)
            
            result = await session.execute(query)
            rows = result.fetchall()
            
            print("=" * 60)
            print("Verification: Sources with 'blocks' type")
            print("=" * 60)
            print()
            
            if not rows:
                print("No sources found with 'blocks' type")
                return
            
            print(f"Found {len(rows)} source(s) with 'blocks' type:\n")
            
            for row in rows:
                source_id, url, source_type, block_count = row
                print(f"Source ID: {source_id}")
                print(f"  Type: {source_type}")
                print(f"  URL: {url}")
                print(f"  Blocks: {block_count}")
                
                # Get sample block URLs
                block_query = text("""
                    SELECT DISTINCT url
                    FROM blocks
                    WHERE source_id = :source_id
                    AND url LIKE '%/i/%'
                    ORDER BY url
                    LIMIT 3
                """)
                block_result = await session.execute(block_query, {'source_id': source_id})
                block_urls = [r[0] for r in block_result.fetchall()]
                
                if block_urls:
                    print(f"  Sample /i/ URLs:")
                    for block_url in block_urls:
                        print(f"    - {block_url}")
                print()
            
            print("=" * 60)
            print("[OK] Verification complete")
            print("=" * 60)
            
    except Exception as e:
        print(f"[ERROR] Verification failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    import asyncio
    asyncio.run(verify_sources())
