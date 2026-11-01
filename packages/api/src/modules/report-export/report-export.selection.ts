export class ReportSelectionError extends Error {
  constructor() {
    super(
      "Some selected reports are no longer available. Refresh the list and select reports again.",
    );
    this.name = "ReportSelectionError";
  }
}

export function selectReports<T extends { id: string }>(
  reports: T[],
  ids: string[],
  getId: (report: T) => string = (report) => report.id,
): T[] {
  const selected = new Set(ids);
  if (!ids.length || ids.length > 100 || selected.size !== ids.length) {
    throw new ReportSelectionError();
  }
  const matches = reports.filter((report) => selected.has(getId(report)));
  if (matches.length !== selected.size) throw new ReportSelectionError();
  return matches;
}
