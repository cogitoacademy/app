import { expect, mock, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import type { Context } from "../../context";
import { createReferralHandler } from "../../modules/referral/referral.handler";
import { createReferralRouter } from "../../modules/referral/referral.router";
import {
  ReferralError,
  type ReferralErrorCode,
} from "../../modules/referral/referral.errors";
import type { ReferralService } from "../../modules/referral/referral.service";

const id = "12345678-1234-4234-8234-123456789012";
const campaign = {
  name: "Campaign",
  code: "KOL2026",
  expiresAt: "2030-12-01T00:00:00Z",
  flatAmountIdr: 5000,
};
const adminCases = [
  {
    method: "listUsage",
    input: { search: "", kind: "all", page: 0, limit: 25 },
    actor: false,
  },
  { method: "exportKolMonthly", input: { month: "2026-10" }, actor: false },
  { method: "getKolSettlement", input: { decisionId: id }, actor: false },
  {
    method: "recordKolTransfer",
    input: {
      decisionId: id,
      operationId: id,
      amountIdr: 5000,
      paidAt: "2026-10-01T00:00:00Z",
      reference: "Bank evidence",
    },
    actor: true,
  },
  {
    method: "adjustKolCommission",
    input: {
      decisionId: id,
      operationId: id,
      amountIdr: -5000,
      expectedObligationIdr: 5000,
      reason: "Correct obligation",
    },
    actor: true,
  },
  { method: "getSettings", input: undefined, actor: false },
  {
    method: "updateSettings",
    input: {
      expectedVersion: 1,
      welcomeMarks: 5,
      friendRewardMarks: 5,
      semesterCapMarks: 20,
      reason: "Approved terms",
    },
    actor: true,
  },
  { method: "createKolCampaign", input: campaign, actor: true },
  { method: "listKolCampaigns", input: undefined, actor: false },
  { method: "listKolCommissions", input: { limit: 50 }, actor: false },
] as const;
function context(
  role: string | null,
  emailVerified = true,
  referralChoicePending = false,
): Context {
  return {
    session: role
      ? {
          user: {
            id: "authenticated-actor",
            role,
            emailVerified,
            referralChoicePending,
          },
        }
      : null,
    headers: new Headers(),
  } as Context;
}
function fixture(ctx: Context) {
  const spies = new Map(
    [
      ...adminCases.map(({ method }) => method),
      "getMine",
      "saveGoogleChoice",
    ].map((method) => [
      method,
      mock(async (..._args: unknown[]) => ({ ok: true })),
    ]),
  );
  const handler = createReferralHandler(
    Object.fromEntries(spies) as unknown as ReferralService,
  );
  const client = createRouterClient(createReferralRouter(handler), {
    context: ctx,
  });
  return { spies, handler, client };
}
function adminCall(
  client: ReturnType<typeof fixture>["client"],
  method: string,
  input: unknown,
) {
  return (
    client.adminReferral as unknown as Record<
      string,
      (input: unknown) => Promise<unknown>
    >
  )[method]!(input);
}

for (const entry of adminCases) {
  test(`admin referral ${entry.method} rejects outsiders before any service access`, async () => {
    for (const role of [null, "student", "tutor"]) {
      const { client, spies } = fixture(context(role));
      // eslint-disable-next-line no-await-in-loop -- Exercise each caller with its own service boundary.
      await expect(
        adminCall(client, entry.method, entry.input),
      ).rejects.toMatchObject({ code: role ? "FORBIDDEN" : "UNAUTHORIZED" });
      expect(spies.get(entry.method)).not.toHaveBeenCalled();
    }
  });
  test(`admin referral ${entry.method} uses the authenticated operator and validated terms`, async () => {
    const { client, spies } = fixture(context("admin"));
    const input =
      entry.input === undefined
        ? undefined
        : { ...entry.input, actorId: "spoofed-actor" };
    await expect(adminCall(client, entry.method, input)).resolves.toEqual({
      ok: true,
    });
    const calls = spies.get(entry.method)!.mock.calls;
    expect(calls).toHaveLength(1);
    if (entry.actor) expect(calls[0]![0]).toBe("authenticated-actor");
    const terms = calls[0]![entry.actor ? 1 : 0];
    if (terms) expect(terms).not.toHaveProperty("actorId");
  });
}

test("pending signup can save a normalized choice while paid referral access stays blocked", async () => {
  const { client, spies } = fixture(context("student", false, true));
  await client.referral.saveGoogleChoice({ code: " friend42 " });
  expect(spies.get("saveGoogleChoice")).toHaveBeenCalledWith(
    "authenticated-actor",
    { code: "FRIEND42" },
  );
  await client.referral.saveGoogleChoice({ code: null });
  expect(spies.get("saveGoogleChoice")).toHaveBeenLastCalledWith(
    "authenticated-actor",
    { code: null },
  );
  await expect(client.referral.getMine()).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "REFERRAL_CHOICE_REQUIRED",
  });
  expect(spies.get("getMine")).not.toHaveBeenCalled();
});

