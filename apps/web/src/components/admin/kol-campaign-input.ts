import { createKolCampaignInput } from "@cogito-app/api/modules/referral/referral.types";
import { percentToBasisPoints } from "./tax-rate-input";

export const emptyCampaignDraft = {
  name: "",
  code: "",
  activationAt: "",
  expiresAt: "",
  attributionWindowDays: "90",
  flatAmountIdr: "0",
  percent: "0",
};
export type CampaignDraft = typeof emptyCampaignDraft;

function toWibTimestamp(value: string) {
  return new Date(`${value}:00+07:00`);
}

export function parseCampaignDraft(draft: CampaignDraft, now = new Date()) {
  const errors: Partial<Record<keyof CampaignDraft, string>> = {};
  if (!/^\d+(\.\d{1,2})?$/.test(draft.percent)) {
    errors.percent = "Enter a percentage with at most 2 decimal places.";
  }
  const parsed = createKolCampaignInput.safeParse({
    name: draft.name,
    code: draft.code,
    activationAt: draft.activationAt
      ? toWibTimestamp(draft.activationAt)
      : undefined,
    expiresAt: toWibTimestamp(draft.expiresAt),
    attributionWindowDays: draft.attributionWindowDays.trim()
      ? Number(draft.attributionWindowDays)
      : NaN,
    flatAmountIdr: draft.flatAmountIdr.trim()
      ? Number(draft.flatAmountIdr)
      : NaN,
    percentBps: percentToBasisPoints(Number(draft.percent)),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key =
        issue.path[0] === "percentBps"
          ? "percent"
          : (issue.path[0] as keyof CampaignDraft);
      errors[key] ??= issue.message;
    }
  } else if (parsed.data.expiresAt <= (parsed.data.activationAt ?? now)) {
    errors.expiresAt =
      "Campaign expiry must be after activation (now if blank).";
  }
  return {
    input: parsed.success && !Object.keys(errors).length ? parsed.data : null,
    errors,
  };
}
