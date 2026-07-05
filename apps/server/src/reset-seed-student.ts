import { db } from "@cogito-app/db";
import { sql } from "drizzle-orm";
import { wallet } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";

const SEED_STUDENT_ID = "jFo1KOr9PsnbUiPTFkcdciDSqtXPDgfd";

async function reset() {
  const [seedWallet] = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(eq(wallet.userId, SEED_STUDENT_ID))
    .limit(1);
  const walletId = seedWallet?.id;

  if (walletId) {
    await db.execute(
      sql`delete from ledger_entry where wallet_id = ${walletId}`,
    );
  }

  await db.execute(
    sql`delete from booking_participant where user_id = ${SEED_STUDENT_ID}`,
  );
  await db.execute(
    sql`delete from booking where proposer_id = ${SEED_STUDENT_ID}`,
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
