import { db } from "@cogito-app/db";
import { user, wallet } from "@cogito-app/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  assertSeedStudentFixture,
  resolveSeedStudentResetTarget,
  SEED_STUDENT_FIXTURE,
} from "./reset-seed-student.guard";

export async function resetSeedStudent() {
  const target = resolveSeedStudentResetTarget(process.env);
  if (target === "skip") {
    console.log("Seed student reset skipped for reserved DB port 6767/6768.");
    return "skipped" as const;
  }
  if (target === "t05") {
    console.log(
      "Seed student reset skipped: T05 uses a fresh student identity per run.",
    );
    return "run-scoped" as const;
  }

  const result = await db.transaction(async (tx) => {
    const [seedStudent] = await tx
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      })
      .from(user)
      .where(eq(user.email, SEED_STUDENT_FIXTURE.email))
      .limit(1);

    if (!seedStudent) return "missing" as const;
    assertSeedStudentFixture(seedStudent);

    const [seedWallet] = await tx
      .select({ id: wallet.id })
      .from(wallet)
      .where(eq(wallet.userId, seedStudent.id))
      .limit(1);
    const walletId = seedWallet?.id;

    if (walletId) {
      await tx.execute(
        sql`delete from ledger_entry where wallet_id = ${walletId}`,
      );
    }

    await tx.execute(
      sql`delete from booking_participant where user_id = ${seedStudent.id}`,
    );
    await tx.execute(
      sql`delete from booking where proposer_id = ${seedStudent.id}`,
    );

    if (walletId) {
      await tx
        .update(wallet)
        .set({ totalBalance: 200, availableBalance: 200, heldBalance: 0 })
        .where(eq(wallet.id, walletId));
    }

    return "reset" as const;
  });

  console.log(
    result === "missing"
      ? "Seed student does not exist yet; nothing to reset"
      : "Reset seed student state",
  );
  return result;
}

if (import.meta.main) {
  resetSeedStudent().catch((err) => {
    console.error("Seed student reset failed:", err);
    process.exit(1);
  });
}
