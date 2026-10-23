import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  auditLog,
  kolCommissionDecision,
  ledgerEntry,
  paymentRecord,
  referralCampaign,
  referralChoice,
  referralCode,
  referralSettingsRevision,
  user,
  wallet,
} from "@cogito-app/db/schema";
import { createAuditRepo } from "../../modules/audit/audit.repo";
import { createAuditService } from "../../modules/audit/audit.service";
import { createPaymentRepo } from "../../modules/payment/payment.repo";
import { createStubPaymentProvider } from "../../modules/payment/stub-payment.provider";
import { createPaymentService } from "../../modules/payment/payment.service";
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
    "KOL commission integration requires exact non-reset loopback 6769/cogito-test",
  );

const ownedUsers: string[] = [];
const ownedCampaignIds: string[] = [];
const ownedPaymentIds: string[] = [];
const signupAt = new Date("2100-01-15T00:00:00.000Z");
const day = (count: number) =>
  new Date(signupAt.getTime() + count * 24 * 60 * 60 * 1000);
let settingsId = "";
let adminId = "";

const walletService = createWalletService(createWalletRepo(), db);
const audit = createAuditService(createAuditRepo());
const referral = createReferralService({
  db,
  wallet: walletService,
  audit,
  clock: () => signupAt,
});
const payments = createPaymentService({
  db,
  wallet: walletService,
  repo: createPaymentRepo(db),
  provider: createStubPaymentProvider("test-only-unused"),
  providerName: "stub",
  audit,
  kolCommission: referral,
});

async function student(role: "student" | "admin" = "student") {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    name: "KOL commission fixture",
    email: `kol-commission-${id}@cogito.test`,
    role,
    emailVerified: true,
  });
  ownedUsers.push(id);
  return id;
}

