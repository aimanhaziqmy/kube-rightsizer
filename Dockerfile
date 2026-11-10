# ==========================================
# Stage 1: Build Clean Soft React UI
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Install dependencies first for efficient layer caching
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build static bundle
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Install API Server in Isolated Virtualenv
# ==========================================
FROM python:3.12-slim AS py-builder
WORKDIR /srv
COPY requirements.txt .
RUN python -m venv /srv/venv && \
    /srv/venv/bin/pip install --no-cache-dir -r requirements.txt

# ==========================================
# Stage 3: Open Source KRR Engine & API Server
# ==========================================
FROM robustadev/krr:v1.31.1

WORKDIR /srv

# Copy isolated API server virtualenv from Stage 2
# (Leaves system python /usr/local/bin/python pristine for robusta-krr engine)
COPY --from=py-builder /srv/venv /srv/venv

# Copy built frontend SPA assets from Stage 1
COPY --from=frontend-builder /app/dist /srv/dist

# Copy backend application package
COPY backend /srv/backend

# Runtime configuration
ENV DATA_DIR=/data/scans \
    STATIC_DIR=/srv/dist \
    PYTHONPATH=/srv \
    PORT=8080 \
    KEEP_SCANS=30 \
    SCAN_TIMEOUT=1800

# Directory for scan history persistence
RUN python -c "import os; os.makedirs('/data/scans', exist_ok=True)"

EXPOSE 8080

VOLUME ["/data/scans"]

CMD ["sh", "-c", "/srv/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

