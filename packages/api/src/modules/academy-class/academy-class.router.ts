import { adminProcedure } from "../../procedures";
import type { AcademyClassHandler } from "./academy-class.handler";
import {
  getAcademyClassInput,
  listAcademyClassesInput,
  saveAcademyClassDraftInput,
} from "./academy-class.types";

export function createAcademyClassRouter(handler: AcademyClassHandler) {
  return {
    listAcademyClasses: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/list",
        tags: ["Admin", "Classes"],
        summary: "List classes and sessions for admin management",
      })
      .input(listAcademyClassesInput)
      .handler(handler.listAcademyClasses),
    getAcademyClass: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/get",
        tags: ["Admin", "Classes"],
        summary: "Get a class and its sessions",
      })
      .input(getAcademyClassInput)
      .handler(handler.getAcademyClass),
    saveAcademyClassDraft: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/save-draft",
        tags: ["Admin", "Classes"],
        summary: "Create or update an auditable class draft",
      })
      .input(saveAcademyClassDraftInput)
      .handler(handler.saveAcademyClassDraft),
  };
}
