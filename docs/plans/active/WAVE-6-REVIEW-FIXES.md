# Wave-6 Review Fixes — Production Readiness (W2 findings)

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Status     | Active — planned (2026-08-19), not yet implemented                    |
| Branch     | `fix/wave6-review-fixes` (future PR)                                  |
| Created    | 2026-08-19 (wave-5 deep review by worker W2, read-only)               |
| Depends on | Wave-5 (PR #79) merged to main                                        |
| Scope      | Backend only (packages/api, apps/server, packages/env, packages/auth) |

This plan catalogs the findings of the wave-5 deep code review (worker W2, read-only, `docs/plans/active/` companion to the wave-5 fix PR). Every finding was verified against code at `d11962b` (pre-wave-5) and re-checked against the wave-5 branch. Severity ordering follows the code-review skill.

> **Rule:** the PRD (`docs/prd.tex`) is the source of truth. If a requirement in this spec conflicts with the PRD, the PRD wins.

## Gap Summary

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                     | Location                                       | Status |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| H1  | HIGH     | `z.coerce.boolean()` treats the string `"false"` as `true` for `TRUST_PROXY`, `STUB_WEBHOOK_ALLOWED`, `SCHEDULER_ENABLED`, `DB_SSL_REJECT_UNAUTHORIZED` — `TRUST_PROXY=false` actually enables proxy trust (rate-limit evasion + webhook IP allowlist bypass); `SCHEDULER_ENABLED=false` runs the scheduler | `packages/env/src/server.ts:15,32,35,53`       | Open   |
| H2  | HIGH     | Series participant no-show forfeits the wallet hold but not `participant.heldAmount` → final session completion throws `InsufficientBalanceError` → booking stuck, tutor unpaid                                                                                                                             | `booking.service.ts:1515-1539,1162-1228`       | Open   |
| H3  | HIGH     | Late terminal webhook for a re-purchased payment (shared `providerReference`) bricks the new purchase — user charged, never credited                                                                                                                                                                        | `payment.service.ts:157-183,263-278`           | Open   |
| M1  | MED      | REFUNDED-webhook reversal checks `availableBalance` only — held Marks strand the reversal into admin reconciliation; company refunds cash but still delivers Marks-backed sessions                                                                                                                          | `payment.service.ts:364-406`                   | Open   |
| M2  | MED      | `adminRefund` fires the provider-side Xendit refund **inside** the DB transaction — rollback after the HTTP call = double refund on retry                                                                                                                                                                   | `admin-booking.service.ts:531-643`             | Open   |
| M3  | MED      | Booking list cursor is non-unique `scheduledStartAt` — bookings sharing the timestamp are permanently skipped in pagination                                                                                                                                                                                 | `booking.service.ts:548-570`                   | Open   |
| M4  | MED      | Student `cancelSession` releases/deducts `session.holdAmount` regardless of the participant's remaining hold — leaks across pooled wallet holds                                                                                                                                                             | `booking.service.ts:1376-1404`                 | Open   |
| M5  | MED      | Webhook processing failures return generic 500 + release the claim — persistent bugs loop against Xendit indefinitely, no DLQ/alert                                                                                                                                                                         | `apps/server/src/webhooks/payments.ts:123-162` | Open   |
| L1  | LOW      | `xendit:no-event-id` fallback idempotency key collapses all id-less events — hides real delivery failures                                                                                                                                                                                                   | `apps/server/src/webhooks/payments.ts:99`      | Open   |
| L2  | LOW      | Booking-create idempotency key has an empty header slot — frontend sends no `idempotency-key`; stale cached result on re-book within 24h TTL                                                                                                                                                                | `booking.handler.ts:81-82,250,279,307`         | Open   |
| L3  | LOW      | Email-OTP brute-force protection is per-instance memory storage — multi-replica multiplication of verify attempts                                                                                                                                                                                           | `packages/auth/src/index.ts:158-191`           | Open   |

---

## H1: `z.coerce.boolean()` treats the string `"false"` as `true`

**Severity:** HIGH (security + ops)

**Location:** `packages/env/src/server.ts:15,32,35,53`

**Evidence (verified at runtime with zod 4.4.3):**

```
"false" -> true, "0" -> true, "" -> false, "FALSE" -> true
```

`TRUST_PROXY: z.coerce.boolean().default(false)` — the string `"false"` coerces to `true`. The wave-4 X3 fix added a preprocess only for `GOOGLE_MEET_ENABLED` (server.ts:44-49); the four other booleans are raw `z.coerce.boolean()`.

**Why it matters:**

- **`TRUST_PROXY` (security):** with `TRUST_PROXY` truthy, `getClientIp` (`packages/api/src/lib/request-id.ts:10-15`) trusts the client-supplied `x-forwarded-for` first hop. In production, ops who set `TRUST_PROXY=false` (the documented safe default) would actually _enable_ proxy trust: the webhook IP allowlist (`apps/server/src/webhooks/payments.ts:19-28`, `WEBHOOK_ALLOWED_IPS`) becomes bypassable by spoofing `x-forwarded-for: <xendit-ip>`, and every per-IP rate limiter (auth 10/min, payment 5/min, booking 30/min, invite, search) becomes evadable by rotating the header. (The `x-callback-token` signature check still gates webhook processing, so this is defense-in-depth degradation — but rate-limit evasion is direct.)
- **`SCHEDULER_ENABLED` (ops):** `SCHEDULER_ENABLED=false` → scheduler actually runs (money-moving jobs: expiry/no-show forfeits, hold releases).
- **`STUB_WEBHOOK_ALLOWED` (staging):** `=false` → stub checkout endpoint enabled on staging (still gated by `NODE_ENV` not production-like after wave-5 C2).
- **`DB_SSL_REJECT_UNAUTHORIZED`:** `=false` → true (fail-closed direction, but the prod warning at `packages/db/src/index.ts:7-11` becomes dead code).

**Required:**

1. Apply the same preprocess pattern used for `GOOGLE_MEET_ENABLED` (or `z.enum(["true","false"]).transform(...)`) to all four vars: `TRUST_PROXY`, `STUB_WEBHOOK_ALLOWED`, `SCHEDULER_ENABLED`, `DB_SSL_REJECT_UNAUTHORIZED`.
2. Add a `TRUST_PROXY` row to the RUNBOOK env table (currently absent — `grep -c TRUST_PROXY docs/RUNBOOK.md` → 0).
3. Add unit tests asserting `"false"` → `false`, `"true"` → `true`, `""` → default, `"0"` → `false` for each var.

**Acceptance tests:**

- `env-xendit.test.ts` (or a new `env-booleans.test.ts`): `TRUST_PROXY="false"` parses to `false`; `SCHEDULER_ENABLED="false"` parses to `false`; `STUB_WEBHOOK_ALLOWED="false"` parses to `false`; `DB_SSL_REJECT_UNAUTHORIZED="false"` parses to `false`.
- Existing tests that set these vars with string values still pass.

---

## H2: Series no-show → final session completion throws `InsufficientBalanceError`

**Severity:** HIGH (money correctness)

**Location:** `packages/api/src/modules/booking/booking.service.ts:1515-1539` (`markParticipantNoShow`) + `:1162-1228` (`completeSeriesSession`)

**Evidence:**

```ts
// markParticipantNoShow (series branch)
const forfeitAmount = Math.min(session!.holdAmount, participant.heldAmount); // :1516
await wallet.deduct(tx, { walletId: w.id, amount: forfeitAmount, ... });     // :1521
await repo.updateParticipantState(tx, participant.id, {
  attendanceState: ATTENDANCE_STATE.ABSENT,
  ...(isGroup ? { heldAmount: 0 } : {}),   // :1538 — series keeps heldAmount
});
```

For a series participant the wallet `heldBalance` is reduced by the forfeit but `booking_participant.held_amount` is **not** decremented. `completeSeriesSession` later deducts per-session again from the _same_ full `participant.heldAmount` (`Math.min(session.holdAmount, p.heldAmount)` at :1175/:1205). With an N-session series: hold = N×perSession; forfeit takes perSession → held = (N−1)×perSession; sessions 1…N each deduct perSession → the N-th deduct hits the `heldBalance >= amount` guard (`wallet.repo.ts:130-133`) → `InsufficientBalanceError` → the whole completion transaction rolls back. The booking stays SCHEDULED forever; the tutor can never complete → no payout; the delivered final session is unpaid (the exact "delivered-but-unpaid" failure L1 was meant to prevent, but L1 only capped the _deduct_, not the no-show-forfeit-vs-held accounting).

**Note:** the group (non-series) path is safe (`heldAmount: 0` for ABSENT participants, skipped at :1072); solo no-show is terminal. Only series is affected. `tutor-no-show-u5.test.ts:212-270` asserts the forfeit but never completes the session afterwards, so this is untested.

**Required:**

1. On series no-show, decrement `participant.heldAmount` by `forfeitAmount` (mirroring `cancelSession` at :1403) and recompute `booking.holdAmount`.
2. Add an integration test "no-show then complete remaining sessions" for both solo-series and group-series.

**Acceptance tests:**

- Solo-series: 3 sessions, participant no-shows session 1 → forfeit deducted, heldAmount decremented → sessions 2-3 complete without error, tutor paid.
- Group-series: same, with the no-show participant's remaining sessions completing.
- No-show on the final session → no completion needed, no error.

---

## H3: Late terminal webhook for a re-purchased payment bricks the new purchase

**Severity:** HIGH (money correctness)

**Location:** `packages/api/src/modules/payment/payment.service.ts:157-183` (FAILED/EXPIRED reset + reference reuse) + `:263-278` (early returns)

**Evidence:** `createIntent` reuses the same `providerReference` (`xendit:{userId}:{packageCode}`) for a fresh payment request after a FAILED/EXPIRED payment, and resets the row to PENDING. Xendit webhooks for the old and new attempts carry distinct `data.payment_id` values, so the idempotency key (`payments.ts:99`) and `providerEventId` dedup do not block the old attempt's events. Sequence: reset to PENDING → late `FAILED`/`EXPIRED` webhook for the **old** attempt arrives → `ALLOWED_TRANSITIONS[PENDING]` includes FAILED/EXPIRED → row flips to FAILED/EXPIRED → the new attempt's `SUCCEEDED` webhook then hits the early return at :268-269/:275-276 (`record.status === FAILED/EXPIRED` → returns without crediting). The user is charged but never credited, and re-purchase is blocked (`PackageAlreadyPurchasedError`).

**Why it matters:** Xendit retries webhooks for minutes-to-hours; the re-purchase window overlaps it. This is the same out-of-order family as the fixed D3, but for _stale terminal events after reference reuse_ — not covered by the D3 fix (D3 fixed PENDING-after-PAID ordering).

**Required:**

1. When the row is reset to PENDING (re-purchase), also reset/rotate the event lineage: e.g. clear `providerEventId` on reset, and only accept terminal events whose `providerEventId` matches the row's current `providerRequestId`/generation; or use a unique provider reference per attempt (Xendit's documented recommendation).
2. Add a test: FAILED webhook for old attempt arrives after re-purchase reset → row stays PENDING; SUCCEEDED webhook for new attempt credits.

