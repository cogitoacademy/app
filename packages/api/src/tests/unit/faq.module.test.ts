import { describe, expect, test } from "bun:test";
import type { DbType } from "../../lib/db";
import type { FaqHandler } from "../../modules/faq/faq.handler";
import { createFaqRouter } from "../../modules/faq/faq.router";
import { createFaqModule } from "../../modules/faq";

const handler = {
  reorder: () => [],
  listPublic: () => [],
  listAdmin: () => [],
  create: () => ({}),
  update: () => ({}),
} as unknown as FaqHandler;

describe("FAQ module wiring", () => {
  test("constructs service and handler from the DB dependency", () => {
    const faqModule = createFaqModule({ db: {} as DbType });
    expect(faqModule.service).toBeDefined();
    expect(faqModule.handler).toBeDefined();
  });

  test("exposes public list and admin CRUD/reorder procedures", () => {
    const router = createFaqRouter(handler);
    expect(Object.keys(router.publicContent.faq)).toEqual(["list"]);
    expect(Object.keys(router.adminFaq)).toEqual([
      "reorder",
      "list",
      "create",
      "update",
    ]);
  });
});
