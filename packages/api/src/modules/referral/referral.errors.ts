export type ReferralErrorCode =
  | "KOL_SETTLEMENT_INVALID"
  | "KOL_SETTLEMENT_CONFLICT"
  | "INVALID_REFERRAL_CODE"
  | "SELF_REFERRAL"
  | "REFERRAL_STUDENT_ONLY"
  | "REFERRAL_CHOICE_REQUIRED"
  | "REFERRAL_SETTINGS_CONFLICT"
  | "REFERRAL_CAMPAIGN_INVALID"
  | "REFERRAL_CODE_TAKEN"
  | "REFERRAL_INVALID_CURSOR";

export class ReferralError extends Error {
  constructor(
    readonly code: ReferralErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReferralError";
  }
}
