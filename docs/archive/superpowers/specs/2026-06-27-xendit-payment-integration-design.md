# Xendit Payment Integration — Design Spec

**Date:** 2026-06-27
**Source of truth:** `docs/planning-phase-0-backend-mvp/PLAN.md` Phase 5
**Scope:** Backend-only. Adds a Xendit payment provider alongside the existing stub provider, aligns payment record statuses with Xendit's native lifecycle, and updates webhook verification for Xendit's callback token scheme. No frontend changes required.

---

## 1. Goal

Replace the stub payment provider with Xendit for production mark package purchases. Students create a purchase, get a real Xendit checkout URL, pay via e-wallet, and the webhook credits their wallet. The integration must be testable without real money using Xendit's development mode (`xnd_development_` keys + dashboard simulation).

## 2. Scope Boundaries

**In scope:**

- Xendit payment provider implementation (`createXenditPaymentProvider`)
- Payment record status enum migration to Xendit native statuses
- Webhook handler updates for Xendit callback token verification
- Provider selection via `PAYMENT_PROVIDER` env var
- New env vars for Xendit credentials
- Unit tests (provider mapping, mocked HTTP)
- Integration tests (service flow with Xendit statuses)
- Stub provider + existing tests updated to new status values

**Out of scope:**

- Refund flow (Phase 5 admin, `refundRecord` stays schema-only)
- Booking payment flow (uses wallet ledger, no provider)
- Frontend changes (checkout URL already handled by frontend)
- Midtrans provider (enum value preserved, no implementation)
- Recurring/subscription payments
- Xendit invoice API (using `payment_requests` v3 only)

## 3. Status Model

Replace lowercase generic statuses with Xendit native uppercase statuses.

### Payment Record Status

| Status     | Wallet action        | Trigger                                                            |
| ---------- | -------------------- | ------------------------------------------------------------------ |
| `PENDING`  | none                 | `createIntent` called, payment request created                     |
| `PAID`     | credit marks         | Xendit webhook `payment.paid`                                      |
| `SETTLED`  | no-op (already paid) | Xendit webhook `payment.settled` — funds settled, no double credit |
| `FAILED`   | mark failed          | Xendit webhook `payment.failed`                                    |
| `EXPIRED`  | mark failed          | Xendit webhook `payment.expired` — timeout                         |
| `REFUNDED` | future Phase 5       | Admin refund flow (not implemented yet)                            |

**Credit trigger: `PAID` only.** Digital goods (Marks) don't need to wait for settlement. `SETTLED` after `PAID` is a status update, wallet already credited.

**Terminal states:** `PAID`, `SETTLED`, `FAILED`, `EXPIRED`, `REFUNDED`. Once terminal, webhook is idempotent no-op.

### Migration

Schema migration drops the old `payment_status_check` constraint and replaces it:

```sql
-- Drop old constraint
ALTER TABLE "payment_record" DROP CONSTRAINT IF EXISTS "payment_status_check";

-- Add new constraint with uppercase Xendit-native statuses
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_status_check"
  CHECK (status IN ('PENDING','PAID','SETTLED','FAILED','EXPIRED','REFUNDED'));

-- Migrate existing rows (stub test data)
UPDATE "payment_record" SET status = 'PAID' WHERE status = 'succeeded';
UPDATE "payment_record" SET status = 'FAILED' WHERE status = 'failed';
UPDATE "payment_record" SET status = 'PENDING' WHERE status = 'pending';
UPDATE "payment_record" SET status = 'REFUNDED' WHERE status = 'refunded';
```

Default value changes from `'pending'` to `'PENDING'`.

## 4. Provider Port

The existing `PaymentProvider` port stays the same shape — `createIntent` + `verifyWebhook`. The `WebhookPayload.status` type changes to accept Xendit-native values.

