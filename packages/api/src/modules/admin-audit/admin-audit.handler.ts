import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAdminAuditError } from "./admin-audit.errors";
import type { AdminAuditService } from "./admin-audit.service";
import type { ListAuditLogsInput } from "./admin-audit.types";

export type AdminAuditHandler = ReturnType<typeof createAdminAuditHandler>;

export function createAdminAuditHandler(service: AdminAuditService) {
  return {
    listAuditLogs: async ({
      input,
    }: {
      context: Context;
      input: ListAuditLogsInput;
    }) => withDomainMap(() => service.list(input), mapAdminAuditError),
  };
}
