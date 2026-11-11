"""Tests for scan serialization robustness (preventing HTTP 500 errors)."""
import math
import os
import tempfile
import time
import pytest
from starlette.testclient import TestClient

from backend.main import app
from backend.engine import engine, sanitize_for_json
from backend.models import ScanDetail, WorkloadRow, ResourceAllocation, ScanMeta
from backend.diff import _allocations_changed, compute_diff, parse_quantity


@pytest.fixture
def client(tmp_path, monkeypatch):
    from backend import engine as eng_mod
    monkeypatch.setattr(eng_mod, "DATA_DIR", str(tmp_path))
    with TestClient(app) as c:
        yield c


def test_sanitize_for_json():
    raw = {
        "score": float("nan"),
        "inf_val": float("inf"),
        "neg_inf": float("-inf"),
        "normal": 42.5,
        "nested": {
            "arr": [1.0, float("nan"), float("inf"), "text", None]
        }
    }
    cleaned = sanitize_for_json(raw)
    assert cleaned["score"] is None
    assert cleaned["inf_val"] is None
    assert cleaned["neg_inf"] is None
    assert cleaned["normal"] == 42.5
    assert cleaned["nested"]["arr"] == [1.0, None, None, "text", None]


def test_parse_quantity():
    assert parse_quantity("100m") == pytest.approx(0.1)
    assert parse_quantity("256Mi") == pytest.approx(256 * 1024 * 1024)
    assert parse_quantity("1Gi") == pytest.approx(1024 * 1024 * 1024)
    assert parse_quantity("0.5") == pytest.approx(0.5)
    assert parse_quantity(1.5) == pytest.approx(1.5)
    assert parse_quantity("unset") is None
    assert parse_quantity("?") is None
    assert parse_quantity(None) is None
    assert parse_quantity(float("nan")) is None


def test_allocations_changed_with_kubernetes_strings():
    # Different string quantities
    assert _allocations_changed({"req_cpu": "100m"}, {"req_cpu": "200m"}) is True
    # Identical string quantities
    assert _allocations_changed({"req_cpu": "100m"}, {"req_cpu": "100m"}) is False
    # String vs float equivalent
    assert _allocations_changed({"req_cpu": "100m"}, {"req_cpu": 0.1}) is False
    # String vs None
    assert _allocations_changed({"req_cpu": "100m"}, {"req_cpu": None}) is True
    # Unset string vs None
    assert _allocations_changed({"req_cpu": "unset"}, {"req_cpu": None}) is False


def test_compute_diff_with_null_allocations():
    baseline = {
        "id": "20261110-100000-000001",
        "started": 1000.0,
        "rows": [
            {
                "ns": "default",
                "kind": "Deployment",
                "name": "app",
                "container": "main",
                "cur": None,
                "rec": None,
                "severity": "UNKNOWN",
            }
        ],
    }
    target = {
        "id": "20261111-100000-000002",
        "started": 2000.0,
        "rows": [
            {
                "ns": "default",
                "kind": "Deployment",
                "name": "app",
                "container": "main",
                "cur": {"req_cpu": "100m"},
                "rec": {"req_cpu": 0.2},
                "severity": "WARNING",
            }
        ],
    }
    # Should not raise AttributeError: 'NoneType' object has no attribute 'get'
    diff = compute_diff(baseline, target)
    assert diff["baseline"]["id"] == baseline["id"]
    assert diff["target"]["id"] == target["id"]
    assert len(diff["rows"]) == 1
    assert diff["rows"][0]["changes"]["current"] is True


