# Release Plan — v1.1.0 "Show Your Work"

> Signed off via grilling session (design tree fully resolved). Scope is frozen;
> deferred items are listed at the bottom and must not creep in.

## Framing

- **Project goal**: genuine open-source adoption (Docker Hub / Helm / GitHub).
- **Primary user**: SRE / platform engineer. App developers are secondary.
- **Scope stance**: stays read-only request/limit checking. Simple wins. No write
  permissions, no apply/remediation, no cost integration this release.
- **Cadence**: solo, one theme per release.

## Root insight

> **Implementation correction:** KRR's JSON output does *not* contain percentile
> distributions — `ResourceScan` is only `{object, recommended, severity}`, and
> `recommended.info` holds human strings ("HPA detected", "Not enough data").
> The raw percentiles live inside KRR's Prometheus loader and are never
> serialized. Therefore evidence is measured directly: `backend/prom.py` queries
> the same Prometheus with the same lookback window and mirrors the KRR "simple"
> strategy formulas (CPU = configured percentile of per-pod usage, max across
> pods, no headroom; memory = max working set × buffer).

`slim()` in `backend/engine.py` previously kept only current/recommended values,
so the UI showed recommendations with nothing underneath them. Trust =
transparency + honesty about uncertainty, not more machinery.

## Feature scope

1. **Raw evidence storage** — `backend/prom.py` measures per-container CPU &
   memory percentiles (p50/p90/p95/p99/max + configured CPU percentile) from
   Prometheus over the scan's lookback window and `slim()` attaches them to
   each row. Mock scans generate deterministic plausible evidence (dev/test only).
2. **Why-line** — auditable derivation per row, e.g.
   `p95 CPU (180m) × 1.15 headroom → 207m → 210m`, built from the scan's own
   configured parameters (cpu percentile, memory headroom, lookback).
3. **Evidence panel** — inside the *existing* expanded row in WorkloadsTable:
   per resource, a percentile strip with the current request and the
   recommendation marked on it. No new page, no modal.
4. **HPA awareness** — amber "HPA detected" badge; CPU request cell shows
   "HPA-controlled" (visible refusal with stated reason in the why-line);
   memory recommendation proceeds normally. Backed by the existing `hpa` flag.
5. **Exclusions & sidecars** —
   - `EXCLUDED_NAMESPACES` env/Helm value, default `kube-system`.
   - `SIDECAR_CONTAINERS` with hardcoded built-in default:
     `istio-proxy`, `envoy`, `linkerd-proxy`, `linkerd2-proxy`, `jaeger-agent`,
     `otel-collector`, `datadog-agent`.
   - Sidecars get a "sidecar" tag and their own recommendation treatment.
   - UI toggles deferred to a later release.
6. **Back-compat** — scans stored pre-v1.1.0 render a muted placeholder:
   "Raw usage data not captured in this scan (pre-v1.1.0). Run a new scan."
   No migration logic; history rotates at `keepScans: 30`.

## Explicitly deferred

- Confidence scoring / thin-data badges → **next release theme (v1.2.0)**.
  (Raw-percentile storage above makes this easier later.)
- Cost in dollars (node pricing / OpenCost).
- GitOps PR generation / apply, scheduled scans + alerting, multi-cluster,
  UI exclusion toggles.

## Open verification item

Evidence panel should be eyeballed against a real cluster with Prometheus
(currently self-hosted). If real-cluster verification is not possible at any
point, extend the mock-scan generator to emit plausible percentile data for
local/test verification — mock mode stays dev/test-only, never production.
