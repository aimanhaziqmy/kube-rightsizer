"""Pydantic data models for kube-rightsizer API."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ScanParams(BaseModel):
    cpu_percentile: float = Field(default=95.0, ge=1.0, le=100.0, description="CPU percentile (1-100)")
    memory_buffer_percentage: int = Field(default=15, ge=0, le=500, description="Memory buffer percentage (0-500)")
    history_days: int = Field(default=14, ge=1, le=30, description="History duration in days (1-30)")
    namespaces: List[str] = Field(default_factory=list, description="Target namespaces (empty for all)")


class ScanMeta(BaseModel):
    id: str
    started: float
    status: str  # "running", "done", "failed"
    params: ScanParams
    finished: Optional[float] = None
    duration: Optional[float] = None
    containers: Optional[int] = 0
    error: Optional[str] = None


class ResourceAllocation(BaseModel):
    req_cpu: Optional[float] = None
    req_mem: Optional[float] = None
    lim_cpu: Optional[float] = None
    lim_mem: Optional[float] = None


class WorkloadRow(BaseModel):
    ns: str
    kind: str
    name: str
    container: str
    pods: int = 1
    hpa: bool = False
    severity: Optional[str] = "UNKNOWN"
    cur: ResourceAllocation
    rec: ResourceAllocation
    info: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)


class ScanDetail(ScanMeta):
    rows: List[WorkloadRow] = Field(default_factory=list)
    score: Optional[float] = None
    errors: List[Any] = Field(default_factory=list)
    cluster: Dict[str, Any] = Field(default_factory=dict)


class ClusterStatus(BaseModel):
    running: Optional[ScanMeta] = None
    elapsed: Optional[int] = None
    log: List[str] = Field(default_factory=list)
    cluster_name: Optional[str] = "k8s-cluster"
    namespaces_count: Optional[int] = 0
    total_scans: int = 0
