import { adminProcedure } from "../../procedures";
import type { CompetitionCatalogHandler } from "./competition-catalog.handler";
import {
  createCompetitionParentInput,
  createCompetitionSpecializationInput,
  getCompetitionCatalogEntryInput,
  listCompetitionCatalogInput,
  moveCompetitionSpecializationInput,
  mutateCompetitionCatalogEntryInput,
  previewCompetitionCatalogImpactInput,
  updateCompetitionCatalogEntryInput,
} from "./competition-catalog.types";

export function createCompetitionCatalogRouter(
  handler: CompetitionCatalogHandler,
) {
  return {
    listCompetitionCatalog: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/list",
        tags: ["Admin", "Competition catalog"],
        summary: "List and search competition catalog entries",
      })
      .input(listCompetitionCatalogInput)
      .handler(handler.listCompetitionCatalog),
    getCompetitionCatalogEntry: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/get",
        tags: ["Admin", "Competition catalog"],
        summary: "Get one competition or specialization",
      })
      .input(getCompetitionCatalogEntryInput)
      .handler(handler.getCompetitionCatalogEntry),
    previewCompetitionCatalogImpact: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/impact",
        tags: ["Admin", "Competition catalog"],
        summary: "Preview references affected by archiving or deleting",
      })
      .input(previewCompetitionCatalogImpactInput)
      .handler(handler.previewCompetitionCatalogImpact),
    createCompetitionParent: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/create-parent",
        tags: ["Admin", "Competition catalog"],
        summary: "Create a draft competition",
      })
      .input(createCompetitionParentInput)
      .handler(handler.createCompetitionParent),
    createCompetitionSpecialization: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/create-specialization",
        tags: ["Admin", "Competition catalog"],
        summary: "Create a specialization under a competition",
      })
      .input(createCompetitionSpecializationInput)
      .handler(handler.createCompetitionSpecialization),
    updateCompetitionCatalogEntry: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/update",
        tags: ["Admin", "Competition catalog"],
        summary: "Update labels or order with version checking",
      })
      .input(updateCompetitionCatalogEntryInput)
      .handler(handler.updateCompetitionCatalogEntry),
    moveCompetitionSpecialization: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/move-specialization",
        tags: ["Admin", "Competition catalog"],
        summary: "Move an unused specialization to another competition",
      })
      .input(moveCompetitionSpecializationInput)
      .handler(handler.moveCompetitionSpecialization),
    archiveCompetitionCatalogEntry: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/archive",
        tags: ["Admin", "Competition catalog"],
        summary: "Archive a competition or specialization",
      })
      .input(mutateCompetitionCatalogEntryInput)
      .handler(handler.archiveCompetitionCatalogEntry),
    restoreCompetitionCatalogEntry: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/restore",
        tags: ["Admin", "Competition catalog"],
        summary: "Restore a rate-ready competition or specialization",
      })
      .input(mutateCompetitionCatalogEntryInput)
      .handler(handler.restoreCompetitionCatalogEntry),
    deleteCompetitionCatalogEntry: adminProcedure
      .route({
        method: "POST",
        path: "/admin/competitions/delete",
        tags: ["Admin", "Competition catalog"],
        summary: "Delete an unused catalog entry",
      })
      .input(mutateCompetitionCatalogEntryInput)
      .handler(handler.deleteCompetitionCatalogEntry),
  };
}
