import { adminProcedure, publicProcedure } from "../../procedures";
import type { FaqHandler } from "./faq.handler";
import {
  reorderFaqInput,
  createFaqInput,
  listAdminFaqInput,
  listPublicFaqInput,
  updateFaqInput,
} from "./faq.types";

export function createFaqRouter(handler: FaqHandler) {
  return {
    publicContent: {
      faq: {
        list: publicProcedure
          .route({
            method: "POST",
            path: "/public-content/faq/list",
            tags: ["Public content", "FAQ"],
            summary: "List active FAQ entries",
          })
          .input(listPublicFaqInput)
          .handler(handler.listPublic),
      },
    },
    adminFaq: {
      reorder: adminProcedure.input(reorderFaqInput).handler(handler.reorder),
      list: adminProcedure
        .route({
          method: "POST",
          path: "/admin/faq/list",
          tags: ["Admin", "FAQ"],
          summary: "List FAQ entries for editing",
        })
        .input(listAdminFaqInput)
        .handler(handler.listAdmin),
      create: adminProcedure
        .route({
          method: "POST",
          path: "/admin/faq/create",
          tags: ["Admin", "FAQ"],
          summary: "Create an FAQ entry",
        })
        .input(createFaqInput)
        .handler(handler.create),
      update: adminProcedure
        .route({
          method: "POST",
          path: "/admin/faq/update",
          tags: ["Admin", "FAQ"],
          summary: "Update an FAQ entry with version checking",
        })
        .input(updateFaqInput)
        .handler(handler.update),
    },
  };
}
