# Deployment Plan — Single-Server Production Readiness

| Field      | Value |
| ---------- | ----- |
| Status     | Active |
| Created    | 2026-08-26 |
| Branch     | `deploy/production-readiness` |
| Depends on | PR #106 (backend finalization), PR #107 (re-audit fixes), PR #102 (Terraform + runbook, **needs rebase + CI re-run**), live env verified 2026-08-26 |
| Scope      | Wire all production dependencies (credentials, env, DNS, webhooks), backups, migrations-in-CD, monitoring + alerting, security hardening, staging, scalability prep |
| Credentials | **User has all credentials ready** — the operator fills secrets into the SOPS vault / Coolify env via `herd attach` or the Coolify UI (the lead never types secrets) |

## 0. Locked decisions (from production-readiness spec §5, confirmed with user)

- Staging on the same VPS, separate containers + subdomains, `staging` branch.
- Monitoring self-hosted on the VPS (Uptime Kuma mandatory; Prometheus+Grafana+Alertmanager only if the 3.7GB RAM budget allows — see Phase 3 risk).
- Backups to R2 (30-day retention) + pre-migration snapshot in CD.
- Secrets via SOPS + Age, applied to Coolify env; operator types secrets.
- Migrations in CD with auto-rollback (backup → migrate → deploy → health → rollback).
- Google OAuth + Meet wired via OAuth refresh-token path (Gmail account).
- Cloudflare retained for DNS/proxy/WAF; Cloudflare Access locks Coolify admin.
- Alerting to both operators via Telegram.

## 1. Current state (verified 2026-08-26)

