export const DEFAULT_REFERRAL_SETTINGS = {
  version: 0,
  welcomeMarks: 15,
  friendRewardMarks: 15,
  semesterCapMarks: 75,
} as const;

export type ReferralSettings = {
  version: number;
  welcomeMarks: number;
  friendRewardMarks: number;
  semesterCapMarks: number;
};

export type ReferralSemester = {
  key: string;
  startsAt: Date;
  endsAt: Date;
};

export function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? "";
  if (!code) return null;
  return /^[A-Z0-9]{4,32}$/.test(code) ? code : null;
}

export function getReferralSemester(at: Date): ReferralSemester {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "numeric",
  }).formatToParts(at);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const half = month <= 6 ? 1 : 2;
  const startMonth = half === 1 ? 1 : 7;
  const nextStart =
    half === 1
      ? new Date(`${year}-07-01T00:00:00+07:00`)
      : new Date(`${year + 1}-01-01T00:00:00+07:00`);

  return {
    key: `${year}-H${half}`,
    startsAt: new Date(
      `${year}-${String(startMonth).padStart(2, "0")}-01T00:00:00+07:00`,
    ),
    endsAt: new Date(nextStart.getTime() - 1),
  };
}

export function calculateFriendReward(input: {
  rewardMarks: number;
  capMarks: number;
  alreadyCreditedMarks: number;
}) {
  return Math.min(
    input.rewardMarks,
    Math.max(0, input.capMarks - input.alreadyCreditedMarks),
  );
}

export function isKolCampaignActive(
  campaign: { activationAt: Date; expiresAt: Date },
  at: Date,
) {
  return campaign.activationAt <= at && at < campaign.expiresAt;
}

export function isKolPurchaseEligible(
  providerSuccessAt: Date,
  attributionExpiresAt: Date,
) {
  return providerSuccessAt < attributionExpiresAt;
}

export function calculateKolCommission(input: {
  purchaseAmountIdr: number;
  flatAmountIdr: number;
  percentBps: number;
}) {
  return (
    input.flatAmountIdr +
    Math.round((input.purchaseAmountIdr * input.percentBps) / 10_000)
  );
}

export function isEarlierKolPurchase(
  candidate: { paymentId: string; providerSuccessAt: Date },
  current: { paymentId: string; providerSuccessAt: Date },
) {
  const timeDifference =
    candidate.providerSuccessAt.getTime() - current.providerSuccessAt.getTime();
  return (
    timeDifference < 0 ||
    (timeDifference === 0 && candidate.paymentId < current.paymentId)
  );
}