```ts
// packages/api/src/shared/ports/payment.port.ts

export type PaymentStatus =
  "PENDING" | "PAID" | "SETTLED" | "FAILED" | "EXPIRED" | "REFUNDED";

export interface WebhookPayload {
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
}

export interface PaymentProvider {
  createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string }>;
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookPayload>;
}

export type PaymentPort = PaymentProvider;
```

The `signature` parameter for Xendit is the `x-callback-token` header value (plain token, not HMAC). Stub provider continues to use HMAC with `PAYMENT_WEBHOOK_SECRET`.

## 5. Xendit Provider Implementation

**File:** `packages/api/src/modules/payment/xendit-payment.provider.ts`

```ts
export function createXenditPaymentProvider(opts: {
  secretKey: string;
  webhookToken: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
}): PaymentProvider;
```

### `createIntent`

Calls `POST https://api.xendit.co/v3/payment_requests` with Basic auth (`secretKey:` base64 encoded).

Request body:

```json
{
  "reference_id": "xendit-{paymentId}",
  "currency": "IDR",
  "amount": 430000,
  "payment_method": {
    "type": "EWALLET",
    "ewallet": {
      "channel_code": "ID_OVO"
    }
  },
  "success_redirect_url": "https://app.cogitoacademy.id/balance?status=success",
  "failure_redirect_url": "https://app.cogitoacademy.id/balance?status=failed",
  "metadata": {
    "paymentId": "uuid",
    "userId": "text",
    "packageCode": "starter"
  }
}
```

Response parsing:

- `response.data.actions[0].url` — checkout URL (e-wallet deep link / QR)
- Fallback: `response.data.payment_method.url` if actions empty

Error handling:

- Non-2xx response → throw with Xendit error code + message
- Network failure → throw (Elysia returns 500 to client)

### `verifyWebhook`

Xendit v3 webhook verification uses **plain token comparison** via `X-Callback-Token` header, not HMAC.

```ts
async function verifyWebhook(
  rawBody: string,
  token: string,
): Promise<WebhookPayload> {
  if (token !== webhookToken) {
    throw new Error("Invalid webhook token");
  }

  const body = JSON.parse(rawBody);
  // Xendit webhook event structure
  const data = body.data ?? body;

  return {
    providerReference: data.reference_id ?? data.id,
    providerEventId: body.event_id ?? body.id,
    status: mapXenditStatus(data.status),
    failureReason: data.failure_code ?? null,
    receiptUrl: data.receipt_url ?? null,
  };
}

function mapXenditStatus(status: string): PaymentStatus {
  const map: Record<string, PaymentStatus> = {
    PENDING: "PENDING",
    PAID: "PAID",
    SETTLED: "SETTLED",
    FAILED: "FAILED",
    EXPIRED: "EXPIRED",
  };
  const mapped = map[status];
  if (!mapped) throw new Error(`Unknown Xendit status: ${status}`);
  return mapped;
}
```

## 6. Webhook Route Changes

**File:** `apps/server/src/webhooks/payments.ts`

The webhook handler currently reads `x-webhook-signature` header. Update to support both providers:

```ts
app.post(
  "/webhooks/payments/:provider",
  async ({ request, body, params, set }: ElysiaContext) => {
    const provider = params.provider as string;
    const signature =
      provider === "xendit"
        ? (request.headers.get("x-callback-token") ?? "")
        : (request.headers.get("x-webhook-signature") ?? "");
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);

    try {
      const payload = await services.payment.provider.verifyWebhook(
        rawBody,
        signature,
      );
      // ... rest unchanged
    } catch {
      set.status = 401;
      return { error: "Invalid webhook signature" };
    }
  },
  { parse: "text" },
);
```

The stub checkout shortcut route (`GET /webhooks/payments/stub/checkout`) stays unchanged.

## 7. Service Layer Changes

**File:** `packages/api/src/modules/payment/payment.service.ts`

### `createIntent`