**Acceptance tests:**

- Re-purchase after FAILED → old FAILED webhook arrives → row remains PENDING (or the event is ignored as stale)
- New SUCCEEDED webhook → credited once
- No double-credit when both old and new SUCCEEDED arrive

---

## M1: REFUNDED-webhook reversal uses `availableBalance` only

**Severity:** MEDIUM (money correctness)

**Location:** `packages/api/src/modules/payment/payment.service.ts:364-406`

**Evidence:** `const w = await wallet.getOrCreate(record.userId); if (w.availableBalance < record.marks) { …skip reversal, write refundRecord… }`. The credited Marks live in `availableBalance` only until the student books sessions, which move Marks to `heldBalance` (hold). If the payer has spent _some_ marks and _held_ the rest, `availableBalance < marks` even though `held + available ≥ marks` — the compensation is skipped, an admin reconciliation row is written, and the held marks stay in the wallet and are later deducted by the tutor at session completion **after the provider already refunded the payment**. The company refunds cash and still delivers Marks-backed sessions.

**Required:**

1. Decide the reversal basis explicitly (likely `heldBalance + availableBalance`, i.e. total, with `compensate_deduct` extended to consume held marks) or document the conservative choice.
2. Add a test where the payer holds the credited marks at REFUNDED-webhook time.

