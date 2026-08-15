# Cogito Backend — Cleanup & Reliability Plan

| Field      | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| Status     | Planned — not implemented (future PRs against main)          |
| Branch     | main (future PRs)                                            |
| Created    | 2026-08-14 (audit of git HEAD `ec8b16c`, post-#46)           |
| Scope      | Backend-only — no behavior changes unless explicitly marked  |

Dead code, silent failure modes, and test-quality issues found during the 2026-08-14 codebase audit (dead-code scan + PRD audit). None of these change user-facing behavior; each item is independently testable. Order by severity, not by section.

> **Rule:** every removal must be verified unused first (`rg` for the symbol across `packages/api/src`, `apps/server/src`; test files may keep using helpers — in that case keep the helper or update the test).

> **Status:** all 11 items implemented and merged to main (2026-08-15). Retained as reference. Two new recovery mechanisms were added beyond this list: `retry-failed-meetings` scheduler job (re-covers CONFIRMED online bookings with failed meetings) and email-outbox retry (failed dispatch rows retried up to 3 attempts).

## Summary

| #   | Item                                                                                  | Severity | Type          |
| --- | ------------------------------------------------------------------------------------- | -------- | ------------- |
| C1  | `booking.service.ts:841` silent catch swallows meeting-creation/transition failures   | High     | **DONE** — error logged (`tutor_accept_meeting_failed`); recovery loop added via `retry-failed-meetings` job |
| C2  | Dead DB columns + index + relations                                                   | Medium   | **DONE** — migration 0016 drops 8 dead columns/index/relations; `refundedAmount` kept (frontend displays it) |
| C3  | Dead repo/service exports                                                             | Low      | **DONE** — removed; `resolvePublicUrl`, `initStructuredLogger`, `ENTRY_TYPE`, `transition`/`canTransition` kept (used by code or tests) |
| C4  | Silent Redis→in-memory fallbacks emit no logs                                          | Medium   | **DONE** — `logRedisFallback` warn on configured-Redis failures |
| C5  | Xendit retry never retries timeout (AbortError) errors                                 | Medium   | **DONE** — default retryable + provider predicate cover AbortError/TimeoutError |
| C6  | `achievement.service.ts:153` adminNote interpolated raw into email HTML                | Medium   | **DONE** — `escapeHtml` on adminNote |
| C7  | `webhook-timestamp.test.ts` tests a stale local copy, not the real function           | Low      | **DONE** — moved to `apps/server/src/webhooks/timestamp.test.ts`, imports the real function |
| C8  | `tutor-invite-onboarding.test.ts:149` `describe.skip("TC-09")` with no rationale       | Low      | **DONE** — enabled, passes against the test DB |
| C9  | Dead re-exports (`handlers`, `redis`) from `@cogito-app/api`                           | Low      | **DONE** — `services` only |
| C10 | Dev DB SQL logging redaction misses short secrets                                     | Medium   | **DONE** — secret-shaped params redacted |
| C11 | `webhook-timestamp.test.ts` + docs refer to `.env.example`-undocumented env vars       | Low      | Docs          |

---

## C1: Silent catch in `tutorAccept` (High)

**Location:** `packages/api/src/modules/booking/booking.service.ts:841`

```ts
try {
  // ... participant lookup, email lookup, meeting.createEvent(),
  //     CONFIRMED → SCHEDULED transition, deadline update, notifications
} catch {
  updated = await repo.findBookingById(tx, bookingId);
}
```

**Problem:** every error inside the try is swallowed with no log. If `meeting.createEvent()` throws (rather than returning `{ status: "failed" }`), the booking silently stays `CONFIRMED` with no meeting link and no error record, then sends the "Booking accepted" notification to the proposer. This is revenue/UX critical and invisible in prod telemetry.

**Fix:**
1. Log the error (`log({ level: "error", action: "tutor_accept_meeting_failed", ... })`) inside the catch — **do not** change the fallback-to-reload behavior (accept must not fail because Meet is down).
2. Ensure the meeting provider's failure path returns `{ status: "failed", errorReason }` instead of throwing (verify `google-meeting.provider.ts` — the circuit breaker may throw; if so, catch at the provider boundary and record the `meetingEvent` failure row).

**Test:** unit test asserting that when `createEvent` throws, the booking still transitions to `SCHEDULED`/records failure **and** an error is logged (assert via injected logger).

---

## C2: Dead DB columns + index + relations (Medium)

Verified unused by `rg` across the entire repo (schema-only definitions, no reads/writes in services/repos):

| Column                                                                 | Schema location          | Notes                                                              |
| ---------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `booking.seriesParentId` (+ index + `seriesParent`/`seriesChildren` relations) | `booking.ts:88,133,412-419` | Series children link via `bookingSession.seriesBookingId` instead |
| `booking.refundedAmount`                                                | `booking.ts:81`          | Never read/written                                                 |
| `booking.notificationFlags`                                             | `booking.ts:86-87`       | Never read/written                                                 |
| `booking.rescheduleMeta`                                                | `booking.ts:84`          | Never read/written                                                 |
| `bookingParticipant.heldLedgerId`                                       | `booking.ts:151`         | FK never populated                                                 |
| `meetingEvent.createdBy` (+ relation)                                   | `booking.ts:373,486-489` | Never written/read                                                 |
| `notificationDispatch.providerMessageId`                                | `notification.ts:65`     | Outbox never records the provider message id                       |
| `notificationDispatch.sentAt`                                           | `notification.ts:70`     | Never written                                                      |

**Fix:** remove the columns from the schema files, run `bun run db:generate` to produce a migration (`DROP COLUMN`), inspect the generated SQL, and apply. **Pre-production only** — no deployed data exists (CD is broken; see `docs/RUNBOOK.md`). Keep `booking.timezone` (accepted dead state K6) and `ledgerEntry.balanceAfterWalletTotal/Held` (write-only audit snapshot — intentionally retained).

**Test:** `bun run db:generate` + migration applies on the test DB; full suite green.

---

## C3: Dead repo/service exports (Low)

Verified unused outside their defining file:

| Symbol                                             | Location                          | Action |
| -------------------------------------------------- | --------------------------------- | ------ |
| `insert()` (wallet)                                | `wallet.repo.ts:68,398`           | Remove + factory entry |
| `updateBalances()` (wallet)                        | `wallet.repo.ts:97,399`           | Remove + factory entry |
| `updateDispatchStatus(notificationId, status)`     | `notification.repo.ts:134,323`    | Remove (outbox uses `updateDispatchStatusById`) |
| `findDispatch()`                                   | `notification.repo.ts:306,336`    | Remove |
| `updateRole()` (admin)                             | `admin.repo.ts:82,123`            | Remove (service uses `updateRoleWithExpected`) |
| `deleteRow()` (achievement)                        | `achievement.repo.ts:182,261`     | Remove (service uses `deleteWithVersion`) |
| `initStructuredLogger()`                           | `lib/logger.ts:15`                | Check test usage; remove if only tests use it (update tests to `log`) |
| `SESSION_DURATION_MINUTES`                         | `shared/constants.ts:15`          | Verify with `rg` before removing |
| `COGITO_TAKE_RATE`                                 | `shared/constants.ts:21`          | Verify with `rg` before removing (pricing uses baseline-split tables) |
| `PAYMENT_PROVIDER_NAME`                            | `shared/constants.ts:170-175`     | Remove |
| `MEETING_PROVIDER`                                 | `shared/constants.ts:177-183`     | Remove |
| `ENTRY_TYPE`                                       | `shared/constants.ts:193-201`     | Remove |
| `resolvePublicUrl()` (upload)                      | `upload.service.ts:49-53`         | Remove (or keep if U-frontend plans to use it — decide) |
| `transition`/`canTransition` on the returned service object | `booking.service.ts:2703-2735` | Remove from the returned object (keep local `transition`); `canTransition` is an import re-exported — drop it |
| `BookingTransition` interface                      | `booking-state.types.ts:35`       | Remove (booking.service defines its own) |

**Test:** `bun run check-types` + full suite (any test importing a removed symbol fails loudly).

---

## C4: Silent Redis→in-memory fallbacks (Medium)

**Locations:** `lib/rate-limit.ts:99`, `lib/idempotency.ts:35,60,82,99,114,139,144`, `lib/circuit-breaker.ts:64,83`.

**Problem:** when Redis is **configured** but a call fails, the code silently falls back to the per-process in-memory store with no log. In a multi-instance deployment this silently downgrades cross-instance correctness (duplicate webhook processing, per-instance rate limits) with zero telemetry.

**Fix:** in each fallback path, emit `log({ level: "warn", action: "redis_fallback", service: "...", error: ... })` **only when a Redis client is present** (when `REDIS_URL` is unset entirely, falling back is the expected dev/CI path — no warn). Idempotency has multiple fallback sites — log at the point where the Redis operation throws, or hoist a small `warnFallback(service, error)` helper into `lib/redis.ts` and reuse.

**Test:** unit test asserting the logger is called when the mock Redis throws; no log when Redis is absent.

---

## C5: Xendit retry never retries timeouts (Medium)

**Location:** `xendit-payment.provider.ts:79-103` passes `retryable: (err) => err instanceof TypeError` to `retryWithBackoff`, but `fetchWithTimeout` (`lib/retry.ts:50`) aborts via `AbortController` → the rejection is a `DOMException` named `AbortError`, **not** a `TypeError`. Network timeouts therefore never retry despite the 3-attempt wrapper.

**Fix:**
1. `lib/retry.ts` — extend the default `retryable` to also match `err?.name === "AbortError"` (and optionally `"TimeoutError"`/message containing `abort`/`timeout`).
2. `xendit-payment.provider.ts` — use the updated default (or pass the same predicate).
3. Same check for `resend-email.provider.ts` and `google-meeting.provider.ts` timeout paths.

**Test:** unit test on `retryWithBackoff` with a throwing mock whose error is `Object.assign(new Error("x"), { name: "AbortError" })` → 3 attempts made; non-retryable error → 1 attempt.

---

## C6: `adminNote` raw in email HTML (Medium)

**Location:** `achievement.service.ts:150-154` — `input.adminNote` is interpolated into the notification `body`, which `notification.service.ts:243` renders as the **email HTML body** (`html: notif.body`) with no escaping. Admin-entered markup renders in student email clients (the M5 `escapeHtml` fix covered booking reasons but missed this).

**Fix:** wrap the interpolated `adminNote` in `escapeHtml` (export from `lib/email.ts` or `lib/sanitize.ts` — reuse the M5 helper). Also audit `admin-tutor.reviewTutorProfile` adminNote and any other admin-supplied strings reaching notification bodies.

**Test:** unit test asserting `<script>`-style input in `adminNote` is escaped in the composed body.

---

## C7: `webhook-timestamp.test.ts` tests a stale copy (Low)

**Location:** `packages/api/src/tests/unit/webhook-timestamp.test.ts:9-24` re-implements `validateWebhookTimestamp` inline instead of importing the real function from `apps/server/src/webhooks/payments.ts` — it passes even if the real implementation breaks.

**Fix:**
1. Export `validateWebhookTimestamp` from `apps/server/src/webhooks/payments.ts` (currently local).
2. Move/replace the test with a file next to the implementation (`apps/server/src/webhooks/`) importing the real function.
3. Delete the stale copy.

**Test:** the moved test runs against the real implementation; `bun test --env-file apps/server/.env.test apps/server/src/webhooks/`.

---

## C8: `describe.skip("TC-09")` with no rationale (Low)

**Location:** `packages/api/src/tests/tutor-invite-onboarding.test.ts:149` — the entire "wrong-email user cannot claim invite" requirement test is disabled with no explanation.

**Fix:** try enabling it against the test DB. If it passes, keep enabled. If it fails, either fix the test to match current behavior (the invite service does enforce email-match per `invite.service.ts:60-97`) or add a dated comment explaining exactly why it stays skipped.

**Test:** the TC-09 test runs green (or a documented skip remains).

---

## C9: Dead re-exports from `@cogito-app/api` (Low)

**Location:** `packages/api/src/index.ts:9` + `services.ts:278-282` — `handlers` and `redis` are re-exported but no consumer imports them (only `services` is used, in `apps/server/src/webhooks/payments.ts:2` and `apps/server/src/scheduler.ts:9`).

**Fix:** export only `services` (keep `createServices`). Update `apps/server/src/*` imports if anything does use `handlers`/`redis` (verified: nothing).

**Test:** `bun run check-types` + server boot smoke.

---

## C10: Dev DB SQL logging redaction (Medium)

**Location:** `packages/db/src/index.ts:26-33` — in `NODE_ENV=development` every query + params are logged with a naive redaction (only strings containing `@` or > 100 chars). Short secrets/tokens in params (e.g. webhook tokens, API keys) would log in plaintext.

**Fix:** extend the redaction to also mask values matching secret-like patterns (`sk_`, `token`, `secret`, `key`, `password`, `authorization` — case-insensitive) and values shorter than a minimum length when the parameter name matches those patterns. Keep the dev-only guard.

**Test:** unit test of the redaction helper with a secret-shaped param value.

---

## C11: Undocumented/awkward env-var docs (Low)

**Items:**
1. `apps/server/.env.example` documents `WEBHOOK_ALLOWED_IPS` (default: allow all IPs when empty — the allowlist is off by default; only signature verification gates webhooks). Add a warning comment that leaving it empty disables IP gating.
2. `.env.example` is missing `GOOGLE_MEET_ENABLED` semantics notes (already present) and `SCHEDULER_ENABLED` — verify and add.
3. `docs/RUNBOOK.md` "Rollback a Deployment" references `cogito-app:previous` docker tag naming that no longer matches the GHCR image names (`ghcr.io/cogitoacademy/app/server`). Update.

**Fix:** doc-only changes.

---

## Shared Guidance

- Verify each removal with `rg` before editing; keep the codebase green after each item (`bun run check-types`, `bun run lint`, targeted tests).
- C2's migration must be generated with `bun run db:generate` and reviewed before applying; the test DB applies it automatically via the harness.
- Conventional commits (`chore`/`refactor`/`fix`/`test`/`docs`), one commit per item or small coherent group.

### Version Notes

- v1.0 (2026-08-14): Created from the dead-code scan + PRD audit of HEAD `ec8b16c`. All items verified in code. C11.1 (allowlist-off-by-default) and C10 were flagged by the same audit that produced `.env.example` documentation in #46.
