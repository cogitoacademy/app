# Phase 1: Wallet & Payment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add markPackage/paymentRecord/refundRecord tables, PaymentService (stub provider), walletRouter, paymentRouter + idempotent webhook. Backend-only, TDD.

**Architecture:** PaymentPort interface + StubPaymentProvider class. PaymentService = functional factory owning paymentRecord writes + ledger orchestration via WalletPort. Webhook = HMAC-SHA256 verified public Elysia route. RefundRecord schema-only (unused until Phase 5).

**Tech Stack:** Drizzle, oRPC, Elysia, Bun test, Web Crypto API (HMAC).

---

## File Structure

**Create:**

- `packages/db/src/schema/mark-package.ts` — seed table
- `packages/db/src/schema/payment-record.ts` — paymentRecord + refundRecord
- `packages/api/src/shared/ports/payment.port.ts` — PaymentPort interface
- `packages/api/src/modules/payment/payment.types.ts` — zod schemas
- `packages/api/src/modules/payment/payment.service.ts` — PaymentService factory
- `packages/api/src/modules/payment/stub-payment.provider.ts` — StubPaymentProvider class
- `packages/api/src/modules/payment/payment.router.ts` — createPurchase, getPurchase
- `packages/api/src/modules/wallet/wallet.types.ts` — zod schemas
- `packages/api/src/modules/wallet/wallet.router.ts` — get, listLedger, listPackages, knowledgeBankEligible, competitionCalendarLink
- `apps/server/src/webhooks/payments.ts` — Elysia webhook route
- `apps/server/src/seed-packages.ts` — markPackage seeder
- `packages/api/src/tests/integration/payment-flow.test.ts` — TC-03, TC-04, TC-35
- `packages/api/src/tests/integration/knowledge-bank.test.ts` — TC-32
- `packages/api/src/tests/unit/stub-provider.test.ts` — HMAC roundtrip

**Modify:**

- `packages/db/src/schema/index.ts`
- `packages/db/src/migrations/` — new migration `0001_wallet_payment.sql`
- `packages/api/src/services.ts`
- `packages/api/src/routers.ts`
- `packages/api/src/modules/wallet/wallet.service.ts`
- `packages/env/src/server.ts`
- `apps/server/src/index.ts`
- `apps/server/.env.example`
- `docs/CONTEXT.md`
- `docs/planning-phase-0-backend-mvp/PLAN.md`

---

## Task 1: markPackage + paymentRecord + refundRecord schemas

**Files:**

- Create: `packages/db/src/schema/mark-package.ts`
- Create: `packages/db/src/schema/payment-record.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create mark-package.ts**

```ts
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { uuidPrimaryKey } from "./auth";

