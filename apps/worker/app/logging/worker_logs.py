"""
Real-time worker logging system.
"""

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Dict, List, Optional

import aiohttp

from app.config import normalize_cms_base_url, settings

try:
    import aioredis
except ImportError:
    aioredis = None


@dataclass
class WorkerLogEntry:
    timestamp: str
    type: str  # STARTING, FETCH, SCRAPE, WRITE/UPLOAD, ERROR, COMPLETE
    run_id: int
    item_url: str
    status: str  # success, error, pending
    timing: Optional[float] = None
    message: Optional[str] = None
    progress: Optional[str] = None


class WorkerLogger:
    """Real-time worker logger that stores logs for streaming to UI."""

    def __init__(self):
        self.redis_client = None
        self.fallback_storage: Dict[int, List[WorkerLogEntry]] = {}

    async def connect(self):
        """Connect to Redis for real-time log storage."""
        if aioredis is None:
            self.redis_client = None
            return

        try:
            self.redis_client = aioredis.from_url(
                getattr(settings, "REDIS_URL", "redis://localhost:6379"),
                decode_responses=True,
            )
            await self.redis_client.ping()
        except Exception:
            self.redis_client = None

    async def log(self, entry: WorkerLogEntry):
        """Log an entry for a specific run."""
        entry_dict = asdict(entry)

        if self.redis_client:
            try:
                key = f"worker_logs:{entry.run_id}"
                await self.redis_client.lpush(key, json.dumps(entry_dict))
                await self.redis_client.expire(key, 86400)
                await self.redis_client.publish(
                    f"logs:{entry.run_id}", json.dumps(entry_dict)
                )
            except Exception:
                self._store_in_memory(entry)
        else:
            self._store_in_memory(entry)

    def _store_in_memory(self, entry: WorkerLogEntry):
        if entry.run_id not in self.fallback_storage:
            self.fallback_storage[entry.run_id] = []
        self.fallback_storage[entry.run_id].append(entry)
        if len(self.fallback_storage[entry.run_id]) > 1000:
            self.fallback_storage[entry.run_id] = self.fallback_storage[entry.run_id][
                -1000:
            ]

    async def get_logs(self, run_id: int, limit: int = 100) -> List[Dict]:
        if self.redis_client:
            try:
                key = f"worker_logs:{run_id}"
                log_strings = await self.redis_client.lrange(key, 0, limit - 1)
                return [json.loads(log_str) for log_str in log_strings]
            except Exception:
                pass
        entries = self.fallback_storage.get(run_id, [])
        return [asdict(entry) for entry in entries[-limit:]]

    async def clear_logs(self, run_id: int):
        if self.redis_client:
            try:
                await self.redis_client.delete(f"worker_logs:{run_id}")
            except Exception:
                pass
        if run_id in self.fallback_storage:
            del self.fallback_storage[run_id]


_logger: Optional[WorkerLogger] = None


async def get_worker_logger() -> WorkerLogger:
    global _logger
    if _logger is None:
        _logger = WorkerLogger()
        await _logger.connect()
    return _logger


async def _send_log_to_cms(run_id: int, log_data: Dict):
    """Send log entry to CMS API for real-time display."""
    try:
        cms_url = normalize_cms_base_url(
            getattr(settings, "CMS_URL", "http://localhost:3000")
        )
        if not cms_url:
            return

        token = getattr(settings, "ENGINE_MONITOR_TOKEN", None)
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.post(
                f"{cms_url}/api/engine/logs",
                json={"jobId": str(run_id), "log": log_data},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as response:
                if response.status != 200:
                    pass
    except Exception:
        pass


async def log_starting(run_id: int, url: str, message: str = ""):
    logger = await get_worker_logger()
    await logger.log(
        WorkerLogEntry(
            timestamp=datetime.now().isoformat(),
            type="STARTING",
            run_id=run_id,
            item_url=url,
            status="pending",
            message=message,
        )
    )
    await _send_log_to_cms(
        run_id,
        {
            "type": "STARTING",
            "url": url,
            "status": "pending",
            "message": message,
        },
    )


async def log_fetch(run_id: int, item_url: str, timing: float, success: bool = True):
    status = "success" if success else "error"
    logger = await get_worker_logger()
    await logger.log(
        WorkerLogEntry(
            timestamp=datetime.now().isoformat(),
            type="FETCH",
            run_id=run_id,
            item_url=item_url,
            status=status,
            timing=timing,
        )
    )
    await _send_log_to_cms(
        run_id,
        {
            "type": "FETCH",
            "url": item_url,
            "status": status,
            "timing": f"{timing:.2f}s",
        },
    )


async def log_scrape(run_id: int, item_url: str, timing: float, success: bool = True):
    status = "success" if success else "error"
    logger = await get_worker_logger()
    await logger.log(
        WorkerLogEntry(
            timestamp=datetime.now().isoformat(),
            type="SCRAPE",
            run_id=run_id,
            item_url=item_url,
            status=status,
            timing=timing,
        )
    )
    await _send_log_to_cms(
        run_id,
        {
            "type": "SCRAPE",
            "url": item_url,
            "status": status,
            "timing": f"{timing:.2f}s",
        },
    )


async def log_upload(
    run_id: int,
    item_url: str,
    timing: float,
    success: bool = True,
    message: str = "",
):
    status = "success" if success else "error"
    logger = await get_worker_logger()
    await logger.log(
        WorkerLogEntry(
            timestamp=datetime.now().isoformat(),
            type="WRITE/UPLOAD",
            run_id=run_id,
            item_url=item_url,
            status=status,
            timing=timing,
            message=message,
        )
    )
    await _send_log_to_cms(
        run_id,
        {
            "type": "WRITE/UPLOAD",
            "url": item_url,
            "status": status,
            "timing": f"{timing:.2f}s",
            "message": message,
        },
    )


async def log_write(run_id: int, item_url: str, timing: float, success: bool = True):
    status = "success" if success else "error"
    logger = await get_worker_logger()
    await logger.log(
        WorkerLogEntry(
            timestamp=datetime.now().isoformat(),
            type="WRITE/UPLOAD",
            run_id=run_id,
            item_url=item_url,
            status=status,
            timing=timing,
        )
    )
    await _send_log_to_cms(
        run_id,
        {
            "type": "WRITE/UPLOAD",
            "url": item_url,
            "status": status,
            "timing": f"{timing:.2f}s",
        },
    )


async def log_error(run_id: int, item_url: str, error_message: str):
    logger = await get_worker_logger()
    await logger.log(
        WorkerLogEntry(
            timestamp=datetime.now().isoformat(),
            type="ERROR",
            run_id=run_id,
            item_url=item_url,
            status="error",
            message=error_message,
        )
    )
    await _send_log_to_cms(
        run_id,
        {
            "type": "ERROR",
            "url": item_url,
            "status": "error",
            "message": error_message,
        },
    )


async def log_complete(run_id: int, item_url: str, timing: float, progress: str):
    logger = await get_worker_logger()
    await logger.log(
        WorkerLogEntry(
            timestamp=datetime.now().isoformat(),
            type="COMPLETE",
            run_id=run_id,
            item_url=item_url,
            status="success",
            timing=timing,
            progress=progress,
        )
    )
    await _send_log_to_cms(
        run_id,
        {
            "type": "COMPLETE",
            "url": item_url,
            "status": "success",
            "timing": f"{timing:.2f}s",
            "message": progress,
        },
    )
