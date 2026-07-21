# Cogito Backend — Infrastructure Plan

**Status:** Active — third branch (parallel with production readiness)
**Branch:** `improvement/infrastructure`
**Created from:** `main` (after consolidation merges)
**Date:** 2026-07-21
**Depends on:** `improvement/consolidation` merged to main
**Runs in parallel with:** `improvement/production-readiness`
**Merges to:** `staging` (then `main` after testing)

This branch sets up the full deployment infrastructure: Docker, CI/CD, Hetzner VPS, monitoring, and code scanning. It runs in parallel with the production readiness branch because they touch different files (infra touches Docker/workflows, prod readiness touches business logic).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Phase 1: Docker Compose + Dockerfiles](#3-phase-1-docker-compose--dockerfiles)
4. [Phase 2: CI Pipeline (Feature Branches)](#4-phase-2-ci-pipeline-feature-branches)
5. [Phase 3: CD Pipeline (Staging + Production)](#5-phase-3-cd-pipeline-staging--production)
6. [Phase 4: Hetzner Provisioning](#6-phase-4-hetzner-provisioning)
7. [Phase 5: Monitoring + Observability](#7-phase-5-monitoring--observability)
8. [Phase 6: Code Scanning + Bot Maximization](#8-phase-6-code-scanning--bot-maximization)
9. [Branch Strategy](#9-branch-strategy)
10. [Risk Register](#10-risk-register)
11. [Execution Checklist](#11-execution-checklist)

---

## 1. Overview

### What This Branch Does

| Phase | Focus | Days |
|-------|-------|------|
| 1 | Docker Compose + Dockerfiles | 1 |
| 2 | CI pipeline (feature branches) | 0.5 |
| 3 | CD pipeline (staging + production) | 1 |
| 4 | Hetzner provisioning (single VPS) | 1 |
| 5 | Monitoring + observability (self-hosted, free) | 1 |
| 6 | Code scanning + bot maximization | 0.5 |
| **Total** | | **~5 days** |

### Principles

- **Fully declarative** — everything in the repo, no UI clicking, no manual steps after initial VPS setup
- **Version-controlled** — Docker configs, nginx/Caddy configs, CI/CD workflows, provisioning scripts all in git
- **Self-hosted, free-tier only** — no paid services, everything runs on the Hetzner VPS
- **Single VPS** — staging and production as separate Docker Compose deployments on the same machine
- **Automatic deployments** — push to `staging` → deploy to staging, push to `main` → deploy to production

---

## 2. Architecture

### Single VPS Architecture

```
Hetzner VPS (4 vCPU, 8GB RAM, 80GB SSD)
├── Caddy (reverse proxy, auto-HTTPS)
│   ├── cogitoacademy.id → production server
│   └── staging.cogitoacademy.id → staging server
├── Docker Compose (production)
│   ├── cogito-server (Bun + compiled JS)
│   ├── cogito-web (Vite build + nginx)
│   ├── postgres-prod (PostgreSQL 16)
│   └── redis-prod (Redis 7)
├── Docker Compose (staging)
│   ├── cogito-server-staging
│   ├── cogito-web-staging
│   ├── postgres-staging (PostgreSQL 16)
│   └── redis-staging (Redis 7)
└── Uptime Kuma (status page + health checks)
```

### CI/CD Flow

```
Feature branch PR → CI (lint, typecheck, test, coverage)
                     ↓
              Merge to staging → CD (build, push, deploy staging)
                     ↓
              Merge to main → CD (build, push, deploy production)
```

### File Structure

```
cogito-app/
├── .github/
│   └── workflows/
│       ├── ci.yml                    ← lint, typecheck, build, test (all PRs)
│       ├── cd-staging.yml            ← build + deploy to staging (push to staging)
│       └── cd-prod.yml               ← build + deploy to production (push to main)
├── infra/
│   ├── provision.sh                  ← Hetzner VPS setup script
│   ├── deploy.sh                     ← Deploy script (called by CI/CD)
│   ├── Caddyfile                     ← Caddy reverse proxy config
│   ├── docker-compose.yml            ← Production services
│   ├── docker-compose.staging.yml    ← Staging overrides
│   ├── docker-compose.prod.yml       ← Production overrides
│   ├── .env.staging.example          ← Staging env vars template
│   ├── .env.prod.example             ← Production env vars template
│   └── healthcheck.sh                ← Container health check script
├── apps/
│   ├── server/
│   │   ├── Dockerfile                ← Multi-stage build (Bun)
│   │   └── .dockerignore
│   └── web/
│       ├── Dockerfile                ← Multi-stage build (Vite + nginx)
│       ├── nginx.conf               ← SPA fallback, gzip, cache
│       └── .dockerignore
└── packages/                         ← No Dockerfile needed (workspace deps)
```

---

## 3. Phase 1: Docker Compose + Dockerfiles

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
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM deps AS builder
COPY . .
RUN bun run build:web

# Stage 3: Production (nginx)
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

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

    # API proxy
    location /api/ {
        proxy_pass http://cogito-server:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static assets cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Acceptance:** `docker build -t cogito-web apps/web && docker run --rm -p 8080:80 cogito-web` serves the frontend.

### 1.3 Docker Compose (base)

**File:** `infra/docker-compose.yml`

```yaml
version: "3.8"

services:
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - BETTER_AUTH_URL=${BETTER_AUTH_URL}
      - CORS_ORIGIN=${CORS_ORIGIN}
      - PORT=3001
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - server
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-cogito}
      POSTGRES_USER: ${POSTGRES_USER:-cogito}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-cogito}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  uptime-kuma:
    image: louislam/uptime-kuma:1
    volumes:
      - uptime_kuma_data:/app/data
    ports:
      - "3002:3001"
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  uptime_kuma_data:
```

### 1.4 Docker Compose (staging overrides)

**File:** `infra/docker-compose.staging.yml`

```yaml
version: "3.8"

services:
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    environment:
      - NODE_ENV=staging
      - DATABASE_URL=postgresql://cogito_staging:${POSTGRES_PASSWORD}@postgres-staging:5432/cogito_staging
      - REDIS_URL=redis://redis-staging:6379
      - BETTER_AUTH_SECRET=${STAGING_BETTER_AUTH_SECRET}
      - BETTER_AUTH_URL=https://staging.cogitoacademy.id
      - CORS_ORIGIN=https://staging.cogitoacademy.id
      - PAYMENT_PROVIDER=stub
      - PAYMENT_WEBHOOK_SECRET=${STAGING_PAYMENT_WEBHOOK_SECRET}
      - SCHEDULER_ENABLED=true
    ports:
      - "3011:3001"

  web:
    ports:
      - "3010:80"

  postgres-staging:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: cogito_staging
      POSTGRES_USER: cogito_staging
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_staging_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cogito_staging"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-staging:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_staging_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_staging_data:
  redis_staging_data:
```

### 1.5 Verify Docker builds

- `docker compose -f docker-compose.yml build` succeeds
- `docker compose -f docker-compose.yml up` starts all services
- `curl http://localhost:3001/health` returns 200
- `curl http://localhost:3000` returns frontend HTML

**Acceptance:** All containers start. Server responds to `/health`. Frontend loads.

---

## 4. Phase 2: CI Pipeline (Feature Branches)

### 2.1 Update CI workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run check-types

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build

  test:
    runs-on: ubuntu-latest
    needs: [build]
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
      - run: bun test --coverage
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/cogito-test
          REDIS_URL: redis://localhost:6379
          BETTER_AUTH_SECRET: test-secret-at-least-32-characters-long-for-ci
          BETTER_AUTH_URL: http://localhost:3001
          CORS_ORIGIN: http://localhost:3000
          PAYMENT_PROVIDER: stub
          PAYMENT_WEBHOOK_SECRET: test-webhook-secret

  coverage:
    runs-on: ubuntu-latest
    needs: [test]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test --coverage
      - name: Coverage report
        uses: davelosert/vitest-coverage-report-action@v2
        with:
          coverageThreshold: 80
```

**Acceptance:** Push to feature branch triggers CI. All 4 jobs pass.

---

## 5. Phase 3: CD Pipeline (Staging + Production)

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
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

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

  deploy-staging:
    runs-on: ubuntu-latest
    needs: build-and-push
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        env:
          SSH_PRIVATE_KEY: ${{ secrets.STAGING_SSH_KEY }}
          STAGING_HOST: ${{ secrets.STAGING_HOST }}
          STAGING_USER: ${{ secrets.STAGING_USER }}
        run: |
          echo "$SSH_PRIVATE_KEY" > /tmp/staging_key
          chmod 600 /tmp/staging_key
          ssh -o StrictHostKeyChecking=no -i /tmp/staging_key $STAGING_USER@$STAGING_HOST "bash -s" < infra/deploy.sh staging

      - name: Health check
        run: |
          sleep 10
          curl -f https://staging.cogitoacademy.id/api/health || exit 1
```

### 3.2 CD Production workflow

**File:** `.github/workflows/cd-prod.yml`

Same as staging but:
- Trigger: `push` to `main`
- Tag: `ghcr.io/.../server:latest` and `ghcr.io/.../server:v${{ github.sha }}`
- Deploys to production
- Health check against `cogitoacademy.id`
- Adds rollback step on failure

### 3.3 Deploy script

**File:** `infra/deploy.sh`

```bash
#!/bin/bash
set -euo pipefail

ENV="${1:-staging}"
COMPOSE_FILE="docker-compose.yml"

if [ "$ENV" = "staging" ]; then
  COMPOSE_FILE="docker-compose.staging.yml"
fi

echo "Deploying $ENV environment..."

# Pull latest images
docker compose -f "$COMPOSE_FILE" pull

# Run migrations
docker compose -f "$COMPOSE_FILE" run --rm server bun run db:migrate

# Restart services
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Clean up old images
docker image prune -f

echo "Deploy complete. Running health check..."
sleep 5
curl -f http://localhost:3001/health || { echo "Health check failed!"; exit 1; }
echo "Health check passed."
```

**Acceptance:** Push to `staging` → builds Docker images → pushes to GHCR → SSHs into VPS → runs `deploy.sh staging`. Push to `main` → same for production.

---

## 6. Phase 4: Hetzner Provisioning

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

echo "=== Installing Caddy ==="
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1slf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | tee /etc/apt/trusted.gpg.d/caddy-stable.asc
curl -1slf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

echo "=== Installing utility packages ==="
apt install -y git curl wget ufail2ban

echo "=== Configuring firewall ==="
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw allow 3002/tcp   # Uptime Kuma (optional, can remove)
ufw --force enable

echo "=== Creating deploy user ==="
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

echo "=== Creating app directory ==="
mkdir -p /opt/cogito
chown deploy:deploy /opt/cogito

echo "=== Setting up fail2ban ==="
systemctl enable fail2ban
systemctl start fail2ban

echo "=== Done! ==="
echo "Next steps:"
echo "1. Add your SSH key to /home/deploy/.ssh/authorized_keys"
echo "2. Copy docker-compose files to /opt/cogito/"
echo "3. Copy .env.staging to /opt/cogito/.env"
echo "4. Run: cd /opt/cogito && docker compose up -d"
echo "5. Configure DNS: cogitoacademy.id → this server IP"
```

### 4.2 Caddy configuration

**File:** `infra/Caddyfile`

```
# Production
cogitoacademy.id {
    reverse_proxy localhost:3000
    encode gzip

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }

    # API proxy
    handle /api/* {
        reverse_proxy localhost:3001
    }
}

# Staging
staging.cogitoacademy.id {
    reverse_proxy localhost:3010
    encode gzip

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }

    handle /api/* {
        reverse_proxy localhost:3011
    }
}
```

### 4.3 Environment templates

**File:** `infra/.env.staging.example`

```env
NODE_ENV=staging
DATABASE_URL=postgresql://cogito_staging:CHANGE_ME@postgres-staging:5432/cogito_staging
REDIS_URL=redis://redis-staging:6379
BETTER_AUTH_SECRET=CHANGE_ME_AT_LEAST_32_CHARS
BETTER_AUTH_URL=https://staging.cogitoacademy.id
CORS_ORIGIN=https://staging.cogitoacademy.id
PORT=3001
PAYMENT_PROVIDER=stub
PAYMENT_WEBHOOK_SECRET=CHANGE_ME
SCHEDULER_ENABLED=true
RESEND_API_KEY=
EMAIL_FROM=noreply@staging.cogitoacademy.id
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_CALENDAR_ID=primary
```

**File:** `infra/.env.prod.example`

Same but with `NODE_ENV=production`, production URLs, and real API keys.

**Acceptance:** Fresh Hetzner VPS provisioned with `provision.sh`. Caddy serves both staging and production with auto-HTTPS.

---

## 7. Phase 5: Monitoring + Observability

All self-hosted, free, running on the same VPS.

### 5.1 Structured JSON logging

**File:** Update `apps/server/src/index.ts` and logging config

Replace `console.log` / `console.error` with structured JSON logs:

```ts
// lib/logger.ts
export const log = {
  info: (msg: string, data?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: "info", msg, timestamp: new Date().toISOString(), ...data }));
  },
  error: (msg: string, data?: Record<string, unknown>) => {
    console.error(JSON.stringify({ level: "error", msg, timestamp: new Date().toISOString(), ...data }));
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: "warn", msg, timestamp: new Date().toISOString(), ...data }));
  },
};
```

Docker collects these logs with `docker logs cogito-server`. Structured JSON makes them searchable.

**Acceptance:** Server logs are JSON-formatted. `docker logs cogito-server` shows structured entries.

### 5.2 Request ID middleware

**File:** Update `apps/server/src/routes.ts`

Add request ID to every request:

```ts
import { randomUUID } from "crypto";

app.onRequest((ctx) => {
  ctx.headers.set("x-request-id", randomUUID());
});
```

Every log entry includes the request ID for correlation.

**Acceptance:** Every request has a unique `x-request-id` header. Logs include request ID.

### 5.3 Health check enhancement

**File:** Update `apps/server/src/routes.ts`

Enhance `/health` to check PostgreSQL and Redis:

```ts
app.get("/health", async () => {
  const dbHealthy = await db.execute(sql`SELECT 1`);
  const redisHealthy = await redis.ping(); // after Redis is added
  return { status: "ok", db: dbHealthy ? "ok" : "error", redis: redisHealthy ? "ok" : "error" };
});
```

**Acceptance:** `/health` returns PostgreSQL and Redis status.

### 5.4 Docker log rotation

**File:** `infra/docker-compose.yml` (add to each service)

```yaml
services:
  server:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**Acceptance:** Docker logs rotate automatically. No disk fills up.

### 5.5 Uptime Kuma setup

Uptime Kuma runs as a Docker container (already in `docker-compose.yml`).

Configure via its API or UI (one-time setup, then config is persisted in Docker volume):

- Monitor `https://cogitoacademy.id/health` every 60s
- Monitor `https://staging.cogitoacademy.id/health` every 60s
- Monitor `https://cogitoacademy.id` (frontend) every 60s
- Alert on downtime (configure webhook/email notifications)

**Acceptance:** Uptime Kuma monitors both environments. Status page accessible at `https://status.cogitoacademy.id` (or `http://<vps-ip>:3002`).

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
        patterns:
          - "@types/*"
          - "oxlint"
          - "oxfmt"
          - "typescript"
      dependencies:
        patterns:
          - "*"
        exclude-patterns:
          - "@types/*"
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
    - cron: "0 0 * * 1"  # Weekly Monday

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

### 6.3 Secret scanning

Already enabled in GitHub (repository settings → Code security → Secret scanning). Add custom patterns:

**File:** `.github/codeql-custom-queries/secrets.yml` (or configure in GitHub UI)

Custom patterns to detect:
- `XENDIT_SECRET_KEY`
- `GOOGLE_PRIVATE_KEY`
- `RESEND_API_KEY`
- `BETTER_AUTH_SECRET` (when not in test values)

### 6.4 Semantic PR enforcement

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

### 6.5 PR auto-labeler

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

### 6.6 Coverage threshold enforcement

Already in CI workflow (`.github/workflows/ci.yml`). Add to `bunfig.toml`:

```toml
[test]
coverage = true
coverageThreshold = 80
```

### 6.7 Pre-commit hooks (already configured)

Lefthook is already set up. Verify it covers:
- `oxlint` on commit
- `oxfmt --check` on commit
- `bun run check-types` on push

### 6.8 Verify bot configuration

- Push a PR to a feature branch → CI runs all 4 jobs
- Merge PR to `staging` → CD builds and deploys
- Dependabot creates PRs weekly → CI runs on those PRs
- CodeQL runs weekly → security alerts appear in GitHub Security tab
- Semantic PR enforcement → non-semantic PR titles are rejected
- PR auto-labeler → PRs get labels based on changed files

**Acceptance:** All bots and workflows are active and configured.

---

## 9. Branch Strategy

### Branch Model

```
main (production)
  │
  ├── staging (pre-production, auto-deploys)
  │     │
  │     ├── improvement/consolidation (MERGED FIRST)
  │     ├── improvement/production-readiness (PARALLEL)
  │     └── improvement/infrastructure (PARALLEL)
  │
  └── feature/prd-gaps (after both production-readiness and infrastructure merge)
```

### Workflow

1. Create feature branch from `staging`
2. Work on feature branch, push PR to `staging`
3. CI runs on the PR (lint, typecheck, build, test)
4. Merge PR to `staging` → CD builds and deploys to staging VPS
5. Test on staging
6. Merge `staging` to `main` → CD builds and deploys to production VPS
7. Monitor via Uptime Kuma + Docker logs

### Deployment Commands

```bash
# Deploy staging (automatic on push to staging branch)
# Or manual: ssh deploy@<vps-ip> "cd /opt/cogito && ./infra/deploy.sh staging"

# Deploy production (automatic on push to main branch)
# Or manual: ssh deploy@<vps-ip> "cd /opt/cogito && ./infra/deploy.sh production"

# Rollback production to previous version
ssh deploy@<vps-ip> "cd /opt/cogito && docker compose -f docker-compose.prod.yml down && docker tag ghcr.io/<repo>/server:previous ghcr.io/<repo>/server:latest && docker compose -f docker-compose.prod.yml up -d"
```

### Environment Variables

Environment variables are managed via `.env` files on the VPS:

```bash
# On VPS: /opt/cogito/.env
# Copy from .env.staging.example or .env.prod.example
# Fill in real values, NEVER commit to git
```

Secrets that shouldn't be in `.env` files (API keys, etc.) are set via GitHub Actions secrets for CI/CD, and via the `.env` file on the VPS for runtime.

---

## 10. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | VPS runs out of resources (RAM/CPU) | Medium | High | Monitor with Uptime Kuma + Docker stats. Start with 8GB RAM. Upgrade Hetzner plan if needed. |
| R2 | Docker image build fails in CI | Medium | Low | Cache Docker layers. Use buildkit. Test locally first. |
| R3 | Database migration fails on deploy | Low | High | CD runs migration before `docker compose up`. If migration fails, deploy stops. Manual rollback required. |
| R4 | Staging and production on same VPS = blast radius | Medium | High | Use separate Docker networks and databases. Staging data is isolated. If VPS goes down, both go down — accept risk for now. |
| R5 | Caddy certificate provisioning fails | Low | Medium | Caddy auto-provisions Let's Encrypt certs. If it fails, check DNS and port 80/443 availability. |
| R6 | Uptime Kuma uses too much memory | Low | Low | Uptime Kuma uses ~50MB. Monitor with Docker stats. |
| R7 | Dependabot PRs break CI | Medium | Low | CI runs on all Dependabot PRs. Only merge passing PRs. |
| R8 | Hetzner VPS IP changes | Very Low | Medium | Use Hetzner floating IP if needed. DNS TTL set low (300s). |

---

## 11. Execution Checklist

### Phase 1: Docker Compose + Dockerfiles

- [ ] 1.1 Create server Dockerfile (multi-stage build)
- [ ] 1.2 Create web Dockerfile (multi-stage build + nginx)
- [ ] 1.3 Create nginx.conf (SPA fallback, gzip, API proxy)
- [ ] 1.4 Create docker-compose.yml (production)
- [ ] 1.5 Create docker-compose.staging.yml (staging overrides)
- [ ] 1.6 Create .dockerignore for both apps
- [ ] 1.7 Verify Docker builds succeed locally
- [ ] 1.8 Verify `docker compose up` starts all services

### Phase 2: CI Pipeline

- [ ] 2.1 Update ci.yml (add Redis service, coverage threshold)
- [ ] 2.2 Add Dependabot configuration
- [ ] 2.3 Add CodeQL security scanning
- [ ] 2.4 Add semantic PR enforcement
- [ ] 2.5 Add PR auto-labeler
- [ ] 2.6 Verify CI passes on feature branch PR

### Phase 3: CD Pipeline

- [ ] 3.1 Create cd-staging.yml (build + push + deploy)
- [ ] 3.2 Create cd-prod.yml (build + push + deploy + rollback)
- [ ] 3.3 Create deploy.sh (migrate + pull + restart + health check)
- [ ] 3.4 Add GHCR secrets to GitHub repo settings
- [ ] 3.5 Add SSH key secrets for staging and production VPS
- [ ] 3.6 Verify CD deploys to staging on push to staging branch

### Phase 4: Hetzner Provisioning

- [ ] 4.1 Create provision.sh (Docker, Caddy, firewall, deploy user)
- [ ] 4.2 Create Caddyfile (production + staging reverse proxy)
- [ ] 4.3 Create .env.staging.example and .env.prod.example
- [ ] 4.4 Provision Hetzner VPS with provision.sh
- [ ] 4.5 Configure DNS (cogitoacademy.id → VPS IP, staging.cogitoacademy.id → VPS IP)
- [ ] 4.6 Verify Caddy auto-provisions SSL certificates
- [ ] 4.7 Verify both domains resolve and serve the app

### Phase 5: Monitoring + Observability

- [ ] 5.1 Add structured JSON logging (lib/logger.ts)
- [ ] 5.2 Add request ID middleware
- [ ] 5.3 Enhance /health endpoint (PostgreSQL + Redis ping)
- [ ] 5.4 Add Docker log rotation to docker-compose.yml
- [ ] 5.5 Configure Uptime Kuma (status page + health checks + alerts)
- [ ] 5.6 Verify logs are structured and searchable

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

- v1.0 (2026-07-21): Created. Infrastructure branch: Docker, CI/CD, Hetzner, monitoring, code scanning. 6 phases, ~5 days. Runs in parallel with production readiness after consolidation merges.