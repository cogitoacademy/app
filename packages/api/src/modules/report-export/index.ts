import type { DbType } from "../../lib/db";
import { createReportExportService } from "./report-export.service";

export function createReportExportModule(deps: { db: DbType }) {
  return { service: createReportExportService(deps) };
}

export type { ReportExportService } from "./report-export.service";
