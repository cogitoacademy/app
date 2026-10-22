import { and, desc, eq, lte, sql } from "drizzle-orm";
import {
  friendRewardDecision,
  ledgerEntry,
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
  DEFAULT_REFERRAL_SETTINGS,
  generateFriendReferralCode,
  getReferralSemester,
  isKolCampaignActive,
  normalizeReferralCode,
} from "./referral.policy";
import type {
  CreateKolCampaignInput,
  UpdateReferralSettingsInput,
} from "./referral.types";

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
    recordEligibleFirstCompletion,
  };
}

export type ReferralService = ReturnType<typeof createReferralService>;
