"""Prometheus usage evidence queries.

Fetches per-container CPU/memory usage percentiles directly from the same
Prometheus the KRR engine reads, so the UI can show the measured data behind
each recommendation. The formulas intentionally mirror KRR's "simple"
strategy: CPU = configured percentile of per-pod usage, max across pods;
memory = max working set across pods (max is queried directly).

No synthetic data is ever produced here: on query failure the affected
containers simply have no usage entry, and the UI shows that honestly.
"""
import logging
import math
import time
from typing import Dict, Optional, Tuple

import requests

logger = logging.getLogger("kube-rightsizer.prom")

QUERY_TIMEOUT = 20.0
# Subquery step for historical percentiles (matches KRR default timeframe of 5m)
STEP = "5m"

CONTAINER_SELECTOR = '{container!="",container!="POD"}'

CPU_METRIC = "container_cpu_usage_seconds_total"
MEM_METRIC = "container_memory_working_set_bytes"


def percentile_key(p: float) -> str:
    """Format a percentile value (e.g. 95 or 97.5) as a lookup key ("p95")."""
    return f"p{p:g}"


def _query(prom_url: str, promql: str) -> Dict[Tuple[str, str], float]:
    resp = requests.get(
        f"{prom_url.rstrip('/')}/api/v1/query",
        params={"query": promql},
        timeout=QUERY_TIMEOUT,
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") != "success":
        raise RuntimeError(f"Prometheus query failed: {str(body.get('error'))[:300]}")

    out: Dict[Tuple[str, str], float] = {}
    for item in body.get("data", {}).get("result", []):
        metric = item.get("metric", {})
        ns = metric.get("namespace")
        container = metric.get("container")
        if not ns or not container:
            continue
        try:
            value = float(item["value"][1])
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if math.isnan(value) or math.isinf(value):  # NaN or Inf from quantile_over_time over empty series
            continue
        out[(ns, container)] = value
    return out


def _range_subquery(lookback_hours: float) -> str:
    return f"[{int(lookback_hours)}h:{STEP}]"


def fetch_container_usage(
    prom_url: str,
    lookback_hours: float,
    cpu_percentile: float,
) -> Dict[str, Dict[str, Dict[str, Optional[float]]]]:
    """Return usage evidence keyed by "namespace|container".

    Shape per container:
        {"cpu": {"p50": .., "p90": .., "p95": .., "p99": .., "max": ..,
                 "<p{cpu_percentile}>": ..},
         "memory": {"p50": .., ..., "max": ..}}

    Missing keys mean Prometheus had no data for that percentile.
    """
    if not prom_url:
        return {}

    rng = _range_subquery(lookback_hours)
    keys = ["p50", "p90", "p99", "max", percentile_key(cpu_percentile)]
    cpu_quantiles = [k for k in keys if k != "max"]
    mem_quantiles = ["p50", "p90", "p95", "p99"]

    usage: Dict[str, Dict[str, Dict[str, Optional[float]]]] = {}

    def merge(metric: str, key: str, quantile: Optional[float], counter: bool) -> None:
        series = f"{metric}{CONTAINER_SELECTOR}"
        if counter:
            base = f"rate({series}[{STEP}])"
            if quantile is not None:
                inner = f"quantile_over_time({quantile}, {base}{rng})"
            else:
                inner = f"max_over_time({base}{rng})"
        else:
            if quantile is not None:
                inner = f"quantile_over_time({quantile}, {series}{rng})"
            else:
                inner = f"max_over_time({series}{rng})"
        promql = f"max by (namespace, container) ({inner})"
        try:
            for (ns, container), value in _query(prom_url, promql).items():
                slot = usage.setdefault(f"{ns}|{container}", {}).setdefault(
                    "cpu" if metric == CPU_METRIC else "memory", {}
                )
                slot[key] = value
        except Exception as e:
            logger.warning(f"Usage evidence query failed ({key}, {metric}): {e}")

    started = time.time()
    for k in cpu_quantiles:
        q = float(k[1:]) / 100.0
        merge(CPU_METRIC, k, q, counter=True)
    merge(CPU_METRIC, "max", None, counter=True)
    for k in mem_quantiles:
        merge(MEM_METRIC, k, float(k[1:]) / 100.0, counter=False)
    merge(MEM_METRIC, "max", None, counter=False)
    for k in [percentile_key(cpu_percentile)]:
        if k not in ("p50", "p90", "p95", "p99"):
            merge(MEM_METRIC, k, float(k[1:]) / 100.0, counter=False)

    logger.info(
        f"Usage evidence collected for {len(usage)} containers in {round(time.time() - started, 1)}s"
    )
    return usage
