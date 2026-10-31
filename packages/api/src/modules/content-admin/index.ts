import type { DbType } from "../../lib/db";
import type { AuditPort } from "../audit/audit.service";
import type { PrivateKbStorage } from "../../lib/private-kb-storage";
import { createContentAdminRepo } from "./content-admin.repo";
import { createContentAdminService } from "./content-admin.service";
import { createContentAdminHandler } from "./content-admin.handler";
export function createContentAdminModule(deps: {
  db: DbType;
  audit: AuditPort;
  storage: () => PrivateKbStorage;
  enabled: () => boolean;
}) {
  const repo = createContentAdminRepo(deps.db, deps.audit);
  const service = createContentAdminService({ ...deps, repo });
  return { repo, service, handler: createContentAdminHandler(service) };
}