**Acceptance tests:**

- Payer holds all credited marks → REFUNDED webhook reverses from total balance (held + available)
- Payer spent all → reconciliation path (existing behavior)
- Payer spent some, held some → reversal covers the remainder

---

## M2: `adminRefund` fires the provider-side refund inside the DB transaction

**Severity:** MEDIUM (money correctness, double-refund risk)

**Location:** `packages/api/src/modules/admin-booking/admin-booking.service.ts:531-643` (provider call at :586-602, `createRefundRecord` at :604, audit at :627)

**Evidence:** the `refund.refundWithProvider(...)` HTTP call runs while the transaction is open. If anything after it fails (refundRecord insert, notification, audit), the tx rolls back the Marks reversal and the REFUNDED status — but the **provider refund already executed at Xendit**. Admin retries the refund (payment still PAID) → a second provider refund → double refund, with no local trace of the first. The webhook REFUNDED path was carefully made conditional/atomic (B2/H4), but the admin path performs an external money movement with no compensation.

**Required:**

1. Move the provider refund to _after_ the transaction commits (mirror the `cancelMeeting` pattern in `booking.service.ts:2707-2709`), storing a `provider_refund_pending` marker inside the tx.
2. Make the post-commit provider call idempotent (unique reference/`Idempotency-Key` per refund record id).

