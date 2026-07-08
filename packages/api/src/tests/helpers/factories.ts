import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { wallet, ledgerEntry, user } from "@cogito-app/db/schema";

export async function createTestUser(email: string, role = "student") {
  const [u] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: email.split("@")[0] ?? "Test",
      email,
      role,
    })
    .returning();
  return u!;
}

export async function createTestWallet(userId: string, totalBalance = 0) {
  const [w] = await db
    .insert(wallet)
    .values({
      userId,
      totalBalance,
      heldBalance: 0,
      availableBalance: totalBalance,
    })
    .returning();
  return w!;
}

export async function insertLedgerEntry(params: {
  walletId: string;
  entryType: string;
  actorType: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  beforeBalance: number;
  afterBalance: number;
}) {
  const [entry] = await db
    .insert(ledgerEntry)
    .values({
      walletId: params.walletId,
      entryType: params.entryType,
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference ?? null,
      beforeBalance: params.beforeBalance,
      afterBalance: params.afterBalance,
      balanceAfterWalletTotal: params.afterBalance,
      balanceAfterWalletHeld: 0,
    })
    .returning();
  return entry!;
}

export async function getWalletByUserId(userId: string) {
  const [w] = await db
    .select()
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1);
  return w ?? null;
}
