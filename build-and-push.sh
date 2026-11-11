#!/usr/bin/env bash
# ============================================================================
# build-and-push.sh — kube-rightsizer release helper
#
#   1. Builds the multi-stage Docker image (frontend + API on KRR base).
#   2. Pushes the image to Docker Hub.
#   3. Lints + packages the Helm chart and pushes it as an OCI artifact
#      to Docker Hub (stored in the same repo as the image, standard for
#      Helm-on-Docker-Hub).
#
# Usage:
#   ./build-and-push.sh [options]
#
# Options:
#   --bump <ver>     Bump every version reference (Chart.yaml version+appVersion,
#                    values.yaml tag, API version string, deploy manifests, READMEs)
#                    to <ver> (e.g. 1.0.8) before building. Files are edited even
#                    in --dry-run mode. Replaces the current Chart.yaml version.
#   --tag <tag>      Override the image tag (default: "v" + chart version,
#                    e.g. v1.0.6, taken from charts/kube-rightsizer/Chart.yaml)
#   --latest         Also tag and push :latest (off by default)
#   --skip-image     Skip the Docker image build/push
#   --skip-chart     Skip the Helm chart lint/package/push
#   --no-push        Build/package only, push nothing (local verification)
#   --login          Force an interactive docker + helm registry login first
#   --dry-run        Print every command instead of running it (lint still runs)
#   -h, --help       Show this help
#
# Credentials (never hardcoded, never echoed):
#   Non-interactive:  DOCKERHUB_USER=you DOCKERHUB_TOKEN=xxx ./build-and-push.sh
#   Interactive:      ./build-and-push.sh --login   (or just let a failed push
#                     tell you to run "docker login" / "helm registry login")
#
# Requirements: docker, helm >= 3.8 (OCI support), jq optional (unused).
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$SCRIPT_DIR/charts/kube-rightsizer"
CHART_YAML="$CHART_DIR/Chart.yaml"
CHART_OUT_DIR="$SCRIPT_DIR/.chart-release"

# Overridable via env, mirroring values.yaml defaults
DOCKERHUB_USER="${DOCKERHUB_USER:-scriptertech}"
REGISTRY="${REGISTRY:-registry-1.docker.io}"
IMAGE_NAME="${IMAGE_NAME:-kube-rightsizer}"
IMAGE_REPO="$DOCKERHUB_USER/$IMAGE_NAME"

TAG=""
BUMP_VERSION=""
PUSH_LATEST=false
SKIP_IMAGE=false
SKIP_CHART=false
PUSH=true
FORCE_LOGIN=false
DRY_RUN=false

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
log()  { printf '\033[1;34m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m  %s\n' "$*" >&2; exit 1; }

# run <cmd...> — executes unless --dry-run, then just prints
run() {
  if [ "$DRY_RUN" = true ]; then
    printf '\033[1;36m[dry-run]\033[0m %s\n' "$*"
  else
    "$@"
  fi
}

usage() { grep '^#' "$0" | sed -n '2,40p' | sed 's/^# \{0,1\}//'; }

yaml_value() {
  # yaml_value <key> — first "key: value" in Chart.yaml, quotes stripped
  awk -v key="$1" '$1 == key":" { print $2; exit }' "$CHART_YAML" | tr -d '"'
}

# ----------------------------------------------------------------------------
# Parse arguments
# ----------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --bump)       BUMP_VERSION="${2:?--bump requires a version like 1.0.8}"; shift 2 ;;
    --tag)        TAG="${2:?--tag requires a value}"; shift 2 ;;
    --latest)     PUSH_LATEST=true; shift ;;
    --skip-image) SKIP_IMAGE=true; shift ;;
    --skip-chart) SKIP_CHART=true; shift ;;
    --no-push)    PUSH=false; shift ;;
    --login)      FORCE_LOGIN=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "Unknown option: $1 (see --help)" ;;
  esac
done

# ----------------------------------------------------------------------------
# Preflight
# ----------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
command -v helm   >/dev/null 2>&1 || die "helm not found in PATH"
[ -f "$CHART_YAML" ] || die "Chart.yaml not found at $CHART_YAML"

