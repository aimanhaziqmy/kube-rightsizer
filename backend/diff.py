"""Cross-scan diff computation for kube-rightsizer."""
import logging
import math
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("kube-rightsizer.diff")

EPS = 1e-9

ALLOCATION_KEYS = ("req_cpu", "req_mem", "lim_cpu", "lim_mem")


def parse_quantity(val: Any) -> Optional[float]:
    """Parse numeric values or Kubernetes quantity strings ('100m', '256Mi', etc.) into float."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    if not isinstance(val, str):
        return None
    s = val.strip()
    if not s or s.lower() in ("unset", "?", "none", "null"):
        return None
    try:
        f = float(s)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except ValueError:
        pass
    # Kubernetes suffixes
    units = {
        "m": 1e-3,
        "u": 1e-6,
        "n": 1e-9,
        "k": 1e3,
        "M": 1e6,
        "G": 1e9,
        "T": 1e12,
        "P": 1e15,
        "E": 1e18,
        "Ki": 1024.0,
        "Mi": 1024.0**2,
        "Gi": 1024.0**3,
        "Ti": 1024.0**4,
        "Pi": 1024.0**5,
        "Ei": 1024.0**6,
    }
    for unit, mult in sorted(units.items(), key=lambda x: -len(x[0])):
        if s.endswith(unit):
            try:
                num_part = float(s[:-len(unit)].strip())
                return num_part * mult
            except ValueError:
                return None
    return None


def row_key(row: Dict[str, Any]) -> str:
    return f"{row.get('ns')}/{row.get('kind')}/{row.get('name')}/{row.get('container')}"


def _is_unset(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str) and v.strip().lower() in ("", "unset", "?", "none", "null"):
        return True
    return False


def _allocations_changed(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(a, dict) or not isinstance(b, dict):
        return a != b
    for k in ALLOCATION_KEYS:
        va, vb = a.get(k), b.get(k)
        if va == vb:
            continue
        if _is_unset(va) and _is_unset(vb):
            continue
        if _is_unset(va) != _is_unset(vb):
            return True
        fa = parse_quantity(va)
        fb = parse_quantity(vb)
        if fa is None or fb is None:
            if va != vb:
                return True
        elif abs(fa - fb) > EPS:
            return True
    return False


def _num(v: Any) -> Optional[float]:
    return parse_quantity(v)


def _relative_gap(cur: Any, rec: Any) -> Optional[float]:
    c, r = _num(cur), _num(rec)
    if c is None or r is None:
        return None
    return abs(c - r) / max(abs(r), EPS)


def _moved_toward_recommended(cur_before: Any, cur_after: Any, rec: Any) -> bool:
    """True when current allocations changed and the relative gap to the
    recommendation shrank across the comparable CPU/memory dimensions."""
    cur_b = cur_before if isinstance(cur_before, dict) else {}
    cur_a = cur_after if isinstance(cur_after, dict) else {}
    rec_d = rec if isinstance(rec, dict) else {}
    before_sum, after_sum = 0.0, 0.0
    for k in ALLOCATION_KEYS:
        g_before = _relative_gap(cur_b.get(k), rec_d.get(k))
        g_after = _relative_gap(cur_a.get(k), rec_d.get(k))
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
