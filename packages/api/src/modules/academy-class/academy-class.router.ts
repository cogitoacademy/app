import { adminProcedure, publicProcedure } from "../../procedures";
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

export function createAcademyClassPublicRouter(handler: AcademyClassHandler) {
  return {
    list: publicProcedure
      .route({
        method: "POST",
        path: "/classes/list",
        tags: ["Classes"],
        summary: "List published classes for the student catalog",
      })
      .handler(handler.listPublishedAcademyClasses),
    get: publicProcedure
      .route({
        method: "POST",
        path: "/classes/get",
        tags: ["Classes"],
        summary: "Get one published class for the student catalog",
      })
      .input(getAcademyClassInput)
      .handler(handler.getPublishedAcademyClass),
  };
}