- `providerReference` prefix: `stub-` for stub, `xendit-` for Xendit. Derive from `provider` parameter or a `providerPrefix` config.
- `provider` field in `paymentRecord` insert: use `env.PAYMENT_PROVIDER` value.
- Initial `status`: `'PENDING'` (was `'pending'`).

### `confirmFromWebhook`

Update status checks to uppercase:

- `record.status === 'PAID'` → return early (idempotent)
- `record.status === 'FAILED'` → return early (idempotent)
- `record.status === 'SETTLED'` → return early (idempotent)
- `record.status === 'EXPIRED'` → return early (idempotent)

Credit logic:

- `input.status === 'PAID'` → credit wallet, set status `PAID`
- `input.status === 'SETTLED'` → if record is `PAID`, update to `SETTLED` (no credit). If record is `PENDING`, credit + set `SETTLED` (edge case: missed PAID webhook).
- `input.status === 'FAILED'` → set status `FAILED`, record `failureReason`
- `input.status === 'EXPIRED'` → set status `EXPIRED`, record `failureReason`

### `ConfirmInput` type

```ts
export interface ConfirmInput {
  provider: string;
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
}
```

## 8. Provider Selection

**File:** `packages/api/src/services.ts`

```ts
function createPaymentProvider(env): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "xendit":
      return createXenditPaymentProvider({
        secretKey: env.XENDIT_SECRET_KEY,
        webhookToken: env.XENDIT_WEBHOOK_TOKEN,
        successRedirectUrl: env.XENDIT_SUCCESS_REDIRECT_URL,
        failureRedirectUrl: env.XENDIT_FAILURE_REDIRECT_URL,
      });
    case "stub":
    default:
      return createStubPaymentProvider(env.PAYMENT_WEBHOOK_SECRET);
  }
}
```

## 9. Env Vars

**File:** `packages/env/src/server.ts`

Add new vars (only required when `PAYMENT_PROVIDER=xendit`):

```ts
XENDIT_SECRET_KEY: z.string().optional(),
XENDIT_WEBHOOK_TOKEN: z.string().optional(),
XENDIT_SUCCESS_REDIRECT_URL: z.url().optional(),
XENDIT_FAILURE_REDIRECT_URL: z.url().optional(),
```

Validation: runtime check in provider factory — if `PAYMENT_PROVIDER=xendit` but any Xendit var is missing, throw clear error on startup.

**File:** `apps/server/.env`

```env
# Payment (stub default)
PAYMENT_PROVIDER=stub
PAYMENT_WEBHOOK_SECRET=b7XXyYcVKaXFmheeVaePF0bWnWmLC7h9-stub-secret

# Xendit (uncomment when PAYMENT_PROVIDER=xendit)
# XENDIT_SECRET_KEY=xnd_development_xxx
# XENDIT_WEBHOOK_TOKEN=wh_token_xxx
# XENDIT_SUCCESS_REDIRECT_URL=http://localhost:3000/balance?status=success
# XENDIT_FAILURE_REDIRECT_URL=http://localhost:3000/balance?status=failed
```

## 10. Stub Provider Updates

**File:** `packages/api/src/modules/payment/stub-payment.provider.ts`

- `verifyWebhook` return payload `status` type: now `PaymentStatus` (uppercase). Stub checkout shortcut returns `PAID`.
- No logic change beyond status value casing.

## 11. Testing Strategy

### Unit Tests — Provider Mapping

**File:** `packages/api/src/tests/unit/xendit-payment.provider.test.ts`

Mock `globalThis.fetch` to simulate Xendit API responses:

- `createIntent` success → returns checkout URL from `actions[0].url`
- `createIntent` API error → throws with Xendit error code
- `verifyWebhook` valid token → parses `PAID`/`SETTLED`/`FAILED`/`EXPIRED` correctly
- `verifyWebhook` invalid token → throws "Invalid webhook token"
- `verifyWebhook` unknown status → throws

