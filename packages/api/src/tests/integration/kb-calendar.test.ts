import { beforeAll, afterAll, expect, test } from "bun:test";
import { db } from "@cogito-app/db";
import {
  user,
  kbFile,
  kbResource,
  calendarEvent,
  subjectCategory,
  auditLog,
} from "@cogito-app/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createContentAdminRepo } from "../../modules/content-admin/content-admin.repo";
import { insertAuditLog } from "../../modules/audit/audit.repo";
// No reset/seed; explicit guarded TEST database window required.
const prefix = `kb-cc-test-${crypto.randomUUID()}`;
const actorId = `${prefix}-admin`,
  fileId = `${prefix}-file`,
  parentId = `${prefix}-parent`;
const ids: string[] = [];
const ownedCategoryIds: string[] = [];
let cleanup = false;
const enabled = process.env.KB_DB_TEST_WINDOW === "confirmed";
const guardedTest = enabled ? test : test.skip;
const repo = createContentAdminRepo(db, {
  record: (p) => insertAuditLog(p.db, p),
});
async function createCategory(
  id: string,
  options: { parentCategoryId?: string; active?: boolean } = {},
) {
  ownedCategoryIds.push(id);
  await db.insert(subjectCategory).values({
    id,
    parentId: options.parentCategoryId ?? null,
    slug: id,
    name: id,
    isActive: options.active ?? true,
    lightTextColor: options.parentCategoryId ? null : "oklch(0.2 0 0)",
    lightBackgroundColor: options.parentCategoryId ? null : "oklch(0.9 0 0)",
    darkTextColor: options.parentCategoryId ? null : "oklch(0.9 0 0)",
    darkBackgroundColor: options.parentCategoryId ? null : "oklch(0.2 0 0)",
  });
}
const resource = {
  kind: "resource" as const,
  values: {
    title: "Synthetic guide",
    description: null,
    category: "guide",
    fileId,
    isActive: true,
    sortOrder: 0,
  },
};
beforeAll(async () => {
  if (!enabled) return;
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.KB_DB_TEST_WINDOW !== "confirmed" ||
    process.env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "6769" ||
    target.pathname !== "/cogito-test"
  )
    throw new Error(
      "Requires explicit KB_DB_TEST_WINDOW=confirmed and localhost:6769/cogito-test guarded window",
    );
  cleanup = true;
  await db.insert(user).values({
    id: actorId,
    name: "Synthetic admin",
    email: `${prefix}@example.test`,
    role: "admin",
  });
  await repo.registerFile({
    id: fileId,
    storageKey: `${prefix}.pdf`,
    fileName: "synthetic.pdf",
    bytes: 10,
    sha256: "a".repeat(64),
  });
  await db.insert(subjectCategory).values({
    id: parentId,
    slug: prefix,
    name: "Synthetic competition",
    isActive: true,
    lightTextColor: "oklch(0.2 0 0)",
    lightBackgroundColor: "oklch(0.9 0 0)",
    darkTextColor: "oklch(0.9 0 0)",
    darkBackgroundColor: "oklch(0.2 0 0)",
  });
});
afterAll(async () => {
  if (!cleanup) return;
  if (ids.length) {
    await db.delete(calendarEvent).where(inArray(calendarEvent.id, ids));
    await db.delete(kbResource).where(inArray(kbResource.id, ids));
  }
  if (ownedCategoryIds.length)
    await db
      .delete(subjectCategory)
      .where(inArray(subjectCategory.id, ownedCategoryIds));
  await db.delete(subjectCategory).where(eq(subjectCategory.id, parentId));
  await db.delete(kbFile).where(eq(kbFile.id, fileId));
  await db.delete(auditLog).where(eq(auditLog.actorId, actorId));
  await db.delete(user).where(eq(user.id, actorId));
});
guardedTest(
  "concurrent version saves have one winner and one conflict, with one update audit",
  async () => {
    const created = await repo.save(resource, actorId, "Create fixture");
    ids.push(created.id);
    const results = await Promise.allSettled([
      repo.save(
        { ...resource, values: { ...resource.values, title: "A" } },
        actorId,
        "Edit A",
        { id: created.id, expectedVersion: 1 },
      ),
      repo.save(
        { ...resource, values: { ...resource.values, title: "B" } },
        actorId,
        "Edit B",
        { id: created.id, expectedVersion: 1 },
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      (
        await db.select().from(kbResource).where(eq(kbResource.id, created.id))
      )[0]?.version,
    ).toBe(2);
    expect(
      (
        await db
          .select()
          .from(auditLog)
          .where(eq(auditLog.targetId, created.id))
      ).filter((a) => a.action === "content.updated"),
    ).toHaveLength(1);
  },
);
guardedTest("audit failure rolls back content save", async () => {
  const id = `${prefix}-rollback`;
  ids.push(id);
  const failing = createContentAdminRepo(db, {
    record: async () => {
      throw new Error("audit failure");
    },
  });
  await expect(
    failing.save(resource, actorId, "Rollback fixture", undefined, {
      id,
      sourceId: id,
      sourceHash: "hash",
    }),
  ).rejects.toThrow("audit failure");
  expect(
    await db.select().from(kbResource).where(eq(kbResource.id, id)),
  ).toHaveLength(0);
});
guardedTest(
  "calendar references restrict deletion and imported identity cannot be hard deleted",
  async () => {
    const id = `${prefix}-event`;
    ids.push(id);
    await repo.save(
      {
        kind: "event",
        values: {
          title: "Synthetic event",
          description: null,
          location: null,
          startDate: "2026-11-01T17:00:00Z",
          endDate: "2026-11-02T17:00:00Z",
          categoryIds: [parentId],
          educationLevels: [],
          scale: null,
          organizer: null,
          registrationDeadline: null,
          registrationLink: null,
          socialMediaLink: null,
          isActive: true,
          sortOrder: 0,
        },
      },
      actorId,
      "Import fixture",
      undefined,
      { id, sourceId: id, sourceHash: "hash" },
    );
    await expect(
      db
        .delete(subjectCategory)
        .where(eq(subjectCategory.id, parentId))
        .execute(),
    ).rejects.toThrow();
    await expect(
      repo.remove("event", id, 1, actorId, "Delete fixture"),
    ).rejects.toThrow("Archive imported");
  },
);
guardedTest(
  "content repository read projections include active and linked data",
  async () => {
    const activeResource = await repo.save(resource, actorId, "Read fixture");
    const inactiveResource = await repo.save(
      {
        ...resource,
        values: {
          ...resource.values,
          title: "Inactive guide",
          isActive: false,
        },
      },
      actorId,
      "Inactive read fixture",
    );
    ids.push(activeResource.id, inactiveResource.id);
    const eventId = `${prefix}-read-event`;
    ids.push(eventId);
    await repo.save(
      {
        kind: "event",
        values: {
          title: "Read event",
          description: null,
          location: null,
          startDate: "2026-11-01T17:00:00Z",
          endDate: "2026-11-02T17:00:00Z",
          categoryIds: [parentId],
          educationLevels: [],
          scale: null,
          organizer: null,
          registrationDeadline: null,
          registrationLink: null,
          socialMediaLink: null,
          isActive: true,
          sortOrder: 0,
        },
      },
      actorId,
      "Read event fixture",
      undefined,
      { id: eventId, sourceId: eventId, sourceHash: "hash" },
    );

    expect((await repo.list("resource")).map((row) => row.id)).toContain(
      inactiveResource.id,
    );
    expect(
      (await repo.list("resource", true)).map((row) => row.id),
    ).not.toContain(inactiveResource.id);
    expect((await repo.resources()).map((row) => row.id)).toContain(
      activeResource.id,
    );
    expect(
      (await repo.list("event")).find((row) => row.id === eventId)?.categoryIds,
    ).toEqual([parentId]);
    expect((await repo.list("event", true)).map((row) => row.id)).toContain(
      eventId,
    );
    expect((await repo.events()).map((row) => row.id)).toContain(eventId);
    expect(
      (await repo.eventCategories()).some((row) =>
        Object.values(row).some(
          (joined) =>
            joined !== null &&
            typeof joined === "object" &&
            "eventId" in joined &&
            joined.eventId === eventId,
        ),
      ),
    ).toBe(true);
    expect((await repo.categories()).map((category) => category.id)).toContain(
      parentId,
    );
    expect((await repo.file(fileId))?.storageKey).toBe(`${prefix}.pdf`);
    expect((await repo.resourceFile(activeResource.id))?.id).toBe(fileId);
    expect(await repo.resourceFile(inactiveResource.id)).toBeUndefined();
    expect(await repo.file(`${prefix}-missing`)).toBeUndefined();
  },
);

guardedTest(
  "event categories reject invalid selections and retain archived links",
  async () => {
    const archivedId = `${prefix}-archived-category`;
    const inactiveId = `${prefix}-inactive-category`;
    const childId = `${prefix}-child-category`;
    await createCategory(archivedId);
    await createCategory(inactiveId, { active: false });
    await createCategory(childId, { parentCategoryId: parentId });
    const eventId = `${prefix}-category-event`;
    ids.push(eventId);
    const values = {
      title: "Category validation event",
      description: null,
      location: null,
      startDate: "2026-11-01T17:00:00Z",
      endDate: "2026-11-02T17:00:00Z",
      educationLevels: [] as string[],
      scale: null,
      organizer: null,
      registrationDeadline: null,
      registrationLink: null,
      socialMediaLink: null,
      isActive: true,
      sortOrder: 0,
    };
    const entry = (selectedCategoryIds: string[]) => ({
      kind: "event" as const,
      values: { ...values, categoryIds: selectedCategoryIds },
    });

    await expect(
      repo.save(
        entry([`${prefix}-missing-category`]),
        actorId,
        "Missing category",
      ),
    ).rejects.toThrow("Choose existing active parent competitions");
    await expect(
      repo.save(entry([childId]), actorId, "Child category"),
    ).rejects.toThrow("Choose existing active parent competitions");
    await expect(
      repo.save(entry([inactiveId]), actorId, "Archived category"),
    ).rejects.toThrow("Choose existing active parent competitions");

    const created = await repo.save(
      entry([archivedId]),
      actorId,
      "Create archived link",
    );
    ids.push(created.id);
    await db
      .update(subjectCategory)
      .set({ isActive: false })
      .where(eq(subjectCategory.id, archivedId));
    await expect(
      repo.save(entry([archivedId]), actorId, "Retain archived link", {
        id: created.id,
        expectedVersion: 1,
      }),
    ).resolves.toEqual({ id: created.id, version: 2 });
    const empty = await repo.save(entry([]), actorId, "Empty category list");
    ids.push(empty.id);
    expect(
      (await repo.list("event")).find((event) => event.id === empty.id)
        ?.categoryIds,
    ).toEqual([]);
  },
);

guardedTest(
  "private file identity conflicts and resource lifecycle are guarded",
  async () => {
    await expect(
      repo.registerFile({
        id: fileId,
        storageKey: `${prefix}.pdf`,
        fileName: "synthetic.pdf",
        bytes: 10,
        sha256: "a".repeat(64),
      }),
    ).resolves.toMatchObject({ id: fileId });
    await expect(
      repo.registerFile({
        id: fileId,
        storageKey: `${prefix}-different.pdf`,
        fileName: "synthetic.pdf",
        bytes: 10,
        sha256: "a".repeat(64),
      }),
    ).rejects.toThrow("Private file identity conflict");

    await expect(
      repo.save(
        {
          ...resource,
          values: { ...resource.values, fileId: `${prefix}-missing-file` },
        },
        actorId,
        "Missing private file",
      ),
    ).rejects.toThrow("Upload a private PDF before saving");

    const created = await repo.save(
      resource,
      actorId,
      "Resource removal fixture",
    );
    ids.push(created.id);
    await expect(
      repo.remove("resource", created.id, 0, actorId, "Stale resource removal"),
    ).rejects.toThrow("changed or was removed");
    await expect(
      repo.remove(
        "resource",
        `${prefix}-missing-resource`,
        1,
        actorId,
        "Missing resource",
      ),
    ).rejects.toThrow("changed or was removed");
    await expect(
      repo.remove("resource", created.id, 1, actorId, "Archive resource"),
    ).resolves.toEqual({ id: created.id });
    expect(await repo.resourceFile(created.id)).toBeUndefined();
  },
);

guardedTest(
  "calendar lifecycle updates deadlines and removes non-imported events",
  async () => {
    const values = {
      title: "Local calendar event",
      description: null,
      location: null,
      startDate: "2026-11-01T17:00:00Z",
      endDate: "2026-11-02T17:00:00Z",
      categoryIds: [] as string[],
      educationLevels: [] as string[],
      scale: null,
      organizer: null,
      registrationDeadline: "2026-10-30T17:00:00Z",
      registrationLink: null,
      socialMediaLink: null,
      isActive: true,
      sortOrder: 0,
    };
    const created = await repo.save(
      { kind: "event", values },
      actorId,
      "Create local event",
    );
    ids.push(created.id);
    await expect(
      repo.save(
        {
          kind: "event",
          values: {
            ...values,
            title: "Updated local event",
            registrationDeadline: null,
          },
        },
        actorId,
        "Update local event",
        { id: created.id, expectedVersion: 1 },
      ),
    ).resolves.toEqual({ id: created.id, version: 2 });
    await expect(
      repo.remove("event", created.id, 1, actorId, "Stale event removal"),
    ).rejects.toThrow("changed or was removed");
    await expect(
      repo.remove("event", created.id, 2, actorId, "Archive local event"),
    ).resolves.toEqual({ id: created.id });
  },
);