def test_get_scan_with_nan_and_string_allocations_returns_200(client, tmp_path):
    sid = "20261111-075926-e46cc9"
    scan_data = {
        "id": sid,
        "started": time.time(),
        "status": "done",
        "params": {
            "cpu_percentile": 95.0,
            "memory_buffer_percentage": 15,
            "history_days": 14,
            "namespaces": [],
        },
        "finished": time.time() + 10,
        "duration": 10.0,
        "containers": 2,
        "score": float("nan"),
        "errors": [],
        "cluster": {},
        "rows": [
            {
                "ns": "prod",
                "kind": "Deployment",
                "name": "checkout",
                "container": "api",
                "pods": 3,
                "hpa": True,
                "sidecar": False,
                "severity": "WARNING",
                "cur": {
                    "req_cpu": "100m",
                    "req_mem": "256Mi",
                    "lim_cpu": float("inf"),
                    "lim_mem": float("nan"),
                },
                "rec": {
                    "req_cpu": None,
                    "req_mem": 536870912,
                    "lim_cpu": "unset",
                    "lim_mem": "?",
                },
                "info": {"cpu": "HPA detected"},
                "warnings": ["HPA detected"],
                "usage": {
                    "cpu": {"p50": 0.05, "p95": float("nan"), "max": 0.12},
                    "memory": {"p50": 100000000, "max": float("inf")},
                },
            }
        ],
    }

    # Write scan directly to test loading legacy/corrupted scans
    engine._write_json(engine.scan_path(sid), scan_data)
    engine._write_json(engine.meta_path(sid), {
        "id": sid,
        "started": scan_data["started"],
        "status": "done",
        "params": scan_data["params"],
        "containers": 2,
    })

    res = client.get(f"/api/scans/{sid}")
    assert res.status_code == 200, f"Expected 200 but got {res.status_code}: {res.text}"
    body = res.json()
    assert body["id"] == sid
    assert body["status"] == "done"
    assert body["score"] is None
    row = body["rows"][0]
    assert row["cur"]["req_cpu"] == "100m"
    assert row["cur"]["lim_cpu"] is None
    assert row["cur"]["lim_mem"] is None
    assert row["usage"]["cpu"]["p95"] is None
    assert row["usage"]["memory"]["max"] is None


def test_trends_and_history_with_nan_allocations(client, tmp_path):
    sid = "20261111-080000-112233"
    scan_data = {
        "id": sid,
        "started": time.time(),
        "status": "done",
        "params": {
            "cpu_percentile": 90.0,
            "memory_buffer_percentage": 10,
            "history_days": 7,
            "namespaces": [],
        },
        "score": float("nan"),
        "rows": [
            {
                "ns": "default",
                "kind": "Deployment",
                "name": "web",
                "container": "nginx",
                "pods": 1,
                "severity": "OK",
                "cur": {"req_cpu": float("nan"), "req_mem": 1000},
                "rec": {"req_cpu": 0.1, "req_mem": float("inf")},
            }
        ],
    }
    engine._write_json(engine.scan_path(sid), scan_data)
    engine._write_json(engine.meta_path(sid), {
        "id": sid,
        "started": scan_data["started"],
        "status": "done",
        "params": scan_data["params"],
    })

    trends_res = client.get("/api/scans/trends")
    assert trends_res.status_code == 200
    trends = trends_res.json()
    assert len(trends["scans"]) == 1
    assert trends["scans"][0]["score"] is None

    hist_res = client.get("/api/scans/history?key=default/Deployment/web/nginx")
    assert hist_res.status_code == 200
    points = hist_res.json()["points"]
    assert len(points) == 1
    assert points[0]["cur"]["req_cpu"] is None
    assert points[0]["rec"]["req_mem"] is None


def test_list_scans_and_diff_with_null_started_meta(client, tmp_path):
    """Ensure engine.list_metas() and diff endpoint gracefully handle scans with started=None."""
    # Write one normal scan and one scan with started=None
    sid_normal = "20261111-090000-000001"
    sid_corrupted = "20261111-090000-000002"

    engine._write_json(engine.meta_path(sid_normal), {
        "id": sid_normal,
        "started": 1000.0,
        "status": "done",
    })
    engine._write_json(engine.scan_path(sid_normal), {
        "id": sid_normal,
        "started": 1000.0,
        "status": "done",
        "rows": [],
    })

    # Meta with started=None
    with open(engine.meta_path(sid_corrupted), "w", encoding="utf-8") as f:
        f.write('{"id": "' + sid_corrupted + '", "started": null, "status": "failed"}')

    # Also a completely invalid JSON file
    with open(os.path.join(str(tmp_path), "invalid.meta.json"), "w", encoding="utf-8") as f:
        f.write("corrupted json content")

    # list_scans must return 200 without crashing
    res = client.get("/api/scans")
    assert res.status_code == 200
    metas = res.json()
    ids = [m["id"] for m in metas]
    assert sid_normal in ids

    # diff_scan must not crash with TypeError when encountering started=None
    diff_res = client.get(f"/api/scans/{sid_normal}/diff")
    # Should return 404 cleanly since no earlier done scan exists
    assert diff_res.status_code == 404
