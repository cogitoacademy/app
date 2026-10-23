import { describe, expect, test } from "bun:test";

import {
  calculateFriendReward,
  generateFriendReferralCode,
  getReferralSemester,
  isKolCampaignActive,
  normalizeReferralCode,
} from "../../modules/referral/referral.policy";

describe("referral policy", () => {
  test("normalizes codes and rejects unsupported characters", () => {
    expect(normalizeReferralCode("  kol2026 ")).toBe("KOL2026");
    expect(normalizeReferralCode("bad-code")).toBeNull();
    expect(normalizeReferralCode(" ")).toBeNull();
  });

  test("generates a unique-format student code", () => {
    const code = generateFriendReferralCode();
    expect(code).toMatch(/^F[A-F0-9]{16}$/);
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
});
