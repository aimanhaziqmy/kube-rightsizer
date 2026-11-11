"""Tests for v1.1.0 "Show Your Work" evidence features."""
import importlib

import pytest

from backend import engine
from backend.engine import ScanEngine


@pytest.fixture
def raw_two_containers():
    return {
        "scans": [
            {
                "object": {
                    "namespace": "production",
                    "kind": "Deployment",
                    "name": "api",
                    "container": "app",
                    "pods": [{"name": "p1", "deleted": False}],
                    "allocations": {"requests": {"cpu": 1.0}, "limits": {"cpu": 2.0}},
                },
                "recommended": {
                    "requests": {"cpu": {"value": 0.5}, "memory": {}},
                    "limits": {"cpu": {}},
                },
                "severity": "WARNING",
            },
            {
                "object": {
                    "namespace": "production",
                    "kind": "Deployment",
                    "name": "web",
                    "container": "istio-proxy",
                    "pods": [{"name": "p1", "deleted": False}],
                    "allocations": {"requests": {"cpu": 0.1}, "limits": {}},
                },
                "recommended": {
                    "requests": {"cpu": {"value": 0.05}},
                    "limits": {},
                },
                "severity": "OK",
            },
            {
                "object": {
                    "namespace": "kube-system",
                    "kind": "Deployment",
                    "name": "coredns",
                    "container": "coredns",
                    "pods": [],
                    "allocations": {},
                },
                "recommended": {},
                "severity": "UNKNOWN",
            },
        ],
        "score": 80,
        "errors": [],
        "clusterSummary": {},
    }


def test_slim_excludes_kube_system(raw_two_containers):
    result = ScanEngine().slim(raw_two_containers)
    ns_list = [r["ns"] for r in result["rows"]]
    assert "kube-system" not in ns_list
    assert len(result["rows"]) == 2


def test_slim_sidecar_flag(raw_two_containers):
    result = ScanEngine().slim(raw_two_containers)
    by_container = {r["container"]: r for r in result["rows"]}
    assert by_container["istio-proxy"]["sidecar"] is True
    assert by_container["app"]["sidecar"] is False


def test_slim_attaches_usage_by_ns_container(raw_two_containers):
    usage_map = {"production|app": {"cpu": {"p95": 0.45, "max": 0.5}}}
    result = ScanEngine().slim(raw_two_containers, usage_map=usage_map)
    by_container = {r["container"]: r for r in result["rows"]}
    assert by_container["app"]["usage"] == {"cpu": {"p95": 0.45, "max": 0.5}}
    assert by_container["istio-proxy"]["usage"] == {}


def test_slim_custom_exclusions(monkeypatch, raw_two_containers):
    monkeypatch.setattr(engine, "EXCLUDED_NAMESPACES", ("production",))
    result = ScanEngine().slim(raw_two_containers)
    # production rows excluded, kube-system row now visible
    assert [r["ns"] for r in result["rows"]] == ["kube-system"]


def test_mock_usage_map_is_deterministic_and_consistent_with_formula():
    raw = {
        "scans": [
            {
                "object": {"namespace": "production", "kind": "Deployment", "name": "api", "container": "app"},
                "recommended": {"requests": {"cpu": {"value": 0.5}, "memory": {"value": 536870912}}},
            }
        ]
    }
    params = {"cpu_percentile": 95, "memory_buffer_percentage": 15}
    first = ScanEngine._mock_usage_map(raw, params)
    second = ScanEngine._mock_usage_map(raw, params)
    assert first == second

    entry = first["production|app"]
    # CPU basis (p95) must equal the recommendation: request = p95, no headroom
    assert entry["cpu"]["p95"] == 0.5
    # Memory: recommendation = max × (1 + buffer/100)
    assert entry["memory"]["max"] == pytest.approx(536870912 / 1.15)
    assert entry["memory"]["max"] < entry["memory"]["p99"] * 1.02 + 1


def test_percentile_key_formatting():
    from backend.prom import percentile_key
    assert percentile_key(95) == "p95"
    assert percentile_key(95.0) == "p95"
    assert percentile_key(97.5) == "p97.5"


def test_fetch_container_usage_without_prom_url_is_empty():
    from backend.prom import fetch_container_usage
    assert fetch_container_usage("", 336, 95) == {}
