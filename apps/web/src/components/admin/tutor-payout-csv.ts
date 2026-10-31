export interface TutorPayoutCsvRow {
  tutorName: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolderName: string | null;
  taxLegalName: string | null;
  taxNik: string | null;
  taxNpwp: string | null;
  grossHonorariumIdr: number;
  taxStatus: string | null;
  taxRateBps: number | null;
  taxRateSource: string | null;
  taxHonorariumIdr: number | null;
  transferFeeIdr: number;
  netHonorariumIdr: number | null;
  actualAmountIdr: number | null;
  actualReference: string | null;
  status: "pending" | "prepared" | "paid" | "void";
  paidAt: Date | string | null;
  transferRecordedAt: Date | string | null;
  voidedAt: Date | string | null;
  voidReason: string | null;
  reconciliationStatus: string;
  reconciliationReason: string | null;
  coveredSessionCount: number;
}

function csvCell(value: string | number | null, preserveLeadingZeros = false) {
  let text = value === null ? "" : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  if (preserveLeadingZeros && /^0\d+$/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function parseDate(value: Date | string | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinWibRange(
  value: Date | string | null,
  dateFrom: string,
  dateTo: string,
) {
  const parsed = parseDate(value);
  if (!parsed) return false;
  const from = new Date(`${dateFrom}T00:00:00+07:00`).getTime();
  const to = new Date(`${dateTo}T23:59:59.999+07:00`).getTime();
  return parsed.getTime() >= from && parsed.getTime() <= to;
}

function formatWibDateTime(value: Date | string | null) {
  const parsed = parseDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
}

const HEADERS = [
  "Record type",
  "Tutor name",
  "Bank",
  "Account number",
  "Account holder",
  "Tax legal name snapshot",
  "NIK snapshot",
  "NPWP snapshot",
  "Payout status",
  "Actual paid at (Asia/Jakarta)",
  "Transfer recorded at (Asia/Jakarta)",
  "Voided at (Asia/Jakarta)",
  "Gross honorarium IDR",
  "Tax status snapshot",
  "Tax rate snapshot (basis points)",
  "Tax rate source snapshot",
  "Tax withheld IDR",
  "Transfer fee IDR",
  "Calculated net IDR",
  "Actual transfer IDR",
  "Transfer reference",
  "Covered sessions",
  "Reconciliation status",
  "Void reason",
  "Reconciliation reason",
];

export function buildTutorPayoutCsv(
  rows: TutorPayoutCsvRow[],
  dateFrom: string,
  dateTo: string,
) {
  const paidRows = rows.filter(
    (row) =>
      row.status === "paid" && isWithinWibRange(row.paidAt, dateFrom, dateTo),
  );
  const voidRows = rows.filter(
    (row) =>
      row.status === "void" && isWithinWibRange(row.voidedAt, dateFrom, dateTo),
  );
  const toCsvRow = (row: TutorPayoutCsvRow, type: "PAID" | "VOID") => [
    type,
    row.tutorName,
    row.bankName,
    row.bankAccountNumber,
    row.bankAccountHolderName,
    row.taxLegalName,
    row.taxNik,
    row.taxNpwp,
    row.status,
    formatWibDateTime(row.paidAt),
    formatWibDateTime(row.transferRecordedAt),
    formatWibDateTime(row.voidedAt),
    row.grossHonorariumIdr,
    row.taxStatus ?? "Unavailable (required snapshot missing)",
    row.taxRateBps ?? "Unavailable (required snapshot missing)",
    row.taxRateSource ?? "Unavailable (required snapshot missing)",
    row.taxHonorariumIdr ?? "Unavailable (required snapshot missing)",
    row.transferFeeIdr,
    row.netHonorariumIdr,
    row.actualAmountIdr,
    row.actualReference,
    row.coveredSessionCount > 0
      ? row.coveredSessionCount
      : "Session coverage unavailable",
    row.reconciliationStatus,
    row.voidReason,
    row.reconciliationReason,
  ];
  const paidTaxTotal = paidRows.reduce(
    (sum, row) => sum + (row.taxHonorariumIdr ?? 0),
    0,
  );
  const totals = HEADERS.map((_, index) => {
    switch (index) {
      case 0:
        return "PAID TOTAL";
      case 12:
        return paidRows.reduce((sum, row) => sum + row.grossHonorariumIdr, 0);
      case 16:
        return paidTaxTotal;
      case 17:
        return paidRows.reduce((sum, row) => sum + row.transferFeeIdr, 0);
      case 19:
        return paidRows.reduce(
          (sum, row) => sum + (row.actualAmountIdr ?? 0),
          0,
        );
      case 21:
        return `Known allocation rows only: ${paidRows.reduce((sum, row) => sum + row.coveredSessionCount, 0)}`;
      default:
        return "";
    }
  });
  const rowsToWrite = [
    [
      "Actual transfers by Asia/Jakarta paid date",
      ...Array(HEADERS.length - 1).fill(""),
    ],
    HEADERS,
    ...paidRows.map((row) => toCsvRow(row, "PAID")),
    totals,
    [
      "Void and reconciliation records by Asia/Jakarta void date",
      ...Array(HEADERS.length - 1).fill(""),
    ],
    HEADERS,
    ...voidRows.map((row) => toCsvRow(row, "VOID")),
  ];

  return (
    "\uFEFF" +
    rowsToWrite
      .map((row) =>
        row
          .map((value, index) =>
            csvCell(
              typeof value === "string" || typeof value === "number"
                ? value
                : null,
              index === 3 || index === 6 || index === 7,
            ),
          )
          .join(","),
      )
      .join("\r\n")
  );
}
