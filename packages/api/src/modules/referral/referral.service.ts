import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  friendRewardDecision,
  kolCommissionDecision,
  ledgerEntry,
  paymentRecord,
  referralCampaign,
  referralChoice,
  referralCode,
  referralSemesterUsage,
  referralSettingsRevision,
  user,
} from "@cogito-app/db/schema";
import type { AuditPort } from "../audit/audit.service";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { WalletPort } from "../wallet/wallet.service";
import { ReferralError } from "./referral.errors";
import {
  calculateFriendReward,
  calculateKolCommission,
  DEFAULT_REFERRAL_SETTINGS,
  generateFriendReferralCode,
  getReferralSemester,
  isKolCampaignActive,
  isKolPurchaseEligible,
  normalizeReferralCode,
} from "./referral.policy";
import type {
  CreateKolCampaignInput,
  ListKolCommissionsInput,
  UpdateReferralSettingsInput,
} from "./referral.types";
import {
  decodeKolCommissionCursor,
  encodeKolCommissionCursor,
} from "./referral.pagination";

const INVALID_CODE_MESSAGE =
  "That referral code is invalid or is no longer active.";

export type ReferralCompletionType =
  | "solo"
  | "group"
  | "series_child"
  | "cohort"
  | "masterclass";

export type EligibleReferralCompletion = {
  studentId: string;
  completionType: ReferralCompletionType;
  completionId: string;
  completedAt: Date;
  chargedMarks: number;
};

async function settingsAt(conn: DbOrTx, at: Date) {
  const [row] = await conn
    .select()
    .from(referralSettingsRevision)
    .where(lte(referralSettingsRevision.effectiveAt, at))
    .orderBy(
      desc(referralSettingsRevision.effectiveAt),
      desc(referralSettingsRevision.version),
    )
    .limit(1);
  return row ?? DEFAULT_REFERRAL_SETTINGS;
}

