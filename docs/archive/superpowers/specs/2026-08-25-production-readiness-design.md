# Production Readiness Program — Design Spec

Date: 2026-08-25
Status: Draft (awaiting user review)
Scope: Backend code fixes + fully declarative infrastructure + observability + hardened CI/CD for the Cogito app.

## 1. Goal

Take the Cogito app from "deployed but prelaunch" to **full production behavior**:

- Backend code is correct against the PRD and all review findings are fixed.
- The entire stack (VPS host, Coolify resources, app containers, monitoring, backups, secrets) is **declarative** — no manual CLI or UI-button steps to reproduce or operate it.
- Everything is observable (metrics, logs, synthetic checks) with alerting to the two operators.
- CI/CD is automated end-to-end: CI gates deploys, migrations run in the pipeline, rollback is automatic on failure.
- All access to external resources is documented and owned (no tribal knowledge).

## 2. Current state (verified 2026-08-25)

- Repo: public monorepo (Turborepo + Bun), main branch. CI currently blocked by GitHub billing (repo now public — billing resolved).
- VPS: OVH `15.235.186.159`, 2vCPU / 3.7GB RAM / 38GB disk, Ubuntu, ufw active (22/80/443). SSH via `~/.ssh/cogito_vps` as `ubuntu`.
- Coolify running on the VPS (traefik proxy, own postgres:15 + redis:7). App containers `server:latest` + `web:latest` healthy.
- Live prod env: `NODE_ENV=production`, `SCHEDULER_ENABLED=true`, `TRUST_PROXY=true`, `BETTER_AUTH_URL=https://api.cogitoacademy.id`, `CORS_ORIGIN=https://app.cogitoacademy.id`, `EMAIL_FROM=Cogito <send@cogitoacademy.id>`.
- **Gaps found in live env:** `PAYMENT_PROVIDER=stub` (not xendit), no Google OAuth/Meet vars, no R2 vars (uploads go to container-local disk), no Sanity token, no `coolify.`/`staging.` DNS records, no backups, no monitoring, no alerting. `drizzle-gateway` container unhealthy (Coolify-internal, not our app).
- DNS: `api.` and `app.` subdomains proxied through Cloudflare (zone moved to Cloudflare). `coolify.` and `staging.` records do not exist yet.
- PR #102 (`docs/production-deployment-runbook`) exists: Terraform host bootstrap + provision.sh + CD workflows + 500-line runbook. Good foundation; gaps: app layer not declarative (Coolify UI clicks), no monitoring, no backups, CD not gated on CI, no staging wired.

## 3. Architecture (target)

```
Cloudflare (DNS + proxy + WAF + CDN; Access locks Coolify admin)
  ├── app.cogitoacademy.id        → prod web container
  ├── api.cogitoacademy.id        → prod server container
  ├── staging.cogitoacademy.id    → staging web
  ├── staging-api.cogitoacademy.id→ staging server
  ├── coolify.cogitoacademy.id    → Coolify UI (behind Cloudflare Access, email-gated)
  └── status.cogitoacademy.id     → Uptime Kuma status page
VPS (OVH, 2vCPU/4GB/40GB)
  ├── Coolify (Docker): Postgres 16, Redis 7, app containers (prod + staging)
  ├── Monitoring: Prometheus + node_exporter + cAdvisor + Grafana + Uptime Kuma + Alertmanager
  ├── Backups: nightly pg_dump → R2 (30-day retention) + pre-migration snapshot in CD
  └── Terraform state → R2 bucket (S3-compatible backend)
Secrets: SOPS + Age keys, encrypted in git, decrypted by Ansible at deploy → Coolify API
```

### 3.1 Declarative layering

