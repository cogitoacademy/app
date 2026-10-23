export function kolCsvCell(value: unknown): string {
  let text =
    value == null
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function kolCsv(rows: unknown[][]) {
  return (
    "\uFEFF" + rows.map((row) => row.map(kolCsvCell).join(",")).join("\r\n")
  );
}
