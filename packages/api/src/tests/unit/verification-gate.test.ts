import { describe, expect, test, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";

import { USER_ROLE } from "../../shared/constants";
import {
  createTestClient,
  createTestContext,
  resetDatabase,
  signUpAndSignIn,
  signUpAndSignInUnverified,
} from "../helpers/test-client";

function soloInput(tutorId: string, ts: number) {
  return {
    tutorId,
    availabilitySlotId: `slot.${ts}`,
    modality: "online" as const,
    scheduledStartAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
    scheduledEndAt: new Date(
      Date.now() + 48 * 3600_000 + 90 * 60_000,
    ).toISOString(),
    timezone: "Asia/Jakarta",
  };
}

describe("email-verification gate (paid actions require a verified email)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("unverified student createSolo is FORBIDDEN (not a domain error)", async () => {
    const ts = Date.now();
    const res = await signUpAndSignInUnverified(
      `gate.unverified.${ts}@cogito.test`,
      "Test1234!",
      "Gate Unverified",
    );
    const client = createTestClient(await createTestContext(res.cookie));

    await expect(
      client.booking.createSolo(soloInput("tutor-missing", ts)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("verified student passes the gate and hits the domain layer (NOT_FOUND tutor)", async () => {
    const ts = Date.now() + 1;
    const res = await signUpAndSignInUnverified(
      `gate.verified.${ts}@cogito.test`,
      "Test1234!",
      "Gate Verified",
    );
    const ctx = await createTestContext(res.cookie);
    if (!ctx.session?.user) throw new Error("Session missing");
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, ctx.session.user.id));

    const client = createTestClient(await createTestContext(res.cookie));
    await expect(
      client.booking.createSolo(soloInput("tutor-missing", ts)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("signUpAndSignIn marks users verified so existing suites stay green", async () => {
    const ts = Date.now() + 2;
    const res = await signUpAndSignIn(
      `gate.helper.${ts}@cogito.test`,
      "Test1234!",
      "Gate Helper",
    );
    await createTestContext(res.cookie);
    const [row] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, `gate.helper.${ts}@cogito.test`));
    expect(row?.emailVerified).toBe(true);
  });

  test("requireVerifiedStudent rejects non-students", async () => {
    const { requireVerifiedStudent } = await import("../../procedures");
    await expect(
      (requireVerifiedStudent as any)({
        context: {
          session: { user: { id: "t1", role: USER_ROLE.TUTOR } },
          services: {},
        },
        next: async () => "ok",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("requireVerifiedStudent rejects unauthenticated callers", async () => {
    const { requireVerifiedStudent } = await import("../../procedures");
    await expect(
      (requireVerifiedStudent as any)({
        context: { session: null, services: {} },
        next: async () => "ok",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("requireVerifiedStudent passes a verified student through", async () => {
    const { requireVerifiedStudent } = await import("../../procedures");
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      return "ok";
    };
    const result = await (requireVerifiedStudent as any)({
      context: {
        session: {
          user: { id: "s1", role: USER_ROLE.STUDENT, emailVerified: true },
        },
        services: {},
      },
      next,
    });
    expect(nextCalled).toBe(true);
    expect(result).toBe("ok");
  });
});