| Layer      | Tool                    | Owns                                                                                                                                    |
| ---------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Host shell | Terraform (state in R2) | ufw, fail2ban, SSH hardening (keys only, no root pw), deploy user, unattended-upgrades, Docker                                          |
| Inside VPS | Ansible playbooks       | Coolify install, **Coolify resources via its API** (apps, DB, Redis, env vars, domains), monitoring stack, backup cron, SOPS decryption |
| App        | Docker images from GHCR | server + web, versioned tags (`v<sha>`), `latest` for Coolify tracking                                                                  |
| CI/CD      | GitHub Actions          | build → test → push images → run migrations → trigger Coolify deploy → health poll → auto-rollback                                      |
| Secrets    | SOPS + Age              | all env vars, encrypted in git, applied via Ansible → Coolify API                                                                       |

### 3.2 Environments

- **Prod:** `api.cogitoacademy.id` / `app.cogitoacademy.id`, deployed from `main`.
- **Staging:** `staging-api.cogitoacademy.id` / `staging.cogitoacademy.id`, same VPS, separate Coolify resources + containers, deployed from `staging` branch. Same image pipeline, gated before prod.

### 3.3 Security posture

- VPS: SSH keys only, ufw (22 from operator IPs, 80, 443), fail2ban, unattended-upgrades, no root login.
- Network: Cloudflare proxy hides origin; Coolify admin behind Cloudflare Access (email allowlist: the two operators); DB/Redis on private Docker network only.
- App: TLS Full(strict), `TRUST_PROXY=true`, rate limits on `/rpc` + auth, webhook IP allowlist, CORS locked to `app.cogitoacademy.id`.
- Secrets: SOPS+Age; never plaintext in git; rotation documented in runbook.
- Backups: nightly pg_dump → R2 (30-day retention); pre-migration snapshot in CD; restore drill.

### 3.4 Scaling (2vCPU/4GB)

Cloudflare CDN/proxy absorbs static + global traffic. In-node: Nginx → Bun/Elysia async, connection pooling, Redis rate limiting, paginated queries. This handles low-thousands of concurrent users. Scale levers when metrics say so: (1) vertical to 8GB VPS, (2) Coolify API replicas behind LB, (3) managed Postgres. Alert thresholds defined in Phase 3.

## 4. Phases

### Phase 0 — PRD + wiring audit (backend only)

- Audit backend against `docs/prd.tex`, `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md` → gap list.
- "Can it boot with all moving parts" audit: scheduler, Redis, webhooks, uploads, meeting, email, Sanity, OTP — each dependency's prod wiring verified.
- Deliverable: gap list approved by user.

### Phase 1 — Code fixes (backend only, TDD, docs per AGENTS.md rule 11)

From the review findings (all verified):

1. **Email verification gate (HIGH):** browse free, paid actions gated. New `requireVerifiedStudent` middleware on booking creates, `payment.createPurchase`, wallet spend paths. Client banner + redirect to `/verify-email` (frontend minimal, presentation-only). Docs updated to state enforcement level.
2. **Stored HTML injection into email (HIGH):** escape `reason` in `withdrawInvite` notification body (`booking.service.ts:2556`), consistent with sibling path.
3. **Sanity file proxy hardening (MED):** host allowlist (`cdn.sanity.io`), upstream timeout, response-size cap, rate limit on `/content/student-resources/:id/file`.
4. **Scheduler:** already `true` in prod — add boot-time fail-loud check + alert on `scheduler_skip` (Phase 3).
5. **`getTutorPayouts` ledger mismatch (MED):** reconcile `totalMarks` vs `cogitoTake+tutorPayout` rounding spread; add assertion test.
6. **Admin escalated queue pagination (MED):** empty-page-with-cursor fix; DB-side filter instead of in-memory window.
7. **Economy config fan-out (MED):** move per-tutor notifications out of the transaction (outbox pattern already exists).
8. **Migrations 0027/0028 (LOW):** add down paths.
9. **Google OAuth + Meet wiring:** real creds via SOPS; OAuth callback URL verified; Meet via OAuth refresh-token path (Gmail account — no domain-wide delegation).
10. **Xendit:** `PAYMENT_PROVIDER=xendit` + `WEBHOOK_ALLOWED_IPS` populated; sandbox E2E before prod switch.

