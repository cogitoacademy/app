import { describe, expect, it } from "bun:test";
import ExcelJS from "exceljs";
import type { TutorPayoutCsvRow } from "./tutor-payout-csv";
import { buildTutorPayoutXlsx } from "./tutor-payout-xlsx";

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

describe("tutor payout XLSX", () => {
  it("round-trips separate sheets, text identifiers, numeric totals and safe text", async () => {
    const bytes = await buildTutorPayoutXlsx(
      [
        row({ tutorName: "=1+1" }),
        row({ status: "pending", tutorName: "Excluded pending" }),
        row({ paidAt: "2026-06-01T00:00:00Z", tutorName: "Excluded date" }),
        row({
          status: "void",
          voidedAt: "2026-05-02T00:00:00Z",
          taxHonorariumIdr: 999999,
        }),
      ],
      "2026-05-01",
      "2026-05-31",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Paid transfers",
      "Cancelled payouts",
    ]);
    const paid = workbook.getWorksheet("Paid transfers")!;
    expect(paid.rowCount).toBe(2);
    expect(paid.getCell("B2").value).toBe("=1+1");
    expect(paid.getCell("B2").type).toBe(ExcelJS.ValueType.String);
    expect(paid.getCell("D2").value).toBe("001234567890");
    expect(paid.getCell("G2").value).toBe("0012345678901234");
    expect(paid.getCell("H2").value).toBe("000123456789000");
    expect(paid.getCell("M2").value).toBe(100000);
    expect(paid.getCell("O2").value).toBe(2.5);
    expect(paid.getCell("O1").value).toBe("Tax rate (%)");
    expect(
      workbook.getWorksheet("Cancelled payouts")!.getCell("I2").value,
    ).toBe("Cancelled");
    expect(workbook.getWorksheet("Summary")!.getCell("B4").value).toBe(2500);
    expect(workbook.getWorksheet("Cancelled payouts")!.rowCount).toBe(2);
  });
  it("explains a void-only report without adding void amounts to paid totals", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      await buildTutorPayoutXlsx(
        [row({ status: "void", voidedAt: "2026-05-02T00:00:00Z" })],
        "2026-05-01",
        "2026-05-31",
      ),
    );
    expect(workbook.getWorksheet("Summary")!.getCell("B8").value).toBe(
      "No paid transfers. 1 cancelled payout is listed separately.",
    );
    expect(workbook.getWorksheet("Summary")!.getCell("B6").value).toBe(0);
    expect(workbook.getWorksheet("Paid transfers")!.rowCount).toBe(1);
  });
});
