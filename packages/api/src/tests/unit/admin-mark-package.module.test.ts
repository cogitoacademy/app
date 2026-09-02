import { describe, expect, mock, test } from "bun:test";
import { createAdminMarkPackageModule } from "../../modules/admin-mark-package";

describe("admin mark package module", () => {
  test("composes repository, service, and handler", () => {
    const module = createAdminMarkPackageModule({
      db: {} as any,
      audit: { record: mock(async () => undefined) },
    });

    expect(module.service).toBeDefined();
    expect(module.handler).toBeDefined();
    expect(module.service.list).toBeFunction();
    expect(module.handler.list).toBeFunction();
  });
});