helm_major="$(helm version --short 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/')"
helm_minor="$(helm version --short 2>/dev/null | sed -E 's/^v[0-9]+\.([0-9]+)\..*/\1/')"
if [ "${helm_major:-0}" -lt 3 ] || { [ "${helm_major:-0}" -eq 3 ] && [ "${helm_minor:-0}" -lt 8 ]; }; then
  die "helm >= 3.8 required for OCI chart pushes (found: $(helm version --short 2>/dev/null || echo unknown))"
fi

CHART_VERSION="$(yaml_value version)"
APP_VERSION="$(yaml_value appVersion)"
[ -n "$CHART_VERSION" ] || die "Could not read 'version' from $CHART_YAML"

if [ -n "$APP_VERSION" ] && [ "$APP_VERSION" != "$CHART_VERSION" ]; then
  warn "Chart.yaml version ($CHART_VERSION) != appVersion ($APP_VERSION) — check before releasing"
fi

# ----------------------------------------------------------------------------
# Version bump (--bump): rewrite every version reference, then verify
# ----------------------------------------------------------------------------
if [ -n "$BUMP_VERSION" ]; then
  echo "$BUMP_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
    || die "--bump wants a semver like 1.0.8 (got: $BUMP_VERSION)"
  [ "$BUMP_VERSION" != "$CHART_VERSION" ] || die "--bump $BUMP_VERSION equals the current version in Chart.yaml"

  OLD="$CHART_VERSION"
  NEW="$BUMP_VERSION"
  OLD_RE="$(printf '%s' "$OLD" | sed 's/\./\\./g')"
  log "Bumping version: $OLD -> $NEW (files are edited even in --dry-run mode)"

  # Chart.yaml: top-level version + appVersion
  sed -i "s/^version: .*/version: $NEW/" "$CHART_YAML"
  sed -i "s/^appVersion: .*/appVersion: \"$NEW\"/" "$CHART_YAML"
  log "  bumped: $CHART_YAML"

  # All other known reference files. Guard: not part of a longer version
  # number, "v1.0.7" and bare "1.0.7" both handled in one pass.
  REF_FILES=(
    "$CHART_DIR/values.yaml"
    "$SCRIPT_DIR/backend/main.py"
    "$SCRIPT_DIR/frontend/package.json"
    "$SCRIPT_DIR"/deploy/*.yaml
    "$SCRIPT_DIR/README.md"
    "$SCRIPT_DIR/DOCKERHUB_README.md"
  )
  for f in "${REF_FILES[@]}"; do
    [ -f "$f" ] || continue
    if grep -qE "(^|[^0-9.])${OLD_RE}([^0-9.]|\$)" "$f" 2>/dev/null; then
      sed -i -E "s/(^|[^0-9.])${OLD_RE}([^0-9.]|\$)/\1${NEW}\2/g" "$f"
      log "  bumped: $f"
    fi
  done

  # Verify nothing stale remains in the files we manage
  if grep -rnE "(^|[^0-9.])${OLD_RE}([^0-9.]|\$)" \
      "$CHART_DIR" "$SCRIPT_DIR/backend/main.py" "$SCRIPT_DIR/frontend/package.json" "$SCRIPT_DIR/deploy" \
      "$SCRIPT_DIR/README.md" "$SCRIPT_DIR/DOCKERHUB_README.md" >/dev/null 2>&1; then
    grep -rnE "(^|[^0-9.])${OLD_RE}([^0-9.]|\$)" "$CHART_DIR" "$SCRIPT_DIR/backend/main.py" \
      "$SCRIPT_DIR/frontend/package.json" "$SCRIPT_DIR/deploy" "$SCRIPT_DIR/README.md" \
      "$SCRIPT_DIR/DOCKERHUB_README.md" | head -5
    die "Stale '$OLD' references remain after bump — fix them manually"
  fi

  # Drop the previously packaged tgz so .chart-release can't ship a stale chart
  if [ -d "$CHART_OUT_DIR" ]; then
    run rm -f "$CHART_OUT_DIR"/"$IMAGE_NAME-$OLD.tgz"
  fi

  CHART_VERSION="$NEW"
  APP_VERSION="$(yaml_value appVersion)"
fi

IMAGE_TAG="${TAG:-v$CHART_VERSION}"

log "Chart version:   $CHART_VERSION"
log "Image:           $IMAGE_REPO:$IMAGE_TAG"
log "Chart registry:  oci://$REGISTRY/$DOCKERHUB_USER"

# ----------------------------------------------------------------------------
# Authentication (token via stdin only — never echoed, never in argv history)
#
# NOTE: docker login MUST target the default registry (docker.io, stored under
# https://index.docker.io/v1/) because `docker push docker.io/...` matches
# credentials by that hostname — NOT registry-1.docker.io. helm registry login
# uses registry-1.docker.io for OCI pushes.
# ----------------------------------------------------------------------------
login_docker() {
  if [ -n "${DOCKERHUB_TOKEN:-}" ]; then
    log "Logging into Docker Hub as $DOCKERHUB_USER (token from DOCKERHUB_TOKEN)"
    printf '%s' "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USER" --password-stdin >/dev/null
  else
    log "Running interactive docker login"
    docker login
  fi
}

login_helm() {
  if [ -n "${DOCKERHUB_TOKEN:-}" ]; then
    log "Logging into $REGISTRY for helm (OCI)"
    printf '%s' "$DOCKERHUB_TOKEN" | helm registry login "$REGISTRY" --username "$DOCKERHUB_USER" --password-stdin >/dev/null
  else
    log "Running interactive helm registry login"
    helm registry login "$REGISTRY"
  fi
}

if [ "$FORCE_LOGIN" = true ]; then
  login_docker
  login_helm
fi

# ----------------------------------------------------------------------------
# 1) Docker image: build + push
# ----------------------------------------------------------------------------
if [ "$SKIP_IMAGE" = false ]; then
  log "Building image $IMAGE_REPO:$IMAGE_TAG"
  run docker build \
    -t "$IMAGE_REPO:$IMAGE_TAG" \
    $( [ "$PUSH_LATEST" = true ] && echo "-t $IMAGE_REPO:latest" ) \
    "$SCRIPT_DIR"

  if [ "$PUSH" = true ]; then
    log "Pushing $IMAGE_REPO:$IMAGE_TAG"
    run docker push "$IMAGE_REPO:$IMAGE_TAG"
    if [ "$PUSH_LATEST" = true ]; then
      log "Pushing $IMAGE_REPO:latest"
      run docker push "$IMAGE_REPO:latest"
    fi
  else
    log "Skipping image push (--no-push)"
  fi
else
  log "Skipping image build/push (--skip-image)"
fi

# ----------------------------------------------------------------------------
# 2) Helm chart: lint + package + OCI push
# ----------------------------------------------------------------------------
if [ "$SKIP_CHART" = false ]; then
  log "Linting chart at $CHART_DIR"
  run helm lint "$CHART_DIR"

  log "Packaging chart (version $CHART_VERSION) into $CHART_OUT_DIR"
  run mkdir -p "$CHART_OUT_DIR"
  if [ "$DRY_RUN" = false ]; then
    helm package "$CHART_DIR" --version "$CHART_VERSION" --destination "$CHART_OUT_DIR"
    CHART_TGZ="$(ls -t "$CHART_OUT_DIR/$IMAGE_NAME-$CHART_VERSION.tgz" 2>/dev/null | head -n 1 || true)"
    [ -n "$CHART_TGZ" ] || die "helm package did not produce the expected .tgz"
    log "Packaged: $CHART_TGZ"
  fi

  if [ "$PUSH" = true ]; then
    log "Pushing chart to oci://$REGISTRY/$DOCKERHUB_USER"
    run helm push "$CHART_OUT_DIR/$IMAGE_NAME-$CHART_VERSION.tgz" "oci://$REGISTRY/$DOCKERHUB_USER"
  else
    log "Skipping chart push (--no-push)"
  fi
else
  log "Skipping chart lint/package/push (--skip-chart)"
fi

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
log "Done. Install with:"
log "  helm install kube-rightsizer oci://$REGISTRY/$DOCKERHUB_USER/$IMAGE_NAME --version $CHART_VERSION"
log "  docker pull $IMAGE_REPO:$IMAGE_TAG"
