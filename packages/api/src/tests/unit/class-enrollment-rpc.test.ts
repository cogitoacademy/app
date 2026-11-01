import { expect, mock, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "../../context";
import { createClassEnrollmentHandler } from "../../modules/class-enrollment/class-enrollment.handler";
import { createClassEnrollmentRouter } from "../../modules/class-enrollment/class-enrollment.router";
import { ClassEnrollmentConflictError } from "../../modules/class-enrollment/class-enrollment.errors";
import type { ClassEnrollmentService } from "../../modules/class-enrollment/class-enrollment.service";

const id = "12345678-1234-4234-8234-123456789012";
const token = "a".repeat(64);
const confirmation = { requestKey: id, quoteVersion: token };
const cancellation = {
  classId: id,
  expectedVersion: 1,
  reason: "Review cancellation",
};
const sessionCancellation = {
  classId: id,
  sessionId: id,
  expectedClassVersion: 1,
  expectedSessionVersion: 1,
  reason: "Review session cancellation",
};
const minimum = {
  classId: id,
  expectedClassVersion: 1,
  decision: "continue",
  reason: "Review minimum",
  replacementStarts: [],
};
const cases = [
  {
    method: "previewAdminCancellation",
    service: "previewAdminCancellation",
    role: "admin",
    actor: true,
    paid: false,
    input: cancellation,
  },
  {
    method: "confirmAdminCancellation",
    service: "confirmAdminCancellation",
    role: "admin",
    actor: true,
    paid: false,
    input: { ...cancellation, ...confirmation },
  },
  {
    method: "previewAdminSessionCancellation",
    service: "previewAdminSessionCancellation",
    role: "admin",
    actor: true,
    paid: false,
    input: sessionCancellation,
  },
  {
    method: "confirmAdminSessionCancellation",
    service: "confirmAdminSessionCancellation",
    role: "admin",
    actor: true,
    paid: false,
    input: { ...sessionCancellation, ...confirmation },
  },
  {
    method: "getAdminMinimumCheck",
    service: "getAdminMinimumCheck",
    role: "admin",
    actor: false,
    paid: false,
    input: { classId: id },
  },
  {
    method: "previewAdminMinimumDecision",
    service: "previewAdminMinimumDecision",
    role: "admin",
    actor: false,
    paid: false,
    input: minimum,
  },
  {
    method: "confirmAdminMinimumDecision",
    service: "confirmAdminMinimumDecision",
    role: "admin",
    actor: true,
    paid: false,
    input: { ...minimum, ...confirmation },
  },
  {
    method: "quoteCancellation",
    service: "quoteCancellation",
    role: "student",
    actor: true,
    paid: false,
    input: { enrollmentId: id },
  },
  {
    method: "confirmCancellation",
    service: "confirmCancellation",
    role: "student",
    actor: true,
    paid: false,
    input: { enrollmentId: id, ...confirmation },
  },
  {
    method: "getMyEnrollments",
    service: "getMyClassEnrollments",
    role: "student",
    actor: true,
    paid: false,
    input: { classId: id },
  },
  {
    method: "createEnrollment",
    service: "createEnrollment",
    role: "student",
    actor: true,
    paid: true,
    input: { classId: id, requestKey: id, plan: "full" },
  },
  {
    method: "completeCheckout",
    service: "completeCheckout",
    role: "student",
    actor: true,
    paid: true,
    input: { enrollmentId: id },
  },
  {
    method: "paySecondInstallment",
    service: "paySecondInstallment",
    role: "student",
    actor: true,
    paid: true,
    input: { enrollmentId: id },
  },
  {
    method: "createTopUpQuote",
    service: "createTopUpQuote",
    role: "student",
    actor: true,
    paid: true,
    input: { enrollmentId: id, ordinal: 1, requestKey: id },
  },
  {
    method: "purchaseTopUp",
    service: "purchaseTopUp",
    role: "student",
    actor: true,
    paid: true,
    input: { attemptId: id, choice: "custom" },
  },
] as const;
const reportInput = {
  classId: id,
  sessionId: id,
  expectedVersion: 0,
  requestKey: id,
  deliveryConfirmed: true as const,
  feedback: {
    discussion: ["Discussed topic"],
    strengths: ["Clear argument"],
    improvements: ["Practice evidence"],
  },
};
function context(
  role: string | null,
  verified = true,
  pending = false,
): Context {
  return {
    session: role
      ? {
          user: {
            id: "session-owner",
            role,
            emailVerified: verified,
            referralChoicePending: pending,
          },
        }
      : null,
    headers: new Headers(),
  } as Context;
}
function fixture(ctx: Context) {
  const names = [
    ...cases.map(({ service }) => service),
    "submitSessionReport",
    "listSessionReports",
  ];
  const spies = new Map(
    names.map((name) => [
      name,
      mock(async (..._args: unknown[]) => {
        throw new ClassEnrollmentConflictError("Saved terms changed");
      }),
    ]),
  );
  const handler = createClassEnrollmentHandler(
    Object.fromEntries(spies) as unknown as ClassEnrollmentService,
  );
  const client = createRouterClient(createClassEnrollmentRouter(handler), {
    context: ctx,
  });
  return { client, handler, spies };
}
function call(
  client: ReturnType<typeof fixture>["client"],
  method: string,
  input: unknown,
) {
  return (
    client as unknown as Record<string, (input: unknown) => Promise<unknown>>
  )[method]!(input);
}
for (const entry of cases) {
  test(`${entry.method} blocks wrong roles before reading or changing enrollment state`, async () => {
    for (const role of [
      null,
      "tutor",
      entry.role === "admin" ? "student" : "admin",
    ]) {
      const { client, spies } = fixture(context(role));
      // eslint-disable-next-line no-await-in-loop -- Every caller must fail before its independent service spy.
      await expect(
        call(client, entry.method, entry.input),
      ).rejects.toMatchObject({ code: role ? "FORBIDDEN" : "UNAUTHORIZED" });
      expect(spies.get(entry.service)).not.toHaveBeenCalled();
    }
  });
  test(`${entry.method} preserves stale-terms conflicts and trusted actor/quote identities`, async () => {
    const { client, spies } = fixture(context(entry.role));
    await expect(call(client, entry.method, entry.input)).rejects.toMatchObject(
      { code: "CONFLICT", message: "Saved terms changed" },
    );
    const args = spies.get(entry.service)!.mock.calls;
    expect(args).toHaveLength(1);
    if (entry.actor) expect(args[0]![0]).toBe("session-owner");
    if ("quoteVersion" in entry.input)
      expect(args[0]!.at(-1)).toMatchObject(confirmation);
  });
  if (entry.paid)
    test(`${entry.method} blocks unverified and pending-signup paid actions`, async () => {
      for (const ctx of [
        context("student", false),
        context("student", true, true),
      ]) {
        const { client, spies } = fixture(ctx);
        // eslint-disable-next-line no-await-in-loop -- Both gates must independently prevent a financial service call.
        await expect(
          call(client, entry.method, entry.input),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(spies.get(entry.service)).not.toHaveBeenCalled();
      }
    });
}

test("private report routes forward trusted identity/role to ownership checks for all supported roles", async () => {
  for (const role of ["student", "tutor", "admin"]) {
    const { client, spies } = fixture(context(role));
    // eslint-disable-next-line no-await-in-loop -- A report's service permission check depends on its caller role.
    await expect(client.submitSessionReport(reportInput)).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
    expect(
      spies.get("submitSessionReport")!.mock.calls[0]?.slice(0, 2),
    ).toEqual(["session-owner", role]);
    // eslint-disable-next-line no-await-in-loop -- Verify both report operations for each role.
    await expect(
      client.listSessionReports({ classId: id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(spies.get("listSessionReports")!.mock.calls[0]?.slice(0, 2)).toEqual(
      ["session-owner", role],
    );
  }
});
test("malformed report actors cannot reach private report services", async () => {
  for (const user of [
    null,
    { id: "", role: "tutor" },
    { id: null, role: "tutor" },
    { id: "actor", role: "outsider" },
  ]) {
    const ctx = {
      session: user ? { user } : null,
      headers: new Headers(),
    } as Context;
    const { handler, spies } = fixture(ctx);
    // eslint-disable-next-line no-await-in-loop -- Each malformed principal must fail before a service call.
    await expect(
      handler.submitSessionReport({ context: ctx, input: reportInput }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // eslint-disable-next-line no-await-in-loop -- Listing must enforce the same principal boundary.
    await expect(
      handler.listSessionReports({ context: ctx, input: {} }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(spies.get("submitSessionReport")).not.toHaveBeenCalled();
    expect(spies.get("listSessionReports")).not.toHaveBeenCalled();
  }
});
test("caller-controlled owner fields and invalid quote tokens never authorize wallet operations", async () => {
  const { client, spies } = fixture(context("student"));
  await expect(
    call(client, "createEnrollment", {
      classId: id,
      requestKey: id,
      plan: "full",
      studentId: "spoofed",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(spies.get("createEnrollment")).not.toHaveBeenCalled();
  await expect(
    call(client, "completeCheckout", {
      enrollmentId: id,
      studentId: "spoofed",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(spies.get("completeCheckout")).toHaveBeenCalledWith(
    "session-owner",
    id,
  );
  await expect(
    client.confirmCancellation({
      enrollmentId: id,
      requestKey: id,
      quoteVersion: "invalid",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(spies.get("confirmCancellation")).not.toHaveBeenCalled();
});
test("minimum decisions cannot smuggle a schedule change into continue or omit a postponement schedule", async () => {
  const { client, spies } = fixture(context("admin"));
  const replacementStarts = [
    {
      sessionId: id,
      expectedSessionVersion: 1,
      startAt: "2030-01-01T00:00:00Z",
    },
  ];
  await expect(
    call(client, "previewAdminMinimumDecision", {
      ...minimum,
      replacementStarts,
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    call(client, "confirmAdminMinimumDecision", {
      ...minimum,
      ...confirmation,
      decision: "postpone",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(spies.get("previewAdminMinimumDecision")).not.toHaveBeenCalled();
  expect(spies.get("confirmAdminMinimumDecision")).not.toHaveBeenCalled();
  await expect(
    call(client, "previewAdminMinimumDecision", {
      ...minimum,
      decision: "postpone",
      replacementStarts,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
