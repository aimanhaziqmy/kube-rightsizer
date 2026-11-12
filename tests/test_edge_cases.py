"""Comprehensive edge case and robustness tests for kube-rightsizer."""
import base64
import os
import tempfile
import time
import pytest

# Ensure safe data directory before importing backend modules
test_dir = tempfile.mkdtemp(prefix="krr_edge_")
os.environ["DATA_DIR"] = test_dir

from starlette.testclient import TestClient
from backend.engine import ScanEngine
from backend.models import ScanParams, WorkloadRow, ResourceAllocation


def test_scan_params_validation():
    # Valid
    p = ScanParams(cpu_percentile=95, memory_buffer_percentage=15, history_days=14)
    assert p.cpu_percentile == 95.0

    # Invalid cpu_percentile > 100
    with pytest.raises(Exception):
        ScanParams(cpu_percentile=105.0)

    # Invalid cpu_percentile < 1
    with pytest.raises(Exception):
        ScanParams(cpu_percentile=0.0)

    # Invalid history_days < 1
    with pytest.raises(Exception):
        ScanParams(history_days=0)

    # Invalid history_days > 30
    with pytest.raises(Exception):
        ScanParams(history_days=31)


def test_engine_slim_null_allocations():
    engine = ScanEngine()
    # Test both empty dicts and explicit nulls (None)
    raw = {
        "scans": [
            {
                "object": {
                    "namespace": "edge-ns",
                    "kind": "Job",
                    "name": "one-off-job",
                    "container": "runner",
                    "pods": [],
                    "allocations": {
                        "requests": {},
                        "limits": {},
                    },
                },
                "recommended": {
                    "requests": {"cpu": 0.25, "memory": 268435456},
                    "limits": {"cpu": 0.5, "memory": 536870912},
                },
                "severity": "CRITICAL",
            },
            {
                "object": {
                    "namespace": "null-ns",
                    "kind": "Deployment",
                    "name": "unconfigured-app",
                    "container": "app",
                    "pods": None,
                    "allocations": {
                        "requests": None,
                        "limits": None,
                    },
                    "warnings": None,
                },
                "recommended": {
                    "requests": None,
                    "limits": None,
                    "info": None,
                },
                "severity": "UNKNOWN",
            }
        ]
    }
    result = engine.slim(raw)
    assert len(result["rows"]) == 2

    # Row 1
    row1 = result["rows"][0]
    assert row1["cur"]["req_cpu"] is None
    assert row1["cur"]["req_mem"] is None
    assert row1["rec"]["req_cpu"] == 0.25
    assert row1["rec"]["req_mem"] == 268435456
    assert row1["pods"] == 1  # Fallback pods = 1 when pod list is empty

    # Row 2 (explicit nulls)
    row2 = result["rows"][1]
    assert row2["cur"]["req_cpu"] is None
    assert row2["cur"]["req_mem"] is None
    assert row2["rec"]["req_cpu"] is None
    assert row2["rec"]["req_mem"] is None
    assert row2["pods"] == 1
    assert row2["warnings"] == []
    assert row2["info"] == {}


