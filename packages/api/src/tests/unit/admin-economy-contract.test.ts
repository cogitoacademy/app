import { describe, expect, test } from "bun:test";
import { createAdminService } from "../../modules/admin/admin.service";
import { createAdminHandler } from "../../modules/admin/admin.handler";
import { createAdminRouter } from "../../modules/admin/admin.router";

describe("V3 admin economy contract", () => {
  test("registers V3 procedures and removes both take-schedule endpoints", () => {
    const service = createAdminService({
      db: {} as any,
      adminRepo: {} as any,
      auditPort: {} as any,
      wallet: {} as any,
      payout: {} as any,
    });
    const router = createAdminRouter(createAdminHandler(service));
    expect(router).not.toHaveProperty("getEconomySettings");
    expect(router).not.toHaveProperty("updateEconomySettings");
    expect(router).toHaveProperty("getV3EconomySettings");
    expect(router).toHaveProperty("previewV3EconomySettings");
    expect(router).toHaveProperty("saveV3EconomySettings");
  });
});
