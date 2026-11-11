# kube-rightsizer

[![Docker Pulls](https://img.shields.io/docker/pulls/scriptertech/kube-rightsizer.svg)](https://hub.docker.com/r/scriptertech/kube-rightsizer)
[![Docker Image Version](https://img.shields.io/docker/v/scriptertech/kube-rightsizer/latest)](https://hub.docker.com/r/scriptertech/kube-rightsizer)
[![Helm OCI](https://img.shields.io/badge/Helm_OCI-registry--1.docker.io-blue?logo=helm)](https://hub.docker.com/r/scriptertech/kube-rightsizer)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Engine: Robusta KRR](https://img.shields.io/badge/Engine-Robusta_KRR_v1.31-blueviolet.svg)](https://github.com/robusta-dev/krr)

> **Modern, Open-Source Kubernetes Resource Rightsizing & Cost Optimization Console**  
> Powered by [Robusta KRR](https://github.com/robusta-dev/krr) and Prometheus metrics.

---

## ⚡ What is kube-rightsizer?

`kube-rightsizer` is a standalone, lightweight web console designed to give platform engineers, DevOps teams, and FinOps practitioners an immediate, actionable view of Kubernetes CPU and memory allocations. It eliminates guesswork by comparing historical Prometheus container usage against configured Kubernetes requests and limits.

### ✨ Key Features

* **Soft & Clean Cloud Console UI:** Inspired by modern enterprise cloud dashboards with responsive layout, soft pastel severity indicators, and zero clutter.
* **Direct 10-Column Workload Matrix:** Inspect `CPU Request`, `CPU Limit`, `Memory Request`, `Memory Limit`, exact deltas (`CPU Δ`, `MEM Δ`), and `Severity` (`CRITICAL`, `WARNING`, `OK`, `UNKNOWN`) directly in the main table without having to open individual modals.
* **Compact 3-Column Workload Drilldown:**
  * **Per-Pod Comparison:** Clear side-by-side table of current vs. recommended values.
  * **1-Click Copy YAML:** Generates production-ready Kubernetes `resources:` snippets ready to paste into Helm, Kustomize, or GitOps manifests.
  * **Advisory Notes:** Displays container warnings, OOMKilled history, or Horizontal Pod Autoscaler (HPA) targets.
* **Executive Overview Dashboard:** Rightsizing health score gauge (0–100%), total recoverable CPU and Memory savings, and a **Top 5 Savings Opportunities** ranking.
* **Live SSE Streaming Terminal:** Real-time log streaming directly from the KRR engine with anti-duplicate execution guards and live elapsed timers.
* **100% Open Source:** Zero vendor lock-in, zero corporate branding, and no external tracking.

---

## 🚀 Quick Start with Docker

Run `kube-rightsizer` locally or on a bastion/jumpbox with access to your cluster:

```bash
docker run -d \
  --name kube-rightsizer \
  -p 8080:8080 \
  -e PROMETHEUS_URL="http://prometheus-k8s.monitoring.svc:9090" \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v kube-rightsizer-data:/data/scans \
  scriptertech/kube-rightsizer:latest
```

Open **`http://localhost:8080`** in your browser.

### Docker Compose Example

```yaml
version: '3.8'

services:
  kube-rightsizer:
    image: scriptertech/kube-rightsizer:latest
    container_name: kube-rightsizer
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - PROMETHEUS_URL=http://prometheus-k8s.monitoring.svc:9090
      - CLUSTER_NAME=my-cluster
      - KEEP_SCANS=30
    volumes:
      - ~/.kube/config:/root/.kube/config:ro
      - kube-rightsizer-data:/data/scans

volumes:
  kube-rightsizer-data:
```

---

## ☸️ Deploy to Kubernetes via Helm (OCI)

The official Helm chart is packaged as an OCI artifact directly on Docker Hub. No Git clone or local chart directory needed!

### 1. One-Line Quick Install

```bash
helm install kube-rightsizer oci://registry-1.docker.io/scriptertech/kube-rightsizer \
  --version 1.0.9 \
  --namespace kube-rightsizer \
  --create-namespace \
  --set config.prometheusUrl="http://kube-prometheus-kube-prome-prometheus.monitoring.svc:9090"
```

### 2. Production `values.yaml` Example (with Ingress & TLS)

Create `values.yaml`:

```yaml
config:
  # Internal cluster Prometheus endpoint
  prometheusUrl: "http://kube-prometheus-kube-prome-prometheus.monitoring.svc:9090"
  clusterName: "production-cluster"
  
  # Optional Basic Authentication
  auth:
    enabled: false
    username: "admin"
    password: "choose-a-strong-password"

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: rightsizer.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - rightsizer.yourdomain.com
      secretName: rightsizer-tls-secret

# Set to false for lightweight ephemeral storage (emptyDir), or true for persistent PVC
persistence:
  enabled: false
  size: 2Gi
```

Apply and upgrade:

```bash
helm upgrade --install kube-rightsizer oci://registry-1.docker.io/scriptertech/kube-rightsizer \
  --version 1.0.9 \
  --namespace kube-rightsizer \
  --create-namespace \
  -f values.yaml
```

---

## ⚙️ Configuration Reference

All application parameters can be configured via environment variables:

| Environment Variable | Default | Description |
|---|---|---|
| `PROMETHEUS_URL` | `http://prometheus-k8s.monitoring.svc:9090` | Internal URL to your cluster's Prometheus server |
| `CLUSTER_NAME` | `kubernetes-cluster` | Cluster display name shown in header and reports |
| `DATA_DIR` | `/data/scans` | Persistent directory for storing JSON scan history |
| `KEEP_SCANS` | `30` | Number of historical scan executions retained |
| `SCAN_TIMEOUT` | `1800` | Maximum scan execution time in seconds (30m) |
| `AUTH_USER` | `""` *(Disabled)* | Optional HTTP Basic Auth username |
| `AUTH_PASSWORD` | `""` *(Disabled)* | Optional HTTP Basic Auth password |
| `PORT` | `8080` | Web server listening port |

---

## 🔒 Security & Minimal RBAC

`kube-rightsizer` follows the principle of least privilege. The associated ClusterRole requires strictly read-only (`get`, `list`, `watch`) permissions:

* **Core:** `namespaces`, `pods`, `nodes`
* **Apps:** `deployments`, `statefulsets`, `daemonsets`, `replicasets`
* **Batch:** `jobs`, `cronjobs`
* **Autoscaling:** `horizontalpodautoscalers`

It makes **zero mutating API calls** and does not alter your workloads.

---

## 📦 Container Specifications

* **Base Image:** `robustadev/krr:v1.31.1`
* **Architectures:** Multi-arch `linux/amd64`, `linux/arm64`
* **Isolation:** Multi-stage build isolates the FastAPI web server from system Python to maintain KRR engine dependency integrity.

---

## 📄 License

Distributed under the **Apache 2.0 License**. Powered by the open-source [Robusta KRR](https://github.com/robusta-dev/krr) project.

