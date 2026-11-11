"""FastAPI application for kube-rightsizer."""
import asyncio
import base64
import hmac
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from backend.diff import compute_diff
from backend.engine import engine
from backend.k8s import get_cluster_name, list_cluster_namespaces
from backend.models import ClusterStatus, ScanDetail, ScanMeta, ScanParams

AUTH_USER = os.environ.get("AUTH_USER")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD")
REQUIRE_AUTH = bool(AUTH_USER and AUTH_PASSWORD)

def get_static_dir() -> str:
    env_dir = os.environ.get("STATIC_DIR")
    if env_dir and os.path.exists(env_dir):
        return env_dir
    local_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
    if os.path.exists(local_dist):
        return local_dist
    if os.path.exists("/srv/dist"):
        return "/srv/dist"
    return env_dir or local_dist


def verify_basic_auth(request: Request):
    if not REQUIRE_AUTH:
        return True

    # Exclude health checks from auth
    path = request.url.path
    if path in ("/healthz", "/api/healthz"):
        return True

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Basic "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": 'Basic realm="kube-rightsizer"'},
        )

    try:
        encoded = auth_header.split(" ", 1)[1]
        decoded = base64.b64decode(encoded).decode("utf-8")
        username, _, password = decoded.partition(":")
        valid_user = hmac.compare_digest(username, AUTH_USER or "")
        valid_pass = hmac.compare_digest(password, AUTH_PASSWORD or "")
        if not (valid_user and valid_pass):
            raise ValueError()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": 'Basic realm="kube-rightsizer"'},
        )
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup engine event loop reference and recover previous scans
    loop = asyncio.get_running_loop()
    engine.set_event_loop(loop)
    engine.recover()
    yield


