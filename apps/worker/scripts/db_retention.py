#!/usr/bin/env python3
"""
DB retention + lightweight archive for free-tier friendly operations.

What it does:
1) Exports a compact JSON snapshot (optional).
2) Persists daily aggregate counters in `engine_metrics_daily`.
3) Prunes old job logs.
4) Prunes old completed/error runs that are NOT referenced by blocks.

Notes:
- We intentionally do not delete runs still referenced by `blocks.run_id`
  to avoid FK violations and preserve block provenance.
- Uses a single transaction unless --dry-run is provided.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg


def parse_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        value = int(str(raw).strip())
    except Exception:
        return default
    return max(minimum, min(maximum, value))


def normalize_sync_database_url(raw_url: str) -> str:
    url = (raw_url or "").strip()
    if not url:
        return ""

    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    elif url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql+psycopg://", "postgresql://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    # Normalize ssl=true|false query params to sslmode=require|disable for psycopg.
    try:
        sp = urlsplit(url)
        pairs = parse_qsl(sp.query, keep_blank_values=True)
        q: dict[str, str] = {(k or "").lower(): (v or "") for k, v in pairs}
        ssl_val = q.pop("ssl", "").strip().lower()
        if ssl_val in {"1", "true", "yes", "on", "require"} and "sslmode" not in q:
            q["sslmode"] = "require"
        elif ssl_val in {"0", "false", "no", "off", "disable"} and "sslmode" not in q:
            q["sslmode"] = "disable"
        new_query = urlencode(q)
        url = urlunsplit((sp.scheme, sp.netloc, sp.path, new_query, sp.fragment))
    except Exception:
        pass

    return url


def safe_schema_name(schema: str | None) -> str | None:
    if not schema:
        return None
    s = schema.strip()
    if not s:
        return None
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", s):
        return None
    return s


@dataclass
class RetentionSummary:
    generated_at: str
    dry_run: bool
    retention_days: Dict[str, int]
    pre_counts: Dict[str, int]
    deleted_counts: Dict[str, int]
    blocked_counts: Dict[str, int]
    post_counts: Dict[str, int]
    daily_aggregates_upserted: int
    notes: list[str]


def ensure_metrics_table(cur: psycopg.Cursor[Any]) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS engine_metrics_daily (
          day DATE PRIMARY KEY,
          completed_runs INTEGER NOT NULL DEFAULT 0,
          error_runs INTEGER NOT NULL DEFAULT 0,
          pruned_job_logs INTEGER NOT NULL DEFAULT 0,
          pruned_runs INTEGER NOT NULL DEFAULT 0,
          compacted_runs INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        ALTER TABLE engine_metrics_daily
        ADD COLUMN IF NOT EXISTS compacted_runs INTEGER NOT NULL DEFAULT 0
        """
    )


def has_job_logs_timestamp(cur: psycopg.Cursor[Any]) -> bool:
    cur.execute(
        """
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'job_logs'
            AND column_name = 'timestamp'
        )
        """
    )
    row = cur.fetchone()
    return bool(row and row[0])


