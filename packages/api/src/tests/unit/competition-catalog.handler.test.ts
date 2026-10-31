import { describe, expect, mock, test } from "bun:test";
import type { Context } from "../../context";
import { createCompetitionCatalogHandler } from "../../modules/competition-catalog/competition-catalog.handler";
import type { CompetitionCatalogService } from "../../modules/competition-catalog/competition-catalog.service";
import {
  createCompetitionParentInput,
  createCompetitionSpecializationInput,
  getCompetitionCatalogEntryInput,
  listCompetitionCatalogInput,
  moveCompetitionSpecializationInput,
  mutateCompetitionCatalogEntryInput,
  previewCompetitionCatalogImpactInput,
  updateCompetitionCatalogEntryInput,
} from "../../modules/competition-catalog/competition-catalog.types";

describe("competition catalog handler", () => {
  test("delegates every operation and passes the acting admin ID", async () => {
    const service = {
      list: mock(async (input: unknown) => input),
      get: mock(async (input: unknown) => input),
      previewImpact: mock(async (input: unknown) => input),
      createParent: mock(async (adminId: string, input: unknown) => ({
        adminId,
        input,
      })),
      createSpecialization: mock(async (adminId: string, input: unknown) => ({
        adminId,
        input,
      })),
      update: mock(async (adminId: string, input: unknown) => ({
        adminId,
        input,
      })),
      moveSpecialization: mock(async (adminId: string, input: unknown) => ({
        adminId,
        input,
      })),
      archive: mock(async (adminId: string, input: unknown) => ({
        adminId,
        input,
      })),
      restore: mock(async (adminId: string, input: unknown) => ({
        adminId,
        input,
      })),
      remove: mock(async (adminId: string, input: unknown) => ({
        adminId,
        input,
      })),
    } as unknown as CompetitionCatalogService;
    const handler = createCompetitionCatalogHandler(service);
    const adminId = "admin-1";
    const context = {
      session: { user: { id: adminId } },
    } as Context;

    const listInput = listCompetitionCatalogInput.parse({ query: "debate" });
    const getInput = getCompetitionCatalogEntryInput.parse({ id: "entry-1" });
    const impactInput = previewCompetitionCatalogImpactInput.parse({
      id: "entry-1",
    });
    const parentInput = createCompetitionParentInput.parse({
      slug: "debate",
      name: "Debate",
      lightTextColor: "oklch(0.2 0.1 20)",
      lightBackgroundColor: "oklch(0.9 0.05 20)",
      darkTextColor: "oklch(0.9 0.05 20)",
      darkBackgroundColor: "oklch(0.2 0.1 20)",
      reason: "Add catalog entry",
    });
    const specializationInput = createCompetitionSpecializationInput.parse({
      parentId: "parent-1",
      slug: "law-debate",
      name: "Law Debate",
      reason: "Add specialization",
    });
    const updateInput = updateCompetitionCatalogEntryInput.parse({
      id: "entry-1",
      expectedVersion: 1,
      name: "Updated debate",
      reason: "Correct label",
    });
    const moveInput = moveCompetitionSpecializationInput.parse({
      id: "specialization-1",
      parentId: "parent-2",
      expectedVersion: 1,
      reason: "Move specialization",
    });
    const mutateInput = mutateCompetitionCatalogEntryInput.parse({
      id: "entry-1",
      expectedVersion: 1,
      reason: "Update catalog state",
    });

    await handler.listCompetitionCatalog({ input: listInput });
    await handler.getCompetitionCatalogEntry({ input: getInput });
    await handler.previewCompetitionCatalogImpact({ input: impactInput });
    await handler.createCompetitionParent({ context, input: parentInput });
    await handler.createCompetitionSpecialization({
      context,
      input: specializationInput,
    });
    await handler.updateCompetitionCatalogEntry({
      context,
      input: updateInput,
    });
    await handler.moveCompetitionSpecialization({ context, input: moveInput });
    await handler.archiveCompetitionCatalogEntry({
      context,
      input: mutateInput,
    });
    await handler.restoreCompetitionCatalogEntry({
      context,
      input: mutateInput,
    });
    await handler.deleteCompetitionCatalogEntry({
      context,
      input: mutateInput,
    });

    expect(service.list).toHaveBeenCalledWith(listInput);
    expect(service.get).toHaveBeenCalledWith(getInput);
    expect(service.previewImpact).toHaveBeenCalledWith(impactInput);
    expect(service.createParent).toHaveBeenCalledWith(adminId, parentInput);
    expect(service.createSpecialization).toHaveBeenCalledWith(
      adminId,
      specializationInput,
    );
    expect(service.update).toHaveBeenCalledWith(adminId, updateInput);
    expect(service.moveSpecialization).toHaveBeenCalledWith(adminId, moveInput);
    expect(service.archive).toHaveBeenCalledWith(adminId, mutateInput);
    expect(service.restore).toHaveBeenCalledWith(adminId, mutateInput);
    expect(service.remove).toHaveBeenCalledWith(adminId, mutateInput);
  });
});