export function createReferralService(deps: {
  db: DbType;
  wallet: Pick<WalletPort, "getOrCreate" | "credit">;
  audit: AuditPort;
  clock?: () => Date;
}) {
  const { db, wallet, audit } = deps;
  const now = () => deps.clock?.() ?? new Date();

  async function saveChoice(
    conn: DbOrTx,
    input: { userId: string; code?: string | null; decidedAt: Date },
  ) {
    const [account] = await conn
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);
    if (!account)
      throw new ReferralError(
        "REFERRAL_STUDENT_ONLY",
        "Student account was not found.",
      );
    if (account.role !== "student") {
      if (input.code?.trim()) {
        throw new ReferralError(
          "REFERRAL_STUDENT_ONLY",
          "Referral codes are available to student accounts.",
        );
      }
      return null;
    }

    const [existingChoice] = await conn
      .select()
      .from(referralChoice)
      .where(eq(referralChoice.userId, input.userId))
      .limit(1);
    if (existingChoice) return existingChoice;

    const rawCode = input.code?.trim() ?? "";
    const code = rawCode ? normalizeReferralCode(rawCode) : null;
    if (rawCode && !code) {
      throw new ReferralError("INVALID_REFERRAL_CODE", INVALID_CODE_MESSAGE);
    }

    const config = await settingsAt(conn, input.decidedAt);
    let values: typeof referralChoice.$inferInsert;
    if (!code) {
      values = {
        userId: input.userId,
        kind: "none",
        codeId: null,
        codeSnapshot: null,
        referrerUserId: null,
        campaignId: null,
        welcomeMarksSnapshot: 0,
        friendRewardMarksSnapshot: null,
        kolFlatAmountIdrSnapshot: null,
        kolPercentBpsSnapshot: null,
        kolAttributionExpiresAt: null,
        settingsVersion: config.version,
        decidedAt: input.decidedAt,
      };
    } else {
      const [codeRow] = await conn
        .select()
        .from(referralCode)
        .where(eq(referralCode.code, code))
        .limit(1);
      if (!codeRow) {
        throw new ReferralError("INVALID_REFERRAL_CODE", INVALID_CODE_MESSAGE);
      }

      if (codeRow.kind === "friend" && codeRow.referrerUserId) {
        if (codeRow.referrerUserId === input.userId) {
          throw new ReferralError(
            "SELF_REFERRAL",
            "You cannot use your own referral code.",
          );
        }
        const [referrer] = await conn
          .select({ role: user.role })
          .from(user)
          .where(eq(user.id, codeRow.referrerUserId))
          .limit(1);
        if (!referrer || referrer.role !== "student") {
          throw new ReferralError(
            "INVALID_REFERRAL_CODE",
            INVALID_CODE_MESSAGE,
          );
        }
        values = {
          userId: input.userId,
          kind: "friend",
          codeId: codeRow.id,
          codeSnapshot: code,
          referrerUserId: codeRow.referrerUserId,
          campaignId: null,
          welcomeMarksSnapshot: config.welcomeMarks,
          friendRewardMarksSnapshot: config.friendRewardMarks,
          kolFlatAmountIdrSnapshot: null,
          kolPercentBpsSnapshot: null,
          kolAttributionExpiresAt: null,
          settingsVersion: config.version,
          decidedAt: input.decidedAt,
        };
      } else if (codeRow.kind === "kol" && codeRow.campaignId) {
        const [campaign] = await conn
          .select()
          .from(referralCampaign)
          .where(eq(referralCampaign.id, codeRow.campaignId))
          .limit(1);
        if (!campaign || !isKolCampaignActive(campaign, input.decidedAt)) {
          throw new ReferralError(
            "INVALID_REFERRAL_CODE",
            INVALID_CODE_MESSAGE,
          );
        }
        values = {
          userId: input.userId,
          kind: "kol",
          codeId: codeRow.id,
          codeSnapshot: code,
          referrerUserId: null,
          campaignId: campaign.id,
          welcomeMarksSnapshot: config.welcomeMarks,
          friendRewardMarksSnapshot: null,
          kolFlatAmountIdrSnapshot: campaign.flatAmountIdr,
          kolPercentBpsSnapshot: campaign.percentBps,
          kolAttributionExpiresAt: new Date(
            input.decidedAt.getTime() +
              campaign.attributionWindowDays * 24 * 60 * 60 * 1000,
          ),
          settingsVersion: config.version,
          decidedAt: input.decidedAt,
        };
      } else {
        throw new ReferralError("INVALID_REFERRAL_CODE", INVALID_CODE_MESSAGE);
      }
    }

    const [savedChoice] = await conn
      .insert(referralChoice)
      .values(values)
      .returning();
    if (!savedChoice) throw new Error("Referral choice was not saved.");

    if (savedChoice.welcomeMarksSnapshot > 0) {
      const studentWallet = await wallet.getOrCreate(input.userId, conn);
      const eventKey = `referral.signup.${input.userId}`;
      await wallet.credit(conn, {
        walletId: studentWallet.id,
        amount: savedChoice.welcomeMarksSnapshot,
        eventKey,
        sourceReference: savedChoice.id,
        actorType: "system",
        reason: "Referral signup welcome reward",
      });
      const [ledger] = await conn
        .select({ id: ledgerEntry.id })
        .from(ledgerEntry)
        .where(
          and(
            eq(ledgerEntry.walletId, studentWallet.id),
            eq(ledgerEntry.eventKey, eventKey),
            eq(ledgerEntry.sourceReference, savedChoice.id),
          ),
        )
        .limit(1);
      if (ledger) {
        await conn
          .update(referralChoice)
          .set({ welcomeLedgerEntryId: ledger.id })
          .where(eq(referralChoice.id, savedChoice.id));
        savedChoice.welcomeLedgerEntryId = ledger.id;
      }
    }
    return savedChoice;
  }

  async function applyEmailSignupChoice(
    conn: DbOrTx,
    input: { userId: string; code?: string | null },
  ) {
    return saveChoice(conn, { ...input, decidedAt: now() });
  }

  async function saveGoogleChoice(
    userId: string,
    input: { code: string | null },
  ) {
    return db.transaction(async (tx) => {
      const [account] = await tx
        .select({
          id: user.id,
          role: user.role,
          referralChoicePending: user.referralChoicePending,
        })
        .from(user)
        .where(eq(user.id, userId))
        .for("update");
      if (!account) {
        throw new ReferralError(
          "REFERRAL_STUDENT_ONLY",
          "Student account was not found.",
        );
      }

      const [existingChoice] = await tx
        .select()
        .from(referralChoice)
        .where(eq(referralChoice.userId, userId))
        .limit(1);
      if (existingChoice) return existingChoice;
      if (account.role !== "student") {
        throw new ReferralError(
          "REFERRAL_STUDENT_ONLY",
          "Referral codes are available to student accounts.",
        );
      }
      if (!account.referralChoicePending) {
        throw new ReferralError(
          "REFERRAL_CHOICE_REQUIRED",
          "This account is not waiting for a referral choice.",
        );
      }

      const savedChoice = await saveChoice(tx, {
        userId,
        code: input.code,
        decidedAt: now(),
      });
      if (!savedChoice) throw new Error("Referral choice was not saved.");
      await tx
        .update(user)
        .set({ referralChoicePending: false })
        .where(eq(user.id, userId));
      return savedChoice;
    });
  }

  async function ensureFriendCode(userId: string) {
    const [existing] = await db
      .select({ code: referralCode.code })
      .from(referralCode)
      .where(eq(referralCode.referrerUserId, userId))
      .limit(1);
    if (existing) return existing.code;

    for (let attempt = 0; attempt < 4; attempt++) {
      // Each retry must observe its insert before deciding whether a global
      // code collision requires another candidate.
      // eslint-disable-next-line no-await-in-loop
      await db
        .insert(referralCode)
        .values({
          code: generateFriendReferralCode(),
          kind: "friend",
          referrerUserId: userId,
          campaignId: null,
        })
        .onConflictDoNothing();
      // eslint-disable-next-line no-await-in-loop
      const [createdOrRaced] = await db
        .select({ code: referralCode.code })
        .from(referralCode)
        .where(eq(referralCode.referrerUserId, userId))
        .limit(1);
      if (createdOrRaced) return createdOrRaced.code;
    }
    throw new Error("Unable to allocate a friend referral code.");
  }

  async function getMine(userId: string) {
    const [account] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (account?.role !== "student") {
      throw new ReferralError(
        "REFERRAL_STUDENT_ONLY",
        "Referral details are available to student accounts.",
      );
    }

    const at = now();
    const semester = getReferralSemester(at);
    const [usage] = await db
      .select({ creditedMarks: referralSemesterUsage.creditedMarks })
      .from(referralSemesterUsage)
      .where(
        and(
          eq(referralSemesterUsage.referrerUserId, userId),
          eq(referralSemesterUsage.semesterKey, semester.key),
        ),
      )
      .limit(1);
    const config = await settingsAt(db, at);
    const earnedMarks = usage?.creditedMarks ?? 0;
    return {
      code: await ensureFriendCode(userId),
      settings: {
        welcomeMarks: config.welcomeMarks,
        friendRewardMarks: config.friendRewardMarks,
      },
      semester: {
        key: semester.key,
        startsAt: semester.startsAt,
        endsAt: semester.endsAt,
        earnedMarks,
        capMarks: config.semesterCapMarks,
        remainingMarks: Math.max(0, config.semesterCapMarks - earnedMarks),
      },
    };
  }

  async function getSettings() {
    return settingsAt(db, now());
  }

  async function updateSettings(
    adminId: string,
    input: UpdateReferralSettingsInput,
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('cogito-referral-settings', 0))`,
      );
      const at = now();
      const current = await settingsAt(tx, at);
      if (current.version !== input.expectedVersion) {
        throw new ReferralError(
          "REFERRAL_SETTINGS_CONFLICT",
          "Referral settings changed. Reload and try again.",
        );
      }
      const [revision] = await tx
        .insert(referralSettingsRevision)
        .values({
          version: current.version + 1,
          welcomeMarks: input.welcomeMarks,
          friendRewardMarks: input.friendRewardMarks,
          semesterCapMarks: input.semesterCapMarks,
          effectiveAt: at,
          changedBy: adminId,
          reason: input.reason,
        })
        .returning();
      if (!revision) throw new Error("Referral settings were not saved.");
      await audit.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "referral_settings_updated",
        targetId: revision.id,
        targetType: "referral_settings_revision",
        beforeState: current,
        afterState: revision,
        details: { reason: input.reason },
      });
      return revision;
    });
  }

  async function createKolCampaign(
    adminId: string,
    input: CreateKolCampaignInput,
  ) {
    const activatedAt = input.activationAt ?? now();
    if (input.expiresAt <= activatedAt) {
      throw new ReferralError(
        "REFERRAL_CAMPAIGN_INVALID",
        "Campaign expiry must be after activation.",
      );
    }
    try {
      return await db.transaction(async (tx) => {
        const [campaign] = await tx
          .insert(referralCampaign)
          .values({
            name: input.name,
            activationAt: activatedAt,
            expiresAt: input.expiresAt,
            attributionWindowDays: input.attributionWindowDays,
            flatAmountIdr: input.flatAmountIdr,
            percentBps: input.percentBps,
            createdBy: adminId,
          })
          .returning();
        if (!campaign) throw new Error("KOL campaign was not saved.");
        const [code] = await tx
          .insert(referralCode)
          .values({
            code: input.code,
            kind: "kol",
            referrerUserId: null,
            campaignId: campaign.id,
          })
          .returning();
        if (!code) throw new Error("KOL campaign code was not saved.");
        await audit.record({
          db: tx,
          actorId: adminId,
          actorType: "admin",
          action: "kol_referral_campaign_created",
          targetId: campaign.id,
          targetType: "referral_campaign",
          beforeState: {},
          afterState: { ...campaign, code: code.code },
          details: {},
        });
        return { ...campaign, code: code.code };
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new ReferralError(
          "REFERRAL_CODE_TAKEN",
          "That referral code is already in use.",
        );
      }
      throw error;
    }
  }

  async function listKolCampaigns() {
    return db
      .select({
        id: referralCampaign.id,
        name: referralCampaign.name,
        code: referralCode.code,
        activationAt: referralCampaign.activationAt,
        expiresAt: referralCampaign.expiresAt,
        attributionWindowDays: referralCampaign.attributionWindowDays,
        flatAmountIdr: referralCampaign.flatAmountIdr,
        percentBps: referralCampaign.percentBps,
        createdAt: referralCampaign.createdAt,
      })
      .from(referralCampaign)
      .innerJoin(referralCode, eq(referralCode.campaignId, referralCampaign.id))
      .orderBy(desc(referralCampaign.createdAt));
  }

  async function recordSuccessfulKolTopUp(
    conn: DbOrTx,
    input: {
      paymentId: string;
      providerSuccessTimeStatus?: "verified" | "unavailable";
    },
  ) {
    const [payment] = await conn
      .select({
        id: paymentRecord.id,
        userId: paymentRecord.userId,
        amountIdr: paymentRecord.amountIdr,
        status: paymentRecord.status,
        providerSuccessAt: paymentRecord.providerSuccessAt,
        providerRefundKind: paymentRecord.providerRefundKind,
        providerRefundAmountIdr: paymentRecord.providerRefundAmountIdr,
        providerRefundIdentity: paymentRecord.providerRefundIdentity,
      })
      .from(paymentRecord)
      .where(eq(paymentRecord.id, input.paymentId))
      .limit(1);
    if (
      !payment ||
      (payment.status !== "PAID" &&
        payment.status !== "SETTLED" &&
        payment.status !== "REFUNDED" &&
        payment.providerRefundKind !== "partial")
    ) {
      return null;
    }

    // Serialize successful payments for this attribution before choosing the
    // earliest provider success. The unique decision index is the backstop.
    const [choice] = await conn
      .select()
      .from(referralChoice)
      .where(eq(referralChoice.userId, payment.userId))
      .for("update");
    if (
      !choice ||
      choice.kind !== "kol" ||
      !choice.campaignId ||
      !choice.kolAttributionExpiresAt
    ) {
      return null;
    }

    const [account] = await conn
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.id, payment.userId))
      .for("share");
    if (!account || account.role !== "student") return null;

    const providerSuccessAt =
      payment.providerSuccessAt instanceof Date &&
      Number.isFinite(payment.providerSuccessAt.getTime())
        ? payment.providerSuccessAt
        : null;
    if (
      !providerSuccessAt &&
      input.providerSuccessTimeStatus !== "unavailable"
    ) {
      throw new Error(
        "An unresolved KOL purchase must be explicitly marked as missing provider time.",
      );
    }

    const [existing] = await conn
      .select()
      .from(kolCommissionDecision)
      .where(eq(kolCommissionDecision.referredUserId, payment.userId))
      .for("update");

    const [unresolvedPayment] = await conn
      .select({
        id: paymentRecord.id,
        amountIdr: paymentRecord.amountIdr,
        status: paymentRecord.status,
        providerRefundKind: paymentRecord.providerRefundKind,
        providerRefundAmountIdr: paymentRecord.providerRefundAmountIdr,
        providerRefundIdentity: paymentRecord.providerRefundIdentity,
      })
      .from(paymentRecord)
      .where(
        and(
          eq(paymentRecord.userId, payment.userId),
          or(
            inArray(paymentRecord.status, ["PAID", "SETTLED", "REFUNDED"]),
            eq(paymentRecord.providerRefundKind, "partial"),
          ),
          isNull(paymentRecord.providerSuccessAt),
        ),
      )
      .orderBy(asc(paymentRecord.id))
      .limit(1);

    const termsSnapshot = {
      flatAmountIdrSnapshot: choice.kolFlatAmountIdrSnapshot ?? 0,
      percentBpsSnapshot: choice.kolPercentBpsSnapshot ?? 0,
    };

    if (unresolvedPayment) {
      const afterState = {
        paymentId: unresolvedPayment.id,
        providerSuccessAt: null,
        providerSuccessTimeState: "unresolved" as const,
        purchaseAmountIdr: unresolvedPayment.amountIdr,
        paymentStatus: unresolvedPayment.status,
        refundReconciliationState:
          unresolvedPayment.providerRefundKind === "partial"
            ? ("partial_refund" as const)
            : ("none" as const),
        providerRefundAmountIdr:
          unresolvedPayment.providerRefundAmountIdr ?? null,
        providerRefundIdentity:
          unresolvedPayment.providerRefundIdentity ?? null,
        commissionAmountIdr: 0,
      };
      const refundReconciliationState = afterState.refundReconciliationState;
      if (existing) {
        const changed =
          existing.paymentId !== unresolvedPayment.id ||
          existing.providerSuccessTimeState !== "unresolved" ||
          existing.purchaseAmountIdrSnapshot !== unresolvedPayment.amountIdr ||
          existing.paymentStatusSnapshot !== unresolvedPayment.status ||
          existing.refundReconciliationState !== refundReconciliationState ||
          existing.providerRefundAmountIdrSnapshot !==
            afterState.providerRefundAmountIdr ||
          existing.providerRefundIdentitySnapshot !==
            afterState.providerRefundIdentity ||
          existing.commissionAmountIdr !== 0;
        if (!changed) return existing;
        const [held] = await conn
          .update(kolCommissionDecision)
          .set({
            paymentId: unresolvedPayment.id,
            providerSuccessAt: null,
            providerSuccessTimeState: "unresolved",
            paymentStatusSnapshot: unresolvedPayment.status,
            refundReconciliationState,
            providerRefundAmountIdrSnapshot:
              unresolvedPayment.providerRefundAmountIdr ?? null,
            providerRefundIdentitySnapshot:
              unresolvedPayment.providerRefundIdentity ?? null,
            purchaseAmountIdrSnapshot: unresolvedPayment.amountIdr,
            ...termsSnapshot,
            commissionAmountIdr: 0,
            updatedAt: now(),
          })
          .where(eq(kolCommissionDecision.id, existing.id))
          .returning();
        if (!held) throw new Error("KOL commission hold was not saved.");
        const action =
          existing.paymentStatusSnapshot !== "REFUNDED" &&
          unresolvedPayment.status === "REFUNDED"
            ? "kol_commission_refund_invalidation"
            : refundReconciliationState === "partial_refund"
              ? "kol_commission_partial_refund_reconciliation"
              : "kol_commission_provider_time_unresolved";
        const reason =
          action === "kol_commission_refund_invalidation"
            ? "A full refund changed the reserved first purchase; its zero commission and first-event reservation were audited."
            : action === "kol_commission_partial_refund_reconciliation"
              ? "A partial refund requires manual reconciliation; the historical commission remains zero while provider time is unresolved."
              : "Provider confirms a successful or refunded purchase but exposes no authoritative success time; commission is held pending ordering evidence.";
        await audit.record({
          db: conn,
          actorId: null,
          actorType: "system",
          action,
          targetId: existing.id,
          targetType: "kol_commission_decision",
          beforeState: {
            paymentId: existing.paymentId,
            providerSuccessAt: existing.providerSuccessAt,
            providerSuccessTimeState: existing.providerSuccessTimeState,
            purchaseAmountIdr: existing.purchaseAmountIdrSnapshot,
            paymentStatus: existing.paymentStatusSnapshot,
            refundReconciliationState: existing.refundReconciliationState,
            providerRefundAmountIdr: existing.providerRefundAmountIdrSnapshot,
            providerRefundIdentity: existing.providerRefundIdentitySnapshot,
            commissionAmountIdr: existing.commissionAmountIdr,
          },
          afterState,
          details: { reason },
        });
        return held;
      }
      const [held] = await conn
        .insert(kolCommissionDecision)
        .values({
          referredUserId: payment.userId,
          choiceId: choice.id,
          paymentId: unresolvedPayment.id,
          providerSuccessAt: null,
          providerSuccessTimeState: "unresolved",
          paymentStatusSnapshot: unresolvedPayment.status,
          refundReconciliationState,
          providerRefundAmountIdrSnapshot:
            unresolvedPayment.providerRefundAmountIdr ?? null,
          providerRefundIdentitySnapshot:
            unresolvedPayment.providerRefundIdentity ?? null,
          purchaseAmountIdrSnapshot: unresolvedPayment.amountIdr,
          ...termsSnapshot,
          commissionAmountIdr: 0,
        })
        .returning();
      if (!held) throw new Error("KOL commission hold was not saved.");
      await audit.record({
        db: conn,
        actorId: null,
        actorType: "system",
        action: "kol_commission_provider_time_unresolved",
        targetId: held.id,
        targetType: "kol_commission_decision",
        afterState,
        details: {
          choiceId: choice.id,
          reason:
            "Provider confirms a successful or refunded purchase but exposes no authoritative success time; commission is held pending ordering evidence.",
        },
      });
      return held;
    }

    const [earliestEligible] = await conn
      .select({
        id: paymentRecord.id,
        amountIdr: paymentRecord.amountIdr,
        status: paymentRecord.status,
        providerRefundKind: paymentRecord.providerRefundKind,
        providerRefundAmountIdr: paymentRecord.providerRefundAmountIdr,
        providerRefundIdentity: paymentRecord.providerRefundIdentity,
        providerSuccessAt: paymentRecord.providerSuccessAt,
      })
      .from(paymentRecord)
      .where(
        and(
          eq(paymentRecord.userId, payment.userId),
          or(
            inArray(paymentRecord.status, ["PAID", "SETTLED", "REFUNDED"]),
            eq(paymentRecord.providerRefundKind, "partial"),
          ),
          isNotNull(paymentRecord.providerSuccessAt),
          lt(paymentRecord.providerSuccessAt, choice.kolAttributionExpiresAt),
        ),
      )
      .orderBy(asc(paymentRecord.providerSuccessAt), asc(paymentRecord.id))
      .limit(1);

    let winner = earliestEligible;
    if (!winner && existing?.providerSuccessTimeState === "unresolved") {
      const [resolvedReservation] = await conn
        .select({
          id: paymentRecord.id,
          amountIdr: paymentRecord.amountIdr,
          status: paymentRecord.status,
          providerRefundKind: paymentRecord.providerRefundKind,
          providerRefundAmountIdr: paymentRecord.providerRefundAmountIdr,
          providerRefundIdentity: paymentRecord.providerRefundIdentity,
          providerSuccessAt: paymentRecord.providerSuccessAt,
        })
        .from(paymentRecord)
        .where(eq(paymentRecord.id, existing.paymentId))
        .limit(1);
      winner = resolvedReservation;
    }
    if (!winner || !(winner.providerSuccessAt instanceof Date)) {
      return existing ?? null;
    }

    const isEligible = isKolPurchaseEligible(
      winner.providerSuccessAt,
      choice.kolAttributionExpiresAt,
    );
    if (!isEligible && !existing) {
      return null;
    }

    const commissionAmountIdr =
      winner.status === "REFUNDED" || !isEligible
        ? 0
        : calculateKolCommission({
            purchaseAmountIdr: winner.amountIdr,
            flatAmountIdr: termsSnapshot.flatAmountIdrSnapshot,
            percentBps: termsSnapshot.percentBpsSnapshot,
          });
    const refundReconciliationState =
      winner.providerRefundKind === "partial" ? "partial_refund" : "none";
    const purchaseSnapshot = {
      paymentId: winner.id,
      paymentStatus: winner.status,
      providerSuccessAt: winner.providerSuccessAt,
      providerSuccessTimeState: "verified" as const,
      purchaseAmountIdr: winner.amountIdr,
      refundReconciliationState,
      providerRefundAmountIdr: winner.providerRefundAmountIdr ?? null,
      providerRefundIdentity: winner.providerRefundIdentity ?? null,
      commissionAmountIdr,
    };

    if (existing) {
      const changed =
        existing.paymentId !== winner.id ||
        existing.providerSuccessAt?.getTime() !==
          winner.providerSuccessAt.getTime() ||
        existing.providerSuccessTimeState !== "verified" ||
        existing.paymentStatusSnapshot !== winner.status ||
        existing.refundReconciliationState !== refundReconciliationState ||
        existing.providerRefundAmountIdrSnapshot !==
          (winner.providerRefundAmountIdr ?? null) ||
        existing.providerRefundIdentitySnapshot !==
          (winner.providerRefundIdentity ?? null) ||
        existing.purchaseAmountIdrSnapshot !== winner.amountIdr ||
        existing.commissionAmountIdr !== commissionAmountIdr;
      if (!changed) return existing;

      const [corrected] = await conn
        .update(kolCommissionDecision)
        .set({
          paymentId: winner.id,
          providerSuccessAt: winner.providerSuccessAt,
          providerSuccessTimeState: "verified",
          paymentStatusSnapshot: winner.status,
          refundReconciliationState,
          providerRefundAmountIdrSnapshot:
            winner.providerRefundAmountIdr ?? null,
          providerRefundIdentitySnapshot: winner.providerRefundIdentity ?? null,
          purchaseAmountIdrSnapshot: winner.amountIdr,
          ...termsSnapshot,
          commissionAmountIdr,
          updatedAt: now(),
        })
        .where(eq(kolCommissionDecision.id, existing.id))
        .returning();
      if (!corrected)
        throw new Error("KOL commission correction was not saved.");
      let action: string = "kol_commission_earlier_purchase_correction";
      if (existing.providerSuccessTimeState === "unresolved") {
        action = "kol_commission_provider_time_resolved";
      } else if (refundReconciliationState === "partial_refund") {
        action = "kol_commission_partial_refund_reconciliation";
      } else if (winner.status === "REFUNDED") {
        action =
          existing.paymentId === winner.id
            ? "kol_commission_refund_invalidation"
            : "kol_commission_earlier_refunded_purchase_correction";
      }
      const reason =
        action === "kol_commission_refund_invalidation"
          ? "Refund invalidated the commission while preserving the first-purchase reservation."
          : action === "kol_commission_earlier_refunded_purchase_correction"
            ? "A late earlier verified purchase was found refunded; the first-event decision moved to it with zero commission."
            : action === "kol_commission_provider_time_resolved" && !isEligible
              ? "A verified provider success time resolved the hold, but the payment was at or after attribution expiry and receives zero commission."
              : action === "kol_commission_provider_time_resolved"
                ? "A verified provider success time resolved the previous hold and all known purchase times were re-evaluated."
                : "Late earlier provider success callback; candidate ordering re-evaluated by provider time and payment ID.";
      await audit.record({
        db: conn,
        actorId: null,
        actorType: "system",
        action,
        targetId: existing.id,
        targetType: "kol_commission_decision",
        beforeState: {
          paymentId: existing.paymentId,
          providerSuccessAt: existing.providerSuccessAt,
          providerSuccessTimeState: existing.providerSuccessTimeState,
          paymentStatus: existing.paymentStatusSnapshot,
          refundReconciliationState: existing.refundReconciliationState,
          providerRefundAmountIdr: existing.providerRefundAmountIdrSnapshot,
          providerRefundIdentity: existing.providerRefundIdentitySnapshot,
          purchaseAmountIdr: existing.purchaseAmountIdrSnapshot,
          commissionAmountIdr: existing.commissionAmountIdr,
        },
        afterState: purchaseSnapshot,
        details: { reason },
      });
      return corrected;
    }

    const [decision] = await conn
      .insert(kolCommissionDecision)
      .values({
        referredUserId: payment.userId,
        choiceId: choice.id,
        paymentId: winner.id,
        providerSuccessAt: winner.providerSuccessAt,
        providerSuccessTimeState: "verified",
        paymentStatusSnapshot: winner.status,
        refundReconciliationState,
        providerRefundAmountIdrSnapshot: winner.providerRefundAmountIdr ?? null,
        providerRefundIdentitySnapshot: winner.providerRefundIdentity ?? null,
        purchaseAmountIdrSnapshot: winner.amountIdr,
        ...termsSnapshot,
        commissionAmountIdr,
      })
      .returning();
    if (!decision) throw new Error("KOL commission decision was not saved.");
    await audit.record({
      db: conn,
      actorId: null,
      actorType: "system",
      action:
        refundReconciliationState === "partial_refund"
          ? "kol_commission_partial_refund_reconciliation"
          : winner.status === "REFUNDED"
            ? "kol_commission_first_refunded_purchase_reserved"
            : "kol_commission_first_purchase_recorded",
      targetId: decision.id,
      targetType: "kol_commission_decision",
      afterState: purchaseSnapshot,
      details: {
        choiceId: choice.id,
        ...(winner.status === "REFUNDED"
          ? { reason: "First eligible purchase was already refunded." }
          : {}),
      },
    });
    return decision;
  }

  async function listKolCommissions(input: ListKolCommissionsInput) {
    const cursor = input.cursor
      ? decodeKolCommissionCursor(input.cursor)
      : undefined;
    const rows = await db
      .select({
        id: kolCommissionDecision.id,
        referredUserId: kolCommissionDecision.referredUserId,
        referredUserName: user.name,
        referredUserEmail: user.email,
        campaignName: referralCampaign.name,
        code: referralCode.code,
        paymentId: paymentRecord.id,
        paymentReference: paymentRecord.providerReference,
        paymentStatus: paymentRecord.status,
        paymentStatusSnapshot: kolCommissionDecision.paymentStatusSnapshot,
        refundReconciliationState:
          kolCommissionDecision.refundReconciliationState,
        providerRefundAmountIdr:
          kolCommissionDecision.providerRefundAmountIdrSnapshot,
        providerSuccessAt: kolCommissionDecision.providerSuccessAt,
        providerSuccessTimeState:
          kolCommissionDecision.providerSuccessTimeState,
        purchaseAmountIdr: kolCommissionDecision.purchaseAmountIdrSnapshot,
        flatAmountIdr: kolCommissionDecision.flatAmountIdrSnapshot,
        percentBps: kolCommissionDecision.percentBpsSnapshot,
        commissionAmountIdr: kolCommissionDecision.commissionAmountIdr,
        createdAt: kolCommissionDecision.createdAt,
        cursorCreatedAt: sql<string>`to_char(
          ${kolCommissionDecision.createdAt} AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )`,
        cursorId: kolCommissionDecision.id,
        updatedAt: kolCommissionDecision.updatedAt,
      })
      .from(kolCommissionDecision)
      .innerJoin(user, eq(user.id, kolCommissionDecision.referredUserId))
      .innerJoin(
        referralChoice,
        eq(referralChoice.id, kolCommissionDecision.choiceId),
      )
      .innerJoin(
        referralCampaign,
        eq(referralCampaign.id, referralChoice.campaignId),
      )
      .innerJoin(
        paymentRecord,
        eq(paymentRecord.id, kolCommissionDecision.paymentId),
      )
      .innerJoin(referralCode, eq(referralCode.id, referralChoice.codeId))
      .where(
        cursor
          ? or(
              sql`${kolCommissionDecision.createdAt} < ${cursor.createdAt}::timestamptz`,
              and(
                sql`${kolCommissionDecision.createdAt} = ${cursor.createdAt}::timestamptz`,
                lt(kolCommissionDecision.id, cursor.id),
              ),
            )
          : undefined,
      )
      .orderBy(
        desc(kolCommissionDecision.createdAt),
        desc(kolCommissionDecision.id),
      )
      .limit(input.limit + 1);
    const hasNext = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    const nextCursor =
      hasNext && last
        ? encodeKolCommissionCursor(last.cursorCreatedAt, last.cursorId)
        : null;
    return {
      items: items.map(
        ({ cursorCreatedAt: _cursorCreatedAt, cursorId: _cursorId, ...item }) =>
          item,
      ),
      nextCursor,
    };
  }

  async function recordEligibleFirstCompletion(
    conn: DbOrTx,
    input: EligibleReferralCompletion,
  ) {
    if (input.chargedMarks <= 0) return null;
    const [choice] = await conn
      .select()
      .from(referralChoice)
      .where(eq(referralChoice.userId, input.studentId))
      .for("update");
    if (!choice || choice.kind !== "friend" || !choice.referrerUserId) {
      return null;
    }

    const [existing] = await conn
      .select()
      .from(friendRewardDecision)
      .where(eq(friendRewardDecision.referredUserId, input.studentId))
      .limit(1);
    if (existing) return existing;

    // Share locks coordinate reward eligibility with ordinary user role updates.
    const participants = await conn
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(inArray(user.id, [input.studentId, choice.referrerUserId]))
      .orderBy(asc(user.id))
      .for("share");
    if (
      participants.length !== 2 ||
      participants.some((row) => row.role !== "student")
    ) {
      return null;
    }

    const semester = getReferralSemester(input.completedAt);
    const config = await settingsAt(conn, input.completedAt);
    await conn
      .insert(referralSemesterUsage)
      .values({
        referrerUserId: choice.referrerUserId,
        semesterKey: semester.key,
        creditedMarks: 0,
      })
      .onConflictDoNothing();
    const [usage] = await conn
      .select()
      .from(referralSemesterUsage)
      .where(
        and(
          eq(referralSemesterUsage.referrerUserId, choice.referrerUserId),
          eq(referralSemesterUsage.semesterKey, semester.key),
        ),
      )
      .for("update");
    if (!usage) throw new Error("Referral semester usage was not locked.");

    const rewardSnapshot = choice.friendRewardMarksSnapshot ?? 0;
    const creditedMarks = calculateFriendReward({
      rewardMarks: rewardSnapshot,
      capMarks: config.semesterCapMarks,
      alreadyCreditedMarks: usage.creditedMarks,
    });
    const [decision] = await conn
      .insert(friendRewardDecision)
      .values({
        referredUserId: input.studentId,
        choiceId: choice.id,
        referrerUserId: choice.referrerUserId,
        completionType: input.completionType,
        completionId: input.completionId,
        completedAt: input.completedAt,
        semesterKey: semester.key,
        rewardMarksSnapshot: rewardSnapshot,
        semesterCapMarks: config.semesterCapMarks,
        creditedMarks,
      })
      .returning();
    if (!decision) throw new Error("Friend reward decision was not saved.");

    if (creditedMarks > 0) {
      await conn
        .update(referralSemesterUsage)
        .set({ creditedMarks: usage.creditedMarks + creditedMarks })
        .where(eq(referralSemesterUsage.id, usage.id));
      const referrerWallet = await wallet.getOrCreate(
        choice.referrerUserId,
        conn,
      );
      const eventKey = `referral.friend.${input.studentId}`;
      await wallet.credit(conn, {
        walletId: referrerWallet.id,
        amount: creditedMarks,
        eventKey,
        sourceReference: decision.id,
        actorType: "system",
        reason: "Friend referral completion reward",
      });
      const [ledger] = await conn
        .select({ id: ledgerEntry.id })
        .from(ledgerEntry)
        .where(
          and(
            eq(ledgerEntry.walletId, referrerWallet.id),
            eq(ledgerEntry.eventKey, eventKey),
            eq(ledgerEntry.sourceReference, decision.id),
          ),
        )
        .limit(1);
      if (ledger) {
        await conn
          .update(friendRewardDecision)
          .set({ ledgerEntryId: ledger.id })
          .where(eq(friendRewardDecision.id, decision.id));
        decision.ledgerEntryId = ledger.id;
      }
    }
    return decision;
  }

  return {
    applyEmailSignupChoice,
    saveGoogleChoice,
    getMine,
    getSettings,
    updateSettings,
    createKolCampaign,
    listKolCampaigns,
    recordSuccessfulKolTopUp,
    listKolCommissions,
    recordEligibleFirstCompletion,
  };
}

export type ReferralService = ReturnType<typeof createReferralService>;