def table_exists(cur: psycopg.Cursor[Any], table_name: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", (table_name,))
    row = cur.fetchone()
    return bool(row and row[0])


def fetch_scalar(cur: psycopg.Cursor[Any], sql: str, params: tuple[Any, ...] = ()) -> int:
    cur.execute(sql, params)
    row = cur.fetchone()
    if not row:
        return 0
    value = row[0]
    try:
        return int(value or 0)
    except Exception:
        return 0


def collect_pre_counts(cur: psycopg.Cursor[Any], log_days: int, run_days: int, logs_has_ts: bool) -> Dict[str, int]:
    has_job_logs = table_exists(cur, "job_logs")
    pre: Dict[str, int] = {
        "job_logs_total": fetch_scalar(cur, "SELECT COUNT(*) FROM job_logs") if has_job_logs else 0,
        "runs_total": fetch_scalar(cur, "SELECT COUNT(*) FROM runs"),
        "runs_completed_error_total": fetch_scalar(
            cur, "SELECT COUNT(*) FROM runs WHERE status IN ('completed', 'error')"
        ),
        "metrics_daily_total": fetch_scalar(cur, "SELECT COUNT(*) FROM engine_metrics_daily"),
    }

    if not has_job_logs:
        pre["job_logs_old_candidates"] = 0
    elif logs_has_ts:
        pre["job_logs_old_candidates"] = fetch_scalar(
            cur,
            """
            SELECT COUNT(*)
            FROM job_logs
            WHERE timestamp < NOW() - (%s * INTERVAL '1 day')
            """,
            (log_days,),
        )
    else:
        pre["job_logs_old_candidates"] = fetch_scalar(
            cur,
            """
            SELECT COUNT(*)
            FROM job_logs jl
            JOIN runs r ON r.id = jl.run_id
            WHERE COALESCE(r.completed_at, r.updated_at, r.created_at)
                < NOW() - (%s * INTERVAL '1 day')
            """,
            (log_days,),
        )

    pre["runs_old_candidates"] = fetch_scalar(
        cur,
        """
        SELECT COUNT(*)
        FROM runs r
        WHERE r.status IN ('completed', 'error')
          AND COALESCE(r.completed_at, r.updated_at, r.created_at)
            < NOW() - (%s * INTERVAL '1 day')
        """,
        (run_days,),
    )

    pre["runs_old_blocked_by_blocks_fk"] = fetch_scalar(
        cur,
        """
        SELECT COUNT(*)
        FROM runs r
        WHERE r.status IN ('completed', 'error')
          AND COALESCE(r.completed_at, r.updated_at, r.created_at)
            < NOW() - (%s * INTERVAL '1 day')
          AND EXISTS (SELECT 1 FROM blocks b WHERE b.run_id = r.id)
        """,
        (run_days,),
    )

    return pre


def delete_old_job_logs(cur: psycopg.Cursor[Any], log_days: int, logs_has_ts: bool) -> Dict[str, Any]:
    if not table_exists(cur, "job_logs"):
        return {"total": 0, "per_day": {}}

    if logs_has_ts:
        cur.execute(
            """
            WITH deleted AS (
              DELETE FROM job_logs
              WHERE timestamp < NOW() - (%s * INTERVAL '1 day')
              RETURNING DATE(timestamp) AS day
            )
            SELECT day, COUNT(*)::int AS c
            FROM deleted
            GROUP BY day
            ORDER BY day
            """,
            (log_days,),
        )
    else:
        cur.execute(
            """
            WITH deleted AS (
              DELETE FROM job_logs jl
              USING runs r
              WHERE jl.run_id = r.id
                AND COALESCE(r.completed_at, r.updated_at, r.created_at)
                  < NOW() - (%s * INTERVAL '1 day')
              RETURNING DATE(COALESCE(r.completed_at, r.updated_at, r.created_at)) AS day
            )
            SELECT day, COUNT(*)::int AS c
            FROM deleted
            GROUP BY day
            ORDER BY day
            """,
            (log_days,),
        )
    rows = cur.fetchall() or []
    per_day = {str(day): int(c) for day, c in rows}
    total = sum(per_day.values())
    return {"total": total, "per_day": per_day}


def compact_old_runs(cur: psycopg.Cursor[Any], run_days: int) -> Dict[str, Any]:
    cur.execute(
        """
        WITH compacted AS (
          UPDATE runs r
          SET
            error_message = NULL,
            counters = jsonb_build_object(
              'found',
                CASE
                  WHEN COALESCE(r.counters->>'found', '') ~ '^-?[0-9]+$'
                  THEN (r.counters->>'found')::int
                  ELSE 0
                END,
              'uploaded',
                CASE
                  WHEN COALESCE(r.counters->>'uploaded', '') ~ '^-?[0-9]+$'
                  THEN (r.counters->>'uploaded')::int
                  ELSE 0
                END,
              'errors',
                CASE
                  WHEN COALESCE(r.counters->>'errors', '') ~ '^-?[0-9]+$'
                  THEN (r.counters->>'errors')::int
                  ELSE 0
                END
            ),
            updated_at = NOW()
          WHERE r.status IN ('completed', 'error')
            AND COALESCE(r.completed_at, r.updated_at, r.created_at)
              < NOW() - (%s * INTERVAL '1 day')
            AND EXISTS (SELECT 1 FROM blocks b WHERE b.run_id = r.id)
            AND (
              r.error_message IS NOT NULL
              OR r.counters IS NULL
              OR jsonb_typeof(r.counters) <> 'object'
              OR NOT (r.counters ? 'found' AND r.counters ? 'uploaded' AND r.counters ? 'errors')
            )
          RETURNING DATE(COALESCE(r.completed_at, r.updated_at, r.created_at)) AS day
        )
        SELECT day, COUNT(*)::int AS c
        FROM compacted
        GROUP BY day
        ORDER BY day
        """,
        (run_days,),
    )
    rows = cur.fetchall() or []
    per_day = {str(day): int(c) for day, c in rows}
    total = sum(per_day.values())
    return {"total": total, "per_day": per_day}


def delete_old_runs(cur: psycopg.Cursor[Any], run_days: int) -> Dict[str, Any]:
    cur.execute(
        """
        WITH deleted AS (
          DELETE FROM runs r
          WHERE r.status IN ('completed', 'error')
            AND COALESCE(r.completed_at, r.updated_at, r.created_at)
              < NOW() - (%s * INTERVAL '1 day')
            AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.run_id = r.id)
          RETURNING DATE(COALESCE(completed_at, updated_at, created_at)) AS day,
                    status::text AS status
        )
        SELECT day,
               COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_runs,
               COUNT(*) FILTER (WHERE status = 'error')::int AS error_runs,
               COUNT(*)::int AS total_runs
        FROM deleted
        GROUP BY day
        ORDER BY day
        """,
        (run_days,),
    )
    rows = cur.fetchall() or []
    per_day: Dict[str, Dict[str, int]] = {}
    completed_total = 0
    error_total = 0
    total = 0
    for day, completed_runs, error_runs, total_runs in rows:
        c = int(completed_runs or 0)
        e = int(error_runs or 0)
        t = int(total_runs or 0)
        per_day[str(day)] = {
            "completed_runs": c,
            "error_runs": e,
            "pruned_runs": t,
        }
        completed_total += c
        error_total += e
        total += t

    return {
        "total": total,
        "completed_total": completed_total,
        "error_total": error_total,
        "per_day": per_day,
    }


def upsert_daily_aggregates(
    cur: psycopg.Cursor[Any],
    runs_deleted: Dict[str, Any],
    logs_deleted: Dict[str, Any],
    runs_compacted: Dict[str, Any],
) -> int:
    day_map: Dict[str, Dict[str, int]] = {}

    for day, payload in runs_deleted.get("per_day", {}).items():
        bucket = day_map.setdefault(
            day,
            {
                "completed_runs": 0,
                "error_runs": 0,
                "pruned_job_logs": 0,
                "pruned_runs": 0,
                "compacted_runs": 0,
            },
        )
        bucket["completed_runs"] += int(payload.get("completed_runs", 0))
        bucket["error_runs"] += int(payload.get("error_runs", 0))
        bucket["pruned_runs"] += int(payload.get("pruned_runs", 0))

    for day, c in logs_deleted.get("per_day", {}).items():
        bucket = day_map.setdefault(
            day,
            {
                "completed_runs": 0,
                "error_runs": 0,
                "pruned_job_logs": 0,
                "pruned_runs": 0,
                "compacted_runs": 0,
            },
        )
        bucket["pruned_job_logs"] += int(c or 0)

    for day, c in runs_compacted.get("per_day", {}).items():
        bucket = day_map.setdefault(
            day,
            {
                "completed_runs": 0,
                "error_runs": 0,
                "pruned_job_logs": 0,
                "pruned_runs": 0,
                "compacted_runs": 0,
            },
        )
        bucket["compacted_runs"] += int(c or 0)

    for day, payload in day_map.items():
        cur.execute(
            """
            INSERT INTO engine_metrics_daily (
              day, completed_runs, error_runs, pruned_job_logs, pruned_runs, compacted_runs, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (day) DO UPDATE SET
              completed_runs = engine_metrics_daily.completed_runs + EXCLUDED.completed_runs,
              error_runs = engine_metrics_daily.error_runs + EXCLUDED.error_runs,
              pruned_job_logs = engine_metrics_daily.pruned_job_logs + EXCLUDED.pruned_job_logs,
              pruned_runs = engine_metrics_daily.pruned_runs + EXCLUDED.pruned_runs,
              compacted_runs = engine_metrics_daily.compacted_runs + EXCLUDED.compacted_runs,
              updated_at = NOW()
            """,
            (
                day,
                int(payload["completed_runs"]),
                int(payload["error_runs"]),
                int(payload["pruned_job_logs"]),
                int(payload["pruned_runs"]),
                int(payload["compacted_runs"]),
            ),
        )

    return len(day_map)


def collect_post_counts(cur: psycopg.Cursor[Any]) -> Dict[str, int]:
    has_job_logs = table_exists(cur, "job_logs")
    return {
        "job_logs_total": fetch_scalar(cur, "SELECT COUNT(*) FROM job_logs") if has_job_logs else 0,
        "runs_total": fetch_scalar(cur, "SELECT COUNT(*) FROM runs"),
        "metrics_daily_total": fetch_scalar(cur, "SELECT COUNT(*) FROM engine_metrics_daily"),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prune old logs/runs and keep daily aggregates.")
    parser.add_argument(
        "--log-days",
        type=int,
        default=parse_int_env("RETENTION_LOG_DAYS", 10, 7, 30),
        help="Delete job_logs older than this many days (default: env RETENTION_LOG_DAYS or 10).",
    )
    parser.add_argument(
        "--run-days",
        type=int,
        default=parse_int_env("RETENTION_RUN_DAYS", 30, 14, 180),
        help="Delete completed/error runs older than this many days (default: env RETENTION_RUN_DAYS or 30).",
    )
    parser.add_argument(
        "--archive-out",
        type=str,
        default=os.environ.get("RETENTION_ARCHIVE_OUT", "").strip(),
        help="Optional path to write JSON archive summary.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute candidates and print summary without deleting.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    raw_db_url = os.environ.get("DATABASE_URL", "").strip()
    db_url = normalize_sync_database_url(raw_db_url)
    if not db_url:
        print("ERROR: DATABASE_URL is required")
        return 1

    schema = safe_schema_name(os.environ.get("DB_SCHEMA"))
    notes: list[str] = []
    if not schema and os.environ.get("DB_SCHEMA"):
        notes.append("Ignored invalid DB_SCHEMA; using default search_path.")

    now_iso = datetime.now(timezone.utc).isoformat()

    with psycopg.connect(db_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            if schema:
                cur.execute(f"SET search_path TO {schema}, public")

            ensure_metrics_table(cur)
            logs_has_ts = has_job_logs_timestamp(cur)

            pre_counts = collect_pre_counts(
                cur=cur,
                log_days=args.log_days,
                run_days=args.run_days,
                logs_has_ts=logs_has_ts,
            )

            blocked_counts = {
                "runs_old_blocked_by_blocks_fk": int(pre_counts.get("runs_old_blocked_by_blocks_fk", 0))
            }

            deleted_counts = {
                "job_logs_deleted": 0,
                "runs_deleted": 0,
                "runs_deleted_completed": 0,
                "runs_deleted_error": 0,
                "runs_compacted": 0,
            }
            daily_aggregates_upserted = 0

            if not args.dry_run:
                logs_deleted = delete_old_job_logs(
                    cur=cur, log_days=args.log_days, logs_has_ts=logs_has_ts
                )
                runs_deleted = delete_old_runs(cur=cur, run_days=args.run_days)
                runs_compacted = compact_old_runs(cur=cur, run_days=args.run_days)
                daily_aggregates_upserted = upsert_daily_aggregates(
                    cur=cur,
                    runs_deleted=runs_deleted,
                    logs_deleted=logs_deleted,
                    runs_compacted=runs_compacted,
                )
                deleted_counts["job_logs_deleted"] = int(logs_deleted["total"])
                deleted_counts["runs_deleted"] = int(runs_deleted["total"])
                deleted_counts["runs_deleted_completed"] = int(runs_deleted["completed_total"])
                deleted_counts["runs_deleted_error"] = int(runs_deleted["error_total"])
                deleted_counts["runs_compacted"] = int(runs_compacted["total"])
                conn.commit()
            else:
                conn.rollback()
                notes.append("Dry run enabled; no deletes committed.")

            # Re-open tx for post counts in dry-run case (rollback ended current tx).
            cur.execute("SELECT 1")
            post_counts = collect_post_counts(cur)

    summary = RetentionSummary(
        generated_at=now_iso,
        dry_run=bool(args.dry_run),
        retention_days={"job_logs": int(args.log_days), "runs": int(args.run_days)},
        pre_counts=pre_counts,
        deleted_counts=deleted_counts,
        blocked_counts=blocked_counts,
        post_counts=post_counts,
        daily_aggregates_upserted=int(daily_aggregates_upserted),
        notes=notes,
    )

    payload = json.dumps(summary.__dict__, indent=2, sort_keys=True)
    print(payload)

    if args.archive_out:
        out_path = Path(args.archive_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload + "\n", encoding="utf-8")
        print(f"Wrote archive summary to: {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
