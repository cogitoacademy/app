import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  friendRewardDecision,
  kolCommissionDecision,
  ledgerEntry,
  referralCampaign,
  referralChoice,
  user,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { ListReferralUsageInput } from "./referral.types";

export function referralUsageSearchPattern(search: string) {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export function createReferralUsageReader(db: DbType) {
  return async (input: ListReferralUsageInput) =>
    db.transaction(
      async (tx) => {
        const referrer = alias(user, "usage_referrer");
        const friendLedger = alias(ledgerEntry, "usage_friend_ledger");
        const pattern = referralUsageSearchPattern(input.search);
        const filter = and(
          input.kind === "all"
            ? undefined
            : input.kind === "promotion"
              ? eq(referralCampaign.purpose, "promotion")
              : input.kind === "kol"
                ? and(
                    eq(referralChoice.kind, "kol"),
                    eq(referralCampaign.purpose, "kol"),
                  )
                : eq(referralChoice.kind, input.kind),
          input.search
            ? or(
                ilike(referralChoice.codeSnapshot, pattern),
                ilike(user.name, pattern),
                ilike(user.email, pattern),
                ilike(referrer.name, pattern),
                ilike(referrer.email, pattern),
                ilike(referralCampaign.name, pattern),
              )
            : undefined,
        );
        const rows = await tx
          .select({
            id: referralChoice.id,
            kind: referralChoice.kind,
            code: referralChoice.codeSnapshot,
            decidedAt: referralChoice.decidedAt,
            studentId: user.id,
            studentName: user.name,
            studentEmail: user.email,
            emailVerified: user.emailVerified,
            referrerId: referrer.id,
            referrerName: referrer.name,
            referrerEmail: referrer.email,
            campaignName: referralCampaign.name,
            campaignPurpose: referralCampaign.purpose,
            settingsVersion: referralChoice.settingsVersion,
            welcomeMarksSnapshot: referralChoice.welcomeMarksSnapshot,
            welcomeCreditedMarks: ledgerEntry.amount,
            welcomeLedgerId: ledgerEntry.id,
            friendRewardMarksSnapshot: referralChoice.friendRewardMarksSnapshot,
            friendDecisionId: friendRewardDecision.id,
            friendCreditedMarks: friendRewardDecision.creditedMarks,
            completionType: friendRewardDecision.completionType,
            completionId: friendRewardDecision.completionId,
            completedAt: friendRewardDecision.completedAt,
            semesterKey: friendRewardDecision.semesterKey,
            semesterCapMarks: friendRewardDecision.semesterCapMarks,
            friendLedgerId: friendRewardDecision.ledgerEntryId,
            friendLedgerMarks: friendLedger.amount,
            kolDecisionId: kolCommissionDecision.id,
            paymentId: kolCommissionDecision.paymentId,
            paymentStatus: kolCommissionDecision.paymentStatusSnapshot,
            commissionIdr: kolCommissionDecision.commissionAmountIdr,
            providerTimeState: kolCommissionDecision.providerSuccessTimeState,
            refundState: kolCommissionDecision.refundReconciliationState,
            attributionExpiresAt: referralChoice.kolAttributionExpiresAt,
          })
          .from(referralChoice)
          .innerJoin(user, eq(user.id, referralChoice.userId))
          .leftJoin(referrer, eq(referrer.id, referralChoice.referrerUserId))
          .leftJoin(
            referralCampaign,
            eq(referralCampaign.id, referralChoice.campaignId),
          )
          .leftJoin(
            ledgerEntry,
            eq(ledgerEntry.id, referralChoice.welcomeLedgerEntryId),
          )
          .leftJoin(
            friendRewardDecision,
            eq(friendRewardDecision.choiceId, referralChoice.id),
          )
          .leftJoin(
            kolCommissionDecision,
            eq(kolCommissionDecision.choiceId, referralChoice.id),
          )
          .leftJoin(
            friendLedger,
            eq(friendLedger.id, friendRewardDecision.ledgerEntryId),
          )
          .where(filter)
          .orderBy(desc(referralChoice.decidedAt), desc(referralChoice.id))
          .limit(input.limit)
          .offset(input.page * input.limit);
        const [summary] = await tx
          .select({
            signups: count(),
            codesUsed: sql<number>`count(distinct ${referralChoice.codeId})::int`,
            welcomeMarks: sql`coalesce(sum(${ledgerEntry.amount}),0)`.mapWith(
              Number,
            ),
            friendMarks: sql`coalesce(sum(${friendLedger.amount}),0)`.mapWith(
              Number,
            ),
          })
          .from(referralChoice)
          .innerJoin(user, eq(user.id, referralChoice.userId))
          .leftJoin(referrer, eq(referrer.id, referralChoice.referrerUserId))
          .leftJoin(
            referralCampaign,
            eq(referralCampaign.id, referralChoice.campaignId),
          )
          .leftJoin(
            ledgerEntry,
            eq(ledgerEntry.id, referralChoice.welcomeLedgerEntryId),
          )
          .leftJoin(
            friendRewardDecision,
            eq(friendRewardDecision.choiceId, referralChoice.id),
          )
          .leftJoin(
            friendLedger,
            eq(friendLedger.id, friendRewardDecision.ledgerEntryId),
          )
          .where(filter);
        return {
          items: rows,
          summary: summary!,
          page: input.page,
          limit: input.limit,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
}
