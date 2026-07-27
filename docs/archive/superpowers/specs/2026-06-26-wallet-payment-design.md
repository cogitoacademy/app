# Phase 1: Wallet & Payment — Design Spec

**Date:** 2026-06-26  
**Source of truth:** `docs/planning-phase-0-backend-mvp/PLAN.md` §10 Phase 1  
**Scope:** Backend-only. Adds mark packages, payment records, wallet ledger pagination, knowledge-bank gate, and a stub payment provider + webhook. No notification table (Phase 3), no admin refund flow (Phase 5), no frontend wiring.

---

## 1. Goal

Enable students to purchase Marks packages via a stub payment provider. Purchases are recorded idempotently; successful webhooks credit the wallet ledger. The wallet can be queried, ledger paginated, and Knowledge Bank access is gated at 35 total Marks without deduction.

## 2. New DB Tables

### `markPackage`

| Column    | Type              | Notes                                  |
| --------- | ----------------- | -------------------------------------- |
| id        | uuid PK           | uuidPrimaryKey                         |
| code      | text unique       | starter / learner / explorer / pioneer |
| name      | text              | Display name                           |
| marks     | integer           | Marks amount                           |
| priceIdr  | integer           | Student-facing IDR price               |
| isActive  | bool default true | Soft-disable                           |
| createdAt | timestamp         | default now                            |
| updatedAt | timestamp         | default now + onUpdate                 |

Seed values (from PRD §FR-04):

- starter: 50 Marks / Rp 430,000
- learner: 120 Marks / Rp 990,000
- explorer: 200 Marks / Rp 1,570,000
- pioneer: 300 Marks / Rp 2,180,000

### `paymentRecord`

| Column            | Type                | Notes                                   |
| ----------------- | ------------------- | --------------------------------------- |
| id                | uuid PK             | uuidPrimaryKey                          |
| userId            | text FK→user        | cascade                                 |
| walletId          | text FK→wallet      | cascade                                 |
| packageId         | text FK→markPackage | nullable, set null                      |
| provider          | text                | CHECK stub/midtrans/xendit              |
| providerReference | text                | Provider order id                       |
| providerEventId   | text unique         | Webhook event id for idempotency        |
| amountIdr         | integer             |                                         |
| marks             | integer             |                                         |
| status            | text                | CHECK pending/succeeded/failed/refunded |
| receiptUrl        | text                | nullable                                |
| failureReason     | text                | nullable                                |
| createdAt         | timestamp           | default now                             |
| updatedAt         | timestamp           | default now + onUpdate                  |

Indexes: `userId`, `providerReference`, `status`.

### `refundRecord`

Schema-only in this phase. Used in Phase 5 admin override/refund flow.

| Column            | Type                  | Notes              |
| ----------------- | --------------------- | ------------------ |
| id                | uuid PK               |                    |
| paymentId         | text FK→paymentRecord | cascade            |
| walletId          | text FK→wallet        | cascade            |
| providerReference | text                  | nullable           |
| providerEventId   | text unique           |                    |
| amountIdr         | integer               |                    |
| marks             | integer               |                    |
| reason            | text                  |                    |
| actorId           | text FK→user          | nullable, set null |
| createdAt         | timestamp             | default now        |

## 3. Services

### `WalletService` extensions

- `listLedger(walletId, {cursor?, limit?, bookingId?, eventKey?})` — cursor pagination by `createdAt`, limit 20 default / 100 max.
- `knowledgeBankEligible(userId)` — returns `{eligible: totalBalance >= 35, balance, threshold: 35}`. **No ledger write** (DL-16).

### `PaymentService` (functional factory)

- `createIntent(userId, walletId, packageCode)` — validate active package → insert `paymentRecord(status='pending')` → call provider.createIntent → return `{paymentId, providerReference, checkoutUrl}`.
- `confirmFromWebhook({provider, providerReference, providerEventId, status, receiptUrl?, failureReason?})` — tx: find record by providerReference. If already `succeeded` or event id matches another record, return early (idempotent). Update status. If succeeded, credit wallet via `WalletPort.credit` with `eventKey='purchase.{paymentId}'` and `sourceReference=paymentId`.
- `getPurchase(paymentId, userId)` — own record or 404.

### `StubPaymentProvider` (PaymentPort implementation)

- `createIntent({paymentId, amountIdr, providerReference})` → `{checkoutUrl: '/webhooks/payments/stub/checkout?ref=...'}`.
- `verifyWebhook(rawBody, signature)` → verify HMAC-SHA256 against `PAYMENT_WEBHOOK_SECRET` header `x-webhook-signature`; parse `WebhookPayload`.

## 4. Routers

### `walletRouter` (protected)

- `get` → `POST /wallet/get` → wallet totals
- `listLedger` → `POST /wallet/ledger` → paginated entries
- `listPackages` → `POST /wallet/packages` → active packages
- `knowledgeBankEligible` → `POST /wallet/knowledge-bank`
- `competitionCalendarLink` → `POST /wallet/competition-calendar` → env URL

### `paymentRouter` (protected)

- `createPurchase` → `POST /payment/purchase` → `{packageCode}`
- `getPurchase` → `POST /payment/get` → `{paymentId}`

## 5. Webhook

`POST /webhooks/payments/:provider` in `apps/server/src/webhooks/payments.ts`.

- Public (no auth). Gate is HMAC signature.
- Reads raw body, header `x-webhook-signature`, forwards to provider verification.
- Calls `PaymentService.confirmFromWebhook`.
- Stub dev shortcut: `GET /webhooks/payments/stub/checkout?ref={providerReference}` auto-confirms (simulates provider redirect).

## 6. Env Vars

Added to `packages/env/server.ts`:

```
PAYMENT_PROVIDER=stub
PAYMENT_WEBHOOK_SECRET=<32+ chars>
COMPETITION_CALENDAR_URL=https://cogitoacademy.id/en/calendar
KNOWLEDGE_BANK_URL=https://cogitoacademy.id/knowledge-bank
```

## 7. Idempotency & Edge Cases

- Duplicate webhook with same `providerEventId` → `paymentRecord.providerEventId` unique constraint prevents double-credit. Service checks existing record and no-ops.
- Failed webhook → status='failed', no ledger entry.
- Package inactive or unknown → `NOT_FOUND`.
- Knowledge Bank check never writes ledger.
- No cashout/convert/withdraw methods anywhere (DL-24, TC-35).
- Provider calls happen outside transaction; only the result is written inside the transaction.

## 8. Tests

- **Unit:** `packages/api/src/tests/unit/stub-provider.test.ts` — HMAC sign/verify, invalid signature rejected.
- **Integration:** `packages/api/src/tests/integration/payment-flow.test.ts` — TC-03 (purchase + credit), TC-04 (duplicate idempotent), TC-04 neg (failed no-credit), TC-35 (no cashout methods).
- **Integration:** `packages/api/src/tests/integration/knowledge-bank.test.ts` — TC-32 (≥35 eligible, <35 not, no ledger entry).

## 9. Out of Scope

- Notification table + email (Phase 3)
- Admin refund/reconcile (Phase 5)
- Frontend BalancePage wiring (separate frontend phase)
- Real Xendit/Midtrans provider
- RefundRecord writes (table exists, unused)