async function createKolSignup(input: {
  name: string;
  flatAmountIdr?: number;
  percentBps: number;
  attributionWindowDays?: number;
}) {
  const campaign = await referral.createKolCampaign(adminId, {
    name: input.name,
    code: `K${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
    activationAt: new Date("2099-01-01T00:00:00.000Z"),
    expiresAt: new Date("2101-01-01T00:00:00.000Z"),
    attributionWindowDays: input.attributionWindowDays ?? 90,
    flatAmountIdr: input.flatAmountIdr ?? 0,
    percentBps: input.percentBps,
  });
  ownedCampaignIds.push(campaign.id);
  const userId = await student();
  await db.transaction((tx) =>
    referral.applyEmailSignupChoice(tx, { userId, code: campaign.code }),
  );
  return { userId, campaignId: campaign.id };
}

async function createPayment(input: {
  userId: string;
  amountIdr: number;
  providerSuccessAt?: Date;
}) {
  const userWallet = await walletService.getOrCreate(input.userId);
  const id = crypto.randomUUID();
  const providerReference = `stub:${input.userId}:kol:${id}`;
  await db.insert(paymentRecord).values({
    id,
    userId: input.userId,
    walletId: userWallet.id,
    provider: "stub",
    providerReference,
    amountIdr: input.amountIdr,
    marks: 1,
    status: "PENDING",
  });
  ownedPaymentIds.push(id);
  return {
    id,
    providerReference,
    amountIdr: input.amountIdr,
    providerSuccessAt: input.providerSuccessAt,
  };
}

async function confirmPayment(
  payment: Awaited<ReturnType<typeof createPayment>>,
  amountIdr: number,
) {
  return payments.confirmFromWebhook({
    provider: "stub",
    providerReference: payment.providerReference,
    providerEventId: `event:${payment.id}`,
    status: "SETTLED",
    amountIdr,
    currency: "IDR",
    providerSuccessAt: payment.providerSuccessAt,
  });
}

async function refundPayment(
  payment: Awaited<ReturnType<typeof createPayment>>,
  providerSuccessAt?: Date,
) {
  return payments.confirmFromWebhook({
    provider: "stub",
    providerReference: payment.providerReference,
    providerEventId: `refund:${payment.id}`,
    status: "REFUNDED",
    amountIdr: payment.amountIdr,
    currency: "IDR",
    ...(providerSuccessAt
      ? { providerSuccessAt, providerSuccessTimeStatus: "verified" as const }
      : { providerSuccessTimeStatus: "unavailable" as const }),
  });
}

/** A delayed success event is reconciled against the provider's current refund state. */
async function confirmDelayedSuccessAfterRefund(
  payment: Awaited<ReturnType<typeof createPayment>>,
  providerSuccessAt?: Date,
) {
  return payments.confirmFromWebhook({
    provider: "stub",
    providerReference: payment.providerReference,
    providerEventId: `event:${payment.id}`,
    status: "REFUNDED",
    amountIdr: payment.amountIdr,
    currency: "IDR",
    ...(providerSuccessAt
      ? { providerSuccessAt, providerSuccessTimeStatus: "verified" as const }
      : { providerSuccessTimeStatus: "unavailable" as const }),
  });
}

beforeAll(async () => {
  const [identity] = await db.execute(sql`SELECT current_database() AS name`);
  if (identity?.name !== "cogito-test")
    throw new Error("Database readback mismatch");
  adminId = await student("admin");
  const [latest] = await db
    .select({
      version: sql<number>`coalesce(max(${referralSettingsRevision.version}), 0)::int`,
    })
    .from(referralSettingsRevision);
  const [setting] = await db
    .insert(referralSettingsRevision)
    .values({
      version: (latest?.version ?? 0) + 1,
      welcomeMarks: 0,
      friendRewardMarks: 15,
      semesterCapMarks: 75,
      effectiveAt: new Date("2099-01-01T00:00:00.000Z"),
      changedBy: adminId,
      reason: "Run-owned KOL commission regression",
    })
    .returning({ id: referralSettingsRevision.id });
  settingsId = setting!.id;
});

afterAll(async () => {
  if (!ownedUsers.length) return;
  const decisions = await db
    .select({ id: kolCommissionDecision.id })
    .from(kolCommissionDecision)
    .where(inArray(kolCommissionDecision.referredUserId, ownedUsers));
  const auditTargets = [...ownedCampaignIds, ...decisions.map((row) => row.id)];
  if (auditTargets.length)
    await db.delete(auditLog).where(inArray(auditLog.targetId, auditTargets));
  await db
    .delete(kolCommissionDecision)
    .where(inArray(kolCommissionDecision.referredUserId, ownedUsers));
  if (ownedPaymentIds.length)
    await db
      .delete(paymentRecord)
      .where(inArray(paymentRecord.id, ownedPaymentIds));
  await db
    .delete(referralChoice)
    .where(inArray(referralChoice.userId, ownedUsers));
  if (ownedCampaignIds.length) {
    await db
      .delete(referralCode)
      .where(inArray(referralCode.campaignId, ownedCampaignIds));
    await db
      .delete(referralCampaign)
      .where(inArray(referralCampaign.id, ownedCampaignIds));
  }
  await db
    .delete(referralCode)
    .where(inArray(referralCode.referrerUserId, ownedUsers));
  if (settingsId)
    await db
      .delete(referralSettingsRevision)
      .where(eq(referralSettingsRevision.id, settingsId));
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

describe("first eligible KOL purchase commission", () => {
  test("late earlier success corrects the saved commission once and replays idempotently", async () => {
    const signup = await createKolSignup({
      name: "Saved 10 percent",
      percentBps: 1_000,
    });
    await db
      .update(referralCampaign)
      .set({ percentBps: 1_500, attributionWindowDays: 30 })
      .where(eq(referralCampaign.id, signup.campaignId));

    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });
    await confirmPayment(later, 504_440);
    const earlier = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
      providerSuccessAt: day(45),
    });
    await confirmPayment(earlier, 354_440);

    const [decision] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decision).toMatchObject({
      paymentId: earlier.id,
      providerSuccessAt: day(45),
      purchaseAmountIdrSnapshot: 350_000,
      flatAmountIdrSnapshot: 0,
      percentBpsSnapshot: 1_000,
      commissionAmountIdr: 35_000,
    });
    const earlierPayment = await db
      .select({ providerSuccessAt: paymentRecord.providerSuccessAt })
      .from(paymentRecord)
      .where(eq(paymentRecord.id, earlier.id));
    expect(earlierPayment[0]?.providerSuccessAt).toEqual(day(45));

    const correctionRows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, decision!.id),
          eq(auditLog.action, "kol_commission_earlier_purchase_correction"),
        ),
      );
    expect(correctionRows).toHaveLength(1);
    expect(correctionRows[0]?.beforeState).toMatchObject({
      paymentId: later.id,
      purchaseAmountIdr: 500_000,
      commissionAmountIdr: 50_000,
    });
    expect(correctionRows[0]?.afterState).toMatchObject({
      paymentId: earlier.id,
      purchaseAmountIdr: 350_000,
      commissionAmountIdr: 35_000,
    });

    await confirmPayment(earlier, 354_440);
    expect(
      await db
        .select()
        .from(kolCommissionDecision)
        .where(eq(kolCommissionDecision.referredUserId, signup.userId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, decision!.id),
            eq(auditLog.action, "kol_commission_earlier_purchase_correction"),
          ),
        ),
    ).toHaveLength(1);

    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(2);
  });

  test("A then B converges to the same earliest purchase; a refund never resets eligibility", async () => {
    const signup = await createKolSignup({
      name: "A before B",
      percentBps: 1_000,
    });
    const earlier = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
      providerSuccessAt: day(45),
    });
    await confirmPayment(earlier, 354_440);
    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });
    await confirmPayment(later, 504_440);

    await refundPayment(earlier, day(45));
    const another = await createPayment({
      userId: signup.userId,
      amountIdr: 800_000,
      providerSuccessAt: day(55),
    });
    await confirmPayment(another, 804_440);

    const decisions = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      paymentId: earlier.id,
      purchaseAmountIdrSnapshot: 350_000,
      commissionAmountIdr: 0,
    });
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, decisions[0]!.id),
            eq(auditLog.action, "kol_commission_earlier_purchase_correction"),
          ),
        ),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, decisions[0]!.id),
            eq(auditLog.action, "kol_commission_refund_invalidation"),
          ),
        ),
    ).toHaveLength(1);
    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(2);
    const moneyEvents = await db
      .select({ eventKey: ledgerEntry.eventKey })
      .from(ledgerEntry)
      .where(
        inArray(ledgerEntry.eventKey, [
          `purchase.${earlier.id}`,
          `refund.${earlier.id}.reverse`,
          `purchase.${later.id}`,
          `purchase.${another.id}`,
        ]),
      );
    expect(moneyEvents.map((event) => event.eventKey).sort()).toEqual(
      [
        `purchase.${earlier.id}`,
        `refund.${earlier.id}.reverse`,
        `purchase.${later.id}`,
        `purchase.${another.id}`,
      ].sort(),
    );
  });

  test("a late earlier refunded purchase corrects B's commission once", async () => {
    const signup = await createKolSignup({
      name: "Refund callback before success",
      percentBps: 1_000,
    });
    const earlierRefunded = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
    });
    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });

    // B arrives first; A's current provider status is already REFUNDED when
    // its delayed success callback reaches us.
    await confirmPayment(later, 504_440);
    await refundPayment(earlierRefunded, day(45));
    await confirmDelayedSuccessAfterRefund(earlierRefunded, day(45));
    await confirmDelayedSuccessAfterRefund(earlierRefunded, day(45));
    await confirmPayment(later, 504_440);

    const [decision] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decision).toMatchObject({
      paymentId: earlierRefunded.id,
      providerSuccessAt: day(45),
      providerSuccessTimeState: "verified",
      purchaseAmountIdrSnapshot: 350_000,
      commissionAmountIdr: 0,
    });

    const [refundedRow] = await db
      .select({ status: paymentRecord.status })
      .from(paymentRecord)
      .where(eq(paymentRecord.id, earlierRefunded.id));
    expect(refundedRow?.status).toBe("REFUNDED");
    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(1);

    const firstRefundAudit = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, decision!.id),
          eq(
            auditLog.action,
              "kol_commission_earlier_refunded_purchase_correction",
          ),
        ),
      );
    expect(firstRefundAudit).toHaveLength(1);
    expect(firstRefundAudit[0]?.beforeState).toMatchObject({
      paymentId: later.id,
      purchaseAmountIdr: 500_000,
      commissionAmountIdr: 50_000,
    });
    expect(firstRefundAudit[0]?.afterState).toMatchObject({
      paymentId: earlierRefunded.id,
      purchaseAmountIdr: 350_000,
      commissionAmountIdr: 0,
    });
  });

  test("refund A then success B keeps A's zero commission reservation and credits B once", async () => {
    const signup = await createKolSignup({
      name: "Refund A before paid B",
      percentBps: 1_000,
    });
    const earlierRefunded = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
    });
    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });

    await refundPayment(earlierRefunded, day(45));
    await confirmDelayedSuccessAfterRefund(earlierRefunded, day(45));
    await confirmDelayedSuccessAfterRefund(earlierRefunded, day(45));
    await confirmPayment(later, 504_440);
    await confirmPayment(later, 504_440);

    const [decision] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decision).toMatchObject({
      paymentId: earlierRefunded.id,
      providerSuccessAt: day(45),
      providerSuccessTimeState: "verified",
      commissionAmountIdr: 0,
    });
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, decision!.id),
            eq(
              auditLog.action,
              "kol_commission_first_refunded_purchase_reserved",
            ),
          ),
        ),
    ).toHaveLength(1);
    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(1);
    const moneyEvents = await db
      .select({ eventKey: ledgerEntry.eventKey })
      .from(ledgerEntry)
      .where(
        inArray(ledgerEntry.eventKey, [
          `purchase.${earlierRefunded.id}`,
          `refund.${earlierRefunded.id}.reverse`,
          `purchase.${later.id}`,
        ]),
      );
    expect(moneyEvents.map((event) => event.eventKey)).toEqual([
      `purchase.${later.id}`,
    ]);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, decision!.id),
            eq(
              auditLog.action,
              "kol_commission_earlier_refunded_purchase_correction",
            ),
          ),
        ),
    ).toHaveLength(0);
  });

  test("refund with unavailable provider time holds the KOL decision at zero", async () => {
    const signup = await createKolSignup({
      name: "Refund with unknown success time",
      percentBps: 1_000,
    });
    const earlierRefunded = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
    });
    await refundPayment(earlierRefunded);
    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });
    await confirmPayment(later, 504_440);

    const [decision] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decision).toMatchObject({
      paymentId: earlierRefunded.id,
      providerSuccessAt: null,
      providerSuccessTimeState: "unresolved",
      commissionAmountIdr: 0,
    });
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, decision!.id),
            eq(auditLog.action, "kol_commission_provider_time_unresolved"),
          ),
        ),
    ).toHaveLength(1);

    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(1);
    const moneyEvents = await db
      .select({ eventKey: ledgerEntry.eventKey })
      .from(ledgerEntry)
      .where(
        inArray(ledgerEntry.eventKey, [
          `purchase.${earlierRefunded.id}`,
          `refund.${earlierRefunded.id}.reverse`,
          `purchase.${later.id}`,
        ]),
      );
    expect(moneyEvents.map((event) => event.eventKey)).toEqual([
      `purchase.${later.id}`,
    ]);
  });

  test("a late success with unavailable time clears a provisional later commission", async () => {
    const signup = await createKolSignup({
      name: "Late unknown card time",
      percentBps: 1_000,
    });
    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });
    const earlierCard = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
    });

    await confirmPayment(later, 504_440);
    await confirmPayment(earlierCard, 354_440);
    await confirmPayment(earlierCard, 354_440);
    await confirmPayment(later, 504_440);

    const [decision] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decision).toMatchObject({
      paymentId: earlierCard.id,
      providerSuccessAt: null,
      providerSuccessTimeState: "unresolved",
      purchaseAmountIdrSnapshot: 350_000,
      commissionAmountIdr: 0,
    });
    const holdAudits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, decision!.id),
          eq(auditLog.action, "kol_commission_provider_time_unresolved"),
        ),
      );
    expect(holdAudits).toHaveLength(1);
    expect(holdAudits[0]?.beforeState).toMatchObject({
      paymentId: later.id,
      purchaseAmountIdr: 500_000,
      commissionAmountIdr: 50_000,
    });
    expect(holdAudits[0]?.afterState).toMatchObject({
      paymentId: earlierCard.id,
      paymentStatus: "SETTLED",
      providerSuccessTimeState: "unresolved",
      commissionAmountIdr: 0,
    });
    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(2);
  });

  test("holds a success with unknown provider time and resolves it without a second Marks credit", async () => {
    const signup = await createKolSignup({
      name: "Unresolved success time",
      percentBps: 1_000,
    });
    const earliest = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
    });
    await confirmPayment(earliest, 354_440);

    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });
    await confirmPayment(later, 504_440);

    const [held] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(held).toMatchObject({
      paymentId: earliest.id,
      providerSuccessAt: null,
      providerSuccessTimeState: "unresolved",
      commissionAmountIdr: 0,
    });

    // A later authenticated provider source can supply a precise timestamp.
    // The same settled-payment replay resolves the decision, not the wallet.
    earliest.providerSuccessAt = day(45);
    await confirmPayment(earliest, 354_440);
    const [resolved] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(resolved).toMatchObject({
      paymentId: earliest.id,
      providerSuccessAt: day(45),
      providerSuccessTimeState: "verified",
      commissionAmountIdr: 35_000,
    });
    const resolutionAudit = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, resolved!.id),
          eq(auditLog.action, "kol_commission_provider_time_resolved"),
        ),
      );
    expect(resolutionAudit).toHaveLength(1);
    expect(resolutionAudit[0]?.beforeState).toMatchObject({
      paymentId: earliest.id,
      providerSuccessTimeState: "unresolved",
      commissionAmountIdr: 0,
    });
    expect(resolutionAudit[0]?.afterState).toMatchObject({
      paymentId: earliest.id,
      providerSuccessTimeState: "verified",
      commissionAmountIdr: 35_000,
    });

    await confirmPayment(earliest, 354_440);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, resolved!.id),
            eq(auditLog.action, "kol_commission_provider_time_resolved"),
          ),
        ),
    ).toHaveLength(1);
    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(2);
  });

  test("resolving an unknown success at exact expiry preserves zero commission", async () => {
    const signup = await createKolSignup({
      name: "Unresolved at expiry",
      percentBps: 1_000,
    });
    const [choice] = await db
      .select()
      .from(referralChoice)
      .where(eq(referralChoice.userId, signup.userId));
    const payment = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
    });
    await confirmPayment(payment, 354_440);
    payment.providerSuccessAt = choice!.kolAttributionExpiresAt!;
    await confirmPayment(payment, 354_440);

    const [decision] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decision).toMatchObject({
      paymentId: payment.id,
      providerSuccessAt: choice!.kolAttributionExpiresAt,
      providerSuccessTimeState: "verified",
      commissionAmountIdr: 0,
    });
    const resolutionAudit = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, decision!.id),
          eq(auditLog.action, "kol_commission_provider_time_resolved"),
        ),
      );
    expect(resolutionAudit).toHaveLength(1);
    expect(resolutionAudit[0]?.afterState).toMatchObject({
      paymentId: payment.id,
      commissionAmountIdr: 0,
    });
    const [userWallet] = await db
      .select({ totalBalance: wallet.totalBalance })
      .from(wallet)
      .where(eq(wallet.userId, signup.userId));
    expect(userWallet?.totalBalance).toBe(1);
  });

  test("persists a zero commission and excludes purchases at the saved expiry", async () => {
    const zeroSignup = await createKolSignup({
      name: "Rounded zero",
      percentBps: 1,
    });
    const zeroPayment = await createPayment({
      userId: zeroSignup.userId,
      amountIdr: 1,
      providerSuccessAt: day(1),
    });
    await confirmPayment(zeroPayment, 1);
    const [zeroDecision] = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, zeroSignup.userId));
    expect(zeroDecision?.commissionAmountIdr).toBe(0);

    const expiredSignup = await createKolSignup({
      name: "Exact expiry",
      percentBps: 1_000,
    });
    const [choice] = await db
      .select()
      .from(referralChoice)
      .where(eq(referralChoice.userId, expiredSignup.userId));
    const expiredPayment = await createPayment({
      userId: expiredSignup.userId,
      amountIdr: 350_000,
      providerSuccessAt: choice!.kolAttributionExpiresAt!,
    });
    await confirmPayment(expiredPayment, 354_440);
    expect(
      await db
        .select()
        .from(kolCommissionDecision)
        .where(eq(kolCommissionDecision.referredUserId, expiredSignup.userId)),
    ).toHaveLength(0);
  });

  test("concurrent success callbacks serialize to the earliest provider timestamp", async () => {
    const signup = await createKolSignup({
      name: "Concurrent",
      percentBps: 1_000,
    });
    const later = await createPayment({
      userId: signup.userId,
      amountIdr: 500_000,
      providerSuccessAt: day(50),
    });
    const earlier = await createPayment({
      userId: signup.userId,
      amountIdr: 350_000,
      providerSuccessAt: day(45),
    });
    await Promise.all([
      confirmPayment(later, 504_440),
      confirmPayment(earlier, 354_440),
    ]);
    const decisions = await db
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, signup.userId));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      paymentId: earlier.id,
      commissionAmountIdr: 35_000,
    });
  });

  test("friend attribution cannot create a KOL commission", async () => {
    const referrerId = await student();
    const { code } = await referral.getMine(referrerId);
    const referredId = await student();
    await db.transaction((tx) =>
      referral.applyEmailSignupChoice(tx, { userId: referredId, code }),
    );
    const payment = await createPayment({
      userId: referredId,
      amountIdr: 350_000,
      providerSuccessAt: day(45),
    });
    await confirmPayment(payment, 354_440);
    expect(
      await db
        .select()
        .from(kolCommissionDecision)
        .where(eq(kolCommissionDecision.referredUserId, referredId)),
    ).toHaveLength(0);
  });
});
