import { describe, expect, it } from "bun:test";
import {
  buildTutorPayoutCsv,
  type TutorPayoutCsvRow,
} from "./tutor-payout-csv";

function row(overrides: Partial<TutorPayoutCsvRow>): TutorPayoutCsvRow {
  return {
    tutorName: "Tutor",
    bankName: "BCA",
    bankAccountNumber: "001234567890",
    bankAccountHolderName: "Tutor",
    taxLegalName: "Tutor Legal",
    taxNik: "0012345678901234",
    taxNpwp: "000123456789000",
    grossHonorariumIdr: 100_000,
    taxStatus: "nik_npwp",
    taxRateBps: 250,
    taxRateSource: "default_nik_npwp",
    taxHonorariumIdr: 2_500,
    transferFeeIdr: 0,
    netHonorariumIdr: 97_500,
    actualAmountIdr: 97_500,
    actualReference: "INV-1",
    status: "paid",
    paidAt: "2026-04-30T17:00:00.000Z",
    transferRecordedAt: "2026-04-30T17:01:00.000Z",
    voidedAt: null,
    voidReason: null,
    reconciliationStatus: "not_required",
    reconciliationReason: null,
    coveredSessionCount: 2,
    ...overrides,
  };
}

describe("tutor payout CSV", () => {
  it("filters paid and void records on Asia/Jakarta month boundaries", () => {
    const csv = buildTutorPayoutCsv(
      [
        row({ paidAt: "2026-04-30T16:59:59.999Z" }),
        row({ paidAt: "2026-04-30T17:00:00.000Z", tutorName: "May paid" }),
        row({ paidAt: "2026-05-31T16:59:59.999Z", tutorName: "Last May paid" }),
        row({ paidAt: "2026-05-31T17:00:00.000Z", tutorName: "June paid" }),
        row({
          status: "void",
          paidAt: null,
          voidedAt: "2026-04-30T17:00:00.000Z",
          tutorName: "May void",
          reconciliationStatus: "required",
        }),
      ],
      "2026-05-01",
      "2026-05-31",
    );
    expect(csv).toContain("May paid");
    expect(csv).toContain("Last May paid");
    expect(csv).toContain("May void");
    expect(csv).not.toContain("June paid");
    expect(csv).not.toContain('PAID,"Tutor"');
  });

  it("keeps mixed-rate snapshots, excludes void tax from totals, and escapes CSV formulas", () => {
    const csv = buildTutorPayoutCsv(
      [
        row({
          tutorName: '=HYPERLINK("https://bad")',
          taxRateBps: 300,
          taxHonorariumIdr: 3_000,
        }),
        row({
          status: "void",
          paidAt: "2026-05-12T10:00:00.000Z",
          voidedAt: "2026-05-14T10:00:00.000Z",
          taxRateBps: 500,
          taxHonorariumIdr: 5_000,
          reconciliationStatus: "required",
          reconciliationReason: "Confirm external transfer",
        }),
      ],
      "2026-05-01",
      "2026-05-31",
    );
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain('"300"');
    expect(csv).toContain('"500"');
    expect(csv).toContain('"3000"');
    expect(csv).not.toContain('"8,000"');
    expect(csv).toContain('"\'001234567890"');
    expect(csv).toContain('"\'0012345678901234"');
    expect(csv).toContain('"\'000123456789000"');
    expect(csv).toContain("Confirm external transfer");
  });
});
