import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import type { CompetitionCatalogService } from "./competition-catalog.service";
import { mapCompetitionCatalogError } from "./competition-catalog.errors";
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
import type { z } from "zod";

export function createCompetitionCatalogHandler(
  service: CompetitionCatalogService,
) {
  return {
    listCompetitionCatalog: async ({
      input,
    }: {
      input: z.infer<typeof listCompetitionCatalogInput>;
    }) => withDomainMap(() => service.list(input), mapCompetitionCatalogError),
    getCompetitionCatalogEntry: async ({
      input,
    }: {
      input: z.infer<typeof getCompetitionCatalogEntryInput>;
    }) => withDomainMap(() => service.get(input), mapCompetitionCatalogError),
    previewCompetitionCatalogImpact: async ({
      input,
    }: {
      input: z.infer<typeof previewCompetitionCatalogImpactInput>;
    }) =>
      withDomainMap(
        () => service.previewImpact(input),
        mapCompetitionCatalogError,
      ),
    createCompetitionParent: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof createCompetitionParentInput>;
    }) =>
      withDomainMap(
        () => service.createParent(context.session!.user.id, input),
        mapCompetitionCatalogError,
      ),
    createCompetitionSpecialization: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof createCompetitionSpecializationInput>;
    }) =>
      withDomainMap(
        () => service.createSpecialization(context.session!.user.id, input),
        mapCompetitionCatalogError,
      ),
    updateCompetitionCatalogEntry: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof updateCompetitionCatalogEntryInput>;
    }) =>
      withDomainMap(
        () => service.update(context.session!.user.id, input),
        mapCompetitionCatalogError,
      ),
    moveCompetitionSpecialization: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof moveCompetitionSpecializationInput>;
    }) =>
      withDomainMap(
        () => service.moveSpecialization(context.session!.user.id, input),
        mapCompetitionCatalogError,
      ),
    archiveCompetitionCatalogEntry: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof mutateCompetitionCatalogEntryInput>;
    }) =>
      withDomainMap(
        () => service.archive(context.session!.user.id, input),
        mapCompetitionCatalogError,
      ),
    restoreCompetitionCatalogEntry: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof mutateCompetitionCatalogEntryInput>;
    }) =>
      withDomainMap(
        () => service.restore(context.session!.user.id, input),
        mapCompetitionCatalogError,
      ),
    deleteCompetitionCatalogEntry: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof mutateCompetitionCatalogEntryInput>;
    }) =>
      withDomainMap(
        () => service.remove(context.session!.user.id, input),
        mapCompetitionCatalogError,
      ),
  };
}

export type CompetitionCatalogHandler = ReturnType<
  typeof createCompetitionCatalogHandler
>;