def test_failed_scan_fallback(tmp_path):
    os.environ["DATA_DIR"] = str(tmp_path)
    from backend.main import app
    from backend.engine import engine

    sid = "20261110-120000-fa11ed"
    # Create only a .meta.json file representing a failed scan
    meta = {
        "id": sid,
        "started": time.time() - 60,
        "status": "failed",
        "params": {"cpu_percentile": 95, "memory_buffer_percentage": 15, "history_days": 14, "namespaces": []},
        "finished": time.time(),
        "error": "Prometheus connection timed out after 30s",
    }
    engine._write_json(engine.meta_path(sid), meta)

    # get_scan should return detail object instead of None / 404
    detail = engine.get_scan(sid)
    assert detail is not None
    assert detail["status"] == "failed"
    assert "Prometheus" in detail["errors"][0]
    assert detail["rows"] == []

    with TestClient(app) as client:
        res = client.get(f"/api/scans/{sid}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == sid
        assert data["status"] == "failed"
        assert len(data["errors"]) == 1


def test_concurrency_conflict(tmp_path):
    os.environ["DATA_DIR"] = str(tmp_path)
    from backend.main import app

    with TestClient(app) as client:
        # Start first scan
        res1 = client.post("/api/scan", json={"cpu_percentile": 90, "memory_buffer_percentage": 10, "history_days": 7})
        assert res1.status_code == 202

        # Second scan while first is running should return 409
        res2 = client.post("/api/scan", json={"cpu_percentile": 90, "memory_buffer_percentage": 10, "history_days": 7})
        assert res2.status_code == 409
        assert "already running" in res2.json()["detail"]

        # Let the first scan thread finish so it cannot leak into later tests.
        deadline = time.time() + 15
        while time.time() < deadline:
            if client.get("/api/status").json()["running"] is None:
                break
            time.sleep(0.2)
        else:
            raise AssertionError("scan thread did not finish within timeout")


def test_basic_auth_protection(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTH_USER", "admin")
    monkeypatch.setenv("AUTH_PASSWORD", "secret123")
    monkeypatch.setattr("backend.main.REQUIRE_AUTH", True)
    monkeypatch.setattr("backend.main.AUTH_USER", "admin")
    monkeypatch.setattr("backend.main.AUTH_PASSWORD", "secret123")

    from backend.main import app

    with TestClient(app) as client:
        # Health check must still be accessible without auth
        health = client.get("/healthz")
        assert health.status_code == 200

        # Protected endpoint without credentials should fail with 401
        res_unauth = client.get("/api/scans")
        assert res_unauth.status_code == 401

        # With invalid credentials
        bad_auth = base64.b64encode(b"admin:wrong").decode()
        res_bad = client.get("/api/scans", headers={"Authorization": f"Basic {bad_auth}"})
        assert res_bad.status_code == 401

        # With valid credentials
        good_auth = base64.b64encode(b"admin:secret123").decode()
        res_good = client.get("/api/scans", headers={"Authorization": f"Basic {good_auth}"})
        assert res_good.status_code == 200


def test_production_mock_scan_strictly_forbidden(monkeypatch, tmp_path):
    """Ensure in production mode (no PYTEST_CURRENT_TEST or ALLOW_MOCK_SCAN), mock scan is rejected."""
    from backend.engine import engine
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("ALLOW_MOCK_SCAN", "false")

    out_file = str(tmp_path / "scan.raw")
    meta = {"id": "test-prod-forbid", "params": {}}
    with pytest.raises(RuntimeError, match="disabled in production"):
        engine._run_mock_scan(meta, out_file)


def test_production_namespaces_no_synthetic_data(monkeypatch):
    """Ensure in production mode when k8s API is unavailable, no synthetic namespaces are returned."""
    from backend import k8s
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("ALLOW_MOCK_NAMESPACES", "false")
    monkeypatch.setattr(k8s, "_cached_namespaces", None)
    monkeypatch.setattr(k8s, "_core_api", None)
    monkeypatch.setattr(k8s, "_init_core_api", lambda: None)

    ns = k8s.list_cluster_namespaces()
    assert ns == []


def test_real_k8s_empty_namespaces_does_not_fallback(monkeypatch):
    """When k8s core API returns 0 namespaces, return [] and never fallback to synthetic data."""
    from backend import k8s
    class FakeCoreApi:
        def list_namespace(self, _request_timeout=None):
            class FakeResponse:
                items = []
            return FakeResponse()

    monkeypatch.setattr(k8s, "_cached_namespaces", None)
    monkeypatch.setattr(k8s, "_init_core_api", lambda: FakeCoreApi())

    ns = k8s.list_cluster_namespaces()
    assert ns == []
