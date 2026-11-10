# kube-rightsizer

> Open-Source Kubernetes Resource Rightsizing and Cost Optimization Console.

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-scriptertech%2Fkube--rightsizer%3Av1.0.2-blue.svg?logo=docker)](https://hub.docker.com/r/scriptertech/kube-rightsizer)
[![Helm Chart](https://img.shields.io/badge/Helm%20Chart-v1.0.2-orange.svg?logo=helm)](./charts/kube-rightsizer)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Base: Robusta KRR](https://img.shields.io/badge/Engine-Robusta_KRR_v1.31-blueviolet.svg)](https://github.com/robusta-dev/krr)

**kube-rightsizer** is an open-source web console that provides a holistic view of Kubernetes resource allocations, overprovisioning, and rightsizing recommendations. It couples the [Robusta KRR](https://github.com/robusta-dev/krr) CLI engine and Prometheus cluster metrics with a clean, soft-styled React dashboard.

---

## Features

- **Soft & Modern Console UI**: Soft pastel status badges, responsive navigation sidebar, micro-metrics, and live terminal drawer.
- **Side-by-Side Allocations & Diff**: Instant comparison between current container CPU/Memory requests & limits against recommended values.
- **Dynamic Parameter Tuning**: Configure CPU usage percentiles (e.g. 95th), memory headroom buffers (+15%), and lookback duration (1–30 days) on the fly.
- **Live SSE Streaming Terminal**: Server-Sent Events stream real-time logs directly from the scanning engine into the web UI.
- **Namespace-Level Cost Breakdown**: Aggregated resource savings and container counts grouped by Kubernetes namespace.
- **1-Click Remediation**: Copy ready-to-use Kubernetes YAML snippets directly into your manifests or GitOps repositories.
- **Data Export**: Export cluster recommendations to CSV and JSON formats.
- **Generic Open-Source**: Zero company branding; published publicly on Docker Hub as `scriptertech/kube-rightsizer`.

---

## Architecture

```
                    ┌────────────────────────────────────────┐
                    │      React.js Single Page App (SPA)     │
                    │   Vite + Tailwind CSS + Lucide Icons   │
                    └───────────────────▲────────────────────┘
                                        │ HTTP REST & SSE
                    ┌───────────────────▼────────────────────┐
                    │            FastAPI Backend             │
                    │    Scan Management & SSE Streaming     │
                    └─────────▲────────────────────▲─────────┘
                              │                    │
              Prometheus Query│                    │Discovery
                              │                    │
                    ┌─────────▼──────────┐   ┌─────▼───────────────┐
                    │   Prometheus K8s   │   │  Kubernetes API     │
                    │   Cluster Metrics  │   │  (Pods/Deployments) │
                    └────────────────────┘   └─────────────────────┘
```

---

## Deployment Options

Choose the deployment method that fits your environment:

1. [Deploy via Helm Charts](#1-deploy-via-helm-charts) (Recommended for Kubernetes)
2. [Deploy via Docker](#2-deploy-via-docker) (Local testing / Jumpbox)
3. [Deploy via Kubernetes Manifests](#3-deploy-via-kubernetes-manifests) (Plain YAML / GitOps)

---

### 1. Deploy via Helm Charts

The repository includes a production-ready Helm chart located in [`charts/kube-rightsizer`](./charts/kube-rightsizer).

#### Quick Install

```bash
# Install into the kube-rightsizer namespace with auto-created namespace
helm install kube-rightsizer ./charts/kube-rightsizer \
  --namespace kube-rightsizer \
  --create-namespace \
  --set config.prometheusUrl="http://prometheus-k8s.monitoring.svc:9090"
```

#### Custom Values Example

Create a custom `my-values.yaml`:

```yaml
image:
  repository: scriptertech/kube-rightsizer
  tag: "v1.0.2"
  pullPolicy: IfNotPresent

config:
  prometheusUrl: "http://prometheus-k8s.monitoring.svc:9090"
  clusterName: "production-cluster"
  auth:
    enabled: true
    username: "admin"
    password: "change-to-strong-password"

persistence:
  enabled: true
  size: 10Gi

ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: rightsizer.example.com
      paths:
        - path: /
          pathType: Prefix

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

Deploy with your custom values:

```bash
helm install kube-rightsizer ./charts/kube-rightsizer \
  -n kube-rightsizer \
  --create-namespace \
  -f my-values.yaml
```

#### Accessing the UI

If Ingress is disabled, forward the service port locally:

```bash
kubectl -n kube-rightsizer port-forward svc/kube-rightsizer 8080:80
```

Open `http://localhost:8080` in your browser.

#### Upgrading or Uninstalling

```bash
# Upgrade release
helm upgrade kube-rightsizer ./charts/kube-rightsizer -n kube-rightsizer

# Uninstall
helm uninstall kube-rightsizer -n kube-rightsizer
```

#### Helm Chart Configuration Parameters

| Parameter | Description | Default |
|---|---|---|
| `image.repository` | Image repository | `scriptertech/kube-rightsizer` |
| `image.tag` | Image tag | `v1.0.2` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `replicaCount` | Replicas (uses Recreate strategy) | `1` |
| `serviceAccount.create` | Create ServiceAccount | `true` |
| `rbac.create` | Create ClusterRole and Binding | `true` |
| `config.prometheusUrl` | Prometheus endpoint reachable in cluster | `http://prometheus-k8s.monitoring.svc:9090` |
| `config.clusterName` | Cluster name shown in console header | `kubernetes-cluster` |
| `config.dataDir` | Persistent scan directory | `/data/scans` |
| `config.keepScans` | Scan history retention count | `30` |
| `config.scanTimeout` | Scan timeout in seconds | `1800` |
| `config.auth.enabled` | Enable HTTP Basic Authentication | `false` |
| `config.auth.username` | Basic auth username | `""` |
| `config.auth.password` | Basic auth password | `""` |
| `config.auth.existingSecret` | Secret with `AUTH_USER` and `AUTH_PASSWORD` | `""` |
| `persistence.enabled` | Enable persistent volume for scans | `true` |
| `persistence.size` | PVC storage size | `5Gi` |
| `persistence.storageClass` | Storage class name (empty for default) | `""` |
| `service.type` | Kubernetes Service type | `ClusterIP` |
| `service.port` | Service HTTP port | `80` |
| `ingress.enabled` | Enable ingress controller route | `false` |
| `resources` | Container CPU & Memory requests/limits | `requests: 100m/256Mi, limits: 1000m/1Gi` |

---

### 2. Deploy via Docker

You can run the official public image locally or on a bastion/jumpbox:

```bash
# Pull the public image
docker pull scriptertech/kube-rightsizer:v1.0.2

# Run container mounted to host kubeconfig
docker run -d \
  --name kube-rightsizer \
  -p 8080:8080 \
  -e PROMETHEUS_URL="http://prometheus-k8s.monitoring.svc:9090" \
  -e CLUSTER_NAME="my-cluster" \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v kube-rightsizer-data:/data/scans \
  scriptertech/kube-rightsizer:v1.0.2
```

#### Docker Compose

```yaml
version: '3.8'

services:
  kube-rightsizer:
    image: scriptertech/kube-rightsizer:v1.0.2
    container_name: kube-rightsizer
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - PROMETHEUS_URL=http://prometheus-k8s.monitoring.svc:9090
      - CLUSTER_NAME=production-cluster
      - KEEP_SCANS=30
    volumes:
      - ~/.kube/config:/root/.kube/config:ro
      - scan-data:/data/scans

volumes:
  scan-data:
```

---

### 3. Deploy via Kubernetes Manifests

Pre-configured manifests pointing to `scriptertech/kube-rightsizer:v1.0.2` are in the [`deploy/`](./deploy) directory.

#### Quick Deploy (All-in-One)

```bash
kubectl apply -f deploy/all-in-one.yaml
```

#### Modular Deploy

```bash
# 1. Namespace & RBAC read permissions
kubectl apply -f deploy/namespace.yaml
kubectl apply -f deploy/rbac.yaml

# 2. Persistent storage for scan history
kubectl apply -f deploy/pvc.yaml

# 3. Deployment & Service
kubectl apply -f deploy/deployment.yaml
kubectl apply -f deploy/service.yaml

# 4. Optional Ingress
kubectl apply -f deploy/ingress.yaml
```

Access the UI:
```bash
kubectl -n kube-rightsizer port-forward svc/kube-rightsizer 8080:80
```

---

## Configuration Reference

All settings can be configured via environment variables in Docker, Kubernetes, or Helm:

| Variable | Default | Description |
|---|---|---|
| `PROMETHEUS_URL` | `http://prometheus-k8s.monitoring.svc:9090` | Accessible Prometheus URL |
| `DATA_DIR` | `/data/scans` | Persistent storage path for scan logs and JSON outputs |
| `STATIC_DIR` | `/srv/dist` | Path to precompiled React static assets |
| `CLUSTER_NAME` | `kubernetes-cluster` | Label displayed in web UI header |
| `KEEP_SCANS` | `30` | Number of previous scans to keep before automatic rotation |
| `SCAN_TIMEOUT` | `1800` | Engine execution timeout in seconds |
| `AUTH_USER` | `""` (Disabled) | Username for optional HTTP Basic Auth |
| `AUTH_PASSWORD` | `""` (Disabled) | Password for optional HTTP Basic Auth |

---

## Security & RBAC

The deployment runs with minimal required read-only permissions across workloads (`deployments`, `statefulsets`, `daemonsets`, `replicasets`, `pods`, `nodes`, `jobs`, `cronjobs`, `horizontalpodautoscalers`, and `argoproj.io/rollouts`).

**No write or mutating permissions** are requested or granted.

When exposing the dashboard publicly:
- Enable HTTP Basic Auth (`AUTH_USER` and `AUTH_PASSWORD`).
- Configure TLS encryption on your Ingress controller.

---

## Local Development & Build

### 1. Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run server with live reload (uses mock data when KRR is not installed locally)
PYTHONPATH=. uvicorn backend.main:app --reload --port 8080
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` calls to `http://localhost:8080`.

### 3. Build & Test

```bash
# Build frontend bundle
cd frontend && npm run build

# Run unit and integration tests
cd ..
.venv/bin/pytest tests/ -v

# Helm chart validation
helm lint charts/kube-rightsizer
helm template test charts/kube-rightsizer
```

---

## License

Distributed under the Apache 2.0 Open Source License. Built on top of [Robusta KRR](https://github.com/robusta-dev/krr).