**Acceptance tests:**

- Provider refund fails → tx commits, refundRecord marked `provider_refund_pending`, retry reuses the same reference (no double refund)
- Provider refund succeeds → refundRecord updated with provider id
- Tx rollback after provider call → no provider refund fired (call deferred)

---

## M3: Booking list cursor is the non-unique `scheduledStartAt`

**Severity:** MEDIUM (data visibility)

**Location:** `packages/api/src/modules/booking/booking.service.ts:548-551, 566-570`; `booking.repo.ts:918-919, 941-942`

**Evidence:** `nextCursor = items[items.length-1].scheduledStartAt.toISOString()`; next page `lt(booking.scheduledStartAt, new Date(opts.cursor))`. Any two bookings with identical `scheduledStartAt` (bulk/rescheduled series, same-minute duplicates) → the page boundary cursor equals one of them → all rows with that exact timestamp are excluded from every later page (`lt`, not `lt=` or tie-break on id). The ledger pagination (`wallet.repo.ts:272-277`) correctly uses the `(createdAt, id)` composite cursor; the booking lists do not.

**Required:**

1. Use a composite `(scheduledStartAt, id)` cursor like `findLedgerEntries`, or tie-break with `or(lt(start), and(eq(start), lt(id)))`.

**Acceptance tests:**

- Two bookings with identical `scheduledStartAt` → both pages return all rows, no skips
- Existing pagination tests still pass

---

## M4: Student `cancelSession` releases/deducts `session.holdAmount` regardless of the participant's actual remaining hold

**Severity:** MEDIUM (money correctness, cross-booking leak)

**Location:** `packages/api/src/modules/booking/booking.service.ts:1376-1404`

**Evidence:** `wallet.release(tx, { amount: session.holdAmount, … })` (:1394) / `wallet.deduct(... amount: session.holdAmount ...)` (:1384) guarded only by `participant.heldAmount > 0`, while the participant row is decremented by `Math.max(0, heldAmount - session.holdAmount)` (:1403). After an admin `cancelSeriesSession(…, release/partial)` (which decrements `heldAmount` — `admin-booking.service.ts:813-817`), the participant may hold less than `session.holdAmount`; the wallet-level release/deduct then draws the difference from the _wallet's pooled held balance_ (other bookings' holds), and the later completion of those other sessions fails with `InsufficientBalanceError` (same failure family as L1, release side). Wallet holds are pooled per wallet, so this leaks across bookings.

**Required:**

1. Cap the release/deduct at the participant's current `heldAmount` (`Math.min(session.holdAmount, participant.heldAmount)`), mirroring :1175.

**Acceptance tests:**

- Admin `cancelSeriesSession(…, release)` then student `cancelSession` on a remaining session → no over-release, other bookings' holds untouched
- Normal cancel path unchanged

---

## M5: Webhook processing failures return a generic 500 and release the claim

**Severity:** MEDIUM (reliability, retry loop)

**Location:** `apps/server/src/webhooks/payments.ts:123-162`

**Evidence:** any non-signature/non-timestamp error → `set.status = 500; return { error: "Webhook processing failed" }`, after `webhookIdempotency.release(idempotencyKey)` (:124). Xendit retries failed deliveries (minutes to hours). A persistent bug (e.g. `PaymentNotFoundError` on a reference mismatch, an unknown mapped status) re-enters the same failure path on every retry — no exponential backoff of our own, no dead-letter, no alert beyond a log line (`webhook_processing_error`).

**Required:**

1. Distinguish retryable vs permanent webhook failures: 4xx for permanent (payment not found, unknown status) with a logged/alerted dead-letter, 5xx only for transient errors.
2. Consider a failed-attempt counter per `providerEventId` with alerting after N consecutive failures.

**Acceptance tests:**

- `PaymentNotFoundError` → 4xx, claim NOT released (permanent)
- Transient DB error → 5xx, claim released (retryable)
- Unknown status → 4xx, claim not released

---

## L1: `xendit:no-event-id` fallback idempotency key collapses all id-less events

**Severity:** LOW

**Location:** `apps/server/src/webhooks/payments.ts:99`

