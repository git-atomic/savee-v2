#!/usr/bin/env python
"""Add 'blocks' value to enum_sources_source_type enum"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text
from app.config import settings

def main():
    engine = create_engine(settings.sync_database_url)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TYPE enum_sources_source_type ADD VALUE IF NOT EXISTS 'blocks'"))
            conn.commit()
            print("[OK] Enum value 'blocks' added successfully")
            return 0
        except Exception as e:
            print(f"[ERROR] Failed to add enum value: {e}")
            conn.rollback()
            return 1
    engine.dispose()

if __name__ == "__main__":
    sys.exit(main())
