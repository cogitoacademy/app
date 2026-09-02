import { describe, expect, mock, test } from "bun:test";
import { createAdminMarkPackageHandler } from "../../modules/admin-mark-package/admin-mark-package.handler";
import { createAdminMarkPackageRouter } from "../../modules/admin-mark-package/admin-mark-package.router";

describe("admin mark package router", () => {
  test("exports the catalog management routes", () => {
    const handler = createAdminMarkPackageHandler({
      list: mock(),
      create: mock(),
      update: mock(),
      setActive: mock(),
    } as any);
    const router = createAdminMarkPackageRouter(handler);

    expect(Object.keys(router).toSorted()).toEqual([
      "create",
      "list",
      "setActive",
      "update",
    ]);
  });
});
