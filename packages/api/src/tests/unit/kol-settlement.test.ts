import { describe, expect, test } from "bun:test";
import {
  calculateKolSettlement,
  kolMonthRange,
} from "../../modules/referral/kol-settlement.policy";
import { kolCsv } from "../../modules/referral/kol-settlement.csv";
import {
  adjustKolCommissionInput,
  recordKolTransferInput,
} from "../../modules/referral/referral.types";

describe("KOL external settlement", () => {
  test("AC-K03 partial transfer then overpayment; correction does not offset other commissions", () => {
    expect(calculateKolSettlement(35000, 0, 10000)).toMatchObject({
      outstandingIdr: 25000,
      overpaymentIdr: 0,
      status: "partial",
    });
    expect(calculateKolSettlement(35000, 0, 40000)).toMatchObject({
      outstandingIdr: 0,
      overpaymentIdr: 5000,
      status: "overpaid",
    });
    expect(calculateKolSettlement(35000, -5000, 40000)).toMatchObject({
      obligationIdr: 30000,
      overpaymentIdr: 10000,
    });
    expect(calculateKolSettlement(35000, 0, 0)).toMatchObject({
      outstandingIdr: 35000,
      status: "unpaid",
    });
  });
  test("full reversal voids obligation and retains cash and adjustment history", () => {
    expect(calculateKolSettlement(0, 5000, 40000, true)).toMatchObject({
      adjustmentIdr: 5000,
      obligationIdr: 0,
      transferredIdr: 40000,
      overpaymentIdr: 40000,
    });
    expect(() =>
      calculateKolSettlement(Number.MAX_SAFE_INTEGER, 1, 0),
    ).toThrow();
  });
  test("whole-IDR transfers, nonempty reference and correction reason are required", () => {
    const base = {
      decisionId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
    };
    expect(
      recordKolTransferInput.safeParse({
        ...base,
        amountIdr: 0,
        paidAt: new Date(),
        reference: "bank",
      }).success,
    ).toBe(false);
    expect(
      recordKolTransferInput.safeParse({
        ...base,
        amountIdr: 1.5,
        paidAt: new Date(),
        reference: "bank",
      }).success,
    ).toBe(false);
    expect(
      recordKolTransferInput.safeParse({
        ...base,
        amountIdr: 100,
        paidAt: new Date(),
        reference: " ",
      }).success,
    ).toBe(false);
    expect(
      adjustKolCommissionInput.safeParse({
        ...base,
        amountIdr: -100,
        expectedObligationIdr: 35000,
        reason: " ",
      }).success,
    ).toBe(false);
    expect(
      adjustKolCommissionInput.safeParse({
        ...base,
        amountIdr: 0,
        expectedObligationIdr: 35000,
        reason: "approved",
      }).success,
    ).toBe(false);
  });
  test("WIB month bounds include the full last day and exclude next month", () => {
    expect(kolMonthRange("2026-10")).toEqual({
      from: new Date("2026-09-30T17:00:00Z"),
      to: new Date("2026-10-31T17:00:00Z"),
    });
    expect(kolMonthRange("2026-12").to.toISOString()).toBe(
      "2026-12-31T17:00:00.000Z",
    );
  });
  test("CSV quotes multiline references and neutralizes formulas", () => {
    expect(kolCsv([[" =SUM(A1)", 'bank,"ref"\nnext', -5000]])).toBe(
      `\uFEFF"' =SUM(A1)","bank,""ref""\nnext",-5000`,
    );
  });
});
