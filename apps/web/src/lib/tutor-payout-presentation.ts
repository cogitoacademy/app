export function formatPayoutCoverageLabel(
  coveredSessionCount: number,
  hasSavedSessionDetails: boolean,
) {
  return hasSavedSessionDetails
    ? `${coveredSessionCount} session(s)`
    : "Session coverage unavailable";
}

export function formatTaxRateSnapshot(rateBps: number | null) {
  return rateBps === null
    ? "Tax snapshot unavailable"
    : `${(rateBps / 100).toFixed(2)}%`;
}

const TAX_STATUS_LABELS: Record<string, string> = {
  nik_npwp: "NIK + NPWP",
  nik_only: "NIK only",
  missing: "Missing identity",
};

const TAX_RATE_SOURCE_LABELS: Record<string, string> = {
  default_nik_npwp: "Default (NIK + NPWP)",
  default_nik_only: "Default (NIK only)",
  default_missing: "Default (missing identity)",
  tutor_override: "Tutor override",
};

const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  not_required: "Not required",
  required: "Required",
  resolved: "Resolved",
};

const BANK_ACCOUNT_OWNERSHIP_LABELS: Record<string, string> = {
  self: "Self-owned",
  trusted_person: "Trusted person",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  no_show: "No-show",
};

const PAYOUT_SOURCE_TYPE_LABELS: Record<string, string> = {
  fee_event: "Session fee",
};

function humanizeEnum(value: string) {
  const words = value.replaceAll("_", " ").trim();
  if (!words) return "Not recorded";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelFromMap(value: string, labels: Record<string, string>) {
  return labels[value] ?? humanizeEnum(value);
}

export function formatPayoutTaxStatus(status: string | null) {
  return status ? labelFromMap(status, TAX_STATUS_LABELS) : "Not recorded";
}

export function formatPayoutTaxRateSource(source: string | null) {
  return source ? labelFromMap(source, TAX_RATE_SOURCE_LABELS) : "Not recorded";
}

export function formatPayoutReconciliationStatus(status: string | null) {
  return status
    ? labelFromMap(status, RECONCILIATION_STATUS_LABELS)
    : "Not recorded";
}

export function formatBankAccountOwnership(ownership: string | null) {
  return ownership
    ? labelFromMap(ownership, BANK_ACCOUNT_OWNERSHIP_LABELS)
    : "Not provided";
}

export function formatPayoutDeliveryStatus(status: string | null) {
  return status ? labelFromMap(status, DELIVERY_STATUS_LABELS) : "Not recorded";
}

export function formatPayoutSourceType(sourceType: string | null) {
  return sourceType
    ? labelFromMap(sourceType, PAYOUT_SOURCE_TYPE_LABELS)
    : "Not recorded";
}
