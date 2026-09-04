import { db } from "@cogito-app/db";
import { sql } from "drizzle-orm";
import { user, wallet } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";

const SEED_STUDENT_EMAIL = "student.seed@cogitoacademy.id";

async function reset() {
  const [seedStudent] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, SEED_STUDENT_EMAIL))
    .limit(1);

  if (!seedStudent) {
    console.log("Seed student does not exist yet; nothing to reset");
    return;
  }

  const seedStudentId = seedStudent.id;
  const [seedWallet] = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(eq(wallet.userId, seedStudentId))
    .limit(1);
  const walletId = seedWallet?.id;

  if (walletId) {
    await db.execute(
      sql`delete from ledger_entry where wallet_id = ${walletId}`,
    );
  }

  await db.execute(
    sql`delete from booking_participant where user_id = ${seedStudentId}`,
  );
  await db.execute(
    sql`delete from booking where proposer_id = ${seedStudentId}`,
  );

  if (walletId) {
    await db
      .update(wallet)
      .set({ totalBalance: 200, availableBalance: 200, heldBalance: 0 })
      .where(eq(wallet.id, walletId));
  }

  console.log("Reset seed student state");
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
