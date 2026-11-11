"""Tests for the cross-scan diff endpoint (GET /api/scans/{id}/diff)."""
import os
import tempfile

import pytest
from starlette.testclient import TestClient

from backend import engine as engine_module
from backend.main import app


@pytest.fixture(scope="module")
def diff_dir():
    d = tempfile.mkdtemp(prefix="krr_diff_")
    old = engine_module.DATA_DIR
    engine_module.DATA_DIR = d
    yield d
    engine_module.DATA_DIR = old


@pytest.fixture(scope="module")
def client(diff_dir):
    with TestClient(app) as c:
        yield c


def _row(ns, kind, name, container, cur, rec, severity):
    return {
        "ns": ns,
        "kind": kind,
        "name": name,
        "container": container,
        "pods": 2,
        "hpa": False,
        "severity": severity,
        "cur": cur,
        "rec": rec,
        "info": {},
        "warnings": [],
    }


def _write_scan(data_dir, sid, started, rows):
    meta = {
        "id": sid,
        "started": started,
        "status": "done",
        "params": {
            "cpu_percentile": 95.0,
            "memory_buffer_percentage": 15,
            "history_days": 14,
            "namespaces": [],
        },
        "containers": len(rows),
    }
    scan = {**meta, "rows": rows, "score": 50.0, "errors": [], "cluster": {}}
    with open(os.path.join(data_dir, f"{sid}.meta.json"), "w", encoding="utf-8") as f:
        import json

        json.dump(meta, f)
    with open(os.path.join(data_dir, f"{sid}.json"), "w", encoding="utf-8") as f:
        json.dump(scan, f)
    return scan


CUR_A = {"req_cpu": 2.0, "req_mem": 2147483648, "lim_cpu": 4.0, "lim_mem": 4294967296}
REC_A = {"req_cpu": 0.5, "req_mem": 536870912, "lim_cpu": 1.0, "lim_mem": 1073741824}
REC_B = {"req_cpu": 0.4, "req_mem": 536870912, "lim_cpu": 1.0, "lim_mem": 1073741824}


@pytest.fixture()
def fresh_dir():
    """Isolated data dir so default-baseline tests don't see other scans."""
    d = tempfile.mkdtemp(prefix="krr_diff_fresh_")
    old = engine_module.DATA_DIR
    engine_module.DATA_DIR = d
    yield d
    engine_module.DATA_DIR = old


def test_diff_defaults_to_previous_scan(client, fresh_dir):
    baseline_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    target_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_B, "CRITICAL")]
    _write_scan(fresh_dir, "20260110-000000-202020", 10000.0, baseline_rows)
    _write_scan(fresh_dir, "20260111-000000-212121", 11000.0, target_rows)

    res = client.get("/api/scans/20260111-000000-212121/diff")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline"]["id"] == "20260110-000000-202020"
    assert body["target"]["id"] == "20260111-000000-212121"


def test_diff_single_scan_returns_404(client, fresh_dir):
    rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    _write_scan(fresh_dir, "20260112-000000-222222", 12000.0, rows)

    res = client.get("/api/scans/20260112-000000-222222/diff")
    assert res.status_code == 404
    assert "earlier" in res.json()["detail"].lower()


def test_diff_missing_or_failed_scans_return_404(client, fresh_dir):
    # Nonexistent target
    res = client.get("/api/scans/20260113-000000-333333/diff")
    assert res.status_code == 404

    # Failed scan as target (meta only, no rows)
    with open(os.path.join(fresh_dir, "20260114-000000-444444.meta.json"), "w", encoding="utf-8") as f:
        import json

        json.dump({"id": "20260114-000000-444444", "started": 14000.0, "status": "failed",
                   "params": {"cpu_percentile": 95.0, "memory_buffer_percentage": 15,
                              "history_days": 14, "namespaces": []},
                   "error": "boom"}, f)
    res = client.get("/api/scans/20260114-000000-444444/diff")
    assert res.status_code == 404


def test_diff_skips_failed_scan_for_default_baseline(client, fresh_dir):
    # Good scan at 11000, failed scan at 15000, target at 16000:
    # the default baseline must skip the failed scan and land on 11000.
    rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    _write_scan(fresh_dir, "20260111-000000-212121", 11000.0, rows)
    with open(os.path.join(fresh_dir, "20260115-000000-555555.meta.json"), "w", encoding="utf-8") as f:
        import json

        json.dump({"id": "20260115-000000-555555", "started": 15000.0, "status": "failed",
                   "params": {"cpu_percentile": 95.0, "memory_buffer_percentage": 15,
                              "history_days": 14, "namespaces": []},
                   "error": "boom"}, f)
    target_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_B, "CRITICAL")]
    _write_scan(fresh_dir, "20260116-000000-666666", 16000.0, target_rows)

    res = client.get("/api/scans/20260116-000000-666666/diff")
    assert res.status_code == 200
    assert res.json()["baseline"]["id"] == "20260111-000000-212121"


