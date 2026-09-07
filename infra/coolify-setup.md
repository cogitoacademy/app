# Coolify Service Setup Guide

For the Terraform/OVH bootstrap and complete release workflow, including manual
Docker/GHCR deployment when GitHub Actions has no quota, see
[`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Prerequisites

- Coolify installed and running on VPS — **tailnet-only** (no public
  `http://<ip>:8000`; reach it via `http://cogito-vps:8000` from the tailnet)
- GitHub Container Registry (GHCR) accessible
- DNS configured: `api.cogitoacademy.id`, `app.cogitoacademy.id` → VPS IP
- Keep the apex `cogitoacademy.id` on Hostinger; do not route it to this VPS.

## Step 1: Add Docker Registry

1. Coolify → Settings → Docker Registries
2. Add registry: `ghcr.io`
3. Username: your GitHub username
4. Password: GitHub Personal Access Token (with `read:packages` scope)

## Step 2: Create PostgreSQL Service

1. Coolify → Projects → New Project "cogito-prod"
2. Add Service → Database → PostgreSQL 16
3. Name: `cogito-prod-db`
4. Set password (from .env.prod)
5. Volume: `postgres_prod_data:/var/lib/postgresql/data`
6. Network: `cogito-prod`
7. Deploy

## Step 3: Create Redis Service

1. Add Service → Database → Redis 7
2. Name: `cogito-prod-redis`
3. Volume: `redis_prod_data:/data`
4. Network: `cogito-prod`
5. Deploy

## Step 4: Create Server Service

1. Add Service → Docker Image
2. Image: `ghcr.io/cogitoacademy/app/server:latest`
3. Name: `cogito-api`
4. Port: 3001
5. Network: `cogito-prod` (same as postgres + redis)
6. Environment variables (from .env.prod):
   - DATABASE_URL=postgresql://cogito:password@postgres-prod:5432/cogito
   - DB_SSL_ENABLED=false (Coolify's bundled PostgreSQL is non-TLS)
   - DB_SSL_REJECT_UNAUTHORIZED=true (only relevant when DB_SSL_ENABLED=true)
   - REDIS_URL=redis://redis-prod:6379
   - BETTER_AUTH_SECRET=...
   - BETTER_AUTH_URL=https://api.cogitoacademy.id
   - CORS_ORIGIN=https://app.cogitoacademy.id
   - TRUST_PROXY=true (required — Traefik terminates TLS and forwards
     x-forwarded-for; without it rate limiting and the webhook IP
     allowlist see Traefik's IP instead of the client's)
   - ... (all vars from .env.prod)
7. Health check: GET /health
8. Domain: api.cogitoacademy.id (Coolify auto-configures Traefik + HTTPS)
   - All API paths (`/rpc`, `/api`, `/health`, `/webhooks`) route to this
     service. The payment webhook endpoint
     (`POST /webhooks/payments/:provider`) must be reachable from the
     internet; otherwise payments never confirm.
9. Auto-deploy: OFF (`is_auto_deploy_enabled: false` — deploys trigger via
   the CD deploy-webhook, not on image push)
10. Deploy

## Step 5: Create Web Service

1. Add Service → Docker Image
2. Image: `ghcr.io/cogitoacademy/app/web:latest`
3. Name: `cogito-web`
4. Port: 80
5. Network: `cogito-prod`
6. Domain: app.cogitoacademy.id
7. Auto-deploy: OFF (`is_auto_deploy_enabled: false` — deploys trigger via
   the CD deploy-webhook, not on image push)
8. Deploy

> **VITE_SERVER_URL is baked at build time** (the CD workflow passes it as a
> `--build-arg`; the web image has no runtime env). The frontend calls the API
> at the absolute URL `https://api.cogitoacademy.id` (same site as
> `app.cogitoacademy.id`, so the `SameSite=Strict` session cookie is sent and
> CORS is allowed via `CORS_ORIGIN`). Do not set `VITE_SERVER_URL` in the
> Coolify web service env — it has no effect on the built image.

## Step 6: Configure Traefik Routing

Coolify automatically configures Traefik reverse proxy:

- api.cogitoacademy.id/* → cogito-api:3001
- app.cogitoacademy.id → cogito-web:80

## Step 7: Configure Docker Log Rotation

Log rotation (`json-file`, `max-size: 10m`, `max-file: 3`) is a host-level
Docker setting — not a per-service Coolify toggle. It is verified live with
`docker inspect` on each container (confirmed on all containers 2026-09-05)
and asserted by the `drift-check.yml` playbook.

This prevents disk overflow from logs.

## Step 8: Deploy Uptime Kuma

1. Coolify → Add Service → Docker Image → `louislam/uptime-kuma:2`
   (service name: `cogito-uptime-kuma`)
2. Port: 3001 (container), 3002 (host)
3. Volume: `uptime_kuma_data:/app/data`
4. Domain: `status.cogitoacademy.id`

Configure via Uptime Kuma UI:

- Monitor `https://api.cogitoacademy.id/health` every 60s
- Monitor `https://app.cogitoacademy.id` (frontend) every 60s
- Alert on downtime (configure webhook/email notifications)
- Create public status page at `status.cogitoacademy.id`

## Step 9: Configure Coolify Built-in Monitoring

- CPU/memory alerts for each service
- Health check endpoint per service
- Automatic restart on health check failure

## Step 10: Verify

- `curl https://api.cogitoacademy.id/health` → 200
- `curl https://app.cogitoacademy.id` → frontend HTML
- Coolify dashboard shows all services as "running"
