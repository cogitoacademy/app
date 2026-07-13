import { describe, expect, test, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { ledgerEntry } from "@cogito-app/db/schema";

import { resetDatabase } from "../helpers/test-client";
import { services } from "../../services";
import { createTestUser } from "../helpers/factories";
import { KNOWLEDGE_BANK_THRESHOLD } from "../../shared/constants";

describe("Knowledge Bank gate", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("TC-32: eligible when >=35 total, no ledger entry on check", async () => {
    const user = await createTestUser("kb1@cogito.test");
    const w = await services.wallet.getOrCreate(user.id);
    await services.wallet.credit(db, {
      walletId: w.id,
      actorType: "system",
      amount: KNOWLEDGE_BANK_THRESHOLD + 10,
      eventKey: "seed.kb",
      sourceReference: "seed",
      reason: "seed",
    });

    const result = await services.wallet.knowledgeBankEligible(user.id);
    expect(result.eligible).toBe(true);
    expect(result.threshold).toBe(KNOWLEDGE_BANK_THRESHOLD);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, w.id));
    expect(
      entries.filter((e) => e.eventKey.includes("knowledge_bank")).length,
    ).toBe(0);
  });

  test("ineligible when <35", async () => {
    const user = await createTestUser("kb2@cogito.test");
    await services.wallet.getOrCreate(user.id);

    const result = await services.wallet.knowledgeBankEligible(user.id);
    expect(result.eligible).toBe(false);
    expect(result.balance).toBe(0);
  });
});
