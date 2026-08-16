# Deferred Operations Tasks

| Field      | Value                    |
| ---------- | ------------------------ |
| Status     | Active                   |
| Created    | 2026-07-29               |
| Depends on | #18 + #19 merged to main |
| Scope      | Ops + code gaps          |

Tasks deferred from production-readiness (#18) and infrastructure (#19) that could not be completed without a live production environment or were identified as gaps during the post-merge audit.

---

## 1. Code Gaps (can be done now)

### 1.1 Missing composite indexes (from PRODUCTION-READINESS-PLAN 3.1) ✅

3 of 6 planned indexes were not created (2 were already present, 1 was unnecessary). Added migration:

- [x] `idx_booking_status_deadline` — booking(status, deadline_at) — expiry sweep
- [x] `idx_booking_participant_user` — bookingParticipant(user_id) — user bookings
- [x] `idx_audit_log_target` — auditLog(target_type, target_id) — admin audit

### 1.2 BullMQ retry config + backoff (from 2.6) ✅

Configured in scheduler.service.ts: `attempts: 3, backoff: { type: 'exponential', delay: 1000 }`.

### 1.3 Wallet repo explicit column lists (from 3.2) ✅

Replaced `SELECT *` in `wallet.repo.ts` getById/getByUserId with explicit column lists.

### 1.4 Booking repo explicit column lists (from 3.3) ✅ (partial)

Replaced `.select()` in `booking.repo.ts` findBookingById and other queries with explicit columns.

- Landed in **BACKEND-HARDENING PR C** (task C3).
- **Remaining (2026-08-16):** 7 leaf queries still use bare `.select()` — `findSessionById`, `listSessionNotes`, `findOverlappingBookings`, `findTutorParticipant`, `listBookingsByState` area, the `meetingEvent` lookup, and `findConfirmedMeetingsPendingRetry` (`booking.repo.ts`). Low risk (explicit-column conversion is hygiene, not correctness); tracked in REVIEW-FIXES-3 P5.8.

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

> **Deferred / needs separate plan.** Not implemented.

Better Auth currently uses cookieCache + DB adapter. Implement Redis-backed session storage with DB fallback.

---

## 3. Manual Verification (requires running env)

- Redis integration test (with/without Redis, kill mid-request)
- EXPLAIN ANALYZE on 5 key queries
- Manual smoke test (auth, wallet, booking, admin, discovery, scheduler)
- Performance baseline (p95 < 500ms)

---

## 4. Production Ops (requires live VPS + Coolify)

### 4.1 Provisioning

- Provision Hetzner VPS with provision.sh
- Install Coolify + create admin account
- Add GHCR as Docker registry in Coolify
- Create PostgreSQL, Redis, server, web services in Coolify
- Configure domains + auto-HTTPS in Coolify
- Configure DNS (cogitoacademy.id, app.cogitoacademy.id → VPS IP)
- Verify Coolify auto-deploys on new image push
- Verify both domains serve with HTTPS

### 4.2 CI/CD Secrets

- Add GHCR secrets to GitHub repo
- Add Coolify webhook URLs to GitHub secrets
- Verify CD builds and pushes to GHCR on push to staging

### 4.3 Monitoring

- Configure Docker log rotation in Coolify
- Deploy Uptime Kuma as Coolify service
- Configure Uptime Kuma monitors (health, frontend, alerting)
- Create public status page
- Configure Coolify built-in health checks + resource alerts

### 4.4 Security

- Enable GitHub secret scanning (repo settings)

### 4.5 Docker Build Verification

- Verify Docker builds succeed locally
- Verify both images start and respond to health checks

---

### Version Notes

- v1.0 (2026-07-29): Created from post-merge audit of #18 + #19. Groups code gaps (done in next PR), manual verification (needs running env), and production ops (needs live VPS).
- v1.1 (2026-07-30): Items 1.1, 1.2, 1.3, 1.6 completed in `improvement/foundation-critical-fixes` branch. Remaining: 1.4, 1.5, 1.7, 1.8, §2 Redis session caching.
- v1.2 (2026-08-12): Items 1.4 (PR C / C3), 1.5 (PR C / C5), 1.7 (PR C / C4), 1.8 (PR B / B2) completed in BACKEND-HARDENING PRs. §2 Redis session caching remains unimplemented and moved under a "Deferred / needs separate plan" note.
