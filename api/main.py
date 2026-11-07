"""Read-through cache in front of the dashboard's Apps Script Web App.

Apps Script rebuilds a payload part from the sheets whenever its own cache
expires, and that rebuild takes 26-62 seconds, so whoever opens the dashboard
at that moment waits. This service asks Apps Script for every part on a timer,
keeps the last good copy in memory and on disk, and answers browsers from that
copy, so a browser never waits on a rebuild.

The JSON served here is exactly what Apps Script returns for the same part, so
the web app only needs a different base URL. Parsing the sheets in Python is
deliberately not done: phase 2 moves the heavy tables out of the sheets, and a
sheet parser would be thrown away then.
"""

import asyncio
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

logger = logging.getLogger("dashboard_cache")

# Endpoint name served here -> the `?path=` value Apps Script understands.
PART_ENDPOINTS = {
    "core": "core",
    "work-performance": "workPerformance",
    "cancelled": "cancelled",
    "focus": "focus",
    "restock": "restock",
    "refunds": "refunds",
}

RETRY_SECONDS_WHEN_EMPTY = 60

FetchPart = Callable[[str], Awaitable[bytes]]


class PartCache:
    """Last good payload of every part, kept in memory and mirrored to disk.

    Args:
        cache_dir: folder that holds one `<endpoint>.json` file per part.
        fetch_part: coroutine that returns the raw JSON bytes of one Apps Script path.

    A failed or error-shaped refresh never replaces the stored copy: serving
    slightly old data beats serving nothing.
    """

    def __init__(self, cache_dir: Path, fetch_part: FetchPart) -> None:
        self.cache_dir = cache_dir
        self.fetch_part = fetch_part
        self.payloads: dict[str, bytes] = {}
        self.refreshed_at: dict[str, float] = {}
        self.last_error: dict[str, str] = {}

    def load_from_disk(self) -> None:
        """Restore parts saved by an earlier run so a restart serves at once."""
        for endpoint in PART_ENDPOINTS:
            path = self.cache_dir / f"{endpoint}.json"
            if path.exists():
                self.payloads[endpoint] = path.read_bytes()
                self.refreshed_at[endpoint] = path.stat().st_mtime

    async def refresh(self, endpoint: str) -> bool:
        """Fetch one part and store it; return whether the stored copy changed."""
        try:
            payload = await self.fetch_part(PART_ENDPOINTS[endpoint])
            parsed = json.loads(payload)
            if not isinstance(parsed, dict) or "error" in parsed:
                raise ValueError(f"Apps Script returned an error payload: {str(parsed)[:200]}")
        except Exception as error:  # noqa: BLE001 - any failure must leave the old copy in place
            self.last_error[endpoint] = f"{type(error).__name__}: {error}"
            logger.warning("refresh of %s failed: %s", endpoint, self.last_error[endpoint])
            return False
        self.payloads[endpoint] = payload
        self.refreshed_at[endpoint] = time.time()
        self.last_error.pop(endpoint, None)
        self._write_to_disk(endpoint, payload)
        return True

    def _write_to_disk(self, endpoint: str, payload: bytes) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        temporary = self.cache_dir / f"{endpoint}.json.tmp"
        temporary.write_bytes(payload)
        temporary.replace(self.cache_dir / f"{endpoint}.json")  # atomic, readers never see half a file


async def refresh_forever(cache: PartCache, endpoint: str, interval_seconds: int) -> None:
    """Keep one part fresh; retry sooner while there is nothing to serve yet."""
    while True:
        await cache.refresh(endpoint)
        has_payload = endpoint in cache.payloads
        await asyncio.sleep(interval_seconds if has_payload else RETRY_SECONDS_WHEN_EMPTY)


def build_http_fetcher(apps_script_url: str) -> FetchPart:
    async def fetch_part(path: str) -> bytes:
        # shortcut: one client per request; reuse a shared client if refreshes ever get chatty
        async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
            response = await client.get(apps_script_url, params={"path": path})
            response.raise_for_status()
            return response.content

    return fetch_part


def create_app(cache: PartCache | None = None, interval_seconds: int | None = None) -> FastAPI:
    """Build the app; tests pass their own cache so nothing calls Apps Script."""
    refresh_seconds = interval_seconds or int(os.environ.get("REFRESH_SECONDS", "300"))
    if cache is None:
        cache = PartCache(
            Path(os.environ.get("CACHE_DIR", "cache")),
            build_http_fetcher(os.environ["APPS_SCRIPT_URL"]),
        )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        cache.load_from_disk()
        tasks = [asyncio.create_task(refresh_forever(cache, name, refresh_seconds)) for name in PART_ENDPOINTS]
        yield
        for task in tasks:
            task.cancel()

    app = FastAPI(title="teamklang dashboard cache", lifespan=lifespan)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get(
            "ALLOWED_ORIGINS", "https://teamklang-warehouse-kpi.pages.dev,http://localhost:5199"
        ).split(","),
        allow_methods=["GET"],
    )

    @app.get("/api/health")
    def health() -> dict:
        now = time.time()
        return {
            endpoint: {
                "has_payload": endpoint in cache.payloads,
                "age_seconds": round(now - cache.refreshed_at[endpoint]) if endpoint in cache.refreshed_at else None,
                "last_error": cache.last_error.get(endpoint),
            }
            for endpoint in PART_ENDPOINTS
        }

    @app.get("/api/{endpoint}")
    def get_part(endpoint: str) -> Response:
        if endpoint not in PART_ENDPOINTS:
            raise HTTPException(status_code=404, detail=f"unknown part: {endpoint}")
        payload = cache.payloads.get(endpoint)
        if payload is None:
            raise HTTPException(
                status_code=503,
                detail="กำลังเตรียมข้อมูลครั้งแรก ลองใหม่ใน 1-2 นาที",
                headers={"Retry-After": str(RETRY_SECONDS_WHEN_EMPTY)},
            )
        return Response(content=payload, media_type="application/json", headers={"Cache-Control": "public, max-age=60"})

    return app


def create_default_app() -> FastAPI:
    """Entry point for uvicorn: `uvicorn main:app` needs the env vars set."""
    return create_app()


app = create_default_app() if "APPS_SCRIPT_URL" in os.environ else None
