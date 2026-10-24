import { describe, expect, test } from "bun:test";

import {
  calculateFriendReward,
  calculateKolCommission,
  getReferralSemester,
  isKolCampaignActive,
  isKolPurchaseEligible,
  isEarlierKolPurchase,
  normalizeReferralCode,
} from "../../modules/referral/referral.policy";

describe("referral policy", () => {
  test("normalizes codes and rejects unsupported characters", () => {
    expect(normalizeReferralCode("  kol2026 ")).toBe("KOL2026");
    expect(normalizeReferralCode("bad-code")).toBeNull();
    expect(normalizeReferralCode(" ")).toBeNull();
  });

  test("uses WIB Jan-Jun and Jul-Dec semesters at their exact boundaries", () => {
    expect(
      getReferralSemester(new Date("2026-06-30T16:59:59.999Z")),
    ).toMatchObject({
      key: "2026-H1",
      startsAt: new Date("2025-12-31T17:00:00.000Z"),
      endsAt: new Date("2026-06-30T16:59:59.999Z"),
    });
    expect(
      getReferralSemester(new Date("2026-06-30T17:00:00.000Z")),
    ).toMatchObject({
      key: "2026-H2",
      startsAt: new Date("2026-06-30T17:00:00.000Z"),
      endsAt: new Date("2026-12-31T16:59:59.999Z"),
    });
  });

  test("records a permanent zero reward when the semester cap is exhausted", () => {
    expect(
      calculateFriendReward({
        rewardMarks: 15,
        capMarks: 75,
        alreadyCreditedMarks: 75,
      }),
    ).toBe(0);
    expect(
      calculateFriendReward({
        rewardMarks: 15,
        capMarks: 60,
        alreadyCreditedMarks: 65,
      }),
    ).toBe(0);
    expect(
      calculateFriendReward({
        rewardMarks: 15,
        capMarks: 75,
        alreadyCreditedMarks: 65,
      }),
    ).toBe(10);
  });

  test("KOL campaigns are active at activation and expire exclusively", () => {
    const campaign = {
      activationAt: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    };
    expect(isKolCampaignActive(campaign, campaign.activationAt)).toBe(true);
    expect(
      isKolCampaignActive(campaign, new Date(campaign.expiresAt.getTime() - 1)),
    ).toBe(true);
    expect(isKolCampaignActive(campaign, campaign.expiresAt)).toBe(false);
  });

  test("KOL purchase eligibility is strictly before the saved expiry", () => {
    const expiry = new Date("2026-12-01T00:00:00.000Z");
    expect(isKolPurchaseEligible(new Date(expiry.getTime() - 1), expiry)).toBe(
      true,
    );
    expect(isKolPurchaseEligible(expiry, expiry)).toBe(false);
    expect(isKolPurchaseEligible(new Date(expiry.getTime() + 1), expiry)).toBe(
      false,
    );
  });

  test("commission uses saved flat and basis-point terms with whole-rupiah rounding", () => {
    expect(
      calculateKolCommission({
        purchaseAmountIdr: 350_000,
        flatAmountIdr: 0,
        percentBps: 1_000,
      }),
    ).toBe(35_000);
    expect(
      calculateKolCommission({
        purchaseAmountIdr: 1_000,
        flatAmountIdr: 7_500,
        percentBps: 5,
      }),
    ).toBe(7_501);
    expect(
      calculateKolCommission({
        purchaseAmountIdr: 1,
        flatAmountIdr: 0,
        percentBps: 1,
      }),
    ).toBe(0);
    expect(
      calculateKolCommission({
        purchaseAmountIdr: 350_000,
        flatAmountIdr: 4_000,
        percentBps: 0,
      }),
    ).toBe(4_000);
  });

  test("earliest provider success wins and equal timestamps use payment ID", () => {
    const time = new Date("2026-10-23T05:00:00.000Z");
    expect(
      isEarlierKolPurchase(
        { paymentId: "purchase-b", providerSuccessAt: time },
        {
          paymentId: "purchase-c",
          providerSuccessAt: new Date(time.getTime() + 1),
        },
      ),
    ).toBe(true);
    expect(
      isEarlierKolPurchase(
        { paymentId: "purchase-a", providerSuccessAt: time },
        { paymentId: "purchase-b", providerSuccessAt: time },
      ),
    ).toBe(true);
    expect(
      isEarlierKolPurchase(
        { paymentId: "purchase-c", providerSuccessAt: time },
        { paymentId: "purchase-b", providerSuccessAt: time },
      ),
    ).toBe(false);
  });
});
