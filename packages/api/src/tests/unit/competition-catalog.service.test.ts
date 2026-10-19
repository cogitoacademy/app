import { describe, expect, mock, test } from "bun:test";
import { createCompetitionCatalogService } from "../../modules/competition-catalog/competition-catalog.service";
import {
  CompetitionCatalogInvalidOperationError,
  CompetitionCatalogInUseError,
  CompetitionCatalogStateConflictError,
  CompetitionCatalogVersionConflictError,
} from "../../modules/competition-catalog/competition-catalog.errors";
import {
  competitionPaletteInput,
  createCompetitionParentInput,
  updateCompetitionCatalogEntryInput,
} from "../../modules/competition-catalog/competition-catalog.types";
import type { TxClient } from "../../lib/tx";

const parent = {
  id: "parent-1",
  parentId: null,
  slug: "competition-example",
  name: "Example",
  nameId: null,
  description: null,
  descriptionId: null,
  lightTextColor: "oklch(1 0 0)",
  lightBackgroundColor: "oklch(0.6 0.15 240)",
  darkTextColor: "oklch(1 0 0)",
  darkBackgroundColor: "oklch(0.6 0.15 240)",
  isActive: true,
  sortOrder: 10,
  version: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const child = {
  ...parent,
  id: "child-1",
  parentId: parent.id,
  slug: "specialization-example",
  name: "Specialization",
  lightTextColor: null,
  lightBackgroundColor: null,
  darkTextColor: null,
  darkBackgroundColor: null,
};

function setup(
  repoOverrides: Record<string, unknown> = {},
  economyOverrides: Record<string, unknown> = {},
) {
  const tx = { execute: mock(async () => undefined) } as unknown as TxClient;
  const db = {
    transaction: mock(async (callback: (tx: TxClient) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const audit = { record: mock(async () => undefined) };
  const economy = {
    getV3Config: mock(async () => ({
      values: { competitionRates: { "competition-example": {} } },
    })),
    ...economyOverrides,
  };
  const repo = {
    listCompetitionCatalog: mock(async () => []),
    getCompetitionCatalogEntry: mock(async () => parent),
    getCompetitionCatalogEntriesByReferences: mock(async () => []),
    listCompetitionCatalogChildren: mock(async () => []),
    insertCompetitionParent: mock(async () => ({ ...parent, isActive: false })),
    insertCompetitionSpecialization: mock(async () => child),
    updateCompetitionCatalogEntry: mock(async () => ({
      ...parent,
      version: 2,
    })),
    setCompetitionCatalogEntryActive: mock(async () => ({
      ...parent,
      isActive: false,
      version: 2,
    })),
    moveCompetitionSpecialization: mock(async () => child),
    deleteCompetitionCatalogEntry: mock(async () => parent),
    countCompetitionCatalogReferences: mock(async () => ({
      tutorAssignments: 0,
      pendingProfileEdits: 0,
      bookings: 0,
      bookingSessions: 0,
      economyRevisions: 0,
      defaultRates: 0,
    })),
    countCompetitionCatalogChildren: mock(async () => 0),
    ...repoOverrides,
  };
  const service = createCompetitionCatalogService({
    db: db as never,
    audit,
    economy: economy as never,
    repo: repo as never,
  });

  return { service, tx, db, audit, economy, repo };
}

describe("competition catalog service", () => {
  test("lists every parent and marks dynamic entries ready only with saved rates", async () => {
    const dynamicParent = {
      ...parent,
      id: "parent-2",
      slug: "competition-policy-debate",
      name: "Policy Debate",
    };
    const { service } = setup(
      { listCompetitionCatalog: mock(async () => [parent, dynamicParent]) },
      {
        getV3Config: mock(async () => ({
          values: {
            competitionRates: {
              "competition-example": { soloMarks: 40, soloFeeIdr: 150000 },
            },
          },
        })),
      },
    );

    const parents = await service.listParents();

    expect(parents).toMatchObject([
      { slug: "competition-example", rateConfigured: true, selectable: true },
      {
        slug: "competition-policy-debate",
        rateConfigured: false,
        selectable: false,
      },
    ]);
  });

  test("requires canonical opaque OKLCH palette values and normalizes them", () => {
    const parsed = competitionPaletteInput.parse({
      lightTextColor: " OKLCH(1.000 0.000 0) ",
      lightBackgroundColor: "oklch(0.695641 0.132326 232.54)",
      darkTextColor: "oklch(0.2036 0.0029 247.97)",
      darkBackgroundColor: "oklch(0.6 0.15 240)",
    });
    expect(parsed.lightTextColor).toBe("oklch(1 0 0)");
    expect(
      competitionPaletteInput.safeParse({
        lightTextColor: "var(--foreground)",
        lightBackgroundColor: "oklch(0.5 0.1 20)",
        darkTextColor: "oklch(0.5 0.1 20)",
        darkBackgroundColor: "oklch(0.5 0.1 20)",
      }).success,
    ).toBe(false);
    expect(
      competitionPaletteInput.safeParse({
        lightTextColor: "oklch(1 0 0 / 50%)",
        lightBackgroundColor: "oklch(0.5 0.1 20)",
        darkTextColor: "oklch(0.5 0.1 20)",
        darkBackgroundColor: "oklch(0.5 0.1 20)",
      }).success,
    ).toBe(false);
    expect(
      createCompetitionParentInput.safeParse({
        slug: "new-parent",
        name: "New parent",
        reason: "Create parent",
      }).success,
    ).toBe(false);
  });

  test("creates an inactive parent and audits the reason in its transaction", async () => {
    const { service, tx, audit, repo } = setup();
    const created = await service.createParent("admin-1", {
      slug: parent.slug,
      name: parent.name,
      lightTextColor: parent.lightTextColor,
      lightBackgroundColor: parent.lightBackgroundColor,
      darkTextColor: parent.darkTextColor,
      darkBackgroundColor: parent.darkBackgroundColor,
      sortOrder: parent.sortOrder,
      reason: "Add the new competition",
    });

    expect(created.isActive).toBe(false);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(repo.insertCompetitionParent).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorType: "admin",
        action: "competition_catalog_parent_created",
        details: { reason: "Add the new competition" },
      }),
    );
  });

  test("archives only the parent and reports subtree use counts", async () => {
    const { service, repo } = setup({
      listCompetitionCatalogChildren: mock(async () => [child]),
      setCompetitionCatalogEntryActive: mock(async () => ({
        ...parent,
        isActive: false,
        version: 2,
      })),
    });

    const result = await service.archive("admin-1", {
      id: parent.id,
      expectedVersion: parent.version,
      reason: "Temporarily retire this competition",
    });

    expect(result.entry.isActive).toBe(false);
    expect(result.affected.childCount).toBe(1);
    expect(repo.setCompetitionCatalogEntryActive).toHaveBeenCalledWith(
      expect.anything(),
      { id: parent.id, expectedVersion: 1, isActive: false },
    );
  });

  test("rejects stale edits before writing or auditing", async () => {
    const { service, audit, repo } = setup({
      getCompetitionCatalogEntry: mock(async () => ({ ...parent, version: 2 })),
    });

    await expect(
      service.update("admin-1", {
        id: parent.id,
        expectedVersion: 1,
        name: "Changed",
        reason: "Rename competition",
      }),
    ).rejects.toBeInstanceOf(CompetitionCatalogVersionConflictError);
    expect(repo.updateCompetitionCatalogEntry).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  test("rejects attempts to change a stable slug or hierarchy through update", () => {
    expect(
      updateCompetitionCatalogEntryInput.safeParse({
        id: parent.id,
        expectedVersion: 1,
        name: "Renamed",
        slug: "new-slug",
        parentId: "other-parent",
        reason: "Rename competition",
      }).success,
    ).toBe(false);
  });

  test("does not let specializations override inherited colors", async () => {
    const { service, repo } = setup({
      getCompetitionCatalogEntry: mock(async () => child),
    });
    await expect(
      service.update("admin-1", {
        id: child.id,
        expectedVersion: child.version,
        lightTextColor: "oklch(1 0 0)",
        reason: "Try to change child colors",
      }),
    ).rejects.toBeInstanceOf(CompetitionCatalogInvalidOperationError);
    expect(repo.updateCompetitionCatalogEntry).not.toHaveBeenCalled();
  });

  test("resolves an archived child by ID before a legacy slug and returns the parent palette", async () => {
    const secondParent = {
      ...parent,
      id: "parent-2",
      slug: "competition-business",
      lightBackgroundColor: "oklch(0.804266 0.214364 151.41)",
      darkBackgroundColor: "oklch(0.804266 0.214364 151.41)",
    };
    const archivedChild = {
      ...child,
      isActive: false,
      parent,
    };
    const { service, repo } = setup({
      getCompetitionCatalogEntriesByReferences: mock(async () => [
        archivedChild,
        secondParent,
      ]),
    });
    const palette = await service.resolveCompetitionPalette({
      id: archivedChild.id,
      slug: "business",
    });
    expect(palette).toEqual({
      lightTextColor: parent.lightTextColor,
      lightBackgroundColor: parent.lightBackgroundColor,
      darkTextColor: parent.darkTextColor,
      darkBackgroundColor: parent.darkBackgroundColor,
    });
    expect(repo.getCompetitionCatalogEntriesByReferences).toHaveBeenCalled();
  });

  test("blocks deleting an entry referenced by default rates", async () => {
    const { service, repo } = setup({
      countCompetitionCatalogReferences: mock(async () => ({
        tutorAssignments: 0,
        pendingProfileEdits: 0,
        bookings: 0,
        bookingSessions: 0,
        economyRevisions: 0,
        defaultRates: 1,
      })),
    });

    await expect(
      service.remove("admin-1", {
        id: parent.id,
        expectedVersion: parent.version,
        reason: "Remove unused competition",
      }),
    ).rejects.toBeInstanceOf(CompetitionCatalogInUseError);
    expect(repo.deleteCompetitionCatalogEntry).not.toHaveBeenCalled();
  });

  test("conflicts when restoring a parent without a configured rate", async () => {
    const { service, repo } = setup(
      {
        getCompetitionCatalogEntry: mock(async () => ({
          ...parent,
          isActive: false,
        })),
      },
      {
        getV3Config: mock(async () => ({ values: { competitionRates: {} } })),
      },
    );

    await expect(
      service.restore("admin-1", {
        id: parent.id,
        expectedVersion: parent.version,
        reason: "Restore competition",
      }),
    ).rejects.toBeInstanceOf(CompetitionCatalogStateConflictError);
    expect(repo.setCompetitionCatalogEntryActive).not.toHaveBeenCalled();
  });
});