test("personal codes require a verified student and do not expose another user's code", async () => {
  for (const role of [null, "admin", "tutor"]) {
    const { client, spies } = fixture(context(role));
    // eslint-disable-next-line no-await-in-loop -- Each role has an independent context and service spy.
    await expect(client.referral.getMine()).rejects.toMatchObject({
      code: role ? "FORBIDDEN" : "UNAUTHORIZED",
    });
    expect(spies.get("getMine")).not.toHaveBeenCalled();
  }
  const unverified = fixture(context("student", false));
  await expect(unverified.client.referral.getMine()).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Email verification required",
  });
  const verified = fixture(context("student"));
  await verified.client.referral.getMine();
  expect(verified.spies.get("getMine")).toHaveBeenCalledWith(
    "authenticated-actor",
  );
});

const errors: Array<[ReferralErrorCode, string]> = [
  ["REFERRAL_STUDENT_ONLY", "FORBIDDEN"],
  ["REFERRAL_CHOICE_REQUIRED", "FORBIDDEN"],
  ["REFERRAL_SETTINGS_CONFLICT", "CONFLICT"],
  ["REFERRAL_CODE_TAKEN", "CONFLICT"],
  ["REFERRAL_CODE_EXHAUSTED", "CONFLICT"],
  ["KOL_SETTLEMENT_CONFLICT", "CONFLICT"],
  ["KOL_SETTLEMENT_INVALID", "BAD_REQUEST"],
  ["INVALID_REFERRAL_CODE", "BAD_REQUEST"],
  ["SELF_REFERRAL", "BAD_REQUEST"],
  ["REFERRAL_CAMPAIGN_INVALID", "BAD_REQUEST"],
  ["REFERRAL_INVALID_CURSOR", "BAD_REQUEST"],
];
test.each(errors)(
  "referral domain error %s retains its RPC classification %s",
  async (code, rpcCode) => {
    const { client, spies } = fixture(context("student"));
    spies
      .get("getMine")!
      .mockRejectedValue(new ReferralError(code, "Review saved terms"));
    await expect(client.referral.getMine()).rejects.toMatchObject({
      code: rpcCode,
      message: "Review saved terms",
    });
  },
);
test("unexpected service failures are preserved for central RPC error handling", async () => {
  const ctx = context("student");
  const { handler, spies } = fixture(ctx);
  const failure = new Error("synthetic database unavailable");
  spies.get("getMine")!.mockRejectedValue(failure);
  await expect(handler.getMine({ context: ctx })).rejects.toBe(failure);
});

test("campaign and settlement validation rejects invalid financial terms before service writes", async () => {
  const { client, spies } = fixture(context("admin"));
  for (const change of [
    { flatAmountIdr: 0, percentBps: 0 },
    { percentBps: 10001 },
    { activationAt: "2031-01-01T00:00:00Z" },
    { attributionWindowDays: 366 },
    { code: "invalid!" },
  ]) {
    // eslint-disable-next-line no-await-in-loop -- Assert each independently invalid financial contract.
    await expect(
      client.adminReferral.createKolCampaign({ ...campaign, ...change }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  expect(spies.get("createKolCampaign")).not.toHaveBeenCalled();
  await client.adminReferral.createKolCampaign({
    ...campaign,
    flatAmountIdr: 0,
    percentBps: 250,
    activationAt: "2030-01-01T00:00:00Z",
  });
  expect(spies.get("createKolCampaign")).toHaveBeenCalledTimes(1);
  await expect(
    client.adminReferral.adjustKolCommission({
      decisionId: id,
      operationId: id,
      amountIdr: 0,
      expectedObligationIdr: 5000,
      reason: "No adjustment",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(spies.get("adjustKolCommission")).not.toHaveBeenCalled();
});
