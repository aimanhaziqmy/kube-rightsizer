"""Scan execution engine, history persistence, and live log streaming."""
import asyncio
import json
import logging
import math
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from backend.models import ScanDetail, ScanMeta, ScanParams, WorkloadRow

logger = logging.getLogger("kube-rightsizer.engine")


def sanitize_for_json(obj: Any) -> Any:
    """Recursively convert float('nan'), float('inf'), and -float('inf') to None for RFC 8259 compliance."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    return obj

def _get_data_dir() -> str:
    env_dir = os.environ.get("DATA_DIR")
    if env_dir:
        try:
            os.makedirs(env_dir, exist_ok=True)
            return env_dir
        except Exception:
            pass

    # Default to /data/scans if possible (e.g. Docker container)
    default_dir = "/data/scans"
    try:
        os.makedirs(default_dir, exist_ok=True)
        return default_dir
    except Exception:
        # Fallback to user home directory for local development
        local_dir = os.path.join(os.path.expanduser("~"), ".kube-rightsizer", "scans")
        os.makedirs(local_dir, exist_ok=True)
        return local_dir


DATA_DIR = _get_data_dir()
KEEP_SCANS = int(os.environ.get("KEEP_SCANS", "30"))
SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT", "1800"))
PROM_URL = os.environ.get("PROMETHEUS_URL", "http://prometheus-k8s.monitoring:9090")

# Comma-separated environment lists; blank entries are ignored.
def _env_csv(name: str, default: str) -> tuple:
    raw = os.environ.get(name, default)
    return tuple(x.strip() for x in raw.split(",") if x.strip())

# Namespaces whose workloads never get recommendations shown (infra noise).
EXCLUDED_NAMESPACES = _env_csv("EXCLUDED_NAMESPACES", "kube-system")
# Well-known sidecar container names, tagged in the UI so their numbers are
# not mistaken for app-container sizing errors.
SIDECAR_CONTAINERS = _env_csv(
    "SIDECAR_CONTAINERS",
    "istio-proxy,envoy,linkerd-proxy,linkerd2-proxy,jaeger-agent,otel-collector,datadog-agent",
)

ID_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$")
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


class ScanEngine:
    def __init__(self):
        self._lock = threading.Lock()
        self.current_meta: Optional[Dict[str, Any]] = None
        self.current_logs: List[str] = []
        self._subscribers: Set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def meta_path(self, sid: str) -> str:
        return os.path.join(DATA_DIR, f"{sid}.meta.json")

    def scan_path(self, sid: str) -> str:
        return os.path.join(DATA_DIR, f"{sid}.json")

    def _write_json(self, path: str, data: Any):
        clean_data = sanitize_for_json(data)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.tmp.{uuid.uuid4().hex[:6]}"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(clean_data, f, indent=2, allow_nan=False)
        os.replace(tmp, path)

    def recover(self):
        """Mark interrupted scans on startup as failed."""
        for m in self.list_metas():
            if m.get("status") == "running":
                m.update(status="failed", error="Instance restarted while scan was in progress")
                self._write_json(self.meta_path(m["id"]), m)

    def list_metas(self) -> List[Dict[str, Any]]:
        metas = []
        if not os.path.exists(DATA_DIR):
            return metas
        for name in os.listdir(DATA_DIR):
            if name.endswith(".meta.json"):
                path = os.path.join(DATA_DIR, name)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        metas.append(sanitize_for_json(json.load(f)))
                except Exception as e:
                    logger.warning(f"Error reading scan meta {path}: {e}")

        def _safe_started(m: Dict[str, Any]) -> float:
            val = m.get("started")
            if isinstance(val, (int, float)) and not (math.isnan(val) or math.isinf(val)):
                return float(val)
            return 0.0

        return sorted(metas, key=_safe_started, reverse=True)

    def get_scan(self, sid: str) -> Optional[Dict[str, Any]]:
        if not ID_RE.match(sid):
            return None
        path = self.scan_path(sid)
        if not os.path.exists(path):
            # Check if meta file exists (e.g. failed or interrupted scan)
            mpath = self.meta_path(sid)
            if os.path.exists(mpath):
                try:
                    with open(mpath, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    return sanitize_for_json({
                        **meta,
                        "rows": [],
                        "score": None,
                        "errors": [meta.get("error")] if meta.get("error") else [],
                        "cluster": {},
                    })
                except Exception:
                    return None
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return sanitize_for_json(data)
        except Exception as e:
            logger.error(f"Failed to read scan {sid}: {e}")
            return None

    def delete_scan(self, sid: str) -> bool:
        if not ID_RE.match(sid):
            return False
        deleted = False
        for p in (self.meta_path(sid), self.scan_path(sid)):
            if os.path.exists(p):
                try:
                    os.remove(p)
                    deleted = True
                except Exception as e:
                    logger.error(f"Failed to remove {p}: {e}")
        return deleted

    def prune(self):
        metas = self.list_metas()
        for m in metas[KEEP_SCANS:]:
            self.delete_scan(m["id"])

    def slim(self, raw: Dict[str, Any], usage_map: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Convert verbose krr output to minimal UI representation."""
        usage_map = usage_map or {}
        rows = []
        for s in (raw.get("scans") or []):
            if not isinstance(s, dict):
                continue
            o = s.get("object") or {}
            r = s.get("recommended") or {}
            a = o.get("allocations") or {}
            req = a.get("requests") or {}
            lim = a.get("limits") or {}

            rec_req = r.get("requests") or {}
            rec_lim = r.get("limits") or {}

            ns = o.get("namespace", "default")
            container = o.get("container", "main")

            if ns in EXCLUDED_NAMESPACES:
                continue

            def clean_val(val: Any) -> Any:
                if val is None:
                    return None
                if isinstance(val, float):
                    if math.isnan(val) or math.isinf(val):
                        return None
                    return val
                if isinstance(val, (int, str)):
                    return val
                return None

            def get_rec_val(d, k):
                if not isinstance(d, dict):
                    return None
                sub = d.get(k)
                if isinstance(sub, dict):
                    return clean_val(sub.get("value"))
                return clean_val(sub)

            info_dict = r.get("info")
            if not isinstance(info_dict, dict):
                info_dict = {}
            info = {k: v for k, v in info_dict.items() if v}

            warnings = o.get("warnings")
            if not isinstance(warnings, list):
                warnings = []

            pods_list = o.get("pods")
            if not isinstance(pods_list, list):
                pods_list = []
            pods_count = sum(1 for p in pods_list if isinstance(p, dict) and not p.get("deleted", False)) or 1

            rows.append({
                "ns": ns,
                "kind": o.get("kind", "Deployment"),
                "name": o.get("name", "unknown"),
                "container": container,
                "pods": pods_count,
                "hpa": o.get("hpa") is not None,
                "sidecar": container in SIDECAR_CONTAINERS,
                "usage": usage_map.get(f"{ns}|{container}", {}),
                "severity": s.get("severity", "UNKNOWN"),
                "cur": {
                    "req_cpu": clean_val(req.get("cpu")) if isinstance(req, dict) else None,
                    "req_mem": clean_val(req.get("memory")) if isinstance(req, dict) else None,
                    "lim_cpu": clean_val(lim.get("cpu")) if isinstance(lim, dict) else None,
                    "lim_mem": clean_val(lim.get("memory")) if isinstance(lim, dict) else None,
                },
                "rec": {
                    "req_cpu": get_rec_val(rec_req, "cpu"),
                    "req_mem": get_rec_val(rec_req, "memory"),
                    "lim_cpu": get_rec_val(rec_lim, "cpu"),
                    "lim_mem": get_rec_val(rec_lim, "memory"),
                },
                "info": info,
                "warnings": warnings,
            })
        score_val = raw.get("score")
        if isinstance(score_val, float) and (math.isnan(score_val) or math.isinf(score_val)):
            score_val = None

        return {
            "rows": rows,
            "score": score_val,
            "errors": raw.get("errors") or [],
            "cluster": raw.get("clusterSummary") or {},
        }

    def _fetch_usage_evidence(self, p: Dict[str, Any]) -> Dict[str, Any]:
        """Query Prometheus for measured usage percentiles backing each row.

        Mirrors the KRR "simple" strategy inputs so the UI can show an auditable
        derivation. Failures degrade honestly: recommendations are returned
        without usage evidence instead of with synthetic numbers.
        """
        try:
            from backend.prom import fetch_container_usage
        except ImportError as e:
            logger.warning(f"requests library unavailable; usage evidence disabled ({e})")
            return {}
        try:
            self._broadcast_log("Measuring usage evidence from Prometheus...")
            return fetch_container_usage(PROM_URL, p["history_days"] * 24, p["cpu_percentile"])
        except Exception as e:
            logger.warning(f"Usage evidence unavailable: {e}")
            self._broadcast_log("Usage evidence unavailable; recommendations shown without measured data.")
            return {}

    @staticmethod
    def _mock_usage_map(raw: Dict[str, Any], p: Dict[str, Any]) -> Dict[str, Any]:
        """Deterministic plausible usage evidence for mock scans (dev/test only)."""
        cpu_p = p.get("cpu_percentile", 95.0)
        pctl_key = f"p{cpu_p:g}"
        mem_buf = 1 + p.get("memory_buffer_percentage", 15) / 100
        usage: Dict[str, Any] = {}
        for s in raw.get("scans") or []:
            if not isinstance(s, dict):
                continue
            o = s.get("object") or {}
            rec = s.get("recommended") or {}
            req = rec.get("requests") or {}
            rec_cpu = req.get("cpu", {}).get("value") if isinstance(req.get("cpu"), dict) else None
            rec_mem = req.get("memory", {}).get("value") if isinstance(req.get("memory"), dict) else None
            key = f"{o.get('namespace', 'default')}|{o.get('container', 'main')}"
            entry: Dict[str, Any] = {}
            if isinstance(rec_cpu, (int, float)) and not (isinstance(rec_cpu, float) and (math.isnan(rec_cpu) or math.isinf(rec_cpu))):
                cpu = {"p50": rec_cpu * 0.5, "p90": rec_cpu * 0.8, "p95": rec_cpu * 0.95, "p99": rec_cpu * 0.99, "max": rec_cpu}
                cpu[pctl_key] = rec_cpu
                entry["cpu"] = {k: round(v, 6) for k, v in cpu.items() if not (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))}
            if isinstance(rec_mem, (int, float)) and not (isinstance(rec_mem, float) and (math.isnan(rec_mem) or math.isinf(rec_mem))):
                mem_max = rec_mem / mem_buf
                mem = {"p50": mem_max * 0.6, "p90": mem_max * 0.85, "p95": mem_max * 0.95, "p99": mem_max * 0.99, "max": mem_max}
                entry["memory"] = {k: round(v, 6) for k, v in mem.items() if not (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))}
            if entry:
                usage[key] = entry
        return sanitize_for_json(usage)

    def _broadcast_log(self, line: str):
        if not self._loop:
            return
        msg = json.dumps({"type": "log", "line": line, "timestamp": time.time()})
        for q in list(self._subscribers):
            self._loop.call_soon_threadsafe(q.put_nowait, msg)

    def _broadcast_status(self, status: str, error: Optional[str] = None):
        if not self._loop:
            return
        msg = json.dumps({"type": "status", "status": status, "error": error, "timestamp": time.time()})
        for q in list(self._subscribers):
            self._loop.call_soon_threadsafe(q.put_nowait, msg)

    async def subscribe_logs(self) -> AsyncGenerator[str, None]:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(q)
        try:
            # Yield initial backlog
            with self._lock:
                for line in self.current_logs[-20:]:
                    yield f"data: {json.dumps({'type': 'log', 'line': line})}\n\n"
            while True:
                data = await q.get()
                yield f"data: {data}\n\n"
        finally:
            self._subscribers.discard(q)

    def start_scan(self, params: ScanParams) -> Optional[Dict[str, Any]]:
        with self._lock:
            if self.current_meta is not None:
                return None
            sid = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
            meta = {
                "id": sid,
                "started": time.time(),
                "status": "running",
                "params": params.model_dump(),
            }
            self.current_meta = meta
            self.current_logs = []

        self._write_json(self.meta_path(sid), meta)
        threading.Thread(target=self._run_scan_thread, args=(meta,), daemon=True).start()
        return meta

    def _run_scan_thread(self, meta: Dict[str, Any]):
        p = meta["params"]
        sid = meta["id"]
        out_raw = self.scan_path(sid) + ".raw"

        # Determine if krr is available in /app or PATH
        krr_script = "/app/krr.py"
        use_mock = False

        if os.path.exists(krr_script):
            argv = [
                "python", krr_script, "simple",
                "-p", PROM_URL,
                "-f", "json",
                "--logtostderr",
                "--cpu_percentile", str(p["cpu_percentile"]),
                "--memory_buffer_percentage", str(p["memory_buffer_percentage"]),
                "--history_duration", str(p["history_days"] * 24),
            ]
            for ns in p.get("namespaces", []):
                argv += ["-n", ns]
        elif shutil.which("krr"):
            argv = [
                "krr", "simple",
                "-p", PROM_URL,
                "-f", "json",
                "--logtostderr",
                "--cpu_percentile", str(p["cpu_percentile"]),
                "--memory_buffer_percentage", str(p["memory_buffer_percentage"]),
                "--history_duration", str(p["history_days"] * 24),
            ]
            for ns in p.get("namespaces", []):
                argv += ["-n", ns]
        else:
            allow_mock = (
                os.environ.get("ALLOW_MOCK_SCAN", "").lower() in ("true", "1")
                or os.environ.get("PYTEST_CURRENT_TEST") is not None
            )
            if allow_mock:
                logger.warning("KRR executable not detected; running in mock generation mode for automated tests")
                use_mock = True
            else:
                raise RuntimeError(
                    "Robusta KRR executable not found (neither /app/krr.py nor 'krr' in PATH). "
                    "Mock scan generation is disabled in production to guarantee real cluster data."
                )

        try:
            if use_mock:
                self._run_mock_scan(meta, out_raw)
            else:
                self._run_subprocess_scan(argv, out_raw)

            with open(out_raw, "r", encoding="utf-8") as f:
                raw_json = json.load(f)

            if use_mock:
                usage_map = self._mock_usage_map(raw_json, p)
            else:
                usage_map = self._fetch_usage_evidence(p)

            result = self.slim(raw_json, usage_map=usage_map)
            meta.update(
                status="done",
                containers=len(result["rows"]),
                finished=time.time(),
                duration=round(time.time() - meta["started"], 1),
            )
            self._write_json(self.scan_path(sid), {**meta, **result})
            self._broadcast_status("done")
        except Exception as e:
            logger.error(f"Scan {sid} failed: {e}", exc_info=True)
            meta.update(
                status="failed",
                error=str(e)[:2000],
                finished=time.time(),
                duration=round(time.time() - meta["started"], 1),
            )
            self._write_json(self.scan_path(sid), {
                **meta,
                "rows": [],
                "score": None,
                "errors": [str(e)[:2000]],
                "cluster": {},
            })
            self._broadcast_status("failed", error=str(e)[:500])
        finally:
            if os.path.exists(out_raw):
                try:
                    os.remove(out_raw)
                except Exception:
                    pass
            try:
                self._write_json(self.meta_path(sid), meta)
                self.prune()
            except Exception:
                pass
            with self._lock:
                self.current_meta = None

    def _run_subprocess_scan(self, argv: List[str], out_raw: str):
        env = {**os.environ, "COLUMNS": "200"}
        with open(out_raw, "w", encoding="utf-8") as out:
            proc = subprocess.Popen(
                argv,
                cwd="/app" if os.path.exists("/app") else None,
                stdout=out,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
            )
            killer = threading.Timer(SCAN_TIMEOUT, proc.kill)
            killer.start()
            try:
                for line in proc.stderr:
                    clean = ANSI_RE.sub("", line).rstrip()
                    if clean:
                        with self._lock:
                            self.current_logs.append(clean)
                            if len(self.current_logs) > 100:
                                self.current_logs.pop(0)
                        self._broadcast_log(clean)
                proc.wait()
            finally:
                killer.cancel()

        if proc.returncode != 0:
            last_lines = " | ".join(self.current_logs[-3:])
            raise RuntimeError(f"KRR exited with code {proc.returncode}: {last_lines}")

    def _run_mock_scan(self, meta: Dict[str, Any], out_raw: str):
        """Simulate realistic scan for automated test suite when krr isn't installed in the test harness."""
        allow_mock = (
            os.environ.get("ALLOW_MOCK_SCAN", "").lower() in ("true", "1")
            or os.environ.get("PYTEST_CURRENT_TEST") is not None
        )
        if not allow_mock:
            raise RuntimeError("Mock scan generation is strictly disabled in production environments.")
        stages = [
            "Initializing kube-rightsizer engine...",
            f"Querying Prometheus at {PROM_URL}...",
            "Loading cluster workloads and pod allocations...",
            "Analyzing historical CPU usage percentiles...",
            "Analyzing memory peaks and headroom buffers...",
            "Synthesizing resource recommendations...",
            "Scan analysis completed successfully.",
        ]
        for stage in stages:
            time.sleep(0.4)
            with self._lock:
                self.current_logs.append(stage)
            self._broadcast_log(stage)

        demo_data = {
            "scans": [
                {
                    "object": {
                        "namespace": "production",
                        "kind": "Deployment",
                        "name": "api-gateway",
                        "container": "proxy",
                        "pods": [{"name": "api-gateway-1"}, {"name": "api-gateway-2"}],
                        "allocations": {
                            "requests": {"cpu": 2.0, "memory": 2147483648},
                            "limits": {"cpu": 4.0, "memory": 4294967296},
                        },
                    },
                    "recommended": {
                        "requests": {"cpu": {"value": 0.5}, "memory": {"value": 536870912}},
                        "limits": {"cpu": {"value": 1.0}, "memory": {"value": 1073741824}},
                        "info": {"cpu": "Peak CPU usage observed was 0.38 cores", "memory": "Peak RSS memory was 390Mi"},
                    },
                    "severity": "CRITICAL",
                },
                {
                    "object": {
                        "namespace": "production",
                        "kind": "Deployment",
                        "name": "order-processor",
                        "container": "worker",
                        "pods": [{"name": "order-processor-1"}, {"name": "order-processor-2"}, {"name": "order-processor-3"}],
                        "allocations": {
                            "requests": {"cpu": 1.0, "memory": 1073741824},
                            "limits": {"cpu": 2.0, "memory": 2147483648},
                        },
                    },
                    "recommended": {
                        "requests": {"cpu": {"value": 0.25}, "memory": {"value": 268435456}},
                        "limits": {"cpu": {"value": 0.5}, "memory": {"value": 536870912}},
                        "info": {"cpu": "Consistently over-provisioned", "memory": "Stable working set around 180Mi"},
                    },
                    "severity": "WARNING",
                },
                {
                    "object": {
                        "namespace": "database",
                        "kind": "StatefulSet",
                        "name": "redis-cluster",
                        "container": "redis",
                        "pods": [{"name": "redis-cluster-0"}, {"name": "redis-cluster-1"}],
                        "allocations": {
                            "requests": {"cpu": 0.2, "memory": 268435456},
                            "limits": {"cpu": 0.5, "memory": 536870912},
                        },
                    },
                    "recommended": {
                        "requests": {"cpu": {"value": 0.6}, "memory": {"value": 805306368}},
                        "limits": {"cpu": {"value": 1.0}, "memory": {"value": 1073741824}},
                        "info": {"cpu": "High throttling events observed", "memory": "Memory pressure during cache spikes"},
                    },
                    "severity": "CRITICAL",
                },
                {
                    "object": {
                        "namespace": "monitoring",
                        "kind": "Deployment",
                        "name": "grafana",
                        "container": "grafana",
                        "pods": [{"name": "grafana-765f4b-1"}],
                        "allocations": {
                            "requests": {"cpu": 0.1, "memory": 268435456},
                            "limits": {"cpu": 0.5, "memory": 536870912},
                        },
                    },
                    "recommended": {
                        "requests": {"cpu": {"value": 0.1}, "memory": {"value": 268435456}},
                        "limits": {"cpu": {"value": 0.5}, "memory": {"value": 536870912}},
                        "info": {"cpu": "Optimal allocation", "memory": "Within tolerance range"},
                    },
                    "severity": "GOOD",
                },
                {
                    "object": {
                        "namespace": "ingress-nginx",
                        "kind": "DaemonSet",
                        "name": "nginx-ingress-controller",
                        "container": "controller",
                        "pods": [{"name": "nginx-ingress-1"}, {"name": "nginx-ingress-2"}],
                        "allocations": {
                            "requests": {"cpu": None, "memory": None},
                            "limits": {"cpu": None, "memory": None},
                        },
                    },
                    "recommended": {
                        "requests": {"cpu": {"value": 0.5}, "memory": {"value": 536870912}},
                        "limits": {"cpu": {"value": 1.0}, "memory": {"value": 1073741824}},
                        "info": {"cpu": "No requests configured", "memory": "Unconstrained pod"},
                    },
                    "severity": "CRITICAL",
                },
            ],
            "score": 78.4,
            "errors": [],
            "clusterSummary": {"cluster": "production-k8s"},
        }
        with open(out_raw, "w", encoding="utf-8") as f:
            json.dump(demo_data, f)


engine = ScanEngine()
