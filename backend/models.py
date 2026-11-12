"""Pydantic data models for kube-rightsizer API."""
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field


class ScanParams(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cpu_percentile: float = Field(default=95.0, ge=1.0, le=100.0, description="CPU percentile (1-100)")
    memory_buffer_percentage: int = Field(default=15, ge=0, le=500, description="Memory buffer percentage (0-500)")
    history_days: int = Field(default=14, ge=1, le=30, description="History duration in days (1-30)")
    namespaces: List[str] = Field(default_factory=list, description="Target namespaces (empty for all)")


class ScanMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    started: Optional[Union[float, int]] = 0.0
    status: Optional[str] = "unknown"  # "running", "done", "failed"
    params: Optional[ScanParams] = Field(default_factory=ScanParams)
    finished: Optional[Union[float, int]] = None
    duration: Optional[Union[float, int]] = None
    containers: Optional[int] = 0
    error: Optional[str] = None


class ResourceAllocation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    req_cpu: Optional[Union[float, int, str]] = None
    req_mem: Optional[Union[float, int, str]] = None
    lim_cpu: Optional[Union[float, int, str]] = None
    lim_mem: Optional[Union[float, int, str]] = None


class WorkloadRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ns: Optional[str] = "default"
    kind: Optional[str] = "Deployment"
    name: Optional[str] = "unknown"
    container: Optional[str] = "main"
    pods: Optional[Union[int, float, str]] = 1
    hpa: Optional[bool] = False
    sidecar: Optional[bool] = False
    severity: Optional[str] = "UNKNOWN"
    cur: Optional[ResourceAllocation] = Field(default_factory=ResourceAllocation)
    rec: Optional[ResourceAllocation] = Field(default_factory=ResourceAllocation)
    info: Optional[Dict[str, Any]] = Field(default_factory=dict)
    warnings: Optional[List[str]] = Field(default_factory=list)
    # Measured usage evidence keyed by percentile ("p50", "p90", ..., "max").
    # Empty for scans made before v1.1.0 or when Prometheus had no data.
    usage: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ScanDetail(ScanMeta):
    model_config = ConfigDict(extra="ignore")
    rows: Optional[List[WorkloadRow]] = Field(default_factory=list)
    score: Optional[Union[float, int, str]] = None
    errors: Optional[List[Any]] = Field(default_factory=list)
    cluster: Optional[Dict[str, Any]] = Field(default_factory=dict)
    # Cluster-wide capacity snapshot collected at scan time (v1.1.2+).
    capacity: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ClusterStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    running: Optional[ScanMeta] = None
    elapsed: Optional[int] = None
    log: List[str] = Field(default_factory=list)
    cluster_name: Optional[str] = "k8s-cluster"
    namespaces_count: Optional[int] = 0
    total_scans: int = 0
