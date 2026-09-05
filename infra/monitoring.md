# Monitoring + Observability

> Pointer — canonical docs: `docs/KUMA-RUNBOOK.md` (Uptime Kuma monitors,
> Discord alerting, status page — live since 2026-09-02) and
> `docs/INFRA-PLAYBOOK.md` (when to run what, drift-check, disk-watchdog).

- **Uptime Kuma** — `status.cogitoacademy.id`; 4 monitors + `COGITO ALERT`
  Discord + `cogito` status page (`docs/KUMA-RUNBOOK.md`).
- **Health** — `GET /health` (DB/Redis/scheduler/DLQ).
- **Disk watchdog** — nightly 03:30 WIB, warn ≥ 85%, prune ≥ 92%.
- **Log rotation** — json-file 10m×3 per Coolify service (drift-check item).
- **Structured logs** — `evlog` JSON; `docker logs <container> | jq .`.
