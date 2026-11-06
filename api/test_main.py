"""Checks for the dashboard cache: run with `python -m pytest api`."""

import asyncio
import json

from fastapi.testclient import TestClient

from main import PartCache, create_app


def make_cache(tmp_path, responses):
    """Cache whose fetcher answers from `responses` (path -> bytes or an exception)."""

    async def fake_fetch(path):
        outcome = responses[path]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    return PartCache(tmp_path, fake_fetch)


def test_refresh_stores_good_payload_and_keeps_it_when_next_refresh_fails(tmp_path):
    good = json.dumps({"todayDate": "2026-11-05"}).encode()
    responses = {"cancelled": good}
    cache = make_cache(tmp_path, responses)

    assert asyncio.run(cache.refresh("cancelled")) is True
    assert cache.payloads["cancelled"] == good

    responses["cancelled"] = RuntimeError("boom")
    assert asyncio.run(cache.refresh("cancelled")) is False
    assert cache.payloads["cancelled"] == good  # old copy survives
    assert "boom" in cache.last_error["cancelled"]


def test_error_shaped_payload_is_rejected(tmp_path):
    cache = make_cache(tmp_path, {"returns": json.dumps({"error": "Unknown path"}).encode()})
    assert asyncio.run(cache.refresh("returns")) is False
    assert "returns" not in cache.payloads


def test_restart_restores_parts_from_disk(tmp_path):
    good = json.dumps({"ok": 1}).encode()
    first = make_cache(tmp_path, {"workPerformance": good})
    asyncio.run(first.refresh("work-performance"))

    second = make_cache(tmp_path, {})
    second.load_from_disk()
    assert second.payloads["work-performance"] == good


def test_endpoint_answers_503_until_filled_then_200_with_same_bytes(tmp_path):
    cache = make_cache(tmp_path, {})
    app = create_app(cache, interval_seconds=3600)
    # fetches fail (no responses) so the lifespan refresh never fills the cache
    with TestClient(app) as client:
        assert client.get("/api/core").status_code == 503
        assert client.get("/api/nope").status_code == 404

        body = json.dumps({"dates": ["2026-11-05"]}).encode()
        cache.payloads["core"] = body
        response = client.get("/api/core")
        assert response.status_code == 200
        assert response.content == body
        assert client.get("/api/health").json()["core"]["has_payload"] is True
