export function calculateKolSettlement(
  base: number,
  adjustment: number,
  transferred: number,
  voided = false,
) {
  for (const value of [base, adjustment, transferred]) {
    if (!Number.isSafeInteger(value))
      throw new Error("Unsafe KOL accounting amount.");
  }
  const obligationIdr = voided ? 0 : base + adjustment;
  const balanceIdr = obligationIdr - transferred;
  if (!Number.isSafeInteger(obligationIdr) || !Number.isSafeInteger(balanceIdr))
    throw new Error("Unsafe KOL accounting total.");
  return {
    calculatedIdr: base,
    adjustmentIdr: adjustment,
    obligationIdr,
    transferredIdr: transferred,
    outstandingIdr: Math.max(0, balanceIdr),
    overpaymentIdr: Math.max(0, -balanceIdr),
    status:
      balanceIdr < 0
        ? "overpaid"
        : balanceIdr === 0
          ? "settled"
          : transferred > 0
            ? "partial"
            : "unpaid",
  };
}

export function kolMonthRange(month: string) {
  const [year, number] = month.split("-").map(Number);
  if (!year || !number || number < 1 || number > 12)
    throw new Error("Invalid KOL export month.");
  return {
    from: new Date(Date.UTC(year, number - 1, 1) - 7 * 60 * 60 * 1000),
    to: new Date(Date.UTC(year, number, 1) - 7 * 60 * 60 * 1000),
  };
}
