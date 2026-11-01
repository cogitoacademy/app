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
