# Deferred Operations Tasks

| Field      | Value                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status     | Active — §0/§1 resolved; §4.3/§4.4 secret-scanning + branch protection remain (operator console); §2 + §3 deliberately deferred (recorded for future agents) |
| Created    | 2026-07-29                                                                                                                                                   |
| Depends on | #18 + #19 merged to main                                                                                                                                     |
| Scope      | Ops + code gaps                                                                                                                                              |

Tasks deferred from production-readiness (#18) and infrastructure (#19) that could not be completed without a live production environment or were identified as gaps during the post-merge audit.

The current provisioning and release procedure, including the manual GHCR/Coolify
fallback when CI quota is unavailable, is documented in
[`docs/DEPLOYMENT.md`](../../DEPLOYMENT.md). Production API/web image and domain
smoke verification was completed on 2026-08-25; the remaining unchecked
environment-specific items below still require confirmation in GitHub/Coolify.

## 0. Production domain split

- [x] Keep the Hostinger company profile on the apex `cogitoacademy.id`.
- [x] Route `api.cogitoacademy.id` to the API/Auth/health/webhook service.
- [x] Route `app.cogitoacademy.id` to the frontend and bake the API subdomain
      into the production Vite image.
- [x] Configure the two Coolify resource domains and add the API + web deploy
      webhook secrets in GitHub Actions — **RESOLVED 2026-09-01.** Secrets are
      recreated on the resolvable `https://cl.cogitoacademy.id/api/v1/deploy?uuid=...`
      URL with the `COOLIFY_API_TOKEN` Bearer guard; the Traefik route is live
      and CD is proven green end-to-end (`/health` `version` == main HEAD,
      web 200, 2026-09-01).

---

## 1. Code Gaps (can be done now)

### 1.1 Missing composite indexes (from PRODUCTION-READINESS-PLAN 3.1) ✅

3 of 6 planned indexes were not created (2 were already present, 1 was unnecessary). Added migration:

- [x] `idx_booking_status_deadline` — booking(status, deadline_at) — expiry sweep
- [x] `idx_booking_participant_user` — bookingParticipant(user_id) — user bookings
- [x] `idx_audit_log_target` — auditLog(target_type, target_id) — admin audit

### 1.2 BullMQ retry config + backoff (from 2.6) ✅

Configured in scheduler.service.ts: `attempts: 3, backoff: { type: 'exponential', delay: 1000 }`.

### 1.2b BullMQ dead-letter queue (M4, prod-fixes wave) ✅

Implemented in `scheduler.service.ts`: failed jobs (attempts exhausted) are pushed to the `cogito-jobs-dlq` queue; a dedicated DLQ worker logs each entry and keeps a bounded Redis list (`cogito:dlq`, max 100 entries) for inspection. Wired into `apps/server/src/scheduler.ts` shutdown (dlq worker + queue closed with the main worker).

### 1.3 Wallet repo explicit column lists (from 3.2) ✅

Replaced `SELECT *` in `wallet.repo.ts` getById/getByUserId with explicit column lists.

### 1.4 Booking repo explicit column lists (from 3.3) ✅

Replaced `.select()` in `booking.repo.ts` findBookingById and other queries with explicit columns.

- Landed in **BACKEND-HARDENING PR C** (task C3).
- **Done (verified 2026-08-17):** **0 bare `.select()` remain** in `booking.repo.ts` — the 7 leaf queries listed below (and in REVIEW-FIXES-3 P5.8, which actually landed via #64) were converted. The earlier "7 bare selects" note is stale and removed.

### 1.5 Webhook IP allowlisting (from 5.1) ✅

Add configurable IP allowlist for Xendit webhook endpoint. Signature verification already exists.

- Landed in **BACKEND-HARDENING PR C** (task C5) — `WEBHOOK_ALLOWED_IPS` config.

### 1.6 Redis health check (from INFRASTRUCTURE-PLAN 5.2) ✅

Added Redis ping to `db-health.ts` alongside the existing DB SELECT 1 check.

### 1.7 JSDoc on public functions (from 6.5) ✅

Add JSDoc (`@param`, `@returns`, `@throws`) to all exported service, repo, and router functions.

- Landed in **BACKEND-HARDENING PR C** (task C4).

### 1.8 Docker test database (from 4.0.1) ✅

Create `docker-compose.test.yml` for test-specific PostgreSQL.

- Landed in **BACKEND-HARDENING PR B** (task B2).

---

## 2. Redis Session Caching (from PRODUCTION-READINESS-PLAN 2.2)

> **Deferred by explicit user decision (2026-09-01) — for future agents to
> resolve when perf justifies it.** Not implemented; correctness does not
> depend on it (cookieCache + DB adapter works, Redis is mandatory for
> idempotency/rate-limit/circuit-breaker/BullMQ already).

Better Auth currently uses cookieCache + DB adapter. When picked up: implement
Redis-backed session storage with DB fallback, behind a fresh plan in
`docs/plans/active/`.

---

## 3. Manual Verification (requires running env)

> **Deferred by explicit user decision (2026-09-01) — production is live, so
> these are now possible; future agents pick them up as a perf/verification
> session. Not correctness-blocking.**

- [ ] Redis integration test (with/without Redis, kill mid-request)
- [ ] EXPLAIN ANALYZE on 5 key queries
- [ ] Manual smoke test (auth, wallet, booking, admin, discovery, scheduler)
- [ ] Performance baseline (p95 < 500ms)

---

## 4. Production Ops (requires live VPS + Coolify)

### 4.1 Provisioning

- [x] Provision the OVH VPS with the Terraform bootstrap in `infra/terraform`
      (the existing `infra/provision.sh` remains the host bootstrap payload) —
      **Terraform config extended (#115): Cloudflare DNS (api/app/status/coolify),
      R2 buckets, state backend; apply pending (operator) — R2 is the
      operator's first task (blocked on payment info)**
- [x] Install Coolify + create admin account — **already live on the VPS**
- [x] Add GHCR as Docker registry in Coolify — **already live**
- [x] Create PostgreSQL, Redis, server, web services in Coolify — **already live**
- [x] Set `DB_SSL_ENABLED=false` for Coolify's bundled non-TLS PostgreSQL service;
      keep it true for managed PostgreSQL endpoints that require TLS
- [x] Configure domains + auto-HTTPS in Coolify — **api/app live; `coolify` webhook
      host DNS declared in Terraform (#115), Traefik route pending (wave-2)**
- [x] Configure Hostinger DNS (api.cogitoacademy.id, app.cogitoacademy.id → VPS IP)
- [x] Verify Coolify auto-deploys on new image push — **PROVEN 2026-09-01:
      main HEAD `2a4bfad` deployed via the webhook chain and sha-verified on
      `/health`.**
- [x] Verify both domains serve with HTTPS

### 4.2 CI/CD Secrets

- [x] Add GHCR secrets to GitHub repo
- [x] Add Coolify webhook URLs to GitHub secrets — **DONE (recreated on the
      `cl.` host; CD green 2026-09-01)**
- [x] Verify CD builds and pushes to GHCR on merge to main — **pipeline merged
      (#118); PROVEN GREEN 2026-09-01 (sha-verified deploy). Staging was removed
      entirely (CI-SANITY F7 locked decision: prod-first, no staging).**

### 4.3 Monitoring

- [ ] Configure Docker log rotation in Coolify
- [ ] Deploy Uptime Kuma as Coolify service — **DEFERRED to a follow-up plan
      (user decision, 2026-08-28); no Kuma playbook this wave**
- [ ] Configure Uptime Kuma monitors (health, frontend, alerting) — **deferred
      with the Kuma deploy**
- [ ] Create public status page — **deferred with the Kuma deploy**
- [ ] Configure Coolify built-in health checks + resource alerts

### 4.4 Security

- [ ] Enable GitHub secret scanning (repo settings) — **verified still disabled
      2026-09-01 (`security_and_analysis: null`); operator console**
- [x] Keep the Coolify localhost SSH path key-only: root password login remains
      disabled, and Docker's private `10.0.0.0/8` range stays excluded from the
      SSH fail2ban jail — **DONE 2026-08-31 (host-hardening applied;
      `.apply-state/hardened`).**

### 4.5 Docker Build Verification

- [x] Verify Docker builds succeed locally
- [x] Verify both images start and respond to health checks

---

### Version Notes

- v1.0 (2026-07-29): Created from post-merge audit of #18 + #19. Groups code gaps (done in next PR), manual verification (needs running env), and production ops (needs live VPS).
- v1.1 (2026-07-30): Items 1.1, 1.2, 1.3, 1.6 completed in `improvement/foundation-critical-fixes` branch. Remaining: 1.4, 1.5, 1.7, 1.8, §2 Redis session caching.
- v1.2 (2026-08-12): Items 1.4 (PR C / C3), 1.5 (PR C / C5), 1.7 (PR C / C4), 1.8 (PR B / B2) completed in BACKEND-HARDENING PRs. §2 Redis session caching remains unimplemented and moved under a "Deferred / needs separate plan" note.
- v1.3 (2026-08-28): Wave-2 status sync — webhook 401 moved to wave-2 (Traefik route + optional Bearer, DEPLOYMENT-WAVE-2.md); Uptime Kuma deferred to a follow-up plan (user decision); R2 apply marked as the operator's first task (blocked on payment info).