app = FastAPI(
    title="kube-rightsizer",
    version="1.1.1",
    description="Kubernetes Resource Rightsizing Console",
    lifespan=lifespan,
    dependencies=[Depends(verify_basic_auth)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
@app.get("/api/healthz")
def healthz():
    return {"status": "ok", "service": "kube-rightsizer"}


@app.get("/api/namespaces", response_model=List[str])
def get_namespaces():
    return list_cluster_namespaces()


@app.get("/api/status", response_model=ClusterStatus)
def get_status():
    m = engine.current_meta
    elapsed = round(time.time() - m["started"]) if m else None
    metas = engine.list_metas()
    namespaces = list_cluster_namespaces()
    return ClusterStatus(
        running=ScanMeta(**m) if m else None,
        elapsed=elapsed,
        log=engine.current_logs[-15:],
        cluster_name=get_cluster_name(),
        namespaces_count=len(namespaces),
        total_scans=len(metas),
    )


@app.post("/api/scan", response_model=ScanMeta, status_code=status.HTTP_202_ACCEPTED)
@app.post("/api/scans", response_model=ScanMeta, status_code=status.HTTP_202_ACCEPTED)
def trigger_scan(params: ScanParams):
    meta = engine.start_scan(params)
    if not meta:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A scan is already running",
        )
    return ScanMeta(**meta)


@app.get("/api/scans", response_model=List[ScanMeta])
def list_scans():
    raw_metas = engine.list_metas()
    valid_metas = []
    for m in raw_metas:
        try:
            valid_metas.append(ScanMeta(**m))
        except Exception:
            pass
    return valid_metas


@app.get("/api/scans/trends")
def get_trends():
    """Trimmed rows for every completed scan, oldest first, for trend charts.

    Rows keep only the fields the frontend math needs (identity, pods,
    severity, current/recommended request CPU+memory) so the payload stays
    small; limits, info and warnings are dropped.
    """
    scans = []
    for meta in reversed(engine.list_metas()):  # oldest first
        if meta.get("status") != "done":
            continue
        scan = engine.get_scan(meta["id"])
        if not scan:
            continue
        trimmed = [
            {
                "ns": r.get("ns"),
                "kind": r.get("kind"),
                "name": r.get("name"),
                "container": r.get("container"),
                "pods": r.get("pods", 1),
                "severity": r.get("severity"),
                "cur": {
                    "req_cpu": (r.get("cur") if isinstance(r.get("cur"), dict) else {}).get("req_cpu"),
                    "req_mem": (r.get("cur") if isinstance(r.get("cur"), dict) else {}).get("req_mem"),
                },
                "rec": {
                    "req_cpu": (r.get("rec") if isinstance(r.get("rec"), dict) else {}).get("req_cpu"),
                    "req_mem": (r.get("rec") if isinstance(r.get("rec"), dict) else {}).get("req_mem"),
                },
            }
            for r in (scan.get("rows") or [])
            if isinstance(r, dict)
        ]
        scans.append({
            "id": scan.get("id"),
            "started": scan.get("started"),
            "score": scan.get("score"),
            "rows": trimmed,
        })
    return {"scans": scans}


@app.get("/api/scans/history")
def get_workload_history(key: str):
    """Recommendation/current history for one workload (ns/kind/name/container),
    oldest first, for sparklines in expandable rows."""
    points = []
    for meta in reversed(engine.list_metas()):  # oldest first
        if meta.get("status") != "done":
            continue
        scan = engine.get_scan(meta["id"])
        if not scan:
            continue
        for r in (scan.get("rows") or []):
            if not isinstance(r, dict):
                continue
            from backend.diff import row_key

            if row_key(r) != key:
                continue
            points.append({
                "id": scan.get("id"),
                "started": scan.get("started"),
                "severity": r.get("severity"),
                "cur": {
                    "req_cpu": (r.get("cur") if isinstance(r.get("cur"), dict) else {}).get("req_cpu"),
                    "req_mem": (r.get("cur") if isinstance(r.get("cur"), dict) else {}).get("req_mem"),
                    "lim_cpu": (r.get("cur") if isinstance(r.get("cur"), dict) else {}).get("lim_cpu"),
                    "lim_mem": (r.get("cur") if isinstance(r.get("cur"), dict) else {}).get("lim_mem"),
                },
                "rec": {
                    "req_cpu": (r.get("rec") if isinstance(r.get("rec"), dict) else {}).get("req_cpu"),
                    "req_mem": (r.get("rec") if isinstance(r.get("rec"), dict) else {}).get("req_mem"),
                    "lim_cpu": (r.get("rec") if isinstance(r.get("rec"), dict) else {}).get("lim_cpu"),
                    "lim_mem": (r.get("rec") if isinstance(r.get("rec"), dict) else {}).get("lim_mem"),
                },
            })
            break
    return {"key": key, "points": points}


@app.get("/api/scans/{scan_id}", response_model=ScanDetail)
def get_scan(scan_id: str):
    scan = engine.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@app.delete("/api/scans/{scan_id}")
def delete_scan(scan_id: str):
    success = engine.delete_scan(scan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Scan not found or could not be deleted")
    return {"status": "deleted", "id": scan_id}


@app.get("/api/scans/{scan_id}/diff")
def diff_scan(scan_id: str, compare_to: Optional[str] = None):
    target = engine.get_scan(scan_id)
    if not target or target.get("status") != "done":
        raise HTTPException(status_code=404, detail="Scan not found")
    if compare_to:
        baseline = engine.get_scan(compare_to)
    else:
        baseline = None
        target_started = float(target.get("started") or 0.0)
        for meta in engine.list_metas():
            meta_started = float(meta.get("started") or 0.0)
            if meta.get("status") != "done" or meta_started >= target_started:
                continue
            baseline = engine.get_scan(meta["id"])
            break  # metas are sorted newest-first, so first hit = next-older done scan
    if not baseline or baseline.get("status") != "done":
        raise HTTPException(
            status_code=404,
            detail="No earlier scan available to compare against",
        )
    return compute_diff(baseline, target)


@app.get("/api/scan/live")
async def live_scan_logs():
    """Server-Sent Events (SSE) stream for live scan log output."""
    return StreamingResponse(
        engine.subscribe_logs(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# Serve React SPA static files and assets
@app.get("/assets/{file_path:path}")
async def serve_assets(file_path: str):
    static_dir = get_static_dir()
    asset_file = os.path.join(static_dir, "assets", file_path)
    if os.path.isfile(asset_file):
        return FileResponse(asset_file)
    raise HTTPException(status_code=404, detail="Asset not found")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Allow API and health routes to not be trapped by SPA fallback
    if full_path.startswith("api/") or full_path in ("api", "healthz"):
        raise HTTPException(status_code=404, detail="Route not found")

    static_dir = get_static_dir()
    if full_path:
        file_path = os.path.join(static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)

    index_file = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend assets not found")
