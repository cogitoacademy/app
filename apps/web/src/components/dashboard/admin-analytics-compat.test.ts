import { describe, expect, test } from "bun:test";
import type { DashboardAnalytics } from "@cogito-app/api/modules/admin/admin.service";

import { getBusinessSummary } from "./admin-analytics-compat";

describe("admin analytics rollout compatibility", () => {
  test("accepts analytics responses from servers without business summary", () => {
    const legacyResponse = {} as DashboardAnalytics;

    expect(getBusinessSummary(legacyResponse)).toBeUndefined();
  });
});
