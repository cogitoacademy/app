import { expect, test } from "bun:test";
import {
  countCompetitionCatalogReferences,
  deleteCompetitionCatalogEntry,
  getCompetitionCatalogEntriesByReferences,
  listCompetitionCatalog,
  moveCompetitionSpecialization,
  setCompetitionCatalogEntryActive,
  updateCompetitionCatalogEntry,
} from "../../modules/competition-catalog/competition-catalog.repo";

function connectionFixture(
  options: {
    catalogRows?: unknown[];
    queryResults?: unknown[][];
    mutationResults?: unknown[][];
  } = {},
) {
  const queryResults = options.queryResults ?? [];
  const mutationResults = options.mutationResults ?? [];
  let selectIndex = 0;
  let mutationIndex = 0;
  let catalogReads = 0;

  function queryBuilder(result: unknown[] = []) {
    const query = {
      from: () => query,
      where: () => query,
      orderBy: () => query,
      values: () => query,
      set: () => query,
      returning: async () => mutationResults[mutationIndex++] ?? [],
      // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
      then: (resolve: (result: unknown[]) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  }

  const connection = {
    query: {
      subjectCategory: {
        findMany: async () => {
          catalogReads += 1;
          return options.catalogRows ?? [];
        },
      },
    },
    select: () => queryBuilder(queryResults[selectIndex++] ?? []),
    update: () => queryBuilder(),
    delete: () => queryBuilder(),
  };

  return {
    connection: connection as never,
    get catalogReads() {
      return catalogReads;
    },
    get selectCalls() {
      return selectIndex;
    },
  };
}

test("catalog listing hides inactive entries unless archived entries are requested", async () => {
  const rows = [
    {
      id: "active-root",
      slug: "active-root",
      name: "Active root",
      nameId: null,
      description: null,
      descriptionId: null,
      parentId: null,
      parent: null,
      isActive: true,
    },
    {
      id: "active-child",
      slug: "active-child",
      name: "Active child",
      nameId: null,
      description: null,
      descriptionId: null,
      parentId: "active-root",
      parent: { isActive: true },
      isActive: true,
    },
    {
      id: "inactive-root",
      slug: "inactive-root",
      name: "Inactive root",
      nameId: null,
      description: null,
      descriptionId: null,
      parentId: null,
      parent: null,
      isActive: false,
    },
    {
      id: "inactive-parent-child",
      slug: "inactive-parent-child",
      name: "Inactive parent child",
      nameId: null,
      description: null,
      descriptionId: null,
      parentId: "archived-root",
      parent: { isActive: false },
      isActive: true,
    },
  ];
  const fixture = connectionFixture({ catalogRows: rows });

  await expect(
    listCompetitionCatalog(fixture.connection, { includeArchived: false }),
  ).resolves.toMatchObject([{ id: "active-root" }, { id: "active-child" }]);
  await expect(
    listCompetitionCatalog(fixture.connection, { includeArchived: true }),
  ).resolves.toHaveLength(4);
  expect(fixture.catalogReads).toBe(2);
});

test("catalog references return early when empty and query either reference kind", async () => {
  const fixture = connectionFixture();

  await expect(
    getCompetitionCatalogEntriesByReferences(fixture.connection, {
      ids: [],
      slugs: [],
    }),
  ).resolves.toEqual([]);
  expect(fixture.catalogReads).toBe(0);

  await getCompetitionCatalogEntriesByReferences(fixture.connection, {
    ids: ["id-1"],
    slugs: [],
  });
  await getCompetitionCatalogEntriesByReferences(fixture.connection, {
    ids: [],
    slugs: ["slug-1"],
  });
  expect(fixture.catalogReads).toBe(2);
});

test("catalog updates include supplied fields and return null for stale mutations", async () => {
  const row = { id: "entry-1", version: 2 };
  const fixture = connectionFixture({
    mutationResults: [[row], [], [], [], []],
  });

  await expect(
    updateCompetitionCatalogEntry(fixture.connection, {
      id: "entry-1",
      expectedVersion: 1,
      name: "Name",
      nameId: "Nama",
      description: "Description",
      descriptionId: "Deskripsi",
      lightTextColor: "#000000",
      lightBackgroundColor: "#ffffff",
      darkTextColor: "#ffffff",
      darkBackgroundColor: "#000000",
      sortOrder: 3,
      reason: "Catalog correction",
    }),
  ).resolves.toEqual(row);
  await expect(
    updateCompetitionCatalogEntry(fixture.connection, {
      id: "entry-1",
      expectedVersion: 2,
      name: "Conflicting name",
      reason: "Stale correction",
    }),
  ).resolves.toBeNull();
  await expect(
    setCompetitionCatalogEntryActive(fixture.connection, {
      id: "entry-1",
      expectedVersion: 2,
      isActive: false,
    }),
  ).resolves.toBeNull();
  await expect(
    moveCompetitionSpecialization(
      fixture.connection,
      { id: "entry-1", parentId: "parent-1", expectedVersion: 2 },
      true,
    ),
  ).resolves.toBeNull();
  await expect(
    deleteCompetitionCatalogEntry(fixture.connection, {
      id: "entry-1",
      expectedVersion: 2,
    }),
  ).resolves.toBeNull();
});

test("reference counts short-circuit empty entries and handle absent and calendar counts", async () => {
  const emptyFixture = connectionFixture();
  await expect(
    countCompetitionCatalogReferences(emptyFixture.connection, []),
  ).resolves.toMatchObject({
    tutorAssignments: 0,
    pendingProfileEdits: 0,
    bookings: 0,
    bookingSessions: 0,
    historicalTutorProfileAudits: 0,
    economyRevisions: 0,
    defaultRates: 0,
    calendarEvents: 0,
  });
  expect(emptyFixture.selectCalls).toBe(0);

  const entry = [{ id: "entry-1", slug: "english" }];
  const defaultFixture = connectionFixture({
    queryResults: [
      [],
      [{ count: 2 }],
      [{ count: 3 }],
      [{ count: 4 }],
      [{ count: 5 }],
      [{ count: 6 }],
    ],
  });
  await expect(
    countCompetitionCatalogReferences(defaultFixture.connection, entry),
  ).resolves.toMatchObject({
    tutorAssignments: 0,
    pendingProfileEdits: 2,
    historicalTutorProfileAudits: 3,
    bookings: 4,
    economyRevisions: 5,
    bookingSessions: 6,
    calendarEvents: 0,
  });
  expect(defaultFixture.selectCalls).toBe(6);

  const calendarFixture = connectionFixture({
    queryResults: Array.from({ length: 7 }, (_, index) => [
      { count: index + 1 },
    ]),
  });
  await expect(
    countCompetitionCatalogReferences(calendarFixture.connection, entry, true),
  ).resolves.toMatchObject({ calendarEvents: 7 });
  expect(calendarFixture.selectCalls).toBe(7);
});