def _write_failed_meta(data_dir, sid, started):
    with open(os.path.join(data_dir, f"{sid}.meta.json"), "w", encoding="utf-8") as f:
        import json

        json.dump({"id": sid, "started": started, "status": "failed",
                   "params": {"cpu_percentile": 95.0, "memory_buffer_percentage": 15,
                              "history_days": 14, "namespaces": []},
                   "error": "boom"}, f)


def test_history_returns_workload_series_chronologically(client, fresh_dir):
    rec_old = {"req_cpu": 0.5, "req_mem": 536870912, "lim_cpu": 1.0, "lim_mem": 1073741824}
    rec_mid = {"req_cpu": 0.4, "req_mem": 536870912, "lim_cpu": 1.0, "lim_mem": 1073741824}
    rows_1 = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, rec_old, "CRITICAL")]
    rows_2 = [_row("production", "Deployment", "unrelated", "app", CUR_A, rec_mid, "WARNING")]
    rows_3 = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, rec_mid, "WARNING")]
    _write_scan(fresh_dir, "20260101-000000-aaaaaa", 1000.0, rows_1)
    _write_scan(fresh_dir, "20260102-000000-bbbbbb", 2000.0, rows_2)
    _write_scan(fresh_dir, "20260103-000000-cccccc", 3000.0, rows_3)

    res = client.get("/api/scans/history?key=production/Deployment/api-gateway/proxy")
    assert res.status_code == 200
    body = res.json()
    assert body["key"] == "production/Deployment/api-gateway/proxy"
    assert [p["id"] for p in body["points"]] == ["20260101-000000-aaaaaa", "20260103-000000-cccccc"]

    point = body["points"][0]
    assert point["started"] == 1000.0
    assert point["cur"] == {"req_cpu": 2.0, "req_mem": 2147483648, "lim_cpu": 4.0, "lim_mem": 4294967296}
    assert point["rec"] == {"req_cpu": 0.5, "req_mem": 536870912, "lim_cpu": 1.0, "lim_mem": 1073741824}
    assert point["severity"] == "CRITICAL"


def test_history_unknown_key_returns_empty_points(client, fresh_dir):
    _write_scan(fresh_dir, "20260101-000000-aaaaaa", 1000.0,
                [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")])
    res = client.get("/api/scans/history?key=nope/Deployment/missing/ctr")
    assert res.status_code == 200
    assert res.json()["points"] == []


def test_trends_returns_trimmed_done_scans_chronologically(client, fresh_dir):
    rows_a = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    rows_b = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_B, "CRITICAL")]
    _write_scan(fresh_dir, "20260101-000000-aaaaaa", 1000.0, rows_a)
    _write_scan(fresh_dir, "20260102-000000-bbbbbb", 2000.0, rows_b)
    _write_failed_meta(fresh_dir, "20260103-000000-cccccc", 3000.0)

    res = client.get("/api/scans/trends")
    assert res.status_code == 200
    scans = res.json()["scans"]
    assert [s["id"] for s in scans] == ["20260101-000000-aaaaaa", "20260102-000000-bbbbbb"]

    row = scans[0]["rows"][0]
    assert row == {
        "ns": "production", "kind": "Deployment", "name": "api-gateway", "container": "proxy",
        "pods": 2, "severity": "CRITICAL",
        "cur": {"req_cpu": 2.0, "req_mem": 2147483648},
        "rec": {"req_cpu": 0.5, "req_mem": 536870912},
    }
    # Trimmed rows must not carry limits/info/warnings (keeps the payload small)
    assert "lim_cpu" not in row["cur"] and "info" not in row


def test_diff_flags_recommendation_change(client, diff_dir):
    baseline_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    target_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_B, "CRITICAL")]
    _write_scan(diff_dir, "20260101-000000-aaaaaa", 1000.0, baseline_rows)
    _write_scan(diff_dir, "20260102-000000-bbbbbb", 2000.0, target_rows)

    res = client.get("/api/scans/20260102-000000-bbbbbb/diff?compare_to=20260101-000000-aaaaaa")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline"]["id"] == "20260101-000000-aaaaaa"
    assert body["target"]["id"] == "20260102-000000-bbbbbb"

    rows = {r["key"]: r for r in body["rows"]}
    row = rows["production/Deployment/api-gateway/proxy"]
    assert row["changes"]["recommendation"] is True
    assert row["changes"]["recommendation"] is not False  # guard against truthy-but-not-True


def test_diff_flags_current_moved_toward_recommended(client, diff_dir):
    cur_b = {"req_cpu": 0.6, "req_mem": 2147483648, "lim_cpu": 4.0, "lim_mem": 4294967296}
    baseline_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    target_rows = [_row("production", "Deployment", "api-gateway", "proxy", cur_b, REC_A, "CRITICAL")]
    _write_scan(diff_dir, "20260103-000000-cccccc", 3000.0, baseline_rows)
    _write_scan(diff_dir, "20260104-000000-dddddd", 4000.0, target_rows)

    res = client.get("/api/scans/20260104-000000-dddddd/diff?compare_to=20260103-000000-cccccc")
    assert res.status_code == 200
    rows = {r["key"]: r for r in res.json()["rows"]}
    row = rows["production/Deployment/api-gateway/proxy"]
    assert row["changes"]["current"] is True
    assert row["changes"]["current_toward_recommended"] is True
    assert row["changes"]["recommendation"] is False