**Evidence:** `const idempotencyKey = \`${provider}:${payload.providerEventId || "no-event-id"}\`;`— a malformed/legacy event without`payment_id`/`payment_request_id`/`id` shares one key with every other such event; the first one claims it and all subsequent ones are silently dropped (`{ok:true, idempotent:true}`), while `confirmFromWebhook`would have thrown`PaymentNotFoundError` anyway. Not exploitable (signature-verified), but hides real delivery failures.

**Required:**

1. Reject events with an empty providerEventId + empty providerReference as 400 with a log, instead of folding them into one key.

**Acceptance tests:**

- Webhook with no event id and no reference → 400, logged
- Normal events unchanged

---

## L2: Booking-create idempotency key has an empty header slot

**Severity:** LOW

**Location:** `packages/api/src/modules/booking/booking.handler.ts:81-82, 250, 279, 307` (key `booking:{userId}:{tutorId}:{start}:{headerKey ?? ""}`); `apps/web/src` contains no `idempotency-key` usage (verified by grep).

**Evidence:** with the header always absent, the key is `booking:{user}:{tutor}:{start}:` — a user who cancels/expires a booking and re-books the identical tutor+slot within the 24h `bookingIdempotency` TTL receives the stale cached result (the old/cancelled booking id) instead of a fresh booking. The `getOrSet` cache stores the _result_ of the first attempt for 24h (`lib/idempotency.ts:129-172`).

**Required:**

1. Include a client-generated nonce in the key, or scope the cache to success only / shorter TTL.

**Acceptance tests:**

- Cancel + re-book same tutor+slot within 24h → fresh booking created (not the stale cached id)
- Double-submit of the same request → single booking (idempotency preserved)

---

## L3: Email-OTP brute-force protection is per-instance memory storage

**Severity:** LOW

**Location:** `packages/auth/src/index.ts:158-191`; better-auth 1.6.11 (`create-context.mjs:166-171`): `rateLimit.enabled = options.rateLimit?.enabled ?? isProduction`, storage defaults to `"memory"` unless `secondaryStorage` is configured. No `secondaryStorage` is wired (`packages/auth/src/index.ts` — DB adapter only).

**Evidence:** the app-level `authRateLimit` (`routes.ts:39-44`, 10/min/IP) does **not** cover `/api/auth/email-otp/*` paths (they aren't in `AUTH_PATHS`, `rate-limit-paths.ts:11-18`); the plugin's own 3/min limit per endpoint is per-process. With multiple server replicas behind Caddy, an attacker gets N×3 verify attempts per minute against the 6-digit OTP (5 min expiry). 6 digits / 1e6 space — meaningful with a 1e6/… rate, still impractical per single instance but the multi-instance multiplication should be closed.

**Required:**

1. Wire `secondaryStorage` (Redis) for better-auth, or add `/api/auth/email-otp/` to `AUTH_PATHS` (wave-5 M3 already added the paths — verify the app-level limiter now covers them; if so, this is defense-in-depth only).

**Acceptance tests:**

- `/api/auth/email-otp/verify-email` hits the app-level auth rate limiter (10/min/IP)
- Multi-instance: verify attempts are bounded globally (Redis-backed)

---

## Implementation Guidance (shared)

- Follow the 4-layer pattern, consumer-driven ports, `DomainError` + `withDomainMap`, bounded zod, `DbOrTx`, and integration tests via `createRouterClient` (see `docs/CONTEXT.md` → "How to Add a New Module").
- Money paths (H2, M1, M2, M4) must use `wallet.hold/release/deduct/credit/compensate` inside the booking transaction with deterministic `eventKey`s (ledger idempotency).
- Verify: `bun run check-types`, `bun run lint`, full suite `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env.test packages/api/src/tests/ apps/server/src/openapi.test.ts` (0 fail), coverage gates (api ≥ 90%, overall ≥ 80%).
- Conventional commits; one PR per item or a small coherent group (H1 alone is a security fix; H2+H4 are the same hold-accounting family; H3+M1+M2 are the payment family; M3+M5+L1 are reliability; L2+L3 are hardening).

### Version Notes

- v1.0 (2026-08-19): Created from the wave-5 deep review (worker W2, read-only). All findings verified against code at `d11962b` and re-checked against the wave-5 branch (`fix/wave5-prod-readiness`, PR #79). H1's `TRUST_PROXY` RUNBOOK row is added by wave-5's infra commit (W4 added `TRUST_PROXY=true` to the env examples); the RUNBOOK table row itself is still missing — tracked here.
