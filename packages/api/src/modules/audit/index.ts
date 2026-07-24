import { createAuditRepo } from "./audit.repo";
import { createAuditService } from "./audit.service";
import type { AuditPort } from "./audit.service";

export type AuditModule = ReturnType<typeof createAuditModule>;

export function createAuditModule() {
  const repo = createAuditRepo();
  const service = createAuditService(repo);
  return { service };
}

export type { AuditPort };
