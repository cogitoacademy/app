type Evidence = {
  kind: string;
  friendDecisionId: string | null;
  friendCreditedMarks: number | null;
  friendRewardMarksSnapshot: number | null;
  friendLedgerId: string | null;
  kolDecisionId: string | null;
  paymentStatus: string | null;
  providerTimeState: string | null;
  refundState: string | null;
};

export function referralUsageStatus(row: Evidence): string {
  if (row.kind === "none") return "No code selected";
  if (row.kind === "friend") {
    if (!row.friendDecisionId) return "Awaiting paid completion";
    if ((row.friendCreditedMarks ?? 0) > 0)
      return row.friendLedgerId ? "Reward credited" : "Credit evidence missing";
    return row.friendRewardMarksSnapshot === 0
      ? "Zero reward terms"
      : "Semester cap reached";
  }
  if (!row.kolDecisionId) return "Awaiting eligible top-up";
  if (row.paymentStatus === "REFUNDED") return "Refunded / voided";
  if (row.providerTimeState === "unresolved") return "Provider time unresolved";
  if (row.refundState === "partial_refund") return "Partial refund review";
  return "Commission recorded";
}
