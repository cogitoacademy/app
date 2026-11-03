import { adminProcedure } from "../../procedures";
import type { AdminAuditHandler } from "./admin-audit.handler";
import { listAuditLogsInput } from "./admin-audit.types";

export function createAdminAuditRouter(handler: AdminAuditHandler) {
  return {
    listAuditLogs: adminProcedure
      .route({
        method: "POST",
        path: "/admin/audit/list",
        tags: ["Admin", "Audit"],
        summary: "List audit log entries",
        description:
          "Lists recorded admin and system actions newest first, with actor identity and state snapshots",
      })
      .input(listAuditLogsInput)
      .handler(handler.listAuditLogs),
  };
}
