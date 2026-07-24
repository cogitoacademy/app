# Cogito Backend — Infrastructure Plan

**Status:** Active — parallel with production-readiness, after foundation hardening
**Branch:** `improvement/infrastructure`
**Created from:** `main` (after `improvement/foundation-hardening` and `improvement/production-readiness` merge)
**Date:** 2026-07-24 (v2 — rewritten for Coolify)
**Depends on:** `improvement/foundation-hardening` and `improvement/production-readiness` merged to main
**Runs in parallel with:** `improvement/production-readiness` (different files — infra touches Docker/CI/CD, prod readiness touches business logic)
**Merges to:** `staging` (then `main` after testing)

This branch sets up the full deployment infrastructure using **Coolify** as the deployment platform on a Hetzner VPS. Coolify manages Docker containers, reverse proxy (Caddy), auto-HTTPS, and deployment — replacing the custom `deploy.sh` + Caddyfile approach from v1.

It runs in parallel with the production-readiness branch because they touch different files.

> **v1 → v2 change:** v1 used a custom `deploy.sh` script + manual Caddy setup. v2 uses Coolify as a self-hosted PaaS — Coolify handles Docker orchestration, Caddy reverse proxy, auto-HTTPS, and deployment webhooks. This is simpler to maintain and provides a web UI for deployment management.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Phase 1: Dockerfiles](#3-phase-1-dockerfiles)
4. [Phase 2: CI Pipeline](#4-phase-2-ci-pipeline)
5. [Phase 3: CD Pipeline (Coolify)](#5-phase-3-cd-pipeline-coolify)
6. [Phase 4: Hetzner VPS + Coolify Provisioning](#6-phase-4-hetzner-vps--coolify-provisioning)
7. [Phase 5: Monitoring + Observability](#7-phase-5-monitoring--observability)
8. [Phase 6: Code Scanning + Bot Maximization](#8-phase-6-code-scanning--bot-maximization)
9. [Branch Strategy](#9-branch-strategy)
10. [Risk Register](#10-risk-register)
11. [Execution Checklist](#11-execution-checklist)

---

## 1. Overview

### What This Branch Does

| Phase     | Focus                                          | Days        |
| --------- | ---------------------------------------------- | ----------- |
| 1         | Dockerfiles (server + web)                     | 0.5         |
| 2         | CI pipeline (feature branches)                 | 0.5         |
| 3         | CD pipeline (Coolify webhook trigger)          | 0.5         |
| 4         | Hetzner VPS + Coolify provisioning             | 1           |
| 5         | Monitoring + observability                     | 1           |
| 6         | Code scanning + bot maximization               | 0.5         |
| **Total** |                                                | **~4 days** |

### Principles

- **Coolify-managed** — Coolify handles Docker, Caddy reverse proxy, auto-HTTPS, and deployment. No manual Caddy config or deploy scripts.
- **Fully declarative** — Dockerfiles, CI workflows, and provisioning scripts all in git. Coolify service config is the only manual setup (one-time).
- **Self-hosted, free-tier only** — Coolify (open source), Uptime Kuma (open source), no paid services.
- **Single VPS** — staging and production as separate Coolify services on the same Hetzner VPS.
- **Automatic deployments** — push to `staging` → Coolify auto-deploys staging. Push to `main` → Coolify auto-deploys production.

### Why Coolify (not custom deploy.sh)

| Aspect              | Custom deploy.sh (v1)              | Coolify (v2)                          |
| ------------------- | ----------------------------------- | ------------------------------------- |
| Reverse proxy       | Manual Caddyfile config            | Coolify-managed Caddy (auto-HTTPS)   |
| Deployment          | SSH + deploy.sh script              | Coolify webhook or git integration    |
| SSL certificates    | Caddy auto-provisions               | Coolify auto-provisions via Caddy/Let's Encrypt |
| Rollback            | Manual docker tag swap              | Coolify UI: one-click rollback        |
| Environment vars    | `.env` files on VPS                 | Coolify UI: per-service env vars      |
| Log viewing         | `docker logs` via SSH               | Coolify UI: per-service log viewer     |
| Health monitoring   | Uptime Kuma only                    | Coolify built-in health checks + Uptime Kuma |
| Multi-service setup | Manual docker-compose orchestration | Coolify service groups + dependencies |

---

## 2. Architecture

### Single VPS Architecture

```
Hetzner VPS (4 vCPU, 8GB RAM, 80GB SSD)
├── Coolify (self-hosted PaaS)
│   ├── Manages Docker containers for all services
│   ├── Caddy reverse proxy (auto-HTTPS via Let's Encrypt)
│   │   ├── cogitoacademy.id → production server (port 3001)
│   │   ├── app.cogitoacademy.id → production web (port 3000)
│   │   ├── staging.cogitoacademy.id → staging server
│   │   └── staging-app.cogitoacademy.id → staging web
│   └── Coolify dashboard (port 8000, auth-protected)
├── Production services (Coolify-managed)
│   ├── cogito-server (Bun, from GHCR image)
│   ├── cogito-web (nginx, from GHCR image)
│   ├── postgres-prod (PostgreSQL 16, Docker volume)
│   └── redis-prod (Redis 7, Docker volume)
├── Staging services (Coolify-managed)
│   ├── cogito-server-staging
│   ├── cogito-web-staging
│   ├── postgres-staging
│   └── redis-staging
└── Uptime Kuma (status page + health checks)
```

### CI/CD Flow

```
Feature branch PR → CI (lint, typecheck, build, test, coverage)
                     ↓
              Merge to staging → CI builds Docker images → pushes to GHCR
                     ↓
              Coolify detects new image → auto-deploys staging
                     ↓
              Merge to main → CI builds Docker images → pushes to GHCR (tagged :latest)
                     ↓
              Coolify detects new image → auto-deploys production
```

### File Structure

```
cogito-app/
├── .github/
│   └── workflows/
│       ├── ci.yml                    ← lint, typecheck, build, test (all PRs)
│       ├── cd-staging.yml             ← build + push to GHCR (push to staging)
│       └── cd-prod.yml                ← build + push to GHCR (push to main)
├── infra/
│   ├── provision.sh                   ← Hetzner VPS setup (Docker + Coolify)
│   ├── .env.staging.example           ← Staging env vars template
│   ├── .env.prod.example              ← Production env vars template
│   └── coolify-setup.md               ← Coolify service configuration guide
├── apps/
│   ├── server/
│   │   ├── Dockerfile                 ← Multi-stage build (Bun)
│   │   └── .dockerignore
│   └── web/
│       ├── Dockerfile                 ← Multi-stage build (Vite + nginx)
│       ├── nginx.conf                 ← SPA fallback, gzip, cache
│       └── .dockerignore
└── packages/                          ← No Dockerfile needed (workspace deps)
```

> **Note:** No `docker-compose.yml` or `Caddyfile` in the repo — Coolify manages these. The Dockerfiles are the only Docker artifacts in git. Coolify service configuration (env vars, volumes, networks, health checks) is done via the Coolify UI and documented in `infra/coolify-setup.md`.

---

## 3. Phase 1: Dockerfiles

### 1.1 Server Dockerfile

**File:** `apps/server/Dockerfile`

```dockerfile
# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/env/package.json packages/env/
COPY packages/config/package.json packages/config/
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM deps AS builder
COPY . .
RUN bun run build

# Stage 3: Production
FROM oven/bun:1-slim AS runner
WORKDIR /app
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "run", "dist/index.js"]
```

**Acceptance:** `docker build -t cogito-server apps/server && docker run --rm cogito-server` starts and responds to `/health`.

### 1.2 Web Dockerfile

**File:** `apps/web/Dockerfile`

```dockerfile
# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM deps AS builder
COPY . .
ENV VITE_SERVER_URL=/rpc
RUN bun run build:web

# Stage 3: Production (nginx)
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Note:** `VITE_SERVER_URL=/rpc` means the frontend calls the API at the same origin (relative path). Coolify's Caddy reverse proxy routes `/rpc/*` to the server container and `/*` to the web container. This avoids CORS issues entirely in production.

**File:** `apps/web/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

> **Note:** No `/api/` proxy in nginx — Coolify's Caddy handles the reverse proxy routing. The web container only serves static files.

**Acceptance:** `docker build -t cogito-web apps/web && docker run --rm -p 8080:80 cogito-web` serves the frontend.

### 1.3 Verify Docker builds

- `docker build -t cogito-server -f apps/server/Dockerfile .` succeeds
- `docker build -t cogito-web -f apps/web/Dockerfile .` succeeds
- Both images start and respond to health checks

**Acceptance:** Both Docker images build and run successfully.

---

## 4. Phase 2: CI Pipeline

### 2.1 Update CI workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run check

  typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run check-types

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build

  test:
    runs-on: ubuntu-latest
    needs: [build]
    timeout-minutes: 10
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: password
          POSTGRES_DB: cogito-test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/cogito-test
      - run: bun test --coverage --env-file apps/server/.env
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/cogito-test
          REDIS_URL: redis://localhost:6379
          BETTER_AUTH_SECRET: test-secret-at-least-32-characters-long-for-ci
          BETTER_AUTH_URL: http://localhost:3001
          CORS_ORIGIN: http://localhost:3000
          PAYMENT_PROVIDER: stub
          PAYMENT_WEBHOOK_SECRET: test-webhook-secret-at-least-32-chars

  coverage:
    runs-on: ubuntu-latest
    needs: [test]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test --coverage --env-file apps/server/.env
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/cogito-test
          # ... same env as test job
      - name: Coverage report
        uses: davelosert/vitest-coverage-report-action@v2
        with:
          coverageThreshold: 80
```

**Acceptance:** Push to feature branch triggers CI. All 4 jobs pass.

---

## 5. Phase 3: CD Pipeline (Coolify)

### 3.1 CD Staging workflow

**File:** `.github/workflows/cd-staging.yml`

```yaml
name: Deploy Staging

on:
  push:
    branches: [staging]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push server
        run: |
          docker build -t ghcr.io/${{ github.repository }}/server:staging -f apps/server/Dockerfile .
          docker push ghcr.io/${{ github.repository }}/server:staging

      - name: Build and push web
        run: |
          docker build -t ghcr.io/${{ github.repository }}/web:staging -f apps/web/Dockerfile .
          docker push ghcr.io/${{ github.repository }}/web:staging

      - name: Trigger Coolify deploy
        run: |
          # Coolify auto-deploys when it detects a new image
          # If webhook-based deploy is configured, trigger it:
          curl -X POST ${{ secrets.COOLIFY_STAGING_WEBHOOK }} || true
```

### 3.2 CD Production workflow

**File:** `.github/workflows/cd-prod.yml`

```yaml
name: Deploy Production

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push server
        run: |
          docker build -t ghcr.io/${{ github.repository }}/server:latest -f apps/server/Dockerfile .
          docker tag ghcr.io/${{ github.repository }}/server:latest ghcr.io/${{ github.repository }}/server:v${{ github.sha }}
          docker push ghcr.io/${{ github.repository }}/server:latest
          docker push ghcr.io/${{ github.repository }}/server:v${{ github.sha }}

      - name: Build and push web
        run: |
          docker build -t ghcr.io/${{ github.repository }}/web:latest -f apps/web/Dockerfile .
          docker tag ghcr.io/${{ github.repository }}/web:latest ghcr.io/${{ github.repository }}/web:v${{ github.sha }}
          docker push ghcr.io/${{ github.repository }}/web:latest
          docker push ghcr.io/${{ github.repository }}/web:v${{ github.sha }}

      - name: Trigger Coolify deploy
        run: |
          curl -X POST ${{ secrets.COOLIFY_PROD_WEBHOOK }} || true

      - name: Health check
        run: |
          sleep 15
          curl -f https://cogitoacademy.id/health || exit 1
```

### 3.3 Coolify deployment configuration

Coolify watches the GHCR registry for new images. When a new `:staging` or `:latest` image is pushed, Coolify automatically pulls and restarts the service. Alternatively, Coolify webhook can be used for explicit deploy triggers.

**Coolify service setup** (documented in `infra/coolify-setup.md`):

For each environment (staging, production), create 4 Coolify services:

1. **PostgreSQL** — Coolify's built-in PostgreSQL service (or external Docker container)
2. **Redis** — Coolify's built-in Redis service
3. **Server** — Docker image from GHCR: `ghcr.io/<repo>/server:latest` (or `:staging`)
4. **Web** — Docker image from GHCR: `ghcr.io/<repo>/web:latest` (or `:staging`)

Each service gets:
- Environment variables (from `infra/.env.prod.example` / `.env.staging.example`)
- Health check endpoint (`/health` for server, HTTP 200 for web)
- Volume mounts (data for postgres/redis)
- Network assignment (same network for server + web + postgres + redis)
- Domain configuration (Coolify auto-configures Caddy reverse proxy)

**Acceptance:** Push to `staging` → CI builds images → pushes to GHCR → Coolify auto-deploys staging. Push to `main` → same for production. Health check passes.

---

## 6. Phase 4: Hetzner VPS + Coolify Provisioning

### 4.1 Provisioning script

**File:** `infra/provision.sh`

```bash
#!/bin/bash
set -euo pipefail

# Cogito VPS Provisioning Script
# Run on a fresh Hetzner VPS with Ubuntu 24.04
# Usage: ssh root@<ip> 'bash -s' < infra/provision.sh

echo "=== Updating system ==="
apt update && apt upgrade -y

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "=== Installing utility packages ==="
apt install -y git curl wget ufw fail2ban

echo "=== Configuring firewall ==="
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (Coolify Caddy)
ufw allow 443/tcp    # HTTPS (Coolify Caddy)
ufw allow 8000/tcp   # Coolify dashboard (optional, can restrict)
ufw --force enable

echo "=== Installing Coolify ==="
# Coolify installation script (from official docs)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

echo "=== Creating deploy user ==="
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

echo "=== Setting up fail2ban ==="
systemctl enable fail2ban
systemctl start fail2ban

echo "=== Done! ==="
echo "Next steps:"
echo "1. Access Coolify at http://<server-ip>:8000"
echo "2. Create admin account in Coolify UI"
echo "3. Add GitHub Container Registry as a Docker registry in Coolify"
echo "4. Create services for PostgreSQL, Redis, server, and web"
echo "5. Configure domains: cogitoacademy.id, app.cogitoacademy.id"
echo "6. Configure DNS: cogitoacademy.id → this server IP"
echo "7. Set up environment variables for each service in Coolify UI"
```

### 4.2 Coolify setup guide

**File:** `infra/coolify-setup.md`

```markdown
# Coolify Service Setup Guide

## Prerequisites
- Coolify installed and running on VPS (http://<ip>:8000)
- GitHub Container Registry (GHCR) accessible
- DNS configured: cogitoacademy.id, app.cogitoacademy.id → VPS IP

## Step 1: Add Docker Registry
1. Coolify → Settings → Docker Registries
2. Add registry: `ghcr.io`
3. Username: your GitHub username
4. Password: GitHub Personal Access Token (with `read:packages` scope)

## Step 2: Create PostgreSQL Service
1. Coolify → Projects → New Project "cogito-prod"
2. Add Service → Database → PostgreSQL 16
3. Name: `postgres-prod`
4. Set password (from .env.prod)
5. Volume: `postgres_prod_data:/var/lib/postgresql/data`
6. Network: `cogito-prod`
7. Deploy

## Step 3: Create Redis Service
1. Add Service → Database → Redis 7
2. Name: `redis-prod`
3. Volume: `redis_prod_data:/data`
4. Network: `cogito-prod`
5. Deploy

## Step 4: Create Server Service
1. Add Service → Docker Image
2. Image: `ghcr.io/<org>/cogito-app/server:latest`
3. Name: `cogito-server`
4. Port: 3001
5. Network: `cogito-prod` (same as postgres + redis)
6. Environment variables (from .env.prod):
   - DATABASE_URL=postgresql://cogito:password@postgres-prod:5432/cogito
   - REDIS_URL=redis://redis-prod:6379
   - BETTER_AUTH_SECRET=...
   - BETTER_AUTH_URL=https://cogitoacademy.id
   - CORS_ORIGIN=https://app.cogitoacademy.id
   - ... (all vars from .env.prod)
7. Health check: GET /health
8. Domain: cogitoacademy.id (Coolify auto-configures Caddy + HTTPS)
   - Path: /rpc → this service (Coolify handles routing)
   - Path: /api → this service
   - Path: /health → this service
9. Auto-deploy: ON (deploy when new image pushed)
10. Deploy

## Step 5: Create Web Service
1. Add Service → Docker Image
2. Image: `ghcr.io/<org>/cogito-app/web:latest`
3. Name: `cogito-web`
4. Port: 80
5. Network: `cogito-prod`
6. Domain: app.cogitoacademy.id
7. Auto-deploy: ON
8. Deploy

## Step 6: Configure Caddy Routing
Coolify automatically configures Caddy reverse proxy:
- cogitoacademy.id/rpc/* → cogito-server:3001
- cogitoacademy.id/api/* → cogito-server:3001
- cogitoacademy.id/health → cogito-server:3001
- cogitoacademy.id/* → cogito-web:80

Or use separate domains:
- app.cogitoacademy.id → cogito-web:80
- cogitoacademy.id/rpc, /api, /health → cogito-server:3001

## Step 7: Repeat for Staging
Same as above but:
- Project: "cogito-staging"
- Images tagged :staging
- Domains: staging.cogitoacademy.id, staging-app.cogitoacademy.id
- PAYMENT_PROVIDER=stub
- SCHEDULER_ENABLED=true

## Step 8: Verify
- curl https://cogitoacademy.id/health → 200
- curl https://app.cogitoacademy.id → frontend HTML
- Coolify dashboard shows all services as "running"
```

### 4.3 Environment templates

**File:** `infra/.env.staging.example`

```env
NODE_ENV=staging
DATABASE_URL=postgresql://cogito_staging:CHANGE_ME@postgres-staging:5432/cogito_staging
REDIS_URL=redis://redis-staging:6379
BETTER_AUTH_SECRET=CHANGE_ME_AT_LEAST_32_CHARS
BETTER_AUTH_URL=https://staging.cogitoacademy.id
CORS_ORIGIN=https://staging-app.cogitoacademy.id
PORT=3001
PAYMENT_PROVIDER=stub
PAYMENT_WEBHOOK_SECRET=CHANGE_ME_AT_LEAST_32_CHARS
SCHEDULER_ENABLED=true
RESEND_API_KEY=
EMAIL_FROM=noreply@staging.cogitoacademy.id
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_CALENDAR_ID=primary
GOOGLE_MEET_ENABLED=false
SESSION_COOKIE_CACHE_MAX_AGE=60
DB_SSL_REJECT_UNAUTHORIZED=true
METRICS_TOKEN=CHANGE_ME
```

**File:** `infra/.env.prod.example**

```env
NODE_ENV=production
DATABASE_URL=postgresql://cogito:CHANGE_ME@postgres-prod:5432/cogito
REDIS_URL=redis://redis-prod:6379
BETTER_AUTH_SECRET=CHANGE_ME_AT_LEAST_32_CHARS
BETTER_AUTH_URL=https://cogitoacademy.id
CORS_ORIGIN=https://app.cogitoacademy.id
PORT=3001
PAYMENT_PROVIDER=xendit
PAYMENT_WEBHOOK_SECRET=CHANGE_ME_AT_LEAST_32_CHARS
XENDIT_SECRET_KEY=CHANGE_ME
XENDIT_WEBHOOK_TOKEN=CHANGE_ME
XENDIT_SUCCESS_REDIRECT_URL=https://app.cogitoacademy.id/balance
XENDIT_FAILURE_REDIRECT_URL=https://app.cogitoacademy.id/balance
SCHEDULER_ENABLED=true
RESEND_API_KEY=CHANGE_ME
EMAIL_FROM=noreply@cogitoacademy.id
GOOGLE_CLIENT_EMAIL=CHANGE_ME@iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=CHANGE_ME
GOOGLE_CALENDAR_ID=primary
GOOGLE_MEET_ENABLED=true
SESSION_COOKIE_CACHE_MAX_AGE=60
DB_SSL_REJECT_UNAUTHORIZED=true
METRICS_TOKEN=CHANGE_ME
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
```

**Acceptance:** Fresh Hetzner VPS provisioned with `provision.sh`. Coolify running at `http://<ip>:8000`. Services configured per `coolify-setup.md`. Both domains serve the app with auto-HTTPS.

---

## 7. Phase 5: Monitoring + Observability

### 5.1 Structured JSON logging

Already implemented in the foundation-hardening branch (Story 6 adds `uncaughtException` handler, and the existing `evlog` logger produces structured JSON). Verify:

- `docker logs <container>` shows JSON-formatted entries
- Each entry includes: `level`, `action`, `timestamp`, `requestId` (for request-scoped logs)
- Error entries include: `error.message`, `error.stack`, `error.cause`

**Acceptance:** Server logs are JSON-formatted and searchable.

### 5.2 Health check enhancement

The foundation-hardening branch enhances `/health` with DB + Redis checks. Verify:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "timestamp": "..."
}
```

**Acceptance:** `/health` returns PostgreSQL and Redis status.

### 5.3 Docker log rotation

Configure in Coolify service settings (or via Docker labels):

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

**Acceptance:** Docker logs rotate automatically. No disk fills up.

### 5.4 Uptime Kuma setup

Deploy Uptime Kuma as a Coolify service:

1. Coolify → Add Service → Docker Image → `louislam/uptime-kuma:1`
2. Port: 3001 (container), 3002 (host)
3. Volume: `uptime_kuma_data:/app/data`
4. Domain: `status.cogitoacademy.id`

Configure via Uptime Kuma UI:

- Monitor `https://cogitoacademy.id/health` every 60s
- Monitor `https://staging.cogitoacademy.id/health` every 60s
- Monitor `https://app.cogitoacademy.id` (frontend) every 60s
- Alert on downtime (configure webhook/email notifications)
- Create public status page at `status.cogitoacademy.id`

**Acceptance:** Uptime Kuma monitors both environments. Status page accessible.

### 5.5 Coolify built-in monitoring

Coolify provides built-in health checks and resource monitoring per service. Configure in Coolify UI:

- CPU/memory alerts for each service
- Health check endpoint per service
- Automatic restart on health check failure

**Acceptance:** Coolify dashboard shows resource usage and health status for all services.

---

## 8. Phase 6: Code Scanning + Bot Maximization

### 6.1 Dependabot configuration

**File:** `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    groups:
      dev-dependencies:
        patterns: ["@types/*", "oxlint", "oxfmt", "typescript"]
      dependencies:
        patterns: ["*"]
        exclude-patterns: ["@types/*"]
    open-pull-requests-limit: 10

  - package-ecosystem: "docker"
    directory: "/apps/server"
    schedule:
      interval: "weekly"

  - package-ecosystem: "docker"
    directory: "/apps/web"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### 6.2 CodeQL security scanning

**File:** `.github/workflows/codeql.yml`

```yaml
name: CodeQL

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]
  schedule:
    - cron: "0 0 * * 1"

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

### 6.3 Semantic PR enforcement

**File:** `.github/workflows/semantic-pr.yml`

```yaml
name: Semantic PR

on:
  pull_request:
    types: [opened, edited, synchronize]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            refactor
            docs
            test
            chore
            ci
            perf
```

### 6.4 PR auto-labeler

**File:** `.github/labeler.yml`

```yaml
server:
  - apps/server/**/*
  - packages/api/**/*
  - packages/auth/**/*
  - packages/db/**/*
  - packages/env/**/*

web:
  - apps/web/**/*
  - packages/ui/**/*

infrastructure:
  - infra/**/*
  - .github/workflows/**/*
  - apps/server/Dockerfile
  - apps/web/Dockerfile

docs:
  - docs/**/*
  - "*.md"
```

**File:** `.github/workflows/labeler.yml`

```yaml
name: Labeler

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v5
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
```

### 6.5 Coverage threshold enforcement

Update `bunfig.toml`:

```toml
[test]
coverage = true
coverageThreshold = { lines = 0.8, functions = 0.8, statements = 0.8 }
```

> **Note:** Foundation-hardening establishes 90% for packages/api, 80% overall. The CI coverage job enforces the 80% overall threshold.

### 6.6 Verify bot configuration

- Push a PR to a feature branch → CI runs all 4 jobs
- Merge PR to `staging` → CD builds and pushes to GHCR → Coolify deploys
- Merge `staging` to `main` → CD builds and pushes to GHCR → Coolify deploys production
- Dependabot creates PRs weekly → CI runs on those PRs
- CodeQL runs weekly → security alerts in GitHub Security tab
- Semantic PR enforcement → non-semantic PR titles rejected
- PR auto-labeler → PRs get labels based on changed files

**Acceptance:** All bots and workflows are active and configured.

---

## 9. Branch Strategy

### Branch Model

```
main (production)
  │
  ├── staging (pre-production, auto-deploys via Coolify)
  │     │
  │     ├── improvement/foundation-hardening (MERGED FIRST)
  │     ├── improvement/production-readiness (PARALLEL with infra)
  │     └── improvement/infrastructure (THIS BRANCH, PARALLEL)
  │
  └── feature/prd-gaps (after foundation + production-readiness + infrastructure merge)
```

### Workflow

1. Create feature branch from `staging`
2. Work on feature branch, push PR to `staging`
3. CI runs on the PR (lint, typecheck, build, test)
4. Merge PR to `staging` → CD builds images → pushes to GHCR → Coolify deploys staging
5. Test on staging
6. Merge `staging` to `main` → CD builds images → pushes to GHCR → Coolify deploys production
7. Monitor via Coolify dashboard + Uptime Kuma + Docker logs

### Deployment Commands

```bash
# Deploy staging (automatic on push to staging branch)
# Manual: trigger Coolify webhook or pull image in Coolify UI

# Deploy production (automatic on push to main branch)
# Manual: trigger Coolify webhook or pull image in Coolify UI

# Rollback production to previous version
# Coolify UI → Service → Deploy → Previous Image (one-click rollback)
```

### Environment Variables

Environment variables are managed in Coolify's per-service settings (not in `.env` files on the VPS). This is more secure than files on disk:

- Coolify encrypts secrets at rest
- Secrets are only visible to admins
- No risk of committing `.env` files to git
- Per-environment (staging vs production) configuration

Secrets for CI/CD (GHCR tokens, Coolify webhook URLs) are set via GitHub Actions secrets.

---

## 10. Risk Register

| #   | Risk                                              | Likelihood | Impact | Mitigation                                                                                                                  |
| --- | ------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| R1  | VPS runs out of resources (RAM/CPU)               | Medium     | High   | Monitor with Coolify + Uptime Kuma. Start with 8GB RAM. Upgrade Hetzner plan if needed.                                     |
| R2  | Docker image build fails in CI                    | Medium     | Low    | Cache Docker layers. Test locally first. Use buildkit.                                                                      |
| R3  | Database migration fails on deploy                | Low        | High   | Coolify runs the container → migration runs on startup. If migration fails, container restarts. Use Coolify rollback.    |
| R4  | Staging and production on same VPS = blast radius | Medium     | High   | Separate Docker networks and databases. Staging data isolated. If VPS goes down, both go down — accept risk for now.      |
| R5  | Coolify certificate provisioning fails             | Low        | Medium | Coolify uses Caddy/Let's Encrypt auto-provisioning. If it fails, check DNS and port 80/443 availability.                   |
| R6  | Coolify upgrade breaks services                   | Low        | High   | Coolify updates are non-breaking for running services. Test on staging first.                                               |
| R7  | Uptime Kuma uses too much memory                  | Low        | Low    | Uptime Kuma uses ~50MB. Monitor with Docker stats.                                                                          |
| R8  | Dependabot PRs break CI                           | Medium     | Low    | CI runs on all Dependabot PRs. Only merge passing PRs.                                                                      |
| R9  | GHCR rate limit on image pulls                    | Low        | Medium | Use authenticated pulls (GHCR PAT). Coolify authenticates with registry credentials.                                       |
| R10 | Coolify dashboard exposed publicly                | Medium     | High   | Restrict port 8000 to SSH tunnel or specific IPs. Or: use Coolify's built-in auth + HTTPS via Coolify's own proxy.         |

---

## 11. Execution Checklist

### Phase 1: Dockerfiles

- [ ] 1.1 Create server Dockerfile (multi-stage build)
- [ ] 1.2 Create web Dockerfile (multi-stage build + nginx)
- [ ] 1.3 Create nginx.conf (SPA fallback, gzip)
- [ ] 1.4 Create .dockerignore for both apps
- [ ] 1.5 Verify Docker builds succeed locally
- [ ] 1.6 Verify both images start and respond to health checks

### Phase 2: CI Pipeline

- [ ] 2.1 Update ci.yml (add Redis service, coverage threshold 80%)
- [ ] 2.2 Add coverage job (runs on PRs, posts coverage report)
- [ ] 2.3 Verify CI passes on feature branch PR

### Phase 3: CD Pipeline

- [ ] 3.1 Create cd-staging.yml (build + push to GHCR + trigger Coolify)
- [ ] 3.2 Create cd-prod.yml (build + push to GHCR + trigger Coolify + health check)
- [ ] 3.3 Add GHCR secrets to GitHub repo settings
- [ ] 3.4 Add Coolify webhook URLs to GitHub secrets
- [ ] 3.5 Verify CD builds and pushes to GHCR on push to staging

### Phase 4: Hetzner VPS + Coolify

- [ ] 4.1 Create provision.sh (Docker, Coolify, firewall, deploy user)
- [ ] 4.2 Create coolify-setup.md (step-by-step Coolify service config)
- [ ] 4.3 Create .env.staging.example and .env.prod.example
- [ ] 4.4 Provision Hetzner VPS with provision.sh
- [ ] 4.5 Install Coolify and create admin account
- [ ] 4.6 Add GHCR as Docker registry in Coolify
- [ ] 4.7 Create PostgreSQL, Redis, server, and web services in Coolify
- [ ] 4.8 Configure domains and auto-HTTPS in Coolify
- [ ] 4.9 Configure DNS (cogitoacademy.id, app.cogitoacademy.id → VPS IP)
- [ ] 4.10 Verify Coolify auto-deploys on new image push
- [ ] 4.11 Verify both domains serve the app with HTTPS

### Phase 5: Monitoring + Observability

- [ ] 5.1 Verify structured JSON logging in Docker logs
- [ ] 5.2 Verify /health returns DB + Redis status
- [ ] 5.3 Configure Docker log rotation in Coolify
- [ ] 5.4 Deploy Uptime Kuma as Coolify service
- [ ] 5.5 Configure Uptime Kuma monitors (health, frontend, alerting)
- [ ] 5.6 Create public status page
- [ ] 5.7 Configure Coolify built-in health checks + resource alerts

### Phase 6: Code Scanning + Bots

- [ ] 6.1 Add CodeQL security scanning workflow
- [ ] 6.2 Add semantic PR enforcement workflow
- [ ] 6.3 Add PR auto-labeler workflow
- [ ] 6.4 Add Dependabot configuration (npm + docker + GH actions)
- [ ] 6.5 Configure GitHub secret scanning (custom patterns)
- [ ] 6.6 Verify coverage threshold in bunfig.toml (80%)
- [ ] 6.7 Verify pre-commit hooks (oxlint, oxfmt, typecheck)
- [ ] 6.8 Test all bots with a sample PR

---

### Version Notes

- v1.0 (2026-07-21): Created. Custom deploy.sh + Caddy approach.
- v2.0 (2026-07-24): Rewritten for Coolify. Replaced custom deploy.sh + Caddyfile with Coolify-managed deployment. Removed docker-compose.yml and Caddyfile from repo (Coolify manages these). Added coolify-setup.md guide. Simplified provisioning script. ~4 days.