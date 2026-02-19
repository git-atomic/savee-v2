import concurrent.futures as cf
import json
import os
import re
import subprocess as sp
import sys
import time
import urllib.request
from typing import Dict, List, Tuple


def normalize_cms_base_url(raw_url: str) -> str:
    if not raw_url:
        return ""
    u = raw_url.strip()
    u = re.sub(r"/+$", "", u, flags=re.IGNORECASE)
    u = re.sub(r"/admin$", "", u, flags=re.IGNORECASE)
    u = re.sub(r"/api$", "", u, flags=re.IGNORECASE)
    return u


def parse_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(str(os.environ.get(name, default)).strip())
    except Exception:
        value = default
    return max(minimum, min(value, maximum))


def post_log(run_id: str, log: Dict[str, str]) -> None:
    cms = normalize_cms_base_url(os.environ.get("CMS_URL", ""))
    if not cms or not run_id:
        return

    token = os.environ.get("ENGINE_MONITOR_TOKEN", "")
    data = json.dumps({"jobId": str(run_id), "log": log}).encode("utf-8")
    req = urllib.request.Request(
        f"{cms}/api/engine/logs",
        data=data,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception:
        pass


def load_started_runs(resp_path: str = "/tmp/resp.json") -> List[Dict]:
    if not os.path.exists(resp_path):
        print("No /tmp/resp.json found; will rely on /api/engine/pending")
        return []

    try:
        with open(resp_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("startedDetails") or []
    except Exception as e:
        print("Failed to parse /tmp/resp.json:", e)
        return []


def fetch_pending_runs(limit: int) -> List[Dict]:
    runs: List[Dict] = []
    cms_url = normalize_cms_base_url(os.environ.get("CMS_URL", ""))
    token = os.environ.get("ENGINE_MONITOR_TOKEN", "")
    if not cms_url:
        return runs

    try:
        req = urllib.request.Request(
            f"{cms_url}/api/engine/pending?limit={limit}",
            headers={"Authorization": f"Bearer {token}"} if token else {},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        if payload.get("success"):
            for p in payload.get("pending", []):
                runs.append(
                    {
                        "url": p.get("url"),
                        "runId": p.get("runId"),
                        "maxItems": p.get("maxItems") or 0,
                    }
                )
    except Exception as e:
        print("pending fetch error:", e)
    return runs


def dedupe_runs(runs: List[Dict]) -> List[Dict]:
    deduped: List[Dict] = []
    seen_run_ids = set()
    for r in runs:
        rid = str(r.get("runId") or "").strip()
        if not rid or rid in seen_run_ids:
            continue
        seen_run_ids.add(rid)
        deduped.append(r)
    return deduped


def run_one(run: Dict, max_attempts: int) -> Tuple[str, bool]:
    run_id = str(run.get("runId") or "").strip()
    url = str(run.get("url") or "").strip()
    max_items = int(run.get("maxItems") or 0)
    if not run_id or not url:
        print("Skipping invalid run payload:", run)
        return (run_id or "unknown", False)

    delay = 2
    for attempt in range(1, max_attempts + 1):
        print(f"running: runId={run_id} attempt={attempt}/{max_attempts} url={url}")
        code = sp.run(
            [
                sys.executable,
                "-m",
                "app.cli",
                "--start-url",
                url,
                "--max-items",
                str(max_items),
                "--run-id",
                run_id,
            ],
            check=False,
        ).returncode

        if code == 0:
            post_log(
                run_id,
                {"type": "RETRY", "status": "success", "message": "Completed"},
            )
            return (run_id, True)

        msg = f"Attempt {attempt}/{max_attempts} failed with exit code {code}"
        print(msg, f"(runId={run_id})")
        post_log(run_id, {"type": "RETRY", "status": "error", "message": msg})
        if attempt < max_attempts:
            wait_msg = f"Retrying in {delay}s"
            print(wait_msg, f"(runId={run_id})")
            post_log(
                run_id,
                {"type": "RETRY", "status": "pending", "message": wait_msg},
            )
            time.sleep(delay)
            delay = min(delay * 2, 30)

    return (run_id, False)


def main() -> int:
    parallel = parse_int_env("WORKER_PARALLELISM", 2, 1, 6)
    max_attempts = parse_int_env("WORKER_MAX_ATTEMPTS", 3, 1, 5)
    pending_limit = parse_int_env("PENDING_FETCH_LIMIT", max(12, parallel * 6), 1, 50)

    runs = load_started_runs()
    runs.extend(fetch_pending_runs(pending_limit))
    runs = dedupe_runs(runs)
    if not runs:
        print("No runs to execute")
        return 0

    print(
        f"Queue drain start: total_runs={len(runs)} parallelism={parallel} "
        f"max_attempts={max_attempts} pending_limit={pending_limit}"
    )

    failures = 0
    with cf.ThreadPoolExecutor(max_workers=parallel) as executor:
        futures = [executor.submit(run_one, run, max_attempts) for run in runs]
        for future in cf.as_completed(futures):
            try:
                _, ok = future.result()
                if not ok:
                    failures += 1
            except Exception as e:
                failures += 1
                print("Worker execution error:", e)

    successes = len(runs) - failures
    print(f"Queue drain summary: success={successes} failed={failures} total={len(runs)}")

    # Do not fail workflow for isolated run failures; run status is tracked per run in DB.
    return 1 if runs and failures == len(runs) else 0


if __name__ == "__main__":
    raise SystemExit(main())
