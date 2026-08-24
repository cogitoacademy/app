# Monitoring + Observability

## Structured JSON Logging

The server uses `evlog` for structured JSON logging. Docker logs show JSON-formatted entries:

```bash
docker logs <container> | jq .
```

Each entry includes: `level`, `action`, `timestamp`, `requestId` (for request-scoped logs).
Error entries include: `error.message`, `error.stack`, `error.cause`.

## Health Check Endpoint

`GET /health` returns:

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

The Redis health check is implemented in the server's `db-health.ts` (added by DEFERRED-OPS 1.6) — the server pings Redis alongside the DB `SELECT 1` and reports both in `/health`.

## Docker Log Rotation

Configure for each Coolify service (or via Docker Compose labels):

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

In Coolify UI: Service → Configuration → Docker Logging → set max-size and max-file.

This prevents disk overflow from unbounded log growth.

## Uptime Kuma Setup

Deploy as a Coolify service:

1. Coolify → Add Service → Docker Image → `louislam/uptime-kuma:1`
2. Port: 3001 (container), 3002 (host)
3. Volume: `uptime_kuma_data:/app/data`
4. Domain: `status.cogitoacademy.id`

### Monitor Configuration

- Monitor `https://api.cogitoacademy.id/health` every 60s
- Monitor `https://staging.cogitoacademy.id/health` every 60s
- Monitor `https://app.cogitoacademy.id` (frontend) every 60s
- Alert on downtime (configure webhook/email notifications)
- Create public status page at `status.cogitoacademy.id`

## Coolify Built-in Monitoring

Configure in Coolify UI per service:

- CPU/memory alerts (thresholds per service)
- Health check endpoint per service
- Automatic restart on health check failure
