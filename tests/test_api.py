"""Integration tests for kube-rightsizer API and SPA serving."""
import os
import tempfile
import time
import pytest
from starlette.testclient import TestClient

# Use temporary data dir for tests
test_data_dir = tempfile.mkdtemp(prefix="krr_test_")
os.environ["DATA_DIR"] = test_data_dir

from backend.main import app
from backend.engine import engine


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_healthz(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "kube-rightsizer"}

    res2 = client.get("/api/healthz")
    assert res2.status_code == 200


def test_namespaces(client):
    res = client.get("/api/namespaces")
    assert res.status_code == 200
    ns = res.json()
    assert isinstance(ns, list)
    assert len(ns) > 0


def test_status_empty(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert "cluster_name" in data
    assert "total_scans" in data
    assert data["running"] is None


def test_trigger_scan_and_get_results(client):
    payload = {
        "cpu_percentile": 95.0,
        "memory_buffer_percentage": 15,
        "history_days": 14,
        "namespaces": ["production"],
    }
    res = client.post("/api/scan", json=payload)
    assert res.status_code == 202
    meta = res.json()
    scan_id = meta["id"]
    assert meta["status"] == "running"

    # Wait for mock scan to complete (mock scan sleeps ~2.8s)
    max_wait = 15
    start = time.time()
    completed = False
    while time.time() - start < max_wait:
        status_res = client.get("/api/status").json()
        if status_res["running"] is None:
            completed = True
            break
        time.sleep(0.5)

    assert completed, "Scan did not finish within timeout"

    # Check scan list
    scans_res = client.get("/api/scans")
    assert scans_res.status_code == 200
    scans = scans_res.json()
    assert any(s["id"] == scan_id for s in scans)

    # Check scan detail
    detail_res = client.get(f"/api/scans/{scan_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == scan_id
    assert detail["status"] == "done"
    assert len(detail["rows"]) > 0

    first_row = detail["rows"][0]
    assert "ns" in first_row
    assert "cur" in first_row
    assert "rec" in first_row

    # Test delete scan
    del_res = client.delete(f"/api/scans/{scan_id}")
    assert del_res.status_code == 200

    del_verify = client.get(f"/api/scans/{scan_id}")
    assert del_verify.status_code == 404


def test_spa_serving(client):
    # Verify index.html is served on root path
    res = client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "kube-rightsizer" in res.text


def test_404_nonexistent_scan(client):
    res = client.get("/api/scans/20260101-000000-deadbe")
    assert res.status_code == 404
