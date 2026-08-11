# Xendit Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Xendit payment provider that creates real payment requests and verifies webhooks, aligning payment record statuses with Xendit's native lifecycle (PENDING/PAID/SETTLED/FAILED/EXPIRED).

**Architecture:** Provider port stays same shape. New `createXenditPaymentProvider` implements `PaymentProvider`. Service layer gets `providerName` to derive prefix + DB column. Migration swaps lowercase statuses to uppercase. Webhook route reads correct header per provider.

**Tech Stack:** TypeScript, Drizzle ORM, Elysia, Bun test, Xendit v3 API, `globalThis.fetch` (no SDK — raw HTTP).

---

## File Structure

| File                                                          | Responsibility                                            | Action |
| ------------------------------------------------------------- | --------------------------------------------------------- | ------ |
| `packages/api/src/shared/ports/payment.port.ts`               | `PaymentStatus` type + `WebhookPayload` shape             | Modify |
| `packages/api/src/modules/payment/xendit-payment.provider.ts` | Xendit HTTP calls + webhook token verification            | Create |
| `packages/api/src/modules/payment/stub-payment.provider.ts`   | Stub provider, uppercase statuses                         | Modify |
| `packages/api/src/modules/payment/payment.service.ts`         | Orchestrates provider + wallet credit, uppercase statuses | Modify |
| `packages/api/src/services.ts`                                | Provider selection switch                                 | Modify |
| `packages/env/src/server.ts`                                  | Xendit env vars                                           | Modify |
| `apps/server/src/webhooks/payments.ts`                        | Header selection per provider                             | Modify |
| `apps/server/.env`                                            | Xendit vars (commented)                                   | Modify |
| `packages/db/src/schema/payment-record.ts`                    | Uppercase status check + default                          | Modify |
| `packages/db/src/migrations/0006_xendit_statuses.sql`         | Status constraint + data migration                        | Create |
| `packages/api/src/tests/unit/xendit-payment.provider.test.ts` | Unit tests for Xendit provider                            | Create |
| `packages/api/src/tests/unit/stub-provider.test.ts`           | Update status assertions                                  | Modify |
| `packages/api/src/tests/integration/payment-flow.test.ts`     | Update stub tests + add Xendit describe block             | Modify |

---

## Task 1: Add `PaymentStatus` type to port

**Files:**

- Modify: `packages/api/src/shared/ports/payment.port.ts`

- [ ] **Step 1: Replace file contents with `PaymentStatus` type and updated `WebhookPayload`**

```ts
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

- [ ] **Step 2: Verify typecheck**

Run: `bunx tsc --noEmit -p packages/api/tsconfig.json`
Expected: errors in `stub-payment.provider.ts`, `payment.service.ts`, `payments.ts` (status string mismatches) — these will be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/shared/ports/payment.port.ts
git commit -m "feat(payment): add PaymentStatus type, update WebhookPayload"
```

---

## Task 2: Update schema status constraint + default

**Files:**

- Modify: `packages/db/src/schema/payment-record.ts:35,49-52`

- [ ] **Step 1: Update `status` default and check constraint**

In `packages/db/src/schema/payment-record.ts`, change line 35:

```ts
    status: text("status").notNull().default("PENDING"),
```

Change the `payment_status_check` constraint (lines 49-52) to:

```ts
    check(
      "payment_status_check",
      sql`${table.status} IN ('PENDING','PAID','SETTLED','FAILED','EXPIRED','REFUNDED')`,
    ),
```

Leave `payment_provider_check` unchanged.

- [ ] **Step 2: Verify typecheck**

Run: `bunx tsc --noEmit -p packages/db/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/payment-record.ts
git commit -m "feat(db): align payment status with Xendit native lifecycle"
```

---

## Task 3: Generate migration for status constraint

**Files:**

- Create: `packages/db/src/migrations/0006_xendit_statuses.sql` (via drizzle-kit)

