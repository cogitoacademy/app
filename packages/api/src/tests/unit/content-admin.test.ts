import { describe, expect, mock, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context } from "../../context";
import { createContentAdminService } from "../../modules/content-admin/content-admin.service";
import { createContentAdminHandler } from "../../modules/content-admin/content-admin.handler";
import { createContentAdminRouter } from "../../modules/content-admin/content-admin.router";
import type { ContentAdminRepo } from "../../modules/content-admin/content-admin.repo";
import { ContentConflictError } from "../../modules/content-admin/content-admin.errors";
import {
  resourceFields,
  eventFields,
} from "../../modules/content-admin/content-admin.types";
import {
  assertPrivateDirectory,
  createPrivateKbStorage,
} from "../../lib/private-kb-storage";
import { createContentService } from "../../modules/content/content.service";
const resource = {
  title: "Panduan",
  description: null,
  category: "guide",
  fileId: "file",
  isActive: true,
  sortOrder: 0,
};
const event = {
  title: "Lomba",
  description: null,
  location: null,
  startDate: "2026-10-24T23:59:00+07:00",
  endDate: "2026-10-25T00:00:00+07:00",
  categoryIds: [],
  educationLevels: [],
  scale: null,
  organizer: null,
  registrationDeadline: null,
  registrationLink: "https://example.test/register",
  socialMediaLink: null,
  isActive: true,
  sortOrder: 0,
};
const storage = () => ({
  put: mock(async () => {}),
  read: mock(async () => new Uint8Array()),
});
function service(overrides: Partial<ContentAdminRepo> = {}, enabled = true) {
  return createContentAdminService({
    repo: { list: async () => [], ...overrides } as ContentAdminRepo,
    storage,
    enabled: () => enabled,
  });
}
describe("content admin boundaries", () => {
  test("single text value accepts any language and rejects locale pairs", () => {
    expect(resourceFields.parse(resource).title).toBe("Panduan");
    expect(
      resourceFields.safeParse({ ...resource, titleEn: "Guide" }).success,
    ).toBe(false);
    expect(resourceFields.safeParse({ ...resource, title: "  " }).success).toBe(
      false,
    );
  });
  test("validates offsets, real dates, ranges, links and duplicate categories", () => {
    expect(eventFields.safeParse(event).success).toBe(true);
    for (const change of [
      { startDate: "2026-02-30T00:00:00Z" },
      { startDate: "2026-10-24T10:00:00" },
      { endDate: "2026-10-01T00:00:00Z" },
      { registrationLink: "javascript:alert(1)" },
      { socialMediaLink: "https://user:pass@example.test" },
      { categoryIds: ["one", "one"] },
    ])
      expect(eventFields.safeParse({ ...event, ...change }).success).toBe(
        false,
      );
  });
  test("disabled authoring touches neither tables nor storage", async () => {
    const list = mock(async () => []);
    await expect(service({ list }, false).list("resource")).rejects.toThrow(
      "not activated",
    );
    expect(list).not.toHaveBeenCalled();
  });
  test("stale save returns conflict and forwards expected version", async () => {
    const save = mock(
      async (..._args: Parameters<ContentAdminRepo["save"]>) => {
        throw new ContentConflictError();
      },
    );
    const router = createContentAdminRouter(
      createContentAdminHandler(service({ save })),
    );
    const client = createRouterClient(router, {
      context: { session: { user: { id: "admin", role: "admin" } } } as Context,
    });
    await expect(
      client.update({
        entry: { kind: "resource", values: resource },
        id: "id",
        expectedVersion: 4,
        reason: "Correction",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(save.mock.calls[0]?.[3]).toMatchObject({
      id: "id",
      expectedVersion: 4,
    });
  });
  test("every admin procedure rejects anonymous, student and tutor before service", async () => {
    const list = mock(async () => []);
    const router = createContentAdminRouter(
      createContentAdminHandler(service({ list })),
    );
    for (const role of [null, "student", "tutor"]) {
      const client = createRouterClient(router, {
        context: {
          session: role ? { user: { id: role, role } } : null,
        } as Context,
      });
      const code = role ? "FORBIDDEN" : "UNAUTHORIZED";
      for (const call of [
        () => client.list({ kind: "resource" }),
        () => client.categories(),
        () =>
          client.create({
            entry: { kind: "resource", values: resource },
            reason: "New guide",
          }),
        () =>
          client.update({
            entry: { kind: "resource", values: resource },
            reason: "Fix guide",
            id: "x",
            expectedVersion: 1,
          }),
        () =>
          client.remove({
            kind: "event",
            id: "x",
            expectedVersion: 1,
            reason: "Remove",
          }),
        () => client.uploadPdf({ fileName: "x.pdf", base64: "JVBERi0=" }),
      ])
        await expect(call()).rejects.toMatchObject({ code });
    }
    expect(list).not.toHaveBeenCalled();
  });
  test("upload verifies PDF bytes and returns no storage URL/key", async () => {
    const put = mock(async () => {});
    const registerFile = mock(async (v: any) => v);
    const s = createContentAdminService({
      repo: { registerFile } as unknown as ContentAdminRepo,
      storage: () => ({ put, read: async () => new Uint8Array() }),
      enabled: () => true,
    });
    await expect(
      s.uploadPdf({ fileName: "x.pdf", base64: btoa("not a PDF") }),
    ).rejects.toThrow("PDF");
    const result = await s.uploadPdf({
      fileName: "x.pdf",
      base64: btoa("%PDF-test"),
    });
    expect(Object.keys(result).toSorted()).toEqual([
      "bytes",
      "fileId",
      "fileName",
    ]);
    expect(put).toHaveBeenCalledTimes(1);
  });
  test("admin mutations retain actor and version, while lists redact import hashes", async () => {
    const row = {
      id: "resource",
      ...resource,
      version: 2,
      sourceHash: "private-import-hash",
    };
    const save = mock(async () => row);
    const remove = mock(async () => ({ removed: true }));
    const router = createContentAdminRouter(
      createContentAdminHandler(
        service({
          list: async () => [row] as any,
          categories: async () =>
            [
              {
                id: "category",
                name: "Competition",
                isActive: true,
                parentId: null,
                sourceHash: "private",
              },
            ] as any,
          save,
          remove,
        }),
      ),
    );
    const client = createRouterClient(router, {
      context: {
        session: { user: { id: "operator", role: "admin" } },
      } as Context,
    });
    const rows = await client.list({ kind: "resource" });
    expect(rows[0]).not.toHaveProperty("sourceHash");
    expect(await client.categories()).toEqual([
      { id: "category", name: "Competition", isActive: true, parentId: null },
    ]);
    const entry = { kind: "resource" as const, values: resource };
    await client.create({ entry, reason: "Create guide" });
    expect(save).toHaveBeenCalledWith(entry, "operator", "Create guide");
    await client.update({
      entry,
      id: row.id,
      expectedVersion: 2,
      reason: "Correct guide",
    });
    expect(save).toHaveBeenLastCalledWith(
      entry,
      "operator",
      "Correct guide",
      expect.objectContaining({ id: row.id, expectedVersion: 2 }),
    );
    await client.remove({
      kind: "resource",
      id: row.id,
      expectedVersion: 2,
      reason: "Withdraw guide",
    });
    expect(remove).toHaveBeenCalledWith(
      "resource",
      row.id,
      2,
      "operator",
      "Withdraw guide",
    );
  });
  test("invalid encoding and failed storage never register a downloadable file", async () => {
    const put = mock(async () => {
      throw new Error("storage unavailable");
    });
    const registerFile = mock(async (v: any) => v);
    const s = createContentAdminService({
      repo: { registerFile } as unknown as ContentAdminRepo,
      storage: () => ({ put, read: async () => new Uint8Array() }),
      enabled: () => true,
    });
    await expect(
      s.uploadPdf({ fileName: "x.pdf", base64: "JVBERi10ZXN0=" }),
    ).rejects.toThrow("encoding");
    expect(put).not.toHaveBeenCalled();
    await expect(
      s.uploadPdf({ fileName: "x.pdf", base64: btoa("%PDF-test") }),
    ).rejects.toThrow("storage unavailable");
    expect(registerFile).not.toHaveBeenCalled();
  });
});
describe("private local PDF storage", () => {
  test("rejects public paths and shared public bucket", () => {
    expect(() =>
      assertPrivateDirectory("uploads/private", "uploads"),
    ).toThrow();
    expect(() => assertPrivateDirectory("uploads", "uploads")).toThrow();
    expect(() =>
      createPrivateKbStorage({
        KB_PRIVATE_BUCKET: "public",
        R2_BUCKET: "public",
      }),
    ).toThrow("separate");
    expect(() => createPrivateKbStorage({ NODE_ENV: "production" })).toThrow(
      "KB_PRIVATE_BUCKET",
    );
  });
  test("private round trip, traversal denial and immutable key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cogito-kb-"));
    try {
      const store = createPrivateKbStorage({
        KB_PRIVATE_DIR: join(dir, "private"),
        UPLOAD_DIR: join(dir, "public"),
      });
      const key = "a".repeat(64) + ".pdf",
        bytes = new TextEncoder().encode("%PDF-test");
      await store.put(key, bytes);
      await store.put(key, bytes);
      expect(await store.read(key)).toEqual(bytes);
      await expect(store.read("../secret")).rejects.toThrow();
      await expect(
        store.put(key, new TextEncoder().encode("%PDF-changed")),
      ).rejects.toThrow("collision");
      expect(await readFile(join(dir, "private", key), "utf8")).toBe(
        "%PDF-test",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
describe("explicit DB cutover", () => {
  test("DB errors never silently fall back to Sanity", async () => {
    const fetch = mock(async () => []);
    const s = createContentService({
      client: { fetch } as any,
      competitionPalette: {} as any,
      kbSource: "database",
      database: {
        resources: async () => {
          throw new Error("unapplied");
        },
      } as any,
    });
    await expect(s.listStudentResources()).rejects.toThrow("unapplied");
    expect(fetch).not.toHaveBeenCalled();
  });
  test("public resource DTO excludes file keys and source metadata", async () => {
    const resources = [
      { id: "stable", title: "Panduan", description: null, category: "guide" },
    ];
    const s = createContentService({
      client: {} as any,
      competitionPalette: {} as any,
      kbSource: "database",
      database: { resources: async () => resources } as any,
    });
    expect(await s.listStudentResources()).toEqual(resources);
  });
});

describe("calendar authoring without a manual reason", () => {
  test("uses automatic audit reasons and retains the resource requirement", async () => {
    const reasons: string[] = [];
    const repo = {
      save: async (_entry: unknown, _actor: string, reason: string) => {
        reasons.push(reason);
        return { id: "event" };
      },
      remove: async (
        _kind: string,
        _id: string,
        _version: number,
        _actor: string,
        reason: string,
      ) => {
        reasons.push(reason);
      },
    } as unknown as ContentAdminRepo;
    const service = createContentAdminService({
      repo,
      storage,
      enabled: () => true,
    });
    await service.create(
      { entry: { kind: "event", values: eventFields.parse(event) } },
      "admin",
    );
    await service.update(
      {
        entry: { kind: "event", values: eventFields.parse(event) },
        id: "event",
        expectedVersion: 1,
      },
      "admin",
    );
    await service.remove(
      { kind: "event", id: "event", expectedVersion: 2 },
      "admin",
    );
    expect(reasons).toEqual([
      "Competition event created",
      "Competition event updated",
      "Competition event deleted",
    ]);
    await expect(
      service.create(
        { entry: { kind: "resource", values: resourceFields.parse(resource) } },
        "admin",
      ),
    ).rejects.toThrow("Enter a reason for change");
  });
});
