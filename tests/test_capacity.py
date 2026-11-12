"""Tests for the scan-time cluster capacity snapshot."""
from types import SimpleNamespace

from backend import capacity
from backend.models import ScanDetail

GI = 1024 ** 3
MI = 1024 ** 2


def container(cpu=None, mem=None, lim_cpu=None, lim_mem=None):
    requests = {}
    limits = {}
    if cpu is not None:
        requests["cpu"] = cpu
    if mem is not None:
        requests["memory"] = mem
    if lim_cpu is not None:
        limits["cpu"] = lim_cpu
    if lim_mem is not None:
        limits["memory"] = lim_mem
    return SimpleNamespace(resources=SimpleNamespace(requests=requests, limits=limits))


def pod(containers=(), init_containers=(), overhead=None, phase="Running"):
    return SimpleNamespace(
        status=SimpleNamespace(phase=phase),
        spec=SimpleNamespace(
            containers=list(containers),
            init_containers=list(init_containers),
            overhead=overhead or {},
        ),
    )


def node(cpu, mem):
    return SimpleNamespace(status=SimpleNamespace(allocatable={"cpu": cpu, "memory": mem}))


def test_pod_totals_sums_regular_containers():
    totals = capacity.pod_totals(
        pod([container("500m", "256Mi", "1", "512Mi"), container("250m", "128Mi")])
    )
    assert totals["cpu_req"] == 0.75
    assert totals["mem_req"] == 384 * MI
    assert totals["cpu_lim"] == 1.0
    assert totals["mem_lim"] == 512 * MI


def test_pod_totals_uses_max_init_and_adds_overhead():
    totals = capacity.pod_totals(
        pod(
            [container("200m", "128Mi")],
            init_containers=[container("500m", "64Mi"), container("300m", "256Mi")],
            overhead={"cpu": "100m", "memory": "32Mi"},
        )
    )
    # init max: 500m / 256Mi, then overhead on top
    assert totals["cpu_req"] == 0.6
    assert totals["mem_req"] == 288 * MI


def test_pod_totals_adds_overhead_to_limits():
    totals = capacity.pod_totals(
        pod(
            [container("200m", "128Mi", "300m", "256Mi")],
            overhead={"cpu": "100m", "memory": "32Mi"},
        )
    )
    assert totals["cpu_lim"] == 0.4
    assert totals["mem_lim"] == 288 * MI


def test_pod_totals_uses_max_init_limits():
    totals = capacity.pod_totals(
        pod(
            [container("200m", "128Mi", "300m", "256Mi")],
            init_containers=[container("500m", "64Mi", "1", "512Mi")],
        )
    )
    assert totals["cpu_lim"] == 1.0
    assert totals["mem_lim"] == 512 * MI


def test_summarize_pods_excludes_terminal_pods():
    totals = capacity.summarize_pods(
        [
            pod([container("1", "1Gi", "2", "2Gi")]),
            pod([container("10", "10Gi", "20", "20Gi")], phase="Succeeded"),
            pod([container("10", "10Gi", "20", "20Gi")], phase="Failed"),
        ]
    )
    assert totals["cpu_req"] == 1.0
    assert totals["mem_req"] == GI
    assert totals["cpu_lim"] == 2.0
    assert totals["mem_lim"] == 2 * GI


def test_summarize_pods_handles_missing_resources():
    totals = capacity.summarize_pods([pod([container()])])
    assert totals == {"cpu_req": 0.0, "mem_req": 0.0, "cpu_lim": 0.0, "mem_lim": 0.0}


def test_summarize_nodes_parses_quantities():
    totals = capacity.summarize_nodes([node("4", "16Gi"), node("3500m", "8Gi")])
    assert totals["cpu"] == 7.5
    assert totals["memory"] == 24 * GI


def test_collect_capacity_snapshot_uses_all_sources(monkeypatch):
    monkeypatch.setattr(capacity, "list_nodes", lambda: [node("4", "16Gi")])
    monkeypatch.setattr(
        capacity,
        "list_all_pods",
        lambda: [pod([container("1", "2Gi", "2", "4Gi")])],
    )
    monkeypatch.setattr(
        capacity,
        "fetch_cluster_usage",
        lambda url, hours: {"cpu": 0.8, "memory": 3 * GI},
    )

    snapshot = capacity.collect_capacity_snapshot("http://prometheus", 24)

    assert snapshot["lookback_hours"] == 24
    assert snapshot["cpu"]["allocatable"] == 4
    assert snapshot["cpu"]["requests"] == 1
    assert snapshot["cpu"]["limits"] == 2
    assert snapshot["cpu"]["usage_avg"] == 0.8
    assert snapshot["memory"]["allocatable"] == 16 * GI
    assert snapshot["memory"]["requests"] == 2 * GI
    assert snapshot["memory"]["limits"] == 4 * GI
    assert snapshot["memory"]["usage_avg"] == 3 * GI
    assert snapshot["warnings"] == []


def test_collect_capacity_snapshot_degrades_without_failing(monkeypatch):
    def fail_nodes():
        raise RuntimeError("no nodes")

    def fail_pods():
        raise RuntimeError("no pods")

    def fail_usage(url, hours):
        raise RuntimeError("no prometheus")

    monkeypatch.setattr(capacity, "list_nodes", fail_nodes)
    monkeypatch.setattr(capacity, "list_all_pods", fail_pods)
    monkeypatch.setattr(capacity, "fetch_cluster_usage", fail_usage)

    snapshot = capacity.collect_capacity_snapshot("http://prometheus", 24)

    assert snapshot["cpu"]["allocatable"] is None
    assert snapshot["cpu"]["requests"] is None
    assert snapshot["cpu"]["usage_avg"] is None
    assert snapshot["memory"]["allocatable"] is None
    assert len(snapshot["warnings"]) == 3


def test_scan_detail_without_capacity_still_deserializes():
    detail = ScanDetail(id="old-scan", rows=[])
    assert detail.capacity == {}