- [ ] **Step 1: Generate migration**

Run: `cd packages/db && bun run db:generate`
Expected: creates `0006_*.sql` with ALTER constraint + default change

- [ ] **Step 2: Manually add data migration statements to the generated SQL file**

Append before the final `--> statement-breakpoint` (or at end if none):

```sql
--> statement-breakpoint
UPDATE "payment_record" SET status = 'PAID' WHERE status = 'succeeded';
--> statement-breakpoint
UPDATE "payment_record" SET status = 'FAILED' WHERE status = 'failed';
--> statement-breakpoint
UPDATE "payment_record" SET status = 'PENDING' WHERE status = 'pending';
--> statement-breakpoint
UPDATE "payment_record" SET status = 'REFUNDED' WHERE status = 'refunded';
```

- [ ] **Step 3: Apply migration**

Run: `cd packages/db && bun run db:migrate`
Expected: migration applied successfully

- [ ] **Step 4: Verify constraint**

Run: `psql $DATABASE_URL -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'payment_status_check';"`
Expected: shows `CHECK ((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PAID'::character varying, 'SETTLED'::character varying, 'FAILED'::character varying, 'EXPIRED'::character varying, 'REFUNDED'::character varying])::text[]))`

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/
git commit -m "feat(db): migration 0006 — status constraint + data migration"
```

---

## Task 4: Update stub provider to uppercase statuses

**Files:**

- Modify: `packages/api/src/modules/payment/stub-payment.provider.ts`

- [ ] **Step 1: Write failing test — update `stub-provider.test.ts`**

In `packages/api/src/tests/unit/stub-provider.test.ts`, replace the `verifyWebhook accepts valid HMAC signature` test body (lines 34-46):

```ts
test("verifyWebhook accepts valid HMAC signature", async () => {
  const body = JSON.stringify({
    providerReference: "stub-pay_123",
    providerEventId: "evt_1",
    status: "PAID",
  });
  const signature = await signBody(body, SECRET);

  const payload = await provider.verifyWebhook(body, signature);
  expect(payload.providerReference).toBe("stub-pay_123");
  expect(payload.providerEventId).toBe("evt_1");
  expect(payload.status).toBe("PAID");
});
```

Also update the `verifyWebhook rejects invalid signature` test body (lines 49-53):

```ts
const body = JSON.stringify({
  providerReference: "x",
  providerEventId: "y",
  status: "PAID",
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/api/src/tests/unit/stub-provider.test.ts`
Expected: FAIL — `status: "PAID"` doesn't match `WebhookPayload.status` type `"succeeded" | "failed"` yet (type error) OR runtime passes but type mismatch. If type error blocks run, proceed to Step 3.

- [ ] **Step 3: Update stub provider — no code change needed**

The stub provider returns `JSON.parse(rawBody) as WebhookPayload` — it just casts. Since `WebhookPayload.status` is now `PaymentStatus`, the cast works. No implementation change needed. The test should pass now.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/api/src/tests/unit/stub-provider.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/tests/unit/stub-provider.test.ts
git commit -m "test(payment): update stub provider tests for uppercase statuses"
```

---

## Task 5: Update payment service for uppercase statuses + provider name

**Files:**

- Modify: `packages/api/src/modules/payment/payment.service.ts`

- [ ] **Step 1: Write failing test — update `payment-flow.test.ts` stub tests**

In `packages/api/src/tests/integration/payment-flow.test.ts`, make these replacements:

**TC-03 (line 60):** `status: "succeeded"` → `status: "PAID"`

**TC-04 (lines 90, 96):** both `status: "succeeded"` → `status: "PAID"`

**TC-04 negative (line 122):** `status: "failed"` → `status: "FAILED"`
**TC-04 negative (line 134):** `expect(record[0]!.status).toBe("failed")` → `expect(record[0]!.status).toBe("FAILED")`

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/api/src/tests/integration/payment-flow.test.ts`
Expected: FAIL — service still checks `record.status === "succeeded"` etc.

- [ ] **Step 3: Update `ConfirmInput` type (lines 14-21)**

```ts
import type { PaymentStatus } from "../../shared/ports/payment.port";

export interface ConfirmInput {
  provider: string;
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
}
```

- [ ] **Step 4: Update `createPaymentService` deps to accept `providerName`**

Change the deps interface (line 25-29):

```ts
export function createPaymentService(deps: {
  db: DbType;
  wallet: WalletPort;
  provider: PaymentProvider;
  providerName: string;
}) {
  const { db, wallet, provider, providerName } = deps;
```

- [ ] **Step 5: Update `createIntent` to use `providerName` and uppercase status (lines 44-57)**

Replace lines 44-57:

```ts
const paymentId = crypto.randomUUID();
const providerReference = `${providerName}-${paymentId}`;

await db.insert(paymentRecord).values({
  id: paymentId,
  userId,
  walletId,
  packageId: pkg.id,
  provider: providerName,
  providerReference,
  amountIdr: pkg.priceIdr,
  marks: pkg.marks,
  status: "PENDING",
});
```

- [ ] **Step 6: Update `confirmFromWebhook` status checks (lines 78-79, 92, 96, 110-111, 113)**

Replace lines 78-79:

```ts
if (record.status === "PAID") return { status: "PAID" };
if (record.status === "FAILED") return { status: "FAILED" };
if (record.status === "SETTLED") return { status: "SETTLED" };
if (record.status === "EXPIRED") return { status: "EXPIRED" };
```

Replace lines 92-109 (the `if (input.status === "succeeded")` block):

```ts
if (input.status === "PAID" || input.status === "SETTLED") {
  const shouldCredit = record.status === "PENDING";
  await tx
    .update(paymentRecord)
    .set({
      status: input.status,
      providerEventId: input.providerEventId,
      receiptUrl: input.receiptUrl ?? null,
    })
    .where(eq(paymentRecord.id, record.id));

  if (shouldCredit) {
    await wallet.credit(tx, {
      walletId: record.walletId,
      actorType: "student",
      amount: record.marks,
      eventKey: `purchase.${record.id}`,
      sourceReference: record.id,
      reason: `Purchase: ${record.marks} Marks`,
    });
  }
} else {
  await tx
    .update(paymentRecord)
    .set({
      status: input.status,
      providerEventId: input.providerEventId,
      failureReason: input.failureReason ?? null,
    })
    .where(eq(paymentRecord.id, record.id));
}
```

- [ ] **Step 7: Update `services.ts` to pass `providerName`**

In `packages/api/src/services.ts`, change line 67-72:

```ts
const providerName = env.PAYMENT_PROVIDER;
const paymentProvider =
  providerName === "xendit"
    ? createXenditPaymentProvider({
        secretKey: env.XENDIT_SECRET_KEY!,
        webhookToken: env.XENDIT_WEBHOOK_TOKEN!,
        successRedirectUrl: env.XENDIT_SUCCESS_REDIRECT_URL!,
        failureRedirectUrl: env.XENDIT_FAILURE_REDIRECT_URL!,
      })
    : createStubPaymentProvider(env.PAYMENT_WEBHOOK_SECRET);
const payment = createPaymentService({
  db,
  wallet,
  provider: paymentProvider,
  providerName,
});
```

Add import at top (after line 13):

```ts
import { createXenditPaymentProvider } from "./modules/payment/xendit-payment.provider";
```

**Note:** `createXenditPaymentProvider` doesn't exist yet — typecheck will fail. That's expected, fixed in Task 6.

- [ ] **Step 8: Update webhook route — stub checkout shortcut (line 44)**

In `apps/server/src/webhooks/payments.ts`, change line 44:

```ts
      status: "PAID",
```

- [ ] **Step 9: Commit (will not typecheck yet — Xendit provider missing)**

```bash
git add packages/api/src/modules/payment/payment.service.ts packages/api/src/tests/integration/payment-flow.test.ts packages/api/src/services.ts apps/server/src/webhooks/payments.ts
git commit -m "feat(payment): uppercase statuses + providerName in service"
```

---

## Task 6: Create Xendit payment provider

**Files:**

- Create: `packages/api/src/modules/payment/xendit-payment.provider.ts`

- [ ] **Step 1: Write failing test — `xendit-payment.provider.test.ts`**

Create `packages/api/src/tests/unit/xendit-payment.provider.test.ts`:

```ts
import { expect, test, describe, mock, afterEach } from "bun:test";
import { createXenditPaymentProvider } from "../../modules/payment/xendit-payment.provider";

const opts = {
  secretKey: "xnd_development_test123",
  webhookToken: "wh_token_test_abc",
  successRedirectUrl: "http://localhost:3000/balance?status=success",
  failureRedirectUrl: "http://localhost:3000/balance?status=failed",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("XenditPaymentProvider", () => {
  const provider = createXenditPaymentProvider(opts);

  test("createIntent returns checkoutUrl from actions[0].url", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "pr_123",
              reference_id: "xendit-pay_123",
              status: "PENDING",
              actions: [{ url: "https://checkout.xendit.co/test" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as never;

    const result = await provider.createIntent({
      paymentId: "pay_123",
      amountIdr: 430000,
      providerReference: "xendit-pay_123",
    });
    expect(result.checkoutUrl).toBe("https://checkout.xendit.co/test");
  });

  test("createIntent throws on API error", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error_code: "API_ERROR",
            message: "Invalid amount",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay_456",
        amountIdr: 0,
        providerReference: "xendit-pay_456",
      }),
    ).rejects.toThrow("Xendit API error");
  });

  test("verifyWebhook accepts valid token and parses PAID", async () => {
    const body = JSON.stringify({
      event_id: "evt_001",
      data: {
        id: "pr_123",
        reference_id: "xendit-pay_123",
        status: "PAID",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerReference).toBe("xendit-pay_123");
    expect(payload.providerEventId).toBe("evt_001");
    expect(payload.status).toBe("PAID");
  });

  test("verifyWebhook parses SETTLED", async () => {
    const body = JSON.stringify({
      event_id: "evt_002",
      data: { reference_id: "xendit-pay_456", status: "SETTLED" },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("SETTLED");
  });

  test("verifyWebhook parses FAILED with failure_code", async () => {
    const body = JSON.stringify({
      event_id: "evt_003",
      data: {
        reference_id: "xendit-pay_789",
        status: "FAILED",
        failure_code: "DECLINED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("FAILED");
    expect(payload.failureReason).toBe("DECLINED");
  });

  test("verifyWebhook parses EXPIRED", async () => {
    const body = JSON.stringify({
      event_id: "evt_004",
      data: { reference_id: "xendit-pay_000", status: "EXPIRED" },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("EXPIRED");
  });

  test("verifyWebhook rejects invalid token", async () => {
    const body = JSON.stringify({
      event_id: "evt_005",
      data: { reference_id: "x", status: "PAID" },
    });

    await expect(provider.verifyWebhook(body, "wrong_token")).rejects.toThrow(
      "Invalid webhook token",
    );
  });

  test("verifyWebhook rejects unknown status", async () => {
    const body = JSON.stringify({
      event_id: "evt_006",
      data: { reference_id: "x", status: "UNKNOWN" },
    });

    await expect(
      provider.verifyWebhook(body, opts.webhookToken),
    ).rejects.toThrow("Unknown Xendit status");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/api/src/tests/unit/xendit-payment.provider.test.ts`
Expected: FAIL — module not found (`Cannot find module ... xendit-payment.provider`)

- [ ] **Step 3: Implement Xendit provider**

Create `packages/api/src/modules/payment/xendit-payment.provider.ts`:

```ts
import type {
  PaymentProvider,
  PaymentStatus,
  WebhookPayload,
} from "../../shared/ports/payment.port";

const XENDIT_API_BASE = "https://api.xendit.co/v3";

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

export function createXenditPaymentProvider(opts: {
  secretKey: string;
  webhookToken: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
}): PaymentProvider {
  const authHeader = `Basic ${Buffer.from(`${opts.secretKey}:`).toString("base64")}`;

  async function createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string }> {
    const res = await fetch(`${XENDIT_API_BASE}/payment_requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: authHeader,
      },
      body: JSON.stringify({
        reference_id: params.providerReference,
        currency: "IDR",
        amount: params.amountIdr,
        payment_method: {
          type: "EWALLET",
          ewallet: {
            channel_code: "ID_OVO",
          },
        },
        success_redirect_url: opts.successRedirectUrl,
        failure_redirect_url: opts.failureRedirectUrl,
        metadata: {
          paymentId: params.paymentId,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Xendit API error: ${res.status} ${err.error_code ?? res.statusText}`,
      );
    }

    const json = (await res.json()) as {
      data: {
        actions?: { url: string }[];
        payment_method?: { url?: string };
      };
    };

    const checkoutUrl =
      json.data.actions?.[0]?.url ?? json.data.payment_method?.url;

    if (!checkoutUrl) {
      throw new Error("Xendit API error: no checkout URL in response");
    }

    return { checkoutUrl };
  }

  async function verifyWebhook(
    rawBody: string,
    token: string,
  ): Promise<WebhookPayload> {
    if (token !== opts.webhookToken) {
      throw new Error("Invalid webhook token");
    }

    const body = JSON.parse(rawBody) as {
      event_id?: string;
      id?: string;
      data?: {
        id?: string;
        reference_id?: string;
        status: string;
        failure_code?: string;
        receipt_url?: string;
      };
    };

    const data = body.data ?? body;

    return {
      providerReference: data.reference_id ?? data.id ?? "",
      providerEventId: body.event_id ?? body.id ?? "",
      status: mapXenditStatus(data.status),
      failureReason: data.failure_code ?? null,
      receiptUrl: data.receipt_url ?? null,
    };
  }

  return { createIntent, verifyWebhook };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/api/src/tests/unit/xendit-payment.provider.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/payment/xendit-payment.provider.ts packages/api/src/tests/unit/xendit-payment.provider.test.ts
git commit -m "feat(payment): add Xendit payment provider"
```

---

## Task 7: Add Xendit env vars

**Files:**

- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/.env`

- [ ] **Step 1: Add env vars to schema**

In `packages/env/src/server.ts`, add after line 15 (`PAYMENT_WEBHOOK_SECRET`):

```ts
    XENDIT_SECRET_KEY: z.string().optional(),
    XENDIT_WEBHOOK_TOKEN: z.string().optional(),
    XENDIT_SUCCESS_REDIRECT_URL: z.string().url().optional(),
    XENDIT_FAILURE_REDIRECT_URL: z.string().url().optional(),
```

- [ ] **Step 2: Add commented Xendit vars to `.env`**

In `apps/server/.env`, append after the stub payment section:

```env

# Xendit (uncomment when PAYMENT_PROVIDER=xendit)
# XENDIT_SECRET_KEY=xnd_development_xxx
# XENDIT_WEBHOOK_TOKEN=wh_token_xxx
# XENDIT_SUCCESS_REDIRECT_URL=http://localhost:3000/balance?status=success
# XENDIT_FAILURE_REDIRECT_URL=http://localhost:3000/balance?status=failed
```

- [ ] **Step 3: Verify typecheck**

Run: `bunx tsc --noEmit -p packages/env/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/env/src/server.ts apps/server/.env
git commit -m "feat(env): add Xendit env vars"
```

---

## Task 8: Update webhook route for per-provider header

**Files:**

- Modify: `apps/server/src/webhooks/payments.ts`

- [ ] **Step 1: Update header selection in webhook POST handler**

In `apps/server/src/webhooks/payments.ts`, replace lines 7-9:

```ts
    async ({ request, body, params, set }: ElysiaContext) => {
      const provider = params.provider as string;
      const signature =
        provider === "xendit"
          ? request.headers.get("x-callback-token") ?? ""
          : request.headers.get("x-webhook-signature") ?? "";
      const rawBody = typeof body === "string" ? body : JSON.stringify(body);
```

- [ ] **Step 2: Verify typecheck**

Run: `bunx tsc --noEmit -p apps/server/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/webhooks/payments.ts
git commit -m "feat(webhooks): per-provider header selection"
```

---

## Task 9: Add Xendit integration tests

**Files:**

- Modify: `packages/api/src/tests/integration/payment-flow.test.ts`

- [ ] **Step 1: Add Xendit provider integration test block**

Append to `packages/api/src/tests/integration/payment-flow.test.ts` before the final `});`:

```ts
import { createXenditPaymentProvider } from "../../modules/payment/xendit-payment.provider";
import { createPaymentService } from "../../modules/payment/payment.service";
import { createWalletService } from "../../modules/wallet/wallet.service";
import { db as dbInstance } from "@cogito-app/db";

const xenditProvider = createXenditPaymentProvider({
  secretKey: "xnd_development_test",
  webhookToken: "wh_token_test",
  successRedirectUrl: "http://localhost:3000/balance?status=success",
  failureRedirectUrl: "http://localhost:3000/balance?status=failed",
});

const xenditWallet = createWalletService(dbInstance);
const xenditPayment = createPaymentService({
  db: dbInstance,
  wallet: xenditWallet,
  provider: xenditProvider,
  providerName: "xendit",
});

describe("PaymentService (Xendit provider)", () => {
  beforeEach(async () => {
    await truncate(
      "payment_record",
      "ledger_entry",
      "wallet",
      "mark_package",
      "refund_record",
      "user",
    );
    await seedPackages();
  });

  test("createIntent creates PENDING record with xendit- prefix", async () => {
    const user = await createTestUser("xc01@cogito.test");
    const walletRow = await xenditWallet.getOrCreate(user.id);

    const intent = await xenditPayment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );
    expect(intent.providerReference).toContain("xendit-");

    const [record] = await dbInstance
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(record!.provider).toBe("xendit");
    expect(record!.status).toBe("PENDING");
  });

  test("PAID webhook credits wallet", async () => {
    const user = await createTestUser("xc02@cogito.test");
    const walletRow = await xenditWallet.getOrCreate(user.id);

    const intent = await xenditPayment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await xenditPayment.confirmFromWebhook({
      provider: "xendit",
      providerReference: intent.providerReference,
      providerEventId: "evt_xc02",
      status: "PAID",
    });

    const w = await xenditWallet.getByUserId(dbInstance, user.id);
    expect(w!.totalBalance).toBe(50);

    const [record] = await dbInstance
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(record!.status).toBe("PAID");
  });

  test("SETTLED after PAID is idempotent — no double credit", async () => {
    const user = await createTestUser("xc03@cogito.test");
    const walletRow = await xenditWallet.getOrCreate(user.id);

    const intent = await xenditPayment.createIntent(
      user.id,
      walletRow.id,
      "learner",
    );

    await xenditPayment.confirmFromWebhook({
      provider: "xendit",
      providerReference: intent.providerReference,
      providerEventId: "evt_xc03a",
      status: "PAID",
    });
    await xenditPayment.confirmFromWebhook({
      provider: "xendit",
      providerReference: intent.providerReference,
      providerEventId: "evt_xc03b",
      status: "SETTLED",
    });

    const w = await xenditWallet.getByUserId(dbInstance, user.id);
    expect(w!.totalBalance).toBe(120);

    const [record] = await dbInstance
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(record!.status).toBe("SETTLED");
  });

  test("EXPIRED webhook does not credit", async () => {
    const user = await createTestUser("xc04@cogito.test");
    const walletRow = await xenditWallet.getOrCreate(user.id);

    const intent = await xenditPayment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await xenditPayment.confirmFromWebhook({
      provider: "xendit",
      providerReference: intent.providerReference,
      providerEventId: "evt_xc04",
      status: "EXPIRED",
    });

    const w = await xenditWallet.getByUserId(dbInstance, user.id);
    expect(w!.totalBalance).toBe(0);

    const [record] = await dbInstance
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(record!.status).toBe("EXPIRED");
  });

  test("FAILED webhook records failure reason", async () => {
    const user = await createTestUser("xc05@cogito.test");
    const walletRow = await xenditWallet.getOrCreate(user.id);

    const intent = await xenditPayment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await xenditPayment.confirmFromWebhook({
      provider: "xendit",
      providerReference: intent.providerReference,
      providerEventId: "evt_xc05",
      status: "FAILED",
      failureReason: "DECLINED",
    });

    const [record] = await dbInstance
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(record!.status).toBe("FAILED");
    expect(record!.failureReason).toBe("DECLINED");
  });

  test("duplicate PAID webhook is idempotent", async () => {
    const user = await createTestUser("xc06@cogito.test");
    const walletRow = await xenditWallet.getOrCreate(user.id);

    const intent = await xenditPayment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await xenditPayment.confirmFromWebhook({
      provider: "xendit",
      providerReference: intent.providerReference,
      providerEventId: "evt_xc06",
      status: "PAID",
    });
    await xenditPayment.confirmFromWebhook({
      provider: "xendit",
      providerReference: intent.providerReference,
      providerEventId: "evt_xc06",
      status: "PAID",
    });

    const w = await xenditWallet.getByUserId(dbInstance, user.id);
    expect(w!.totalBalance).toBe(50);

    const entries = await dbInstance
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, walletRow.id));
    expect(entries.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test packages/api/src/tests/integration/payment-flow.test.ts`
Expected: PASS (all stub + Xendit tests)

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/tests/integration/payment-flow.test.ts
git commit -m "test(payment): add Xendit provider integration tests"
```

---

## Task 10: Verify full typecheck + lint

- [ ] **Step 1: Run typecheck across workspace**

Run: `bunx tsc --noEmit`
Expected: PASS (no errors related to payment)

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 3: Run all payment tests**

Run: `bun test packages/api/src/tests/unit/xendit-payment.provider.test.ts packages/api/src/tests/unit/stub-provider.test.ts packages/api/src/tests/integration/payment-flow.test.ts`
Expected: PASS (all tests)

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: typecheck + lint fixes for Xendit integration"
```

---

## Task 11: Update CONTEXT.md

**Files:**

- Modify: `docs/CONTEXT.md`

- [ ] **Step 1: Update payment record status description**

Find the `### paymentRecord` section and update the status description:

```
- id (uuid PK), userId FK→user, walletId FK→wallet, packageId FK→markPackage nullable, provider (stub/midtrans/xendit), providerReference, providerEventId unique, amountIdr, marks, status (PENDING/PAID/SETTLED/FAILED/EXPIRED/REFUNDED), receiptUrl, failureReason, timestamps
```

- [ ] **Step 2: Update env exports in Packages table**

Find the `@cogito-app/env/server` row and append Xendit vars:

```
`XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_SUCCESS_REDIRECT_URL`, `XENDIT_FAILURE_REDIRECT_URL`
```

- [ ] **Step 3: Commit**

```bash
git add docs/CONTEXT.md
git commit -m "docs: update CONTEXT for Xendit integration"
```
