# Coolify Service Setup Guide

## Prerequisites

- Coolify installed and running on VPS (http://\<ip\>:8000)
- GitHub Container Registry (GHCR) accessible
- DNS configured:
  - `api.cogitoacademy.id` → VPS IP (A record)
  - `app.cogitoacademy.id` → Cloudflare Pages project (CNAME)
  - `coolify.cogitoacademy.id` → VPS IP (optional administration hostname)
- Cloudflare Pages project connected to this GitHub repository

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
   - DB_SSL_ENABLED=false (Coolify's bundled PostgreSQL is non-TLS)
   - DB_SSL_REJECT_UNAUTHORIZED=true (only relevant when DB_SSL_ENABLED=true)
   - REDIS_URL=redis://redis-prod:6379
   - BETTER_AUTH_SECRET=...
   - BETTER_AUTH_URL=https://api.cogitoacademy.id
   - CORS_ORIGIN=https://app.cogitoacademy.id
   - TRUST_PROXY=true (required — Caddy terminates TLS and forwards
     x-forwarded-for; without it rate limiting and the webhook IP
     allowlist see Caddy's IP instead of the client's)
   - ... (all vars from .env.prod)
7. Health check: GET /health
8. Domain: api.cogitoacademy.id (Coolify auto-configures Caddy + HTTPS)
   - All API paths (`/rpc`, `/api`, `/health`, `/webhooks`) route to this
     service. The payment webhook endpoint
     (`POST /webhooks/payments/:provider`) must be reachable from the
     internet; otherwise payments never confirm.
9. Auto-deploy: ON (deploy when new image pushed)
10. Deploy

## Step 5: Configure Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → select the Pages project.
2. In **Custom domains**, add `app.cogitoacademy.id` and activate it.
3. If DNS is still hosted at Hostinger, create this record there:
   - Type: `CNAME`
   - Name: `app`
   - Target: `<your-project>.pages.dev`
4. Configure the Git build:
   - Root directory: `/`
   - Build command: `bun install --frozen-lockfile && bun run build:web`
   - Build output directory: `apps/web/dist`
5. In Pages → Settings → Environment variables, add for **Production**:
   - `VITE_SERVER_URL=https://api.cogitoacademy.id`
6. Deploy the project.

> **VITE_SERVER_URL is baked at build time.** Pages injects it during the build;
> it is public frontend configuration, not a secret. The frontend calls the API
> at `https://api.cogitoacademy.id`, while the API allows
> `https://app.cogitoacademy.id` through `CORS_ORIGIN`.

## Step 6: Configure Caddy Routing

Coolify automatically configures Caddy reverse proxy:

- api.cogitoacademy.id/* → cogito-server:3001

The `app` hostname is served by Cloudflare Pages and must not be added as a
Coolify application domain.

## Step 7: Repeat for Staging

Same as above but:

- Project: "cogito-staging"
- Image tagged `:staging` for the API service
- Domain: `staging.cogitoacademy.id` for the API service
- Cloudflare Pages preview/staging domain: `staging-app.cogitoacademy.id` (optional)
- Pages Preview environment variable:
  `VITE_SERVER_URL=https://staging.cogitoacademy.id`
- PAYMENT_PROVIDER=stub
- SCHEDULER_ENABLED=true

## Step 8: Configure Docker Log Rotation

For each service in Coolify, add Docker labels or configure in service settings:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

This prevents disk overflow from logs.

## Step 9: Deploy Uptime Kuma

1. Coolify → Add Service → Docker Image → `louislam/uptime-kuma:1`
2. Port: 3001 (container), 3002 (host)
3. Volume: `uptime_kuma_data:/app/data`
4. Domain: `status.cogitoacademy.id`

Configure via Uptime Kuma UI:

- Monitor `https://api.cogitoacademy.id/health` every 60s
- Monitor `https://staging.cogitoacademy.id/health` every 60s
- Monitor `https://app.cogitoacademy.id` (frontend) every 60s
- Alert on downtime (configure webhook/email notifications)
- Create public status page at `status.cogitoacademy.id`

## Step 10: Configure Coolify Built-in Monitoring

- CPU/memory alerts for each service
- Health check endpoint per service
- Automatic restart on health check failure

## Step 11: Verify

- `curl https://api.cogitoacademy.id/health` → 200
- `curl https://app.cogitoacademy.id` → frontend HTML
- Coolify dashboard shows all services as "running"
