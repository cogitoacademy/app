import { expect, test } from "bun:test";
import { createOfficeHandler, officeAuthorized } from "./http";

test("unset, missing and wrong bearer keys are denied", () => {
  expect(officeAuthorized(null, "secret")).toBe(false);
  expect(officeAuthorized("Bearer wrong", "secret")).toBe(false);
  expect(officeAuthorized("Bearer secret", undefined)).toBe(false);
  expect(officeAuthorized("Bearer secret", "secret")).toBe(true);
});
const make = (enabled = true, limit = true) =>
  createOfficeHandler({
    readKey: () => "read",
    writeKey: () => "write",
    writesEnabled: () => enabled,
    limit: async () => limit,
    snapshot: async () => ({ generatedAt: "test" }),
    action: async () => ({ ok: true }),
  });
test("authorized snapshot has no CORS headers even with browser Origin", async () => {
  const response = await make()(
    new Request("https://api.test/office/snapshot", {
      headers: {
        authorization: "Bearer read",
        origin: "https://app.cogitoacademy.id",
      },
    }),
  );
  expect(response.status).toBe(200);
  expect(
    [...response.headers.keys()].some((key) =>
      key.startsWith("access-control-"),
    ),
  ).toBe(false);
});
test("write switch and rate limits deny before invoking mutation", async () => {
  const request = () =>
    new Request("https://api.test/office/actions/referrals.createKolCampaign", {
      method: "POST",
      headers: { authorization: "Bearer write" },
      body: "{}",
    });
  expect((await make(false)(request())).status).toBe(403);
  expect((await make(true, false)(request())).status).toBe(429);
});
test("dangerous and unknown actions are denied before execution", async () => {
  let mutations = 0;
  const handler = createOfficeHandler({
    readKey: () => "read",
    writeKey: () => "write",
    writesEnabled: () => true,
    limit: async () => true,
    snapshot: async () => ({}),
    action: async () => {
      mutations++;
    },
  });
  for (const name of [
    "refunds.create",
    "wallet.credit",
    "payouts.pay",
    "tax.update",
    "pricing.update",
    "referrals.updateSettings",
    "booking.override",
    "tutor.approve",
    "achievement.approve",
    "invite.create",
    "messages.send",
    "admin.add",
    "blog.delete",
    "__proto__",
  ]) {
    expect(
      (
        await handler(
          new Request(`https://api.test/office/actions/${name}`, {
            method: "POST",
            headers: { authorization: "Bearer write" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
  }
  expect(mutations).toBe(0);
});
test("streamed body limit refuses oversized action input", async () => {
  const response = await make()(
    new Request("https://api.test/office/actions/faq.saveDraft", {
      method: "POST",
      headers: { authorization: "Bearer write" },
      body: "x".repeat(1024 * 1024 + 1),
    }),
  );
  expect(response.status).toBe(413);
});