| Item | State |
| ---- | ----- |
| Live API `https://api.cogitoacademy.id/health` | `{"status":"ok","checks":{"database":"ok","redis":"ok"}}` — **DB + Redis OK** |
| DNS `api.` / `app.` | Cloudflare proxy → VPS (verified via dig: 104.21.43.150) |
| Deploy Production workflow | **Failing on every main push** — `COOLIFY_PROD_SERVER_WEBHOOK` unset → curl exit 6 (S7). Images pushed to GHCR but prod never redeploys. |
| Live env gaps (from spec) | `PAYMENT_PROVIDER=stub` (not xendit), no Google OAuth/Meet vars, no R2 vars (uploads → container-local disk), no Sanity token, no `coolify.`/`staging.`/`status.` DNS, no backups, no monitoring/alerting |
| PR #102 | OPEN, **CONFLICTING** (needs rebase on main), Test+Coverage job failed pre-rebase (coverage gate at that base commit) |
| Scheduler boot | Fail-loud implemented (#106): prod must set `SCHEDULER_ENABLED=true` or boot aborts |
| Env fail-loud guards | `WEBHOOK_ALLOWED_IPS` required when xendit in prod; `SCHEDULER_ENABLED=true` required in prod (#107) |
| Code posture | 100% lines coverage gate green; 2,198 api tests + 110 server tests green |

## 2. Target topology (single VPS, scale-ready)

```
Cloudflare (DNS + proxy + WAF; Access locks coolify.*)
  ├── app.cogitoacademy.id      → web container (nginx :80)
  ├── api.cogitoacademy.id      → server container (:3001, /rpc /api /health /webhooks)
  ├── staging.cogitoacademy.id  → staging web (nginx :80)
  ├── staging-api.cogitoacademy.id → staging server (:3001)
  ├── coolify.cogitoacademy.id  → Coolify UI (Cloudflare Access, operator emails only)
  └── status.cogitoacademy.id   → Uptime Kuma status page
VPS (OVH 2vCPU / 3.7GB / 38GB, Ubuntu, ufw 22/80/443, fail2ban, unattended-upgrades)
  ├── Coolify (traefik/Caddy TLS; Postgres 16 + Redis 7 on private network)
  ├── Uptime Kuma (status + monitors + alerts)
  ├── Backup cron: nightly pg_dump → R2 (30-day retention) + pre-migration snapshot
  └── (stretch) Prometheus + node_exporter + Alertmanager → Telegram
GHCR: ghcr.io/cogitoacademy/app/{server,web}:latest + v<sha> (immutable rollback tags)
```

**Scalability prep (documented levers, not built now):** stateless server replicas behind a LB (BullMQ repeatable jobs dedupe by name across replicas — verified; rate limits + idempotency Redis-backed; sessions DB-backed), vertical VPS upgrade, managed Postgres with TLS (`DB_SSL_ENABLED=true`).

---

## Phase 1 — Wire production dependencies (operator + repo work)

### Task 1: Merge PR #102 (Terraform + DEPLOYMENT.md) — repo work
- [ ] Rebase `docs/production-deployment-runbook` on main, fix the coverage-gate CI failure (its base commit predates the coverage fixes), re-run CI until green.
- [ ] Merge (squash) PR #102.
- Commit: `chore(infra): merge deployment runbook + terraform bootstrap (#102)`

### Task 2: Fix Deploy Production workflow (S7) — repo work
**Files:** `.github/workflows/cd-prod.yml`, `.github/workflows/cd-staging.yml`
- [ ] Guard the Coolify webhook steps: if the secret is empty, fail with a clear message (`curl` exit 6 "Could not resolve host" is the current symptom).
- [ ] Add a `needs: ci` gate (Phase 4 does this fully — here just make the deploy not run when CI is red).
- [ ] Change the health poll to verify the **new image sha** (Coolify deploy is async; current poll can pass against the old container): poll `/health` AND check a version marker (server exposes image sha via a header or `/health` field — add `version` to the health response in `apps/server/src/routes.ts` + test).
- Commit: `fix(ci): guard deploy webhook secrets and verify deployed image sha`

### Task 3: Create the SOPS vault + fill credentials — operator (user) with repo scaffold
- [ ] Repo: add `.sops.yaml` + `infra/secrets/` + `scripts/sops-apply.sh` (decrypt → Coolify env via API or `.env` drop-in), `.sops.yaml` keys via Age (operator generates; public key committed, private key stored off-repo).
- [ ] Operator (via `herd attach` in a worker pane or manually): create the Age keypair, encrypt `infra/secrets/prod.env` with ALL credentials the user has ready:
  - `BETTER_AUTH_SECRET` (32+ chars), `PAYMENT_WEBHOOK_SECRET`
  - `RESEND_API_KEY` + verified `EMAIL_FROM`
  - `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_SUCCESS/FAILURE_REDIRECT_URL`, `WEBHOOK_ALLOWED_IPS` (Xendit live egress IPs)
  - `GOOGLE_CLIENT_ID/SECRET` (OAuth), `GOOGLE_MEET_CLIENT_ID/SECRET/REFRESH_TOKEN` (from `scripts/google-meet-auth.ts`)
  - `R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET/PUBLIC_URL`
  - `SANITY_PROJECT_ID/DATASET/API_VERSION/API_TOKEN`
  - `METRICS_TOKEN`
- [ ] Verify the vault decrypts on a fresh checkout (CI-time check optional).
- Commit: `chore(secrets): add SOPS scaffold and apply script` (encrypted file only, no plaintext)

### Task 4: Apply env to Coolify prod resources — operator
- [ ] Set the API resource env from the decrypted vault (must include `NODE_ENV=production`, `SCHEDULER_ENABLED=true`, `TRUST_PROXY=true`, `DB_SSL_ENABLED=false`, `BETTER_AUTH_URL=https://api.cogitoacademy.id`, `CORS_ORIGIN=https://app.cogitoacademy.id`).
- [ ] Add `COOLIFY_PROD_SERVER_WEBHOOK` + `COOLIFY_PROD_WEBHOOK` as GitHub Actions secrets (from Coolify resource webhooks).
- [ ] Redeploy; verify `/health` shows DB+Redis ok, scheduler boot does not abort.

### Task 5: Wire Google Meet + Sanity + R2 + Xendit — operator (user has credentials)
- [ ] Google OAuth: set `GOOGLE_CLIENT_ID/SECRET`; verify `/api/auth/callback/google` redirect URI in the Google Cloud console.
- [ ] Google Meet: run `bun run scripts/google-meet-auth.ts` (local, one-time) to obtain `GOOGLE_MEET_REFRESH_TOKEN`; set the OAuth triple; verify the boot probe (`calendarList.get`) succeeds.
- [ ] R2: set the four `R2_*` vars + `R2_PUBLIC_URL`; uploads now land in R2 (env schema fails boot without all four in prod — verified guard).
- [ ] Sanity: set `SANITY_*`; verify `content.listCompetitions` + Knowledge Bank file proxy work against the live CDN (allowlist + 10s timeout + 5MB cap already enforced).
- [ ] Xendit: set `PAYMENT_PROVIDER=xendit` + credentials + `WEBHOOK_ALLOWED_IPS` (env schema requires the allowlist now — verified #107); run the sandbox E2E checklist (RUNBOOK) BEFORE going live; then one real small transaction (Pioneer 400) per the go-live checklist.

### Task 6: DNS + Cloudflare — operator
- [ ] Add DNS records (Cloudflare): `staging.`, `staging-api.`, `status.`, `coolify.` → VPS (A records, proxied).
- [ ] Create Cloudflare Access application locking `coolify.cogitoacademy.id` to the two operator emails.
- [ ] (Stretch, Phase 2 of spec) Terraform Cloudflare provider for DNS — skip unless operator wants it declarative now.

---

## Phase 2 — Backups + migration strategy

### Task 7: Nightly DB backup to R2 — repo work (script) + operator (cron)
**Files:** create `infra/backup.sh`, wire into Coolify (scheduled task) or a host cron
- [ ] `infra/backup.sh`: `pg_dump` the prod DB (via the Coolify Postgres container), gzip, upload to R2 with `s3cmd`/`aws cli` (path `backups/$(date +%F).sql.gz`), prune to 30-day retention.
- [ ] Operator: add the cron (Coolify scheduled task or host crontab) — nightly 02:00 WIB.
- [ ] Document restore drill: `pg_restore` from the latest R2 backup into a scratch DB, verify row counts (RUNBOOK section).
- Commit: `feat(ops): nightly postgres backup to R2 with retention`

### Task 8: Migration strategy in CD — repo work
**Files:** `.github/workflows/cd-prod.yml`, `scripts/migrate-and-deploy.sh`
- [ ] Add a pre-deploy step: `pg_dump` snapshot → R2 (`backups/pre-migrate-<sha>.sql.gz`) → run `bun run db:migrate` against prod `DATABASE_URL` (from a secret) → then trigger Coolify deploy.
- [ ] On health-poll failure: auto-rollback to the previous image tag (`v<prev-sha>`); if the migration failed, restore the pre-migrate snapshot (documented manual step — never blind-auto-restore while traffic is live).
- [ ] Migration ordering doc: migrations are backward-compatible (additive only) — no destructive steps in a release without a two-step plan (spec §9 of production-reliability).
- Commit: `feat(ci): backup + migrate + deploy + health + rollback pipeline`

---

## Phase 3 — Monitoring + alerting

### Task 9: Uptime Kuma (mandatory) — operator + repo docs
- [ ] Deploy `louislam/uptime-kuma:1` as a Coolify service (port 3002 host / 3001 container, volume, domain `status.cogitoacademy.id`).
- [ ] Monitors: `https://api.cogitoacademy.id/health` (60s), `https://app.cogitoacademy.id` (60s), `https://staging-api.cogitoacademy.id/health` (60s), and the DB/Redis checks inside `/health` are covered by the API monitor.
- [ ] Notifications: Telegram bot → both operators (downtime + recovery).
- [ ] Public status page on `status.cogitoacademy.id`.
- [ ] Log rotation: Coolify json-file 10m×3 (already documented in `infra/monitoring.md`) — verify applied to all four resources.

### Task 10: Metrics + alerts (stretch — only if RAM allows) — operator + repo docs
- [ ] 3.7GB total is tight (Coolify + Postgres + Redis + app + Uptime Kuma). Measure free RAM after Phase 1–3 before adding Prometheus/Grafana.
- [ ] If the budget allows: node_exporter + Prometheus (retention ≤ 7d) + Alertmanager → Telegram; alerts: host down, container unhealthy, `/health` degraded, disk >80%, backup failure, cert expiry (Caddy auto-renews; monitor the domain cert via Uptime Kuma HTTPS monitor).
- [ ] Update `infra/monitoring.md` with the live topology + alert list.

---

## Phase 4 — CI/CD hardened + staging

### Task 11: CD gates + staging deploy — repo work
- [ ] `cd-prod.yml` / `cd-staging.yml` jobs gain `needs: ci` (deploy only after CI green on the same SHA).
- [ ] Staging: create Coolify resources (`cogito-staging` project, `:staging` tags, `staging.cogitoacademy.id` / `staging-api.cogitoacademy.id`); add the staging webhook secrets; verify a `staging` branch push deploys to staging and `/health` passes.
- [ ] Release discipline: `staging` branch deploys first; only after staging smoke passes do we merge to `main`.
- Commit: `feat(ci): gate deploys on CI and wire staging pipeline`

### Task 12: Deploy drills — operator
- [ ] Deploy drill: merge a trivial docs change → CI green → staging deploy green → prod deploy green → `/health` ok → verify new image sha.
- [ ] Rollback drill: set a Coolify resource back to the previous `v<sha>` tag → verify `/health` ok.
- [ ] Backup-restore drill: restore the nightly backup into a scratch DB, verify data.

---

## Phase 5 — Security hardening + docs

### Task 13: Security pass — operator + repo docs
- [ ] VPS: confirm ufw (22 from operator IPs only, 80, 443), fail2ban sshd jail active, `PermitRootLogin prohibit-password`, unattended-upgrades enabled (all in `provision.sh` — verify applied on the live box).
- [ ] Coolify UI reachable only via SSH tunnel or Cloudflare Access (never public:8000).
- [ ] Rotate the two GHCR tokens (registry read token used by Coolify; Actions uses `GITHUB_TOKEN` with `packages: write`).
- [ ] GitHub secret scanning on; SOPS vault private key off-repo (operator's `~/.config/sops/age`).
- [ ] Document the resource-access map (OVH, Cloudflare, Google, GitHub, Resend, Xendit, Sanity) with owner + rotation path — RUNBOOK section.

### Task 14: Docs + runbooks — repo work
- [ ] `docs/DEPLOYMENT.md` (from #102): update with the new pipeline (backup→migrate→deploy→rollback), staging wiring, drills.
- [ ] `docs/RUNBOOK.md`: incident sections — service crash, DB failure, disk exhaustion, cert expiry, dependency outage, deploy rollback, backup restore; each with detect/diagnose/mitigate/verify/escalate.
- [ ] `docs/CONTEXT.md`: topology + live env state updated; plans table row for this plan.
- [ ] `docs/plans/README.md` index.

---

## Exit gates

- Phase 1: `/health` ok after full env; a real Xendit sandbox→live purchase E2E passes; Google Meet boot probe ok; R2 upload round-trip ok.
- Phase 2: nightly backup runs and restores into a scratch DB (drill green).
- Phase 3: Uptime Kuma monitors live + Telegram alert received (kill-container drill).
- Phase 4: staging deploy green; prod deploy green; rollback drill green.
- Phase 5: security checklist complete; docs current (AGENTS.md rule 11).
- CI green on every PR; `gh pr checks --watch` before any merge.

## Risks

- **4GB RAM:** Coolify + app + monitoring is tight. If free RAM < 500MB after Phase 1, skip Prometheus/Grafana (Uptime Kuma only) — documented fallback.
- **GitHub Actions quota:** repo public (free minutes). If quota binds, self-hosted runner on the VPS (documented in #102).
- **Xendit go-live:** sandbox E2E before live; one real small transaction before wider use.
- **Gmail OAuth refresh token** expires if unused — document re-auth (RUNBOOK).
- **Migration in CD:** never auto-restore while traffic is live; the pre-migrate snapshot is the recovery artifact, applied manually under a maintenance window.
- **Coolify webhook timing:** async deploy means the health poll must verify the new sha (Task 2) — otherwise the check can pass against the old container.
