# Worker Performance Analysis

## Identified Bottlenecks

### 1. Excessive CMS Logging (HIGH IMPACT)
**Location:** `apps/worker/app/cli.py` lines 1442-1564

**Issue:** Each item triggers 5-6 HTTP POST requests to CMS `/api/engine/logs`:
- FETCH start (line 1442)
- FETCH complete (line 1455)
- SCRAPE start (line 1468)
- SCRAPE complete (line 1480)
- COMPLETE start (line 1493)
- COMPLETE finish (line 1515)
- WRITE/UPLOAD (line 1558)

**Impact:** For 100 items = 500-600 HTTP requests, creating significant network overhead and CMS load.

**Recommendation:** 
- Batch logs: collect logs in memory and send every N items (e.g., 10) or every T seconds (e.g., 2s)
- Reduce verbosity: only send critical logs (errors, completion milestones)
- Use a single log entry per item with all stages combined

### 2. Sequential Processing (HIGH IMPACT)
**Location:** `apps/worker/app/cli.py` line 1310 `async for item in item_iterator:`

**Issue:** Items are processed one at a time with no concurrency.

**Impact:** If each item takes 2-3 seconds, 100 items = 200-300 seconds. With 3-5 concurrent workers, this could be 40-60 seconds.

**Recommendation:**
- Implement bounded concurrency using `asyncio.Semaphore` (e.g., `ITEM_CONCURRENCY=3-5`)
- Process multiple items in parallel while respecting resource limits
- Keep R2 uploads and DB writes concurrent but bounded

### 3. Multiple DB Queries Per Item (MEDIUM IMPACT)
**Location:** `apps/worker/app/cli.py` lines 1330-1405

**Issue:** Each item triggers multiple sequential DB queries:
- `_item_already_processed()` - SELECT on blocks (line 1330)
- `_item_exists_globally()` - SELECT on blocks (line 1343)
- `_item_needs_reupload()` - SELECT on blocks (line 1343)
- `_upsert_block()` - INSERT/UPDATE on blocks (line 1527)
- `update_run_status()` - UPDATE on runs (line 1589)
- Session commit after every item (line 1590)

**Impact:** 5-6 DB round-trips per item = significant latency.

**Recommendation:**
- Batch existence checks: check multiple external_ids in one query
- Reduce commits: batch commits every N items (e.g., 10) or use transactions more efficiently
- Use `ON CONFLICT` more aggressively to reduce pre-checks

### 4. Artificial Delays (LOW IMPACT)
**Location:** `apps/worker/app/cli.py` line 1450

**Issue:** `await asyncio.sleep(0.1)` simulates processing time unnecessarily.

**Impact:** Adds 100ms per item = 10 seconds per 100 items.

**Recommendation:** Remove artificial delays; real processing time is sufficient.

### 5. Session Management (MEDIUM IMPACT)
**Location:** `apps/worker/app/cli.py` lines 1051-1638

**Issue:** Single long-lived session for entire run, with frequent commits.

**Impact:** Long transactions can hold locks and reduce concurrency.

**Recommendation:**
- Use shorter-lived sessions with batching
- Commit in batches (every 10-20 items) instead of per-item
- Consider connection pooling optimizations

### 6. R2 Upload Overhead (MEDIUM IMPACT)
**Location:** `apps/worker/app/cli.py` lines 1500-1510

**Issue:** Each upload is sequential, no concurrency control.

**Impact:** Large media files can block processing pipeline.

**Recommendation:**
- Implement concurrent uploads with semaphore (e.g., 3-5 concurrent uploads)
- Use HEAD requests to check existence before upload (already mentioned in codebase)
- Consider upload queue/batching

## Priority Fixes

1. **Batch CMS logging** (Quick win, high impact)
2. **Add bounded concurrency** (Medium effort, high impact)
3. **Batch DB commits** (Medium effort, medium impact)
4. **Remove artificial delays** (Trivial, low impact)
5. **Optimize DB queries** (Medium effort, medium impact)

## Implementation Notes

- Keep changes backward compatible
- Add environment variables for tuning (e.g., `LOG_BATCH_SIZE`, `LOG_BATCH_INTERVAL_SEC`, `ITEM_CONCURRENCY`)
- Maintain idempotency and error handling
- Test with realistic workloads
