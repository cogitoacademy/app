import { adminProcedure } from "../../procedures";
import type { ContentAdminHandler } from "./content-admin.handler";
import {
  createContentInput,
  updateContentInput,
  deleteContentInput,
  uploadPdfInput,
  kindInput,
} from "./content-admin.types";
export function createContentAdminRouter(handler: ContentAdminHandler) {
  return {
    list: adminProcedure.input(kindInput).handler(handler.list),
    categories: adminProcedure.handler(handler.categories),
    create: adminProcedure.input(createContentInput).handler(handler.create),
    update: adminProcedure.input(updateContentInput).handler(handler.update),
    remove: adminProcedure.input(deleteContentInput).handler(handler.remove),
    uploadPdf: adminProcedure.input(uploadPdfInput).handler(handler.uploadPdf),
  };
}