### Integration Tests — Xendit Service Flow

**File:** `packages/api/src/tests/integration/payment-flow.test.ts` (extend existing)

New describe block "Xendit provider" with `services` overridden to use Xendit provider + test env vars:

- `createIntent` → record `PENDING`, `provider: "xendit"`, `providerReference: "xendit-*"`
- `confirmFromWebhook({ status: "PAID" })` → wallet credited, record `PAID`
- `confirmFromWebhook({ status: "SETTLED" })` after `PAID` → no double credit, record `SETTLED`
- `confirmFromWebhook({ status: "EXPIRED" })` → record `EXPIRED`, no credit
- `confirmFromWebhook({ status: "FAILED" })` → record `FAILED`, no credit
- Duplicate `PAID` webhook → idempotent (no double credit)

### Stub Provider Backward Compat

Update existing stub tests:

- `status: "succeeded"` → `status: "PAID"`
- `status: "failed"` → `status: "FAILED"`
- Assertions: `record.status === "PAID"` (was `"succeeded"`)
- `intent.providerReference` still contains `"stub-"`

### Manual Smoke Test (not automated)

1. Set `PAYMENT_PROVIDER=xendit`, `XENDIT_SECRET_KEY=xnd_development_xxx`
2. Start server + ngrok tunnel
3. Configure Xendit dashboard webhook URL → ngrok URL
4. Create purchase via API → get real Xendit checkout URL
5. Open checkout URL in browser → Xendit test payment page
6. Simulate payment via Xendit dashboard or `POST /v3/payment_requests/{id}/simulate`
7. Verify webhook hits server → wallet credited
8. Zero real money spent (development mode)

## 12. Files Changed

| File                                                          | Change                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/api/src/shared/ports/payment.port.ts`               | Add `PaymentStatus` type, update `WebhookPayload.status` |
| `packages/api/src/modules/payment/xendit-payment.provider.ts` | **New** — Xendit provider                                |
| `packages/api/src/modules/payment/stub-payment.provider.ts`   | Update status values to uppercase                        |
| `packages/api/src/modules/payment/payment.service.ts`         | Update status checks, credit logic, provider prefix      |
| `packages/api/src/modules/payment/payment.types.ts`           | No change (status is string in output schema)            |
| `packages/api/src/services.ts`                                | Provider selection switch                                |
| `packages/env/src/server.ts`                                  | Add Xendit env vars                                      |
| `apps/server/.env`                                            | Add Xendit vars (commented)                              |
| `apps/server/src/webhooks/payments.ts`                        | Header selection per provider                            |
| `packages/db/src/schema/payment-record.ts`                    | No schema change (constraint in migration)               |
| `packages/db/migrations/0006_xendit_statuses/`                | **New** migration — status constraint + data migration   |
| `packages/api/src/tests/unit/xendit-payment.provider.test.ts` | **New** — unit tests                                     |
| `packages/api/src/tests/integration/payment-flow.test.ts`     | Update stub tests + add Xendit describe block            |

## 13. Risks & Mitigations

| Risk                                          | Mitigation                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Missed `PAID` webhook, only `SETTLED` arrives | Credit on `SETTLED` if record still `PENDING` (edge case)               |
| Xendit webhook token leaked                   | Token in env var only, never logged                                     |
| Production key used in tests                  | Tests use mocked fetch, never real API                                  |
| Status migration breaks existing data         | Migration handles lowercase → uppercase mapping                         |
| Stub provider tests break                     | Update test assertions in same PR                                       |
| Business verification blocks live testing     | Xendit development mode (`xnd_development_`) works without verification |

## 14. Rollout Plan

1. Merge provider code + migration + tests (stub stays default)
2. Set `PAYMENT_PROVIDER=xendit` + Xendit env vars in staging
3. Smoke test with development key via ngrok
4. Once business verification complete, switch to production key
5. Monitor first real purchase
