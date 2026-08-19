# Wave-6 Review Fixes — Production Readiness (W2 findings)

| Field      | Value                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | Active — H1/H2/M2/M4/N1 (PR #82) + H3/M1/M3/M5/L1/N2/N4 (PR #83) fixed & merged; L2/N3/P1/P2/P3 fixed and L3 confirmed defense-in-depth (wave-6c) |
| Branch     | `fix/wave6-a` (PR #82), `fix/wave6-b` (PR #83) — both merged                                                                                      |
| Created    | 2026-08-19 (wave-5 deep review by worker W2, read-only)                                                                                           |
| Depends on | Wave-5 (PR #79) merged to main                                                                                                                    |
| Scope      | Backend only (packages/api, apps/server, packages/env, packages/auth)                                                                             |

This plan catalogs the findings of the wave-5 deep code review (worker W2, read-only, `docs/plans/active/` companion to the wave-5 fix PR). Every finding was verified against code at `d11962b` (pre-wave-5) and re-checked against the wave-5 branch. **Re-verification (2026-08-19, HEAD `69e2dd8`):** every original finding was re-checked against current main; new findings **N1–N4** were added by the wave-6 deep review. Severity ordering follows the code-review skill.

> **Rule:** the PRD (`docs/prd.tex`) is the source of truth. If a requirement in this spec conflicts with the PRD, the PRD wins.

## Gap Summary

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                   | Location                                       | Status                                                               |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| H1  | HIGH     | `z.coerce.boolean()` treats the string `"false"` as `true` for `TRUST_PROXY`, `STUB_WEBHOOK_ALLOWED`, `SCHEDULER_ENABLED`, `DB_SSL_REJECT_UNAUTHORIZED` — `TRUST_PROXY=false` actually enables proxy trust (rate-limit evasion + webhook IP allowlist bypass); `SCHEDULER_ENABLED=false` runs the scheduler               | `packages/env/src/server.ts:17,34,37,55`       | **Fixed (wave-6a)**                                                  |
| H2  | HIGH     | Series participant no-show forfeits the wallet hold but not `participant.heldAmount` → final session completion throws `InsufficientBalanceError` → booking stuck, tutor unpaid                                                                                                                                           | `booking.service.ts:1515-1539,1162-1228`       | **Fixed (wave-6a)**                                                  |
| H3  | HIGH     | Late terminal webhook for a re-purchased payment (shared `providerReference`) bricks the new purchase — user charged, never credited                                                                                                                                                                                      | `payment.service.ts:157-183,263-278`           | **Fixed (wave-6b)**                                                  |
| M1  | MED      | REFUNDED-webhook reversal checks `availableBalance` only — held Marks strand the reversal into admin reconciliation; company refunds cash but still delivers Marks-backed sessions                                                                                                                                        | `payment.service.ts:364-406`                   | **Fixed (wave-6b)**                                                  |
| M2  | MED      | `adminRefund` fires the provider-side Xendit refund **inside** the DB transaction — rollback after the HTTP call = double refund on retry. **RESOLVED (wave-6a, N1 decision):** the provider refund was removed entirely from `adminRefund` (in-app Marks credit only) — see N1                                           | `admin-booking.service.ts:531-643`             | **Fixed (M2+N1 wave-6a)**                                            |
| M3  | MED      | Booking list cursor is non-unique `scheduledStartAt` — bookings sharing the timestamp are permanently skipped in pagination                                                                                                                                                                                               | `booking.service.ts:548-570`                   | **Fixed (wave-6b)**                                                  |
| M4  | MED      | Student `cancelSession` releases/deducts `session.holdAmount` regardless of the participant's remaining hold — leaks across pooled wallet holds                                                                                                                                                                           | `booking.service.ts:1376-1404`                 | **Fixed (wave-6a)**                                                  |
| M5  | MED      | Webhook processing failures return generic 500 + release the claim — persistent bugs loop against Xendit indefinitely, no DLQ/alert                                                                                                                                                                                       | `apps/server/src/webhooks/payments.ts:123-162` | **Fixed (wave-6b)**                                                  |
| L1  | LOW      | `xendit:no-event-id` fallback idempotency key collapses all id-less events — hides real delivery failures                                                                                                                                                                                                                 | `apps/server/src/webhooks/payments.ts:99`      | **Fixed (wave-6b)**                                                  |
| L2  | LOW      | Booking-create idempotency key has an empty header slot — frontend sends no `idempotency-key`; stale cached result on re-book within 24h TTL                                                                                                                                                                              | `booking.handler.ts:81-82,250,279,307`         | **Fixed (wave-6c)**                                                  |
| L3  | LOW      | Email-OTP brute-force protection is per-instance memory storage — multi-replica multiplication of verify attempts                                                                                                                                                                                                         | `packages/auth/src/index.ts:158-191`           | **Defense-in-depth (wave-6c)** — app-level limiter covers it; see L3 |
| N1  | MED      | `adminRefund` always fires a provider cash refund for the full `amountIdr` on every refund — but PRD §677 limits cash refunds to payment-error/incorrect-capture corrections (refund only the unused excess); normal Marks are non-convertible to rupiah, so booking/wallet corrections must be in-app Marks credits only | `admin-booking.service.ts:527-644`             | **Fixed (wave-6a)**                                                  |
| N2  | MED      | BullMQ scheduler jobs never set `removeOnComplete`/`removeOnFail` — completed/failed job records accumulate unbounded in Redis across every 5m/10m/60s repeatable tick                                                                                                                                                    | `scheduler.service.ts`, `jobs/*.job.ts`        | **Fixed (wave-6b)**                                                  |
| N3  | LOW      | `/health` returns HTTP 200 when a check is `degraded` (DB/Redis response > 1s) — latency degradation is not observable via the health endpoint / LB readiness                                                                                                                                                             | `apps/server/src/routes.ts:433-438`            | **Fixed (wave-6c)**                                                  |
| N4  | LOW      | REFUNDED-webhook available-balance guard reads via `wallet.getOrCreate` on the **global** `db` (not the `tx`) — out-of-tx read for an atomic money decision; concurrent wallet change can skew the reversal/reconciliation split                                                                                          | `payment.service.ts:397`                       | **Fixed (wave-6b)**                                                  |

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
2. Add a `TRUST_PROXY` row to the RUNBOOK env table — **DONE (re-verified 2026-08-19):** the row now exists at `docs/RUNBOOK.md:297` (`TRUST_PROXY` — "Trust `x-forwarded-for` first hop... default false — required behind a reverse proxy"). Only the code + tests remain.
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

> **RESOLVED (2026-08-19, wave-6a — superseded by the N1 decision):** rather than deferring the provider call, the provider call was **removed entirely** from `adminRefund` (N1: in-app Marks credit only — PRD §677 "Marks not convertible to rupiah"). No provider refund exists to run inside or after the transaction, so the double-refund-on-retry hazard is eliminated at the source. See the N1 section for the decision.

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

> **IMPLEMENTED (wave-6c):** `resolveIdempotencyNonce(headerKey)` added in `packages/api/src/lib/idempotency.ts` — when the client sends an `idempotency-key` header it is used verbatim (true double-submit dedup), otherwise a fresh `crypto.randomUUID()` is generated per attempt. The four create handlers (`createSolo/createGroup/createSeries/createGroupSeries` in `booking.handler.ts`) now end the key with this nonce instead of `headerKey ?? ""`. A re-book of the identical tutor+slot always gets a fresh nonce → a genuinely new key → a new booking; a retry of the exact same request still dedups. Covered by `booking.idempotency.test.ts` (L2 tests: no-header fresh-booking, cancel+re-book fresh, same-nonce double-submit single booking).

---

## L3: Email-OTP brute-force protection is per-instance memory storage

**Severity:** LOW

**Location:** `packages/auth/src/index.ts:158-191`; better-auth 1.6.11 (`create-context.mjs:166-171`): `rateLimit.enabled = options.rateLimit?.enabled ?? isProduction`, storage defaults to `"memory"` unless `secondaryStorage` is configured. No `secondaryStorage` is wired (`packages/auth/src/index.ts` — DB adapter only).

**Evidence:** the app-level `authRateLimit` (`routes.ts:39-44`, 10/min/IP) — **re-verified 2026-08-19:** `rate-limit-paths.ts:24` now includes `/api/auth/email-otp/` in `AUTH_PATHS` (added by wave-5 M3), so the app-level limiter DOES cover email-OTP verify/send. The remaining gap is only the plugin's per-process 3/min limit (no Redis `secondaryStorage`), so N replicas still get N×3 verify attempts/min. This is defense-in-depth only at this point.

**Required:**

1. Wire `secondaryStorage` (Redis) for better-auth, or add `/api/auth/email-otp/` to `AUTH_PATHS` (wave-5 M3 already added the paths — verify the app-level limiter now covers them; if so, this is defense-in-depth only).

**Acceptance tests:**

- `/api/auth/email-otp/verify-email` hits the app-level auth rate limiter (10/min/IP)
- Multi-instance: verify attempts are bounded globally (Redis-backed)

> **DEFENSE-IN-DEPTH (wave-6c):** wiring better-auth `secondaryStorage` (Redis) into `packages/auth` is not cleanly available — `@cogito-app/auth` imports only `@cogito-app/db` and `@cogito-app/env`; the Redis client lives in `@cogito-app/api`, which already imports `@cogito-app/auth` (importing the API's Redis client into auth would create a circular dependency). Per the plan's fallback, this is **defense-in-depth only**: the app-level `authRateLimit` (10/min/IP, Redis-backed) fully covers `/api/auth/email-otp/` (confirmed in `rate-limit-paths.ts` `AUTH_PATHS`), so multi-replica verify attempts are already globally bounded by the shared Redis limiter. A focused assertion (`apps/server/src/rate-limit.test.ts`) pins `"/api/auth/email-otp/"` in `AUTH_PATHS` and the `authRateLimit` wiring. If a future requirement needs better-auth's internal per-plugin 3/min bound to be shared across replicas, add a Redis `secondaryStorage` to `packages/auth` in a separate PR (needs the circular-dep resolved first).

---

## N1: `adminRefund` issues a provider cash refund for non-error refunds — violates "Marks not convertible to rupiah"

**Severity:** MEDIUM (money correctness / PRD compliance)

**Location:** `packages/api/src/modules/admin-booking/admin-booking.service.ts:527-644` (provider call at `:586-602`, `createRefundRecord` at `:604`)

**Evidence:** `adminRefund` always calls `refund.refundWithProvider(payment.providerRequestId, payment.amountIdr, "CANCELLATION")` (`:588-592`) whenever the payment has a `providerRequestId` — i.e. it issues a **real Xendit cash refund to the payer's card for the full `amountIdr`** on every admin refund, regardless of reason. It also reverses `refundableMarks` locally (`:560-568`) and stores the full `amountIdr` on the refund record (`:607`).

**PRD conflict (Refund Policy §677):**

- _"Purchased Marks are not redeemable or convertible back to rupiah after a successful valid purchase."_
- _"Unused purchased Marks remain in the wallet indefinitely and cannot be cashed out to rupiah."_
- _"Payment-error cash refunds are corrections, not Marks cash-out."_ Cash refunds are **limited to actual payment errors / incorrect capture**; for anything else the correction is an **in-app Marks/ledger adjustment**, never a card refund.
- _"If a duplicate or incorrect payment produced Marks that were already spent... admin must not issue a full cash refund blindly. Admin must either refund only the unused excess, correct the wallet with compensating entries, or escalate."_

So a routine `adminRefund` (e.g. a booking-level override refund, a wallet correction) must **not** hit the payment provider at all — it should be a compensating ledger credit. A provider cash refund is only legitimate for a genuine payment-error/duplicate-capture correction, and even then only for the **unused cash excess**, never the full captured amount.

**Required:**

1. Gate the provider refund: only issue a real cash refund when the override reason is a payment error / incorrect capture (a distinct action or an explicit flag on the input), never for booking/wallet corrections.
2. When a cash refund IS issued (payment error), refund only the **unused cash excess** (the cash equivalent of the unspent Marks remainder), not the full `amountIdr` — consistent with TC-39 "refund only the unused excess".
3. For all other admin refunds/corrections, perform the in-app compensating Marks credit only (no provider call), per the "Marks not convertible" rule.
4. Add tests: (a) booking/wallet correction → no provider refund call, only a Marks credit; (b) payment-error correction → provider refund equals only the unused cash excess; (c) fully-spent duplicate payment → rejected / escalated (no blind full refund).

**Acceptance tests:**

- Admin refunds a booking error → no `refundWithProvider` call; `refundRecord.amountIdr = 0` (or null); only a compensating Marks credit.
- Admin issues a payment-error refund with 80/120 Marks unspent → provider refund = 800,000 IDR (not 1,200,000), not the full capture.
- Fully-spent duplicate payment → no cash refund (existing `RefundSpendExhaustedError` behavior, unchanged).

> **IMPLEMENTED (2026-08-19, wave-6a):** `adminRefund` now performs the in-app compensating Marks credit only — the provider refund block (`refund.refundWithProvider`) was removed from `admin-booking.service.ts`, `refundRecord.amountIdr` is `0`, and no `providerEventId` is passed. The `refund.refundWithProvider` port remains on the interface (unused by `adminRefund`) and the `services.ts` wiring is untouched, so a future payment-error-only cash-refund flow (required items 1–2, e.g. refunding only the unused cash excess) can be added as a separate action/PR without a schema change. Acceptance tests: "no `refundWithProvider` call; `amountIdr = 0`" covered by the new unit regression test + the updated X1 integration assertion; "fully-spent → `RefundSpendExhaustedError`" is existing behavior, unchanged.

---

## N2: BullMQ scheduler jobs accumulate unbounded job records in Redis

**Severity:** MEDIUM (ops / memory)

**Location:** `packages/api/src/modules/scheduler/scheduler.service.ts` + `jobs/*.job.ts` (`upsertJobScheduler` opts at `expire-bookings.job.ts:7-18`, etc.)

**Evidence:** every repeatable job registers with only `attempts: 3, backoff: { exponential }` and **no `removeOnComplete` / `removeOnFail`**. BullMQ defaults keep completed and failed job records (their full `data` and metadata) in the `completed`/`failed` sets indefinitely. With six jobs firing every 5m/10m/60s, Redis accumulates a completed record on every tick, permanently. The DLQ Redis list is bounded (`DLQ_LIST_MAX = 100`), but the completed-job set is not. On a busy scheduler this grows Redis memory without bound until eviction.

**Why it matters:** unbounded Redis growth on the shared scheduler instance — eventually OOM / eviction churn that degrades idempotency, rate limits, and circuit-breaker state that share the same Redis.

**Required:**

1. Set `removeOnComplete: { age: <hours>, count: <n> }` and `removeOnFail: { age: <hours>, count: <n> }` on each repeatable job's `opts` (e.g. keep last 100 completed / last 50 failed).
2. Consider a queue-level default (`defaultJobOptions`) so future jobs inherit it.

**Acceptance tests:**

- After a scheduler run, the `completed` set for `cogito-jobs` is bounded (no unbounded growth); `cogito-jobs:*` Redis keys stop growing.

---

## N3: `/health` returns 200 when a dependency is `degraded`

**Severity:** LOW (observability / ops)

**Location:** `apps/server/src/routes.ts:433-438`; `packages/api/src/lib/db-health.ts`

**Evidence:** `healthCheck` reports `ok` / `degraded` (a dependency responded but took > 1s) / `error`. The route maps `ok` → 200, `degraded` → 200, `error` → 503. A slow-but-alive database or Redis (> 1s) therefore reports HTTP 200, so the Docker HEALTHCHECK and any LB / Coolify readiness check treat the instance as perfectly healthy even as latency degrades toward timeout. The `degraded` signal is computed but never surfaced as non-200.

**Why it matters:** latency degradation is a real availability signal; the health endpoint exists to surface it. A 1s+ DB is often a precursor to timeout failures and should trip readiness, or at minimum be distinguishable from fully healthy.

**Required:**

1. Map `degraded` → 503 (or a distinct status), so LB / Coolify stop routing to a latency-degraded instance.
2. Add a test asserting `degraded` yields non-200.

**Acceptance tests:**

- DB responds in 1.5s → health returns 503
- DB responds in 100ms → 200

> **IMPLEMENTED (wave-6c):** `healthStatus(status)` added in `packages/api/src/lib/db-health.ts` maps `ok` → 200 and `degraded`/`error` → 503. `routes.ts` `/health` now uses it, so a slow-but-alive dependency (>1s) trips the LB / Coolify readiness check. Covered by `db-health.test.ts` (N3: degraded→503, ok→200, error→503) + the existing slow-DB `degraded` assertion.

---

## N4: REFUNDED-webhook available-balance guard reads outside the transaction

**Severity:** LOW (consistency / money decision)

**Location:** `packages/api/src/modules/payment/payment.service.ts:397`

**Evidence:** in `confirmFromWebhook`'s REFUNDED branch, the `availableBalance < record.marks` guard calls `wallet.getOrCreate(record.userId)` — a **non-transactional** read against the global `db`, not the active `tx`. The wallet's `getOrCreate` signature takes no connection (`wallet.service.ts:156`), so it always uses the module-level `db`. Inside `db.transaction(...)` this means the guard reads a snapshot that is not part of the transaction's view, so a concurrent wallet change (another booking's hold/release committed mid-webhook) can make the reversal-vs-reconciliation decision inconsistent with the row state that `updatePaymentStatusIfInCreditState` just locked.

**Why it matters:** the REFUNDED webhook decision (reverse the marks vs. write an admin reconciliation row) is a money decision; reading outside the tx weakens the atomicity of the choice. This is low severity because the guard is conservative (worst case a reconciliation row is written when a reversal was possible), but it is a correctness smell worth closing with the M1 refactor.

**Required:**

1. Extend `getByUserId`/`getOrCreate` to accept a `DbOrTx` and call it with `tx` inside the webhook (the booking/room paths already thread `tx` through `wallet.getByUserId(tx, ...)`).
2. Add a test: concurrent wallet change does not flip the reversal decision mid-transaction.

**Acceptance tests:**

- REFUNDED webhook reversal uses the transactional wallet snapshot
- Existing refund-flow tests unchanged

---

## PRD Alignment Findings (PRD-vs-code audit, 2026-08-19)

A full read of `docs/prd.tex` (all 24 FRs, state machine, Marks ledger rules, refund/override/lateness/pricing/series rules, notification matrix, and TC-01…TC-39) was cross-checked against main @ `69e2dd8`. Most high-risk money/lifecycle rules are **aligned** (verified): pricing floors & extra-take split (`constants.ts`, `pricing.service.ts`), H-2 = 2h, 12h response windows, 15-min lateness, KB ≥35 Marks, package seed values, refund reconciliation (no blind full refund), series no-opt-out, achievement moderation states + category enum + issuer/visibility, parent-contact profile fields, session-note sanitizer, tutor invite token-hashing + existing-user attach, offline room approval. The gaps below are the ones that did NOT align.

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Location                                                                               | Status              |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------- |
| P1  | MED      | **Group/group-series invitee email lacks the PRD-mandated content + CTA.** The notification matrix ("Group session or series invitation received") and series rules require the email to include the full schedule, per-student price, total Marks hold, the no-opt-out disclaimer, and a direct CTA to view/accept in-platform. Code sends `notif.body` as the email `html` with no link/CTA and a bare body ("You have been invited to a group session. Confirm within 12 hours." / the series variant adds only the disclaimer). No invitee is directed to the platform. | `booking.service.ts:2133-2143,3008-3019`; `notification.service.ts:245-256`            | **Fixed (wave-6c)** |
| P2  | MED      | **No "Account created" welcome email.** The notification matrix requires a signup-confirmation email to new students (onboarding entry point, login link, brief intro). The auth flow only sends a verification OTP (`sendVerificationOnSignUp`) and reset-password emails — no welcome email exists.                                                                                                                                                                                                                                                                       | `packages/auth/src/index.ts` (emailOTP only)                                           | **Fixed (wave-6c)** |
| P3  | LOW      | **Group-series disclaimer copy is weaker than the PRD's required/equivalent text.** PRD requires the "full-series commitment / cannot opt out / missed sessions after H-2 non-refundable / confirm availability for all dates" disclaimer before finalization and on the invitee acceptance screen. `GROUP_SERIES_DISCLAIMER` says only "Group series bookings require attendance at all sessions. Individual sessions cannot be cancelled." — it omits the non-refundable-after-H-2 and availability-confirmation meaning.                                                 | `shared/constants.ts:22-23`; shown via `booking.service.ts:3016` + `disclaimer` on GET | **Fixed (wave-6c)** |

---

## Implementation Guidance (shared)

- Follow the 4-layer pattern, consumer-driven ports, `DomainError` + `withDomainMap`, bounded zod, `DbOrTx`, and integration tests via `createRouterClient` (see `docs/CONTEXT.md` → "How to Add a New Module").
- Money paths (H2, M1, M2, M4) must use `wallet.hold/release/deduct/credit/compensate` inside the booking transaction with deterministic `eventKey`s (ledger idempotency).
- Verify: `bun run check-types`, `bun run lint`, full suite `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env.test packages/api/src/tests/ apps/server/src/openapi.test.ts` (0 fail), coverage gates (api ≥ 90%, overall ≥ 80%).
- Conventional commits; one PR per item or a small coherent group (H1 alone is a security fix; H2+H4 are the same hold-accounting family; H3+M1+M2+N1+N4 are the payment/refund family; M3+M5+L1+N2 are reliability; N3 is ops; L2+L3 are hardening).

### Version Notes

- v1.0 (2026-08-19): Created from the wave-5 deep review (worker W2, read-only). All findings verified against code at `d11962b` and re-checked against the wave-5 branch (`fix/wave5-prod-readiness`, PR #79). H1's `TRUST_PROXY` RUNBOOK row is added by wave-5's infra commit (W4 added `TRUST_PROXY=true` to the env examples); the RUNBOOK table row itself is still missing — tracked here.
- v1.1 (2026-08-19, re-verification at HEAD `69e2dd8`): re-checked every original finding against current main. **Status sync:** H1–H3/M1–M5/L1–L2 all still **Open** (code unchanged); L3 → **Partial** (`/api/auth/email-otp/` now in `AUTH_PATHS`, `rate-limit-paths.ts:24`). **New findings added:** N1 (adminRefund provider refund amount ≠ Marks reversal), N2 (unbounded BullMQ job retention), N3 (`/health` degraded → 200), N4 (REFUNDED-webhook balance guard reads outside tx). H1's RUNBOOK `TRUST_PROXY` row is now present at `docs/RUNBOOK.md:297` (only the env-schema code + tests remain).
- v1.2 (2026-08-19): PRD-vs-code audit added. **Aligned (verified):** pricing/extra-take, H-2/12h/15-min constants, KB threshold, packages, refund reconciliation, series no-opt-out, achievements, parent contact, session notes, tutor invite, offline rooms. **PRD gaps added:** P1 (group-invitee email lacks PRD content + CTA), P2 (no "Account created" welcome email), P3 (group-series disclaimer copy weaker than PRD equivalent). **N1 reframed (v1.2b, product decision):** the real issue is that `adminRefund` issues a provider **cash** refund on every refund — PRD §677 limits cash refunds to payment-error corrections (refund only the unused excess); normal Marks are non-convertible to rupiah, so booking/wallet corrections must be in-app Marks credits. See the N1 section for the full PRD quotes and required gating. P2 is **in-scope** (user confirmed 2026-08-19).
- v1.3 (2026-08-19, wave-6a worker): **M2 + N1 implemented together** — `adminRefund` no longer calls the payment provider at all (no Xendit cash refund, no `providerRefundId`); `refundRecord.amountIdr` is now `0` and `provider_event_id` is `NULL` (N1 decision: in-app Marks credit only, PRD §677 "Marks not convertible to rupiah"). The `refund.refundWithProvider` port stays on the interface (future payment-error-only cash-refund flow) but is intentionally not invoked by `adminRefund`; `services.ts` wiring unchanged. Tests: unit suite extended with a "never calls refundWithProvider" regression test; X1 integration assertion updated to `providerEventId: null` + `amountIdr: 0`; the M2/N1 acceptance criteria are now satisfied by removal (no provider call exists to run inside/after the tx). Remaining payment-error cash-refund gating (N1 required items 1–2) is intentionally NOT implemented — `adminRefund` has no payment-error action today; a dedicated payment-error correction flow would need a separate PR.
- v1.3b (2026-08-19, wave-6a): **H1, H2, M4 also fixed on this branch** — H1 (env boolean coercion, `packages/env/src/server.ts` `boolSchema()` + `env-booleans.test.ts`), H2 (series no-show decrements `participant.heldAmount` + recomputes booking hold, `booking-series-noshow-complete.test.ts`), M4 (student `cancelSession` caps release at `participant.heldAmount`, `booking-series-cancel-m4.test.ts`). All marked Fixed in the summary table.
- v1.5 (2026-08-19, wave-6b reliability): **M3, M5, L1, N2 fixed** on `fix/wave6-b`. **M3** (booking lists use a composite `(scheduledStartAt,id)` cursor via `encodeBookingCursor`/`decodeBookingCursor`/`bookingCursorCondition`; legacy bare-timestamp cursors still accepted) — no bookings skipped when several share a timestamp. **M5** (webhook `isPermanentWebhookError`/`permanentWebhookStatus`: `PaymentNotFoundError`→404, unknown status→400, both logged `webhook_dead_letter` and claim marked processed, NOT released; transient DB/Redis→500 with claim released for provider retry). **L1** (webhook with neither `providerEventId` nor `providerReference` → 400 `webhook_missing_reference`, no more shared `xendit:no-event-id` key collapse). **N2** (BullMQ `JOB_RETENTION` `defaultJobOptions` on `cogito-jobs` — `removeOnComplete {age 24h, count 100}`, `removeOnFail {age 7d, count 50}` — plus per-job `...JOB_RETENTION`). Tests: webhook M5/L1 suite, scheduler job retention tests updated, `repo-booking.test.ts` composite-cursor integration test. Full API suite green (1935 pass / 0 fail), server suite green (87 pass / 0 fail), check-types + lint clean.
- v1.4 (2026-08-19, wave-6b worker): **H3, M1, N4 fixed together** on the payment webhook family.
  - **H3** (`payment.service.ts`): re-purchase after FAILED/EXPIRED rotates `providerRequestId` to the new attempt but **retains** the previous `providerEventId` as a stale-generation marker (Xendit payment events carry `payment_id`, not `payment_request_id`, so a request-id match is impossible). `confirmFromWebhook` now ignores a FAILED/EXPIRED terminal event on a PENDING row whose `providerEventId` equals the retained marker, so a late old-attempt terminal webhook can no longer flip the re-purchased row terminal and strand the new purchase's credit. Tested: old FAILED after re-purchase → row stays PENDING; new SUCCEEDED credits once; no double-credit when both old and new SUCCEEDED arrive.
  - **M1** (`payment.service.ts`): the REFUNDED reversal basis is now **total balance** (`heldBalance + availableBalance`), not `availableBalance` alone. When total ≥ marks the code releases the held portion back to available first (`refund.{id}.release`) then reverses the full payment marks via `compensate_deduct` (`refund.{id}.reverse`). The "spent all" reconciliation path (H4) is preserved: total < marks → mark REFUNDED, write `refund_webhook_reconciliation` audit + refund_record, skip reversal + notification.
  - **N4** (`payment.service.ts`, `payment/index.ts`): the balance guard now reads through the transaction via `wallet.getByUserId(tx, record.userId)` (added to `PaymentWalletPort`) instead of the global `db` via `getOrCreate`. `PaymentWalletPort` gained `getByUserId` and `release`. Audit details now include `heldBalance`. Tests: `payment.service.test.ts` + `refund-flow.test.ts` + `payment-flow.test.ts` + full `packages/api/src/tests/` (1925 pass) + `check-types` + `lint` all green.
- v1.6 (2026-08-19, wave-6c): **P1, P2, P3 fixed** (PRD copy + email content) on `fix/wave6-c`.
  - **P1** (`booking.service.ts`): the group and group-series invitee notification body is now enriched to carry the PRD-mandated content — full schedule, per-student price, total Marks hold, the no-opt-out disclaimer (series only), and a direct in-platform CTA (`${CORS_ORIGIN}/bookings/{bookingId}`, new `formatInviteCta`). Because `notification.write` uses `notif.body` as the email `html` and the in-app body, the CTA link is now present in both. Tested in `booking.service.test.ts` (unit) and `booking-group-series.test.ts` (integration: body contains schedule/price/hold/disclaimer/CTA + severity action).
  - **P2** (`packages/auth`): added a signup-confirmation (welcome) email. New `buildWelcomeEmail` builder (`welcome-email.ts`, subject "Welcome to Cogito", includes dashboard entry point, login link, brief platform intro), a `WelcomeEmailSender` port + `setWelcomeEmailSender` wired through the existing shared email port (`services.email.send`, category `auth`), and a better-auth `databaseHooks.user.create.after` hook that fires only on actual user creation (an existing-user sign-in never re-creates the row, so no re-send). Login URL derives from `CORS_ORIGIN`. Tested in `welcome-email.test.ts` (content + HTML escaping) and verified `welcome_email_not_configured` logs appear (no crash) when unset in tests.
  - **P3** (`shared/constants.ts`): `GROUP_SERIES_DISCLAIMER` expanded to the PRD-equivalent full-series-commitment text (cannot opt out / missed sessions after H-2 non-refundable / confirm availability for all dates). Still surfaced automatically via `computeDisclaimer` on the booking GET and the invitee acceptance path (`booking.service.ts:3016`). Tested in `constants.test.ts` (P3 wording) + `booking.service.test.ts` (GET surfaces it) + `booking-group-series.test.ts`.