export const markPackage = pgTable("mark_package", {
  id: uuidPrimaryKey,
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  marks: integer("marks").notNull(),
  priceIdr: integer("price_idr").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
```

- [ ] **Step 2: Create payment-record.ts**

```ts
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey, user } from "./auth";
import { wallet } from "./wallet";
import { markPackage } from "./mark-package";

export const paymentRecord = pgTable(
  "payment_record",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    packageId: text("package_id").references(() => markPackage.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    providerReference: text("provider_reference").notNull(),
    providerEventId: text("provider_event_id"),
    amountIdr: integer("amount_idr").notNull(),
    marks: integer("marks").notNull(),
    status: text("status").notNull().default("pending"),
    receiptUrl: text("receipt_url"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "payment_provider_check",
      sql`${table.provider} IN ('stub','midtrans','xendit')`,
    ),
    check(
      "payment_status_check",
      sql`${table.status} IN ('pending','succeeded','failed','refunded')`,
    ),
    uniqueIndex("payment_provider_event_id_idx").on(table.providerEventId),
    index("payment_userId_idx").on(table.userId),
    index("payment_providerReference_idx").on(table.providerReference),
    index("payment_status_idx").on(table.status),
  ],
);

export const refundRecord = pgTable(
  "refund_record",
  {
    id: uuidPrimaryKey,
    paymentId: text("payment_id")
      .notNull()
      .references(() => paymentRecord.id, { onDelete: "cascade" }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    providerReference: text("provider_reference"),
    providerEventId: text("provider_event_id"),
    amountIdr: integer("amount_idr").notNull(),
    marks: integer("marks").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("refund_provider_event_id_idx").on(table.providerEventId),
    index("refund_paymentId_idx").on(table.paymentId),
  ],
);

export const paymentRecordRelations = relations(
  paymentRecord,
  ({ one, many }) => ({
    user: one(user, { fields: [paymentRecord.userId], references: [user.id] }),
    wallet: one(wallet, {
      fields: [paymentRecord.walletId],
      references: [wallet.id],
    }),
    package: one(markPackage, {
      fields: [paymentRecord.packageId],
      references: [markPackage.id],
    }),
    refunds: many(refundRecord),
  }),
);

export const refundRecordRelations = relations(refundRecord, ({ one }) => ({
  payment: one(paymentRecord, {
    fields: [refundRecord.paymentId],
    references: [paymentRecord.id],
  }),
  wallet: one(wallet, {
    fields: [refundRecord.walletId],
    references: [wallet.id],
  }),
}));
```

- [ ] **Step 3: Append exports to schema/index.ts**

```ts
export * from "./mark-package";
export * from "./payment-record";
```

- [ ] **Step 4: Generate migration**

Run: `bun run db:generate`  
Expected: `packages/db/src/migrations/0001_*.sql` created for mark_package, payment_record, refund_record.

- [ ] **Step 5: Apply migration**

Run: `bun run db:migrate`  
Expected: applies clean.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/mark-package.ts packages/db/src/schema/payment-record.ts packages/db/src/schema/index.ts packages/db/src/migrations/
git commit -m "feat(db): add markPackage, paymentRecord, refundRecord schemas"
```

---

## Task 2: PaymentPort interface + payment types

**Files:**

- Create: `packages/api/src/shared/ports/payment.port.ts`
- Create: `packages/api/src/modules/payment/payment.types.ts`

- [ ] **Step 1: Create payment.port.ts**

```ts
export interface WebhookPayload {
  providerReference: string;
  providerEventId: string;
  status: "succeeded" | "failed";
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

- [ ] **Step 2: Create payment.types.ts**

```ts
import { z } from "@orpc/zod";

export const createPurchaseInput = z.object({
  packageCode: z.string().min(1),
});
export const createPurchaseOutput = z.object({
  paymentId: z.string(),
  providerReference: z.string(),
  checkoutUrl: z.string(),
});

export const getPurchaseInput = z.object({
  paymentId: z.string(),
});
export const getPurchaseOutput = z.object({
  id: z.string(),
  status: z.string(),
  provider: z.string(),
  providerReference: z.string(),
  amountIdr: z.number(),
  marks: z.number(),
  receiptUrl: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/shared/ports/payment.port.ts packages/api/src/modules/payment/payment.types.ts
git commit -m "feat(api): add PaymentPort and payment zod schemas"
```

---

## Task 3: StubPaymentProvider with HMAC (TDD)

**Files:**

- Create: `packages/api/src/tests/unit/stub-provider.test.ts`
- Create: `packages/api/src/modules/payment/stub-payment.provider.ts`

- [ ] **Step 1: Write failing test**

```ts
import { expect, test, describe } from "bun:test";
import { createStubPaymentProvider } from "../../modules/payment/stub-payment.provider";

const SECRET = "test-webhook-secret-32-chars-long-xxxxx";

describe("StubPaymentProvider", () => {
  const provider = createStubPaymentProvider(SECRET);

  test("createIntent returns checkoutUrl", async () => {
    const result = await provider.createIntent({
      paymentId: "pay_123",
      amountIdr: 430000,
      providerReference: "stub-pay_123",
    });
    expect(result.checkoutUrl).toContain("stub-pay_123");
  });

  test("verifyWebhook accepts valid HMAC signature", async () => {
    const body = JSON.stringify({
      providerReference: "stub-pay_123",
      providerEventId: "evt_1",
      status: "succeeded",
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body),
    );
    const signature = Buffer.from(sig).toString("hex");

    const payload = await provider.verifyWebhook(body, signature);
    expect(payload.providerReference).toBe("stub-pay_123");
    expect(payload.status).toBe("succeeded");
  });

  test("verifyWebhook rejects invalid signature", async () => {
    const body = JSON.stringify({
      providerReference: "x",
      providerEventId: "y",
      status: "succeeded",
    });
    await expect(provider.verifyWebhook(body, "deadbeef")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `bun test packages/api/src/tests/unit/stub-provider.test.ts`  
Expected: FAIL — module not found.

- [ ] **Step 3: Implement provider**

```ts
import type {
  PaymentProvider,
  WebhookPayload,
} from "../../shared/ports/payment.port";

export function createStubPaymentProvider(
  webhookSecret: string,
): PaymentProvider {
  async function createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string }> {
    return {
      checkoutUrl: `/webhooks/payments/stub/checkout?ref=${params.providerReference}`,
    };
  }

  async function verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<WebhookPayload> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(signature, "hex"),
      new TextEncoder().encode(rawBody),
    );
    if (!valid) throw new Error("Invalid webhook signature");
    return JSON.parse(rawBody) as WebhookPayload;
  }

  return { createIntent, verifyWebhook };
}
```

- [ ] **Step 4: Run test (expect pass)**

Run: `bun test packages/api/src/tests/unit/stub-provider.test.ts`  
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/payment/stub-payment.provider.ts packages/api/src/tests/unit/stub-provider.test.ts
git commit -m "feat(payment): add StubPaymentProvider with HMAC verification"
```

---

## Task 4: PaymentService + integration tests

**Files:**

- Create: `packages/api/src/modules/payment/payment.service.ts`
- Create: `packages/api/src/tests/integration/payment-flow.test.ts`
- Modify: `packages/api/src/services.ts`

- [ ] **Step 1: Write failing integration test**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import {
  wallet as walletSchema,
  ledgerEntry,
  paymentRecord,
  markPackage,
  user as userTable,
} from "@cogito-app/db/schema";
import { services } from "../../services";

async function truncate(tables: string[]) {
  for (const t of tables) {
    await db.execute(`TRUNCATE TABLE "${t}" CASCADE`);
  }
}

async function seedPackages() {
  await db
    .insert(markPackage)
    .values([
      { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 430000 },
      { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 990000 },
    ])
    .onConflictDoNothing({ target: markPackage.code });
}

async function createUser(email: string) {
  const [u] = await db
    .insert(userTable)
    .values({ name: "Test", email, emailVerified: true, role: "student" })
    .returning();
  return u!;
}

describe("PaymentService", () => {
  beforeEach(async () => {
    await truncate([
      "payment_record",
      "ledger_entry",
      "wallet",
      "mark_package",
      "user",
    ]);
    await seedPackages();
  });

  test("TC-03: createPurchase then webhook confirm credits wallet", async () => {
    const user = await createUser("student@test.com");
    const walletRow = await services.wallet.getOrCreate(user.id);

    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );
    expect(intent.providerReference).toContain("stub-");

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_tc03",
      status: "succeeded",
    });

    const w = await services.wallet.getByUserId(user.id);
    expect(w!.totalBalance).toBe(50);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, walletRow.id));
    expect(entries.length).toBe(1);
    expect(entries[0]!.entryType).toBe("credit");
    expect(entries[0]!.amount).toBe(50);
  });

  test("TC-04: duplicate webhook is idempotent", async () => {
    const user = await createUser("dup@test.com");
    const walletRow = await services.wallet.getOrCreate(user.id);
    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "learner",
    );

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_dup",
      status: "succeeded",
    });
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_dup",
      status: "succeeded",
    });

    const w = await services.wallet.getByUserId(user.id);
    expect(w!.totalBalance).toBe(120);
  });

  test("TC-04 negative: failed payment does not credit", async () => {
    const user = await createUser("fail@test.com");
    const walletRow = await services.wallet.getOrCreate(user.id);
    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_fail",
      status: "failed",
      failureReason: "declined",
    });

    const w = await services.wallet.getByUserId(user.id);
    expect(w!.totalBalance).toBe(0);
  });

  test("TC-35: no cashout/convert methods exist", () => {
    expect(Object.keys(services.payment)).not.toContain("cashout");
    expect(Object.keys(services.payment)).not.toContain("convertToRupiah");
    expect(Object.keys(services.payment)).not.toContain("withdraw");
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/payment-flow.test.ts`  
Expected: FAIL — services.payment undefined.

- [ ] **Step 3: Implement payment.service.ts**

```ts
import { eq } from "drizzle-orm";
import { paymentRecord, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { WalletPort } from "../../shared/ports/wallet.port";
import type { PaymentProvider } from "../../shared/ports/payment.port";
import { notFound } from "../../lib/errors";

export interface CreateIntentResult {
  paymentId: string;
  providerReference: string;
  checkoutUrl: string;
}

export interface ConfirmInput {
  provider: string;
  providerReference: string;
  providerEventId: string;
  status: "succeeded" | "failed";
  receiptUrl?: string | null;
  failureReason?: string | null;
}

export type PaymentService = ReturnType<typeof createPaymentService>;

export function createPaymentService(deps: {
  db: DbType;
  wallet: WalletPort;
  provider: PaymentProvider;
}) {
  const { db, wallet, provider } = deps;

  async function createIntent(
    userId: string,
    walletId: string,
    packageCode: string,
  ): Promise<CreateIntentResult> {
    const [pkg] = await db
      .select()
      .from(markPackage)
      .where(eq(markPackage.code, packageCode))
      .limit(1);
    if (!pkg || !pkg.isActive) throw notFound("Package not found");

    const paymentId = crypto.randomUUID();
    const providerReference = `stub-${paymentId}`;

    await db.insert(paymentRecord).values({
      id: paymentId,
      userId,
      walletId,
      packageId: pkg.id,
      provider: "stub",
      providerReference,
      amountIdr: pkg.priceIdr,
      marks: pkg.marks,
      status: "pending",
    });

    const intent = await provider.createIntent({
      paymentId,
      amountIdr: pkg.priceIdr,
      providerReference,
    });
    return { paymentId, providerReference, checkoutUrl: intent.checkoutUrl };
  }

  async function confirmFromWebhook(
    input: ConfirmInput,
  ): Promise<{ status: string }> {
    return db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.providerReference, input.providerReference))
        .limit(1);
      if (!record) throw notFound("Payment not found");
      if (record.status === "succeeded") return { status: "succeeded" };
      if (record.status === "failed") return { status: "failed" };

      if (input.providerEventId) {
        const [existing] = await tx
          .select()
          .from(paymentRecord)
          .where(eq(paymentRecord.providerEventId, input.providerEventId))
          .limit(1);
        if (existing && existing.id !== record.id)
          return { status: existing.status };
      }

      if (input.status === "succeeded") {
        await tx
          .update(paymentRecord)
          .set({
            status: "succeeded",
            providerEventId: input.providerEventId,
            receiptUrl: input.receiptUrl ?? null,
          })
          .where(eq(paymentRecord.id, record.id));

        await wallet.credit(tx, {
          walletId: record.walletId,
          entryType: "credit",
          actorType: "student",
          amount: record.marks,
          eventKey: `purchase.${record.id}`,
          sourceReference: record.id,
          reason: `Purchase: ${record.marks} Marks`,
        });
      } else {
        await tx
          .update(paymentRecord)
          .set({
            status: "failed",
            providerEventId: input.providerEventId,
            failureReason: input.failureReason ?? null,
          })
          .where(eq(paymentRecord.id, record.id));
      }

      return { status: input.status };
    });
  }

  async function getPurchase(paymentId: string, userId: string) {
    const [record] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, paymentId))
      .limit(1);
    if (!record || record.userId !== userId)
      throw notFound("Payment not found");
    return record;
  }

  return { createIntent, confirmFromWebhook, getPurchase };
}
```

- [ ] **Step 4: Wire into services.ts**

Add imports:

```ts
import { createPaymentService } from "./modules/payment/payment.service";
import { createStubPaymentProvider } from "./modules/payment/stub-payment.provider";
import { serverEnv } from "@cogito-app/env/server";
```

Add to `createServices` before `return`:

```ts
const paymentProvider = createStubPaymentProvider(
  serverEnv.PAYMENT_WEBHOOK_SECRET,
);
const payment = createPaymentService({ db, wallet, provider: paymentProvider });
```

Add `payment: PaymentService` to `ServiceRegistry` interface and `payment,` to return.

- [ ] **Step 5: Run test (expect pass)**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/payment-flow.test.ts`  
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/modules/payment/payment.service.ts packages/api/src/services.ts packages/api/src/tests/integration/payment-flow.test.ts
git commit -m "feat(payment): add PaymentService with idempotent webhook confirm"
```

---

## Task 5: WalletService extensions + walletRouter

**Files:**

- Modify: `packages/api/src/modules/wallet/wallet.service.ts`
- Create: `packages/api/src/modules/wallet/wallet.types.ts`
- Create: `packages/api/src/modules/wallet/wallet.router.ts`
- Create: `packages/api/src/tests/integration/knowledge-bank.test.ts`

- [ ] **Step 1: Write failing KB test**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import {
  wallet as walletSchema,
  ledgerEntry,
  user as userTable,
} from "@cogito-app/db/schema";
import { services } from "../../services";

async function truncate(tables: string[]) {
  for (const t of tables) await db.execute(`TRUNCATE TABLE "${t}" CASCADE`);
}

async function createUser(email: string) {
  const [u] = await db
    .insert(userTable)
    .values({ name: "Test", email, emailVerified: true, role: "student" })
    .returning();
  return u!;
}

describe("Knowledge Bank gate", () => {
  beforeEach(async () => {
    await truncate(["ledger_entry", "wallet", "user"]);
  });

  test("TC-32: eligible when >=35, no ledger entry on check", async () => {
    const user = await createUser("kb1@test.com");
    const w = await services.wallet.getOrCreate(user.id);
    await services.wallet.credit(w.id, {
      walletId: w.id,
      entryType: "credit",
      actorType: "system",
      amount: 40,
      eventKey: "seed.kb",
      sourceReference: "seed",
      reason: "seed",
    });

    const result = await services.wallet.knowledgeBankEligible(user.id);
    expect(result.eligible).toBe(true);
    expect(result.threshold).toBe(35);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, w.id));
    expect(
      entries.filter((e) => e.eventKey.includes("knowledge_bank")).length,
    ).toBe(0);
  });

  test("ineligible when <35", async () => {
    const user = await createUser("kb2@test.com");
    await services.wallet.getOrCreate(user.id);
    const result = await services.wallet.knowledgeBankEligible(user.id);
    expect(result.eligible).toBe(false);
    expect(result.balance).toBe(0);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/knowledge-bank.test.ts`  
Expected: FAIL — knowledgeBankEligible not found.

- [ ] **Step 3: Extend wallet.service.ts**

Add functions inside `createWalletService`:

```ts
async function listLedger(
  conn: DbOrTx,
  walletId: string,
  opts: {
    cursor?: string;
    limit?: number;
    bookingId?: string;
    eventKey?: string;
  },
) {
  const limit = Math.min(opts.limit ?? 20, 100);
  const rows = await conn
    .select()
    .from(ledgerEntry)
    .where(eq(ledgerEntry.walletId, walletId))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit ? rows[limit - 1]!.createdAt.toISOString() : null;
  return { items, nextCursor };
}

async function knowledgeBankEligible(userId: string) {
  const w = await getOrCreate(userId);
  return {
    eligible: w.totalBalance >= 35,
    balance: w.totalBalance,
    threshold: 35,
  };
}
```

Add to return object: `listLedger, knowledgeBankEligible`.

- [ ] **Step 4: Run test (expect pass)**

Expected: PASS (2 tests).

- [ ] **Step 5: Create wallet.types.ts**

```ts
import { z } from "@orpc/zod";

export const listLedgerInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  bookingId: z.string().optional(),
  eventKey: z.string().optional(),
});

export const walletOutput = z.object({
  totalBalance: z.number(),
  heldBalance: z.number(),
  availableBalance: z.number(),
});

export const knowledgeBankOutput = z.object({
  eligible: z.boolean(),
  balance: z.number(),
  threshold: z.number(),
});
```

- [ ] **Step 6: Create wallet.router.ts**

```ts
import { protectedProcedure } from "../../procedures";
import { serverEnv } from "@cogito-app/env/server";
import { listLedgerInput } from "./wallet.types";

export const walletRouter = {
  get: protectedProcedure
    .route({ method: "POST", path: "/wallet/get", tags: ["Wallet"], summary: "Get wallet" })
    .handler(async ({ context }) => {
      const w = await context.services.wallet.getOrCreate(context.session!.user.id);
      return {
        id: w.id,
        totalBalance: w.totalBalance,
        heldBalance: w.heldBalance,
        availableBalance: w.availableBalance,
      };
    }),

  listLedger: protectedProcedure
    .route({ method: "POST", path: "/wallet/ledger", tags: ["Wallet"], summary: "List ledger entries" })
    .input(listLedgerInput)
    .handler(async ({ context, input }) => {
      const w = await context.services.wallet.getOrCreate(context.session!.user.id);
      return context.services.wallet.listLedger(w.id, input);
    }),

  listPackages: protectedProcedure
    .route({ method: "POST", path: "/wallet/packages", tags: ["Wallet"], summary: "List mark packages" })
    .handler(async ({ context }) => {
      return context.db.select().from(context.db.schema.markPackage ?? context.db._.fullSchema.markPackage).where(...);
    }),

  knowledgeBankEligible: protectedProcedure
    .route({ method: "POST", path: "/wallet/knowledge-bank", tags: ["Wallet"], summary: "Knowledge Bank eligibility" })
    .handler(async ({ context }) => {
      return context.services.wallet.knowledgeBankEligible(context.session!.user.id);
    }),

  competitionCalendarLink: protectedProcedure
    .route({ method: "POST", path: "/wallet/competition-calendar", tags: ["Wallet"], summary: "Competition calendar link" })
    .handler(() => {
      return { url: serverEnv.COMPETITION_CALENDAR_URL };
    }),
};
```

_Note:_ listPackages implementation must import `markPackage` directly if `db` helper does not expose schema. Use `import { markPackage } from "@cogito-app/db/schema";` and `context.db.select().from(markPackage).where(eq(markPackage.isActive, true))`.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/modules/wallet/wallet.service.ts packages/api/src/modules/wallet/wallet.types.ts packages/api/src/modules/wallet/wallet.router.ts packages/api/src/tests/integration/knowledge-bank.test.ts
git commit -m "feat(wallet): add listLedger, KB gate, walletRouter"
```

---

## Task 6: paymentRouter + appRouter wiring

**Files:**

- Create: `packages/api/src/modules/payment/payment.router.ts`
- Modify: `packages/api/src/routers.ts`

- [ ] **Step 1: Create payment.router.ts**

```ts
import { protectedProcedure } from "../../procedures";
import { createPurchaseInput, getPurchaseInput } from "./payment.types";

export const paymentRouter = {
  createPurchase: protectedProcedure
    .route({
      method: "POST",
      path: "/payment/purchase",
      tags: ["Payments"],
      summary: "Create purchase intent",
    })
    .input(createPurchaseInput)
    .handler(async ({ context, input }) => {
      const w = await context.services.wallet.getOrCreate(
        context.session!.user.id,
      );
      return context.services.payment.createIntent(
        context.session!.user.id,
        w.id,
        input.packageCode,
      );
    }),

  getPurchase: protectedProcedure
    .route({
      method: "POST",
      path: "/payment/get",
      tags: ["Payments"],
      summary: "Get purchase status",
    })
    .input(getPurchaseInput)
    .handler(async ({ context, input }) => {
      return context.services.payment.getPurchase(
        input.paymentId,
        context.session!.user.id,
      );
    }),
};
```

- [ ] **Step 2: Wire routers.ts**

Add imports and entries in `appRouter`:

```ts
import { walletRouter } from "./modules/wallet/wallet.router";
import { paymentRouter } from "./modules/payment/payment.router";

export const appRouter = {
  ...
  wallet: walletRouter,
  payment: paymentRouter,
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/modules/payment/payment.router.ts packages/api/src/routers.ts
git commit -m "feat(api): wire wallet and payment routers"
```

---

## Task 7: Env vars + webhook route + seeder

**Files:**

- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/.env.example`
- Create: `apps/server/src/webhooks/payments.ts`
- Modify: `apps/server/src/index.ts`
- Create: `apps/server/src/seed-packages.ts`

- [ ] **Step 1: Add env vars to packages/env/src/server.ts**

Append to the server env schema:

```ts
PAYMENT_PROVIDER: z.enum(["stub", "midtrans", "xendit"]).default("stub"),
PAYMENT_WEBHOOK_SECRET: z.string().min(32),
COMPETITION_CALENDAR_URL: z.string().url().default("https://cogitoacademy.id/en/calendar"),
KNOWLEDGE_BANK_URL: z.string().url().default("https://cogitoacademy.id/knowledge-bank"),
```

- [ ] **Step 2: Update apps/server/.env.example**

Add documented entries.

- [ ] **Step 3: Create webhooks/payments.ts**

```ts
import type Elysia from "elysia";
import { services } from "@cogito-app/api";

export function paymentsWebhook(app: Elysia) {
  app.post(
    "/webhooks/payments/:provider",
    async ({ request, body, params, set }) => {
      const signature = request.headers.get("x-webhook-signature") ?? "";
      const rawBody = typeof body === "string" ? body : JSON.stringify(body);

      let payload;
      try {
        payload = await services.payment.provider.verifyWebhook(
          rawBody,
          signature,
        );
      } catch {
        set.status = 401;
        return { error: "Invalid signature" };
      }

      await services.payment.confirmFromWebhook({
        provider: params.provider,
        providerReference: payload.providerReference,
        providerEventId: payload.providerEventId,
        status: payload.status,
        receiptUrl: payload.receiptUrl,
        failureReason: payload.failureReason,
      });

      set.status = 200;
      return { ok: true };
    },
  );

  app.get("/webhooks/payments/stub/checkout", async ({ query, set }) => {
    const ref = query.ref as string;
    const eventId = "evt_" + crypto.randomUUID();
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: ref,
      providerEventId: eventId,
      status: "succeeded",
    });
    set.status = 200;
    return { ok: true, providerReference: ref, eventId };
  });

  return app;
}
```

Note: `services.payment.provider` must be exposed on the service object. Add it to PaymentService return if not already there: `provider`.

- [ ] **Step 4: Mount in apps/server/src/index.ts**

Import and call `paymentsWebhook(app)` before listen.

- [ ] **Step 5: Create seed-packages.ts**

```ts
import { db } from "@cogito-app/db";
import { markPackage } from "@cogito-app/db/schema";

const PACKAGES = [
  { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 430000 },
  { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 990000 },
  { code: "explorer", name: "Explorer Pack", marks: 200, priceIdr: 1570000 },
  { code: "pioneer", name: "Pioneer Pack", marks: 300, priceIdr: 2180000 },
];

export async function seedPackages() {
  for (const pkg of PACKAGES) {
    await db
      .insert(markPackage)
      .values(pkg)
      .onConflictDoNothing({ target: markPackage.code });
  }
  console.log("Seeded mark packages");
}

if (import.meta.main) await seedPackages();
```

- [ ] **Step 6: Run full test suite**

Run: `bun test --env-file apps/server/.env`  
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/env/src/server.ts apps/server/.env.example apps/server/src/webhooks/payments.ts apps/server/src/index.ts apps/server/src/seed-packages.ts
git commit -m "feat(server): add payment webhook, env vars, package seeder"
```

---

## Task 8: Documentation + final verification

- [ ] **Step 1: Update docs/CONTEXT.md**
  - Add markPackage/paymentRecord/refundRecord table summaries.
  - Add walletRouter/paymentRouter route table entries.
  - Add webhook endpoint.
  - Update env vars list.
  - Mark Phase 1 complete in `docs/planning-phase-0-backend-mvp/PLAN.md` §10.

- [ ] **Step 2: Run checks**

Run: `bun run check`  
Run: `bun run check-types`  
Expected: both green.

- [ ] **Step 3: Run full test suite**

Run: `bun test --env-file apps/server/.env`  
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/CONTEXT.md docs/planning-phase-0-backend-mvp/PLAN.md
git commit -m "docs: update Phase 1 context and status"
```

---

## Execution Options

1. **Subagent-Driven (recommended):** Dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution:** Execute tasks in this session with checkpoints.

Which? (User already said "gas" — proceed inline or dispatch.)
