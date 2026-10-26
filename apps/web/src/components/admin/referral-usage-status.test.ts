import { expect, test } from "bun:test";
import { referralUsageStatus } from "./referral-usage-status";
const pending = {
  kind: "friend",
  friendDecisionId: null,
  friendCreditedMarks: null,
  friendRewardMarksSnapshot: 15,
  friendLedgerId: null,
  kolDecisionId: null,
  paymentStatus: null,
  providerTimeState: null,
  refundState: null,
};
test("does not present pending completions as earned rewards", () => {
  expect(referralUsageStatus(pending)).toBe("Awaiting paid completion");
  expect(referralUsageStatus({ ...pending, kind: "none" })).toBe(
    "No code selected",
  );
});
test("distinguishes capped, zero-term and credited friend outcomes", () => {
  const decided = {
    ...pending,
    friendDecisionId: "decision",
    friendCreditedMarks: 0,
  };
  expect(referralUsageStatus(decided)).toBe("Semester cap reached");
  expect(
    referralUsageStatus({ ...decided, friendRewardMarksSnapshot: 0 }),
  ).toBe("Zero reward terms");
  expect(referralUsageStatus({ ...decided, friendCreditedMarks: 5 })).toBe(
    "Credit evidence missing",
  );
  expect(
    referralUsageStatus({
      ...decided,
      friendCreditedMarks: 5,
      friendLedgerId: "ledger",
    }),
  ).toBe("Reward credited");
});
test("surfaces KOL refund and provider-time holds", () => {
  const kol = { ...pending, kind: "kol" };
  expect(referralUsageStatus(kol)).toBe("Awaiting eligible top-up");
  expect(
    referralUsageStatus({
      ...kol,
      kolDecisionId: "d",
      providerTimeState: "unresolved",
    }),
  ).toBe("Provider time unresolved");
  expect(
    referralUsageStatus({
      ...kol,
      kolDecisionId: "d",
      paymentStatus: "REFUNDED",
    }),
  ).toBe("Refunded / voided");
  expect(
    referralUsageStatus({
      ...kol,
      kolDecisionId: "d",
      refundState: "partial_refund",
    }),
  ).toBe("Partial refund review");
});
