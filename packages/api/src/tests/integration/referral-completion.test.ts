import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  friendRewardDecision,
  ledgerEntry,
  referralChoice,
  referralCode,
  referralSemesterUsage,
  referralSettingsRevision,
  user,
  wallet,
} from "@cogito-app/db/schema";
import { settlementTransaction } from "../../lib/settlement-transaction";
import { createReferralService } from "../../modules/referral/referral.service";
import { createWalletService } from "../../modules/wallet/wallet.service";
import { createWalletRepo } from "../../modules/wallet/wallet.repo";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.NODE_ENV !== "test" ||
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.port !== "6769" ||
  url.pathname !== "/cogito-test" ||
  url.search ||
  url.hash ||
  process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
  process.env.TEST_DATABASE_RESET_TARGET !== undefined
)
  throw new Error(
    "Referral integration requires exact non-reset loopback 6769/cogito-test",
  );

const ownedUsers: string[] = [];
let settingsId = "";
const extraSettingsIds: string[] = [];
const completedAt = new Date("2100-01-15T00:00:00Z");
const walletService = createWalletService(createWalletRepo(), db);
const referral = createReferralService({
  db,
  wallet: walletService,
  audit: { record: async () => {} },
  clock: () => completedAt,
});

async function student() {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    name: "Referral concurrency fixture",
    email: `referral-${id}@cogito.test`,
    role: "student",
    emailVerified: true,
  });
  ownedUsers.push(id);
  return id;
}
async function attribution(referrerId: string) {
  const id = await student();
  const mine = await referral.getMine(referrerId);
  await db.transaction((tx) =>
    referral.applyEmailSignupChoice(tx, { userId: id, code: mine.code }),
  );
  return id;
}
const completion = (studentId: string) => ({
  studentId,
  completionType: "group" as const,
  completionId: crypto.randomUUID(),
  completedAt,
  chargedMarks: 10,
});

beforeAll(async () => {
  const [identity] = await db.execute(sql`SELECT current_database() AS name`);
  if (identity?.name !== "cogito-test")
    throw new Error("Database readback mismatch");
  const owner = await student();
  const [latest] = await db
    .select({
      version: sql<number>`coalesce(max(${referralSettingsRevision.version}), 0)::int`,
    })
    .from(referralSettingsRevision);
  const [setting] = await db
    .insert(referralSettingsRevision)
    .values({
      version: (latest?.version ?? 0) + 1,
      welcomeMarks: 15,
      friendRewardMarks: 15,
      semesterCapMarks: 20,
      effectiveAt: new Date("2099-01-01T00:00:00Z"),
      changedBy: owner,
      reason: "Run-owned future referral regression",
    })
    .returning({ id: referralSettingsRevision.id });
  settingsId = setting!.id;
});

afterAll(async () => {
  if (!ownedUsers.length) return;
  await db
    .delete(friendRewardDecision)
    .where(inArray(friendRewardDecision.referredUserId, ownedUsers));
  await db
    .delete(referralChoice)
    .where(inArray(referralChoice.userId, ownedUsers));
  await db
    .delete(referralCode)
    .where(inArray(referralCode.referrerUserId, ownedUsers));
  await db
    .delete(referralSemesterUsage)
    .where(inArray(referralSemesterUsage.referrerUserId, ownedUsers));
  if (settingsId)
    await db
      .delete(referralSettingsRevision)
      .where(
        inArray(referralSettingsRevision.id, [settingsId, ...extraSettingsIds]),
      );
  const wallets = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(inArray(wallet.userId, ownedUsers));
  if (wallets.length)
    await db.delete(ledgerEntry).where(
      inArray(
        ledgerEntry.walletId,
        wallets.map((row) => row.id),
      ),
    );
  await db.delete(user).where(inArray(user.id, ownedUsers));
});

