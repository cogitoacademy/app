import { afterAll, expect, mock, test } from "bun:test";

let contentDeps: any;
let referralDeps: any;
const put = mock(async () => undefined);
const privateStorage = { put, read: mock(async () => new Uint8Array()) };
const tx: any = {
  execute: async () => [],
  select: () => ({ from: () => ({ where: async () => [] }) }),
  insert: () => ({
    values: () => ({ onConflictDoUpdate: async () => undefined }),
  }),
};
const database = { transaction: async (fn: any) => fn(tx) };
mock.module("../../lib/db", () => ({ db: database }));
mock.module("../../lib/storage", () => ({ createStorage: () => ({ put }) }));
mock.module("../../lib/private-kb-storage", () => ({
  createPrivateKbStorage: () => privateStorage,
  validateKbPdf: async () => undefined,
}));
mock.module("../../modules/audit", () => ({
  createAuditModule: () => ({ service: { record: async () => undefined } }),
}));
mock.module("../../modules/blog", () => ({
  createBlogModule: () => ({
    service: {
      getAdmin: async () => {
        throw new Error("BLOG_LOOKUP");
      },
      createArticle: async () => {
        throw new Error("BLOG_CREATE");
      },
    },
  }),
}));
mock.module("../../modules/faq", () => ({
  createFaqModule: () => ({ service: { listAdmin: async () => [] } }),
}));
mock.module("../../modules/content-admin/content-admin.repo", () => ({
  createContentAdminRepo: () => ({ registerFile: async () => undefined }),
}));
mock.module("../../modules/content-admin/content-admin.service", () => ({
  createContentAdminService: (deps: any) => {
    contentDeps = deps;
    return { create: async () => ({ id: "resource-1" }) };
  },
}));
mock.module("../../modules/referral/referral.service", () => ({
  createReferralService: (deps: any) => {
    referralDeps = deps;
    return {};
  },
}));
mock.module("../../modules/activity/activity.service", () => ({
  saveActivity: async () => undefined,
}));
const { executeOfficeAction } =
  await import("../../modules/office/office-actions");
const original = process.env.OFFICE_WRITES_ENABLED;
afterAll(() => {
  process.env.OFFICE_WRITES_ENABLED = original;
  mock.restore();
});
const body = (input: unknown) => ({
  dryRun: false,
  idempotencyKey: crypto.randomUUID(),
  officeItemId: "item",
  requestedBy: "requester",
  approvedBy: "approver",
  input,
});

test("default configuration refuses disabled writes", async () => {
  delete process.env.OFFICE_WRITES_ENABLED;
  expect(await executeOfficeAction("unsupported", null)).toMatchObject({
    code: "OFFICE_WRITES_DISABLED",
  });
});
test("default adapters enforce wallet denial and resolve private storage", async () => {
  process.env.OFFICE_WRITES_ENABLED = "true";
  await expect(
    executeOfficeAction("faq.publish", body({ id: "missing" })),
  ).rejects.toThrow("OFFICE_TARGET_NOT_FOUND");
  await expect(referralDeps.wallet.getOrCreate()).rejects.toThrow(
    "OFFICE_ACTION_DENIED",
  );
  await expect(referralDeps.wallet.credit()).rejects.toThrow(
    "OFFICE_ACTION_DENIED",
  );
  expect(contentDeps.storage()).toBe(privateStorage);
  expect(typeof contentDeps.enabled()).toBe("boolean");
});
test("existing blog draft is looked up before updating", async () => {
  await expect(
    executeOfficeAction(
      "blog.saveDraft",
      body({
        id: "existing",
        lang: "id",
        title: "Title",
        category: "category",
        body: [{ type: "paragraph", runs: [{ text: "Body" }] }],
      }),
    ),
  ).rejects.toThrow("BLOG_LOOKUP");
});
test("a new blog draft does not require a cover image", async () => {
  await expect(
    executeOfficeAction(
      "blog.saveDraft",
      body({
        lang: "id",
        title: "Title",
        category: "category",
        body: [{ type: "paragraph", runs: [{ text: "Body" }] }],
      }),
    ),
  ).rejects.toThrow("BLOG_CREATE");
});
test("activity save without a returned row fails", async () => {
  await expect(
    executeOfficeAction(
      "activities.saveDraft",
      body({
        title: "Title",
        shortDescription: "Description",
        location: "Online",
        dateTime: "2026-12-31T17:00:00Z",
        body: {
          type: "doc",
          blocks: [{ type: "paragraph", content: [{ text: "Content" }] }],
        },
      }),
    ),
  ).rejects.toThrow("OFFICE_SAVE_FAILED");
});
test("knowledge draft uses configured private storage fallback", async () => {
  const fetcher = async () => new Response("%PDF-stub");
  const result = await executeOfficeAction(
    "knowledge.addDraft",
    body({
      title: "Title",
      description: "Description",
      category: "debate",
      fileUrl: "https://office.cogitoacademy.id/file.pdf",
    }),
    { fetcher: fetcher as typeof fetch },
  );
  expect(result).toMatchObject({ ok: true, id: "resource-1" });
  expect(put).toHaveBeenCalledTimes(1);
});
