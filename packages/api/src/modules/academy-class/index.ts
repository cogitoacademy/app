import type { DbType } from "../../lib/db";
import type { AuditPort } from "../audit/audit.service";
import { createAcademyClassHandler } from "./academy-class.handler";
import { createAcademyClassService } from "./academy-class.service";

export function createAcademyClassModule(deps: {
  db: DbType;
  audit: AuditPort;
}) {
  const service = createAcademyClassService(deps);
  const handler = createAcademyClassHandler(service);
  return { service, handler };
}

export type { AcademyClassService } from "./academy-class.service";
export type { AcademyClassHandler } from "./academy-class.handler";