describe("referral completion concurrency and current roles", () => {
  test("saved signup terms survive settings changes and no code grants no welcome", async () => {
    const referrer = await student();
    const oldSignup = await attribution(referrer);
    expect((await walletService.getByUserId(db, oldSignup))?.totalBalance).toBe(
      15,
    );
    const [latest] = await db
      .select({
        version: sql<number>`max(${referralSettingsRevision.version})::int`,
      })
      .from(referralSettingsRevision);
    const [changed] = await db
      .insert(referralSettingsRevision)
      .values({
        version: latest!.version + 1,
        welcomeMarks: 20,
        friendRewardMarks: 20,
        semesterCapMarks: 20,
        effectiveAt: completedAt,
        changedBy: ownedUsers[0]!,
        reason: "Run-owned saved terms regression",
      })
      .returning({ id: referralSettingsRevision.id });
    extraSettingsIds.push(changed!.id);
    const newSignup = await attribution(referrer);
    expect((await walletService.getByUserId(db, newSignup))?.totalBalance).toBe(
      20,
    );
    const oldReward = await settlementTransaction(db, (tx) =>
      referral.recordEligibleFirstCompletion(tx, completion(oldSignup)),
    );
    expect(oldReward?.rewardMarksSnapshot).toBe(15);
    expect(oldReward?.creditedMarks).toBe(15);
    const newChoice = await db
      .select()
      .from(referralChoice)
      .where(eq(referralChoice.userId, newSignup));
    expect(newChoice[0]?.friendRewardMarksSnapshot).toBe(20);
    const noCode = await student();
    const none = await db.transaction((tx) =>
      referral.applyEmailSignupChoice(tx, { userId: noCode }),
    );
    expect(none?.kind).toBe("none");
    expect(none?.welcomeMarksSnapshot).toBe(0);
    expect(await walletService.getByUserId(db, noCode)).toBeNull();
    // Remove this test's revision so later cap tests use their 15-Mark terms.
    await db
      .delete(referralSettingsRevision)
      .where(eq(referralSettingsRevision.id, changed!.id));
  });

  test("does not issue a new reward after either participant stops being a student", async () => {
    const referrer = await student();
    const referred = await attribution(referrer);
    const input = completion(referred);
    await db.update(user).set({ role: "tutor" }).where(eq(user.id, referrer));
    expect(
      await settlementTransaction(db, (tx) =>
        referral.recordEligibleFirstCompletion(tx, input),
      ),
    ).toBeNull();
    await db.update(user).set({ role: "student" }).where(eq(user.id, referrer));
    await db.update(user).set({ role: "admin" }).where(eq(user.id, referred));
    expect(
      await settlementTransaction(db, (tx) =>
        referral.recordEligibleFirstCompletion(tx, input),
      ),
    ).toBeNull();
    expect(
      await db
        .select()
        .from(friendRewardDecision)
        .where(eq(friendRewardDecision.referredUserId, referred)),
    ).toHaveLength(0);
  });

  test("retries a real wallet/usage deadlock, caps both completions, and never replays zero credit", async () => {
    const referrer = await student();
    const a = await attribution(referrer);
    const b = await attribution(referrer);
    const referrerWallet = await walletService.getOrCreate(referrer);
    await db.insert(referralSemesterUsage).values({
      referrerUserId: referrer,
      semesterKey: "2100-H1",
      creditedMarks: 0,
    });
    let walletLocked!: () => void;
    let usageLocked!: () => void;
    const hasWallet = new Promise<void>((resolve) => {
      walletLocked = resolve;
    });
    const hasUsage = new Promise<void>((resolve) => {
      usageLocked = resolve;
    });
    let attempts = 0;
    const [first, second] = await Promise.all([
      settlementTransaction(db, async (tx) => {
        attempts += 1;
        await tx
          .select({ id: wallet.id })
          .from(wallet)
          .where(eq(wallet.id, referrerWallet.id))
          .for("update");
        walletLocked();
        await hasUsage;
        return referral.recordEligibleFirstCompletion(tx, completion(a));
      }),
      settlementTransaction(db, async (tx) => {
        attempts += 1;
        await hasWallet;
        await tx
          .select({ id: referralSemesterUsage.id })
          .from(referralSemesterUsage)
          .where(
            and(
              eq(referralSemesterUsage.referrerUserId, referrer),
              eq(referralSemesterUsage.semesterKey, "2100-H1"),
            ),
          )
          .for("update");
        usageLocked();
        return referral.recordEligibleFirstCompletion(tx, completion(b));
      }),
    ]);
    expect(attempts).toBeGreaterThan(2);
    expect(first!.creditedMarks + second!.creditedMarks).toBe(20);
    const after = await walletService.getByUserId(db, referrer);
    expect(after?.totalBalance).toBe(20);
    const c = await attribution(referrer);
    const zero = await settlementTransaction(db, (tx) =>
      referral.recordEligibleFirstCompletion(tx, completion(c)),
    );
    expect(zero?.creditedMarks).toBe(0);
    const replay = await settlementTransaction(db, (tx) =>
      referral.recordEligibleFirstCompletion(tx, {
        ...completion(c),
        completedAt: new Date("2100-07-15T00:00:00Z"),
      }),
    );
    expect(replay?.id).toBe(zero?.id);
    expect(replay?.creditedMarks).toBe(0);
    const decisions = await db
      .select()
      .from(friendRewardDecision)
      .where(eq(friendRewardDecision.referrerUserId, referrer));
    expect(decisions).toHaveLength(3);
    expect(decisions.reduce((sum, row) => sum + row.creditedMarks, 0)).toBe(20);
  });
});
