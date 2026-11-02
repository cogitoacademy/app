import ExcelJS from "exceljs";
import {
  buildTutorPayoutReport,
  type TutorPayoutCsvRow,
} from "./tutor-payout-csv";

export async function buildTutorPayoutXlsx(
  rows: TutorPayoutCsvRow[],
  from: string,
  to: string,
) {
  const report = buildTutorPayoutReport(rows, from, to);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Cogito";
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 42 }, { width: 85 }];
  summary.addRows([
    ["Tutor payout report", `${from} to ${to} (Asia/Jakarta)`],
    ["Paid transfers", report.paidRows.length],
    ["Gross honorarium (IDR)", report.totals[12]],
    ["Tax withheld (IDR)", report.totals[16]],
    ["Transfer fees (IDR)", report.totals[17]],
    ["Actual transfers (IDR)", report.totals[19]],
    ["Cancelled payouts (excluded from paid totals)", report.voidRows.length],
    [
      "Status",
      report.paidRows.length
        ? "Paid transfers are listed in the Paid transfers sheet."
        : `No paid transfers. ${report.voidRows.length} cancelled payout${report.voidRows.length === 1 ? " is" : "s are"} listed separately.`,
    ],
    [
      "Date basis",
      "Paid: actual transfer date. Cancelled: cancellation date. All dates use Asia/Jakarta.",
    ],
    [
      "Scope",
      "Pending and prepared payouts are excluded. Table status, sorting and pagination do not affect this report.",
    ],
    [
      "Paid transfers with missing tax amounts",
      report.paidRows.filter((row) => row.taxHonorariumIdr === null).length,
    ],
    [
      "Tax total note",
      "Tax total includes recorded amounts only. Review payouts with missing tax amounts before using this recap.",
    ],
  ]);
  for (let row = 3; row <= 6; row++)
    summary.getCell(row, 2).numFmt = '#,##0" IDR"';
  summary.getColumn(2).alignment = { vertical: "top", wrapText: true };
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getRow(10).height = 32;
  summary.getRow(12).height = 32;

  for (const [name, values] of [
    ["Paid transfers", report.paidValues],
    ["Cancelled payouts", report.voidValues],
  ] as const) {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = report.headers.map((header, index) => ({
      header,
      width: index >= 23 ? 45 : Math.max(20, Math.min(32, header.length + 2)),
    }));
    sheet.addRows(values);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };
    sheet.getRow(1).height = 44;
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: report.headers.length },
    };
    sheet.getColumn(15).numFmt = '0.##"%"';
    for (const column of [4, 7, 8]) sheet.getColumn(column).numFmt = "@";
    for (const column of [13, 17, 18, 19, 20])
      sheet.getColumn(column).numFmt = '#,##0" IDR"';
    for (const column of [24, 25])
      sheet.getColumn(column).alignment = { wrapText: true, vertical: "top" };
  }
  return workbook.xlsx.writeBuffer();
}
