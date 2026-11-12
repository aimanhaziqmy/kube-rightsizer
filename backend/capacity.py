"""Cluster capacity snapshot collected during a scan.

The Overview gauges need cluster-wide numbers that KRR's per-workload scan
rows do not contain: node allocatable, total pod requests/limits, and average
usage. This module collects those at scan time and the scan result stores the
snapshot, so the UI always renders the same data the scan was based on.

Collection is best-effort: a missing Kubernetes API or Prometheus leaves the
affected fields as ``None`` instead of failing the scan.
"""
import logging
import time
from typing import Any, Dict, Iterable, Optional, Tuple

logger = logging.getLogger("kube-rightsizer.capacity")

try:
    from kubernetes.utils import parse_quantity
except ImportError:  # pragma: no cover - kubernetes is a runtime dependency
    parse_quantity = None

from backend.k8s import list_all_pods, list_nodes
from backend.prom import fetch_cluster_usage


def _quantity(value: Any) -> float:
    """Parse a Kubernetes quantity into a float, treating missing values as 0."""
    if value is None or value == "":
        return 0.0
    if parse_quantity is None:
        return 0.0
    try:
        return float(parse_quantity(str(value)))
    except Exception:
        return 0.0


def _container_resources(container: Any) -> Tuple[float, float, float, float]:
    resources = getattr(container, "resources", None)
    requests = getattr(resources, "requests", None) or {}
    limits = getattr(resources, "limits", None) or {}
    return (
        _quantity(requests.get("cpu")),
        _quantity(requests.get("memory")),
        _quantity(limits.get("cpu")),
        _quantity(limits.get("memory")),
    )


def pod_totals(pod: Any) -> Dict[str, float]:
    """Return the scheduler-relevant requests/limits for one pod.

    Regular containers are summed; init containers use the max per resource;
    pod overhead is added on top. This mirrors how Kubernetes computes the
    pod's effective resource requirements.
    """
    spec = getattr(pod, "spec", None)
    if spec is None:
        return {"cpu_req": 0.0, "mem_req": 0.0, "cpu_lim": 0.0, "mem_lim": 0.0}

    cpu_req = mem_req = cpu_lim = mem_lim = 0.0
    for container in getattr(spec, "containers", None) or []:
        c_req, m_req, c_lim, m_lim = _container_resources(container)
        cpu_req += c_req
        mem_req += m_req
        cpu_lim += c_lim
        mem_lim += m_lim

    init_cpu_req = init_mem_req = init_cpu_lim = init_mem_lim = 0.0
    for container in getattr(spec, "init_containers", None) or []:
        c_req, m_req, c_lim, m_lim = _container_resources(container)
        init_cpu_req = max(init_cpu_req, c_req)
        init_mem_req = max(init_mem_req, m_req)
        init_cpu_lim = max(init_cpu_lim, c_lim)
        init_mem_lim = max(init_mem_lim, m_lim)

    overhead = getattr(spec, "overhead", None) or {}
    cpu_req = max(cpu_req, init_cpu_req) + _quantity(overhead.get("cpu"))
    mem_req = max(mem_req, init_mem_req) + _quantity(overhead.get("memory"))
    cpu_lim = max(cpu_lim, init_cpu_lim) + _quantity(overhead.get("cpu"))
    mem_lim = max(mem_lim, init_mem_lim) + _quantity(overhead.get("memory"))

    return {
        "cpu_req": cpu_req,
        "mem_req": mem_req,
        "cpu_lim": cpu_lim,
        "mem_lim": mem_lim,
    }


def _is_terminal(pod: Any) -> bool:
    phase = getattr(getattr(pod, "status", None), "phase", None)
    return phase in ("Succeeded", "Failed")


def summarize_pods(pods: Iterable[Any]) -> Dict[str, float]:
    """Aggregate requests/limits across non-terminal pods in all namespaces."""
    totals = {"cpu_req": 0.0, "mem_req": 0.0, "cpu_lim": 0.0, "mem_lim": 0.0}
    for pod in pods or []:
        if _is_terminal(pod):
            continue
        pod_totals_value = pod_totals(pod)
        for key in totals:
            totals[key] += pod_totals_value[key]
    return totals


def summarize_nodes(nodes: Iterable[Any]) -> Dict[str, float]:
    """Sum node.status.allocatable CPU (cores) and memory (bytes)."""
    cpu = 0.0
    memory = 0.0
    for node in nodes or []:
        allocatable = getattr(getattr(node, "status", None), "allocatable", None) or {}
        cpu += _quantity(allocatable.get("cpu"))
        memory += _quantity(allocatable.get("memory"))
    return {"cpu": cpu, "memory": memory}


def _empty_resource() -> Dict[str, Optional[float]]:
    return {"allocatable": None, "usage_avg": None, "requests": None, "limits": None}


def collect_capacity_snapshot(
    prom_url: str,
    lookback_hours: float,
) -> Dict[str, Any]:
    """Collect a best-effort cluster-wide capacity snapshot for a scan."""
    snapshot: Dict[str, Any] = {
        "collected_at": time.time(),
        "lookback_hours": int(lookback_hours),
        "cpu": _empty_resource(),
        "memory": _empty_resource(),
        "warnings": [],
    }

    try:
        nodes = list_nodes()
        if nodes is None:
            raise RuntimeError("Kubernetes API unavailable")
        node_totals = summarize_nodes(nodes)
        snapshot["cpu"]["allocatable"] = node_totals["cpu"]
        snapshot["memory"]["allocatable"] = node_totals["memory"]
    except Exception as e:
        logger.warning(f"Could not read node allocatable: {e}")
        snapshot["warnings"].append(f"allocatable: {str(e)[:200]}")

    try:
        pods = list_all_pods()
        if pods is None:
            raise RuntimeError("Kubernetes API unavailable")
        pod_totals_value = summarize_pods(pods)
        snapshot["cpu"]["requests"] = pod_totals_value["cpu_req"]
        snapshot["cpu"]["limits"] = pod_totals_value["cpu_lim"]
        snapshot["memory"]["requests"] = pod_totals_value["mem_req"]
        snapshot["memory"]["limits"] = pod_totals_value["mem_lim"]
    except Exception as e:
        logger.warning(f"Could not read pod requests/limits: {e}")
        snapshot["warnings"].append(f"requests/limits: {str(e)[:200]}")

    try:
        usage = fetch_cluster_usage(prom_url, lookback_hours)
        snapshot["cpu"]["usage_avg"] = usage.get("cpu")
        snapshot["memory"]["usage_avg"] = usage.get("memory")
    except Exception as e:
        logger.warning(f"Could not read cluster usage: {e}")
        snapshot["warnings"].append(f"usage: {str(e)[:200]}")

    return snapshot
