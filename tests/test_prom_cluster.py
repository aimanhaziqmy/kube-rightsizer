"""Tests for cluster-wide Prometheus usage queries."""
from backend import prom

GI = 1024 ** 3


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_fetch_cluster_usage_builds_average_queries(monkeypatch):
    calls = []

    def fake_get(url, params=None, timeout=None):
        query = params["query"]
        calls.append(query)
        value = "1.5" if "container_cpu_usage_seconds_total" in query else str(3 * GI)
        return FakeResponse({"status": "success", "data": {"result": [{"value": [0, value]}]}})

    monkeypatch.setattr(prom.requests, "get", fake_get)

    usage = prom.fetch_cluster_usage("http://prometheus:9090", 24)

    assert usage["cpu"] == 1.5
    assert usage["memory"] == 3 * GI
    assert len(calls) == 2
    assert "sum(avg_over_time(rate(" in calls[0]
    assert "[24h:5m]" in calls[0]
    assert "sum(avg_over_time(" in calls[1]
    assert "[24h:5m]" in calls[1]


def test_fetch_cluster_usage_returns_none_on_empty_or_error(monkeypatch):
    responses = iter([
        FakeResponse({"status": "success", "data": {"result": []}}),
        FakeResponse({"status": "error", "error": "bad query"}),
    ])

    monkeypatch.setattr(prom.requests, "get", lambda *args, **kwargs: next(responses))

    usage = prom.fetch_cluster_usage("http://prometheus:9090", 24)

    assert usage["cpu"] is None
    assert usage["memory"] is None


def test_fetch_cluster_usage_without_prometheus_url():
    assert prom.fetch_cluster_usage("", 24) == {"cpu": None, "memory": None}