Exit gate: all PRs green, tests pass, docs updated.

### Phase 2 — Declarative infrastructure

- Merge + extend PR #102: Terraform (host) + **Ansible** (replaces provision.sh for in-VPS provisioning).
- Ansible playbooks: Coolify install; Coolify resources via API (prod + staging apps, Postgres, Redis, env vars, domains); monitoring stack; backup cron; SOPS decryption.
- Terraform state → R2 bucket; SOPS + Age keys; `.sops.yaml` in git.
- DNS records (Cloudflare): `coolify.`, `staging.`, `staging-api.`, `status.` — via Terraform Cloudflare provider (declarative).
- Cloudflare Access application locking `coolify.cogitoacademy.id` to the two operators.
- Exit gate: `terraform apply` + `ansible-playbook` on a blank VPS reproduces the full stack with zero UI clicks.

### Phase 3 — Observability

- Prometheus + node_exporter + cAdvisor; Grafana dashboards (app, DB, Redis, host).
- Uptime Kuma on `status.cogitoacademy.id`: monitors api/app/staging health + `/health` checks.
- Alertmanager → Telegram (both operators). Alerts: host down, container unhealthy, /health degraded, scheduler_skip, backup failure, disk >80%, cert expiry.
- Log rotation (10m×3) on all containers.
- Exit gate: alert drill — kill a container → alert received by both operators.

### Phase 4 — CI/CD hardened

- Fix GitHub billing (repo public — verify Actions runs).
- CD waits on CI (deploy job `needs: ci`).
- Pipeline: build → test → push `v<sha>` + `latest` → **backup DB (pg_dump → R2)** → **run migrations** → trigger Coolify deploy → health poll → on failure: **auto-rollback** to previous image tag (+ DB restore if migration failed).
- Staging deploy from `staging` branch first; prod from `main`.
- Exit gate: deploy drill green on staging, then prod; rollback drill green.

### Phase 5 — Docs + drills

- Cold-start drill: blank VPS → full stack via Terraform + Ansible.
- Backup-restore drill: restore DB from R2 backup.
- Update `docs/CONTEXT.md`, `docs/RUNBOOK.md`, `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md`, `docs/DEPLOYMENT.md` (from #102), `docs/plans/`.
- Resource access map (OVH, Cloudflare, Google, GitHub, Resend, Xendit, Sanity) with owner + rotation path.
- Exit gate: all drills pass; docs current.

## 5. Key decisions (locked with user)

- Staging on same VPS, separate containers + subdomains, `staging` branch.
- Monitoring self-hosted on the VPS (Prometheus + Grafana + Uptime Kuma + Alertmanager → Telegram).
- Backups to R2 (30-day retention).
- Secrets via SOPS + Age, applied declaratively.
- Email verification: browse free, paid actions gated.
- Migrations in CD with auto-rollback (backup → migrate → deploy → health → rollback).
- Google OAuth + Meet wired now (Gmail account → OAuth refresh-token path, no domain-wide delegation).
- Alerts to both operators (user + friend) via Telegram.
- Cloudflare retained for DNS/proxy/WAF/CDN/R2; Cloudflare Access locks Coolify admin.
- Ansible (not shell script) for in-VPS provisioning; Terraform for host shell; Terraform state in R2.

## 6. Out of scope

- Frontend feature work (only minimal presentation changes for the verification banner).
- Landing site (Hostinger/Pages) — unchanged.
- Self-hosted Sentry (too heavy for 4GB; revisit later).
- Multi-region / horizontal scaling (documented as scale levers only).

## 7. Risks

- 4GB RAM is tight for Coolify + app + monitoring: monitor memory; if Grafana/Prometheus exceed budget, move metrics retention down or offload to a tiny external host.
- GitHub Actions quota: repo is public (free minutes); if quota still binds, add a self-hosted runner on the VPS (documented fallback in #102).
- Xendit sandbox → live switch must be verified with a real small transaction before launch.
- Gmail OAuth refresh token expires if unused — document re-auth procedure.
