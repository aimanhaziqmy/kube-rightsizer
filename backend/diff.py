"""Cross-scan diff computation for kube-rightsizer."""
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("kube-rightsizer.diff")

EPS = 1e-9

ALLOCATION_KEYS = ("req_cpu", "req_mem", "lim_cpu", "lim_mem")


def row_key(row: Dict[str, Any]) -> str:
    return f"{row.get('ns')}/{row.get('kind')}/{row.get('name')}/{row.get('container')}"


def _allocations_changed(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(a, dict) or not isinstance(b, dict):
        return a != b
    for k in ALLOCATION_KEYS:
        va, vb = a.get(k), b.get(k)
        fa = float(va) if isinstance(va, (int, float)) else None
        fb = float(vb) if isinstance(vb, (int, float)) else None
        if fa is None or fb is None:
            if fa != fb:
                return True
        elif abs(fa - fb) > EPS:
            return True
    return False


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) else None


def _relative_gap(cur: Any, rec: Any) -> Optional[float]:
    c, r = _num(cur), _num(rec)
    if c is None or r is None:
        return None
    return abs(c - r) / max(abs(r), EPS)


def _moved_toward_recommended(cur_before: Dict[str, Any], cur_after: Dict[str, Any], rec: Any) -> bool:
    """True when current allocations changed and the relative gap to the
    recommendation shrank across the comparable CPU/memory dimensions."""
    before_sum, after_sum = 0.0, 0.0
    for k in ALLOCATION_KEYS:
        g_before = _relative_gap(cur_before.get(k), rec.get(k) if isinstance(rec, dict) else None)
        g_after = _relative_gap(cur_after.get(k), rec.get(k) if isinstance(rec, dict) else None)
        if g_before is not None and g_after is not None:
            before_sum += g_before
            after_sum += g_after
    return after_sum + EPS < before_sum


def _identity(key: str, row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "key": key,
        "ns": row.get("ns"),
        "kind": row.get("kind"),
        "name": row.get("name"),
        "container": row.get("container"),
    }


def compute_diff(baseline: Dict[str, Any], target: Dict[str, Any]) -> Dict[str, Any]:
    base_rows = {row_key(r): r for r in (baseline.get("rows") or []) if isinstance(r, dict)}
    target_rows = {row_key(r): r for r in (target.get("rows") or []) if isinstance(r, dict)}

    rows: List[Dict[str, Any]] = []
    for key, trow in target_rows.items():
        brow = base_rows.get(key)
        if brow is None:
            continue
        rec_changed = _allocations_changed(brow.get("rec"), trow.get("rec"))
        cur_changed = _allocations_changed(brow.get("cur"), trow.get("cur"))
        rows.append({
            "key": key,
            "ns": trow.get("ns"),
            "kind": trow.get("kind"),
            "name": trow.get("name"),
            "container": trow.get("container"),
            "changes": {
                "recommendation": rec_changed,
                "current": cur_changed,
                "current_toward_recommended": (
                    _moved_toward_recommended(brow.get("cur"), trow.get("cur"), trow.get("rec"))
                    if cur_changed
                    else False
                ),
                "severity": (brow.get("severity") or None) != (trow.get("severity") or None),
            },
        })

    removed_items = [_identity(key, base_rows[key]) for key in base_rows if key not in target_rows]
    added_items = [_identity(key, target_rows[key]) for key in target_rows if key not in base_rows]

    return {
        "baseline": {"id": baseline.get("id"), "started": baseline.get("started")},
        "target": {"id": target.get("id"), "started": target.get("started")},
        "rows": rows,
        "removed": {"count": len(removed_items), "items": removed_items},
        "added": {"count": len(added_items), "items": added_items},
    }
