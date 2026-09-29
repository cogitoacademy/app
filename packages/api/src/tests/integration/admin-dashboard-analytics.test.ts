import { beforeAll, describe, expect, test } from "bun:test";

import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
  type TestClient,
} from "../helpers/test-client";

describe("Admin dashboard analytics", () => {
  let adminClient: TestClient;

  beforeAll(async () => {
    await resetDatabase();

    const auth = await signUpAndSignIn(
      `analytics.admin.${Date.now()}@cogito.test`,
      "Test1234!",
      "Analytics Admin",
    );
    const context = await createTestContext(auth.cookie);
    await setUserRole(context.session!.user!.id, "admin");
    adminClient = createTestClient(await createTestContext(auth.cookie));
  });

  test("returns analytics from PostgreSQL", async () => {
    const result = await adminClient.admin.getDashboardAnalytics({
      period: "7d",
    });

    expect(result.period).toBe("7d");
    expect(result.businessSummary.totalAccounts).toBe(1);
    expect(result.businessSummary.totalStudents).toBe(0);
  });
});