def test_diff_reports_removed_and_added_workloads(client, diff_dir):
    baseline_rows = [
        _row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL"),
        _row("production", "Deployment", "deleted-svc", "app", CUR_A, REC_A, "WARNING"),
    ]
    target_rows = [
        _row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL"),
        _row("production", "Deployment", "new-svc", "app", CUR_A, REC_A, "WARNING"),
    ]
    _write_scan(diff_dir, "20260109-000000-191919", 9000.0, baseline_rows)
    _write_scan(diff_dir, "20260110-000000-202020", 10000.0, target_rows)

    res = client.get("/api/scans/20260110-000000-202020/diff?compare_to=20260109-000000-191919")
    assert res.status_code == 200
    body = res.json()
    assert body["removed"]["count"] == 1
    assert body["removed"]["items"] == [
        {"key": "production/Deployment/deleted-svc/app",
         "ns": "production", "kind": "Deployment", "name": "deleted-svc", "container": "app"}
    ]
    assert body["added"]["count"] == 1
    assert body["added"]["items"] == [
        {"key": "production/Deployment/new-svc/app",
         "ns": "production", "kind": "Deployment", "name": "new-svc", "container": "app"}
    ]
    # Removed/added rows must not pollute the main drift rows
    assert {r["name"] for r in body["rows"]} == {"api-gateway"}


def test_diff_flags_severity_change_and_unchanged_row(client, diff_dir):
    unchanged_cur = {"req_cpu": 0.5, "req_mem": 536870912, "lim_cpu": 1.0, "lim_mem": 1073741824}
    unchanged_rec = unchanged_cur
    baseline_rows = [
        _row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "WARNING"),
        _row("production", "Deployment", "stable", "app", unchanged_cur, unchanged_rec, "GOOD"),
    ]
    target_rows = [
        _row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL"),
        _row("production", "Deployment", "stable", "app", unchanged_cur, unchanged_rec, "GOOD"),
    ]
    _write_scan(diff_dir, "20260107-000000-171717", 7000.0, baseline_rows)
    _write_scan(diff_dir, "20260108-000000-181818", 8000.0, target_rows)

    res = client.get("/api/scans/20260108-000000-181818/diff?compare_to=20260107-000000-171717")
    assert res.status_code == 200
    rows = {r["key"]: r for r in res.json()["rows"]}
    drift = rows["production/Deployment/api-gateway/proxy"]
    assert drift["changes"]["severity"] is True
    assert drift["changes"]["recommendation"] is False
    assert drift["changes"]["current"] is False
    stable = rows["production/Deployment/stable/app"]
    assert stable["changes"] == {
        "recommendation": False,
        "current": False,
        "current_toward_recommended": False,
        "severity": False,
    }


def test_diff_flags_current_moved_away_from_recommended(client, diff_dir):
    cur_b = {"req_cpu": 3.0, "req_mem": 2147483648, "lim_cpu": 4.0, "lim_mem": 4294967296}
    baseline_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    target_rows = [_row("production", "Deployment", "api-gateway", "proxy", cur_b, REC_A, "CRITICAL")]
    _write_scan(diff_dir, "20260105-000000-eeeeee", 5000.0, baseline_rows)
    _write_scan(diff_dir, "20260106-000000-ffffff", 6000.0, target_rows)

    res = client.get("/api/scans/20260106-000000-ffffff/diff?compare_to=20260105-000000-eeeeee")
    assert res.status_code == 200
    rows = {r["key"]: r for r in res.json()["rows"]}
    row = rows["production/Deployment/api-gateway/proxy"]
    assert row["changes"]["current"] is True
    assert row["changes"]["current_toward_recommended"] is False

    baseline_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_A, "CRITICAL")]
    target_rows = [_row("production", "Deployment", "api-gateway", "proxy", CUR_A, REC_B, "CRITICAL")]
    _write_scan(diff_dir, "20260101-000000-aaaaaa", 1000.0, baseline_rows)
    _write_scan(diff_dir, "20260102-000000-bbbbbb", 2000.0, target_rows)

    res = client.get("/api/scans/20260102-000000-bbbbbb/diff?compare_to=20260101-000000-aaaaaa")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline"]["id"] == "20260101-000000-aaaaaa"
    assert body["target"]["id"] == "20260102-000000-bbbbbb"

    rows = {r["key"]: r for r in body["rows"]}
    row = rows["production/Deployment/api-gateway/proxy"]
    assert row["changes"]["recommendation"] is True
    assert row["changes"]["recommendation"] is not False  # guard against truthy-but-not-True
