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
let cleanup = false;
const enabled = process.env.KB_DB_TEST_WINDOW === "confirmed";
const guardedTest = enabled ? test : test.skip;
const repo = createContentAdminRepo(db, {
  record: (p) => insertAuditLog(p.db, p),
});
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
