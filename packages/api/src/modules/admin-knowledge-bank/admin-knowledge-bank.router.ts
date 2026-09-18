import { adminProcedure } from "../../procedures";
import type { AdminKnowledgeBankHandler } from "./admin-knowledge-bank.handler";
import {
  createKnowledgeBankAccessInput,
  listKnowledgeBankAccessInput,
  removeKnowledgeBankAccessInput,
  updateKnowledgeBankAccessInput,
} from "./admin-knowledge-bank.types";

export function createAdminKnowledgeBankRouter(
  handler: AdminKnowledgeBankHandler,
) {
  return {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/knowledge-bank/access/list",
        tags: ["Admin", "Knowledge Bank"],
        summary: "List Knowledge Bank access grants",
        description:
          "Lists temporary student access grants, including their expiry status",
      })
      .input(listKnowledgeBankAccessInput)
      .handler(handler.list),

    create: adminProcedure
      .route({
        method: "POST",
        path: "/admin/knowledge-bank/access/create",
        tags: ["Admin", "Knowledge Bank"],
        summary: "Grant temporary Knowledge Bank access",
        description:
          "Grants one student Knowledge Bank access until the chosen expiry",
      })
      .input(createKnowledgeBankAccessInput)
      .handler(handler.create),

    update: adminProcedure
      .route({
        method: "POST",
        path: "/admin/knowledge-bank/access/update",
        tags: ["Admin", "Knowledge Bank"],
        summary: "Update Knowledge Bank access expiry",
        description:
          "Changes a student's temporary Knowledge Bank access grant",
      })
      .input(updateKnowledgeBankAccessInput)
      .handler(handler.update),

    remove: adminProcedure
      .route({
        method: "POST",
        path: "/admin/knowledge-bank/access/remove",
        tags: ["Admin", "Knowledge Bank"],
        summary: "Remove Knowledge Bank access grant",
        description: "Removes a student's temporary Knowledge Bank exception",
      })
      .input(removeKnowledgeBankAccessInput)
      .handler(handler.remove),
  };
}
