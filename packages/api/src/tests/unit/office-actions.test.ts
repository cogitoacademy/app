import { describe, expect, test } from "bun:test";
import {
  downloadOfficeAsset,
  officeActionBody,
  officeActionSchemas,
  officeAssetUrl,
  parseOfficeAction,
} from "../../modules/office/office-actions.types";
import { isKolCampaignActive } from "../../modules/referral/referral.policy";
import { assertKbPdf } from "../../lib/private-kb-storage";
const id = "office-content-id";
const document = {
  type: "doc",
  blocks: [{ type: "paragraph", content: [{ text: "Office content" }] }],
};
const fixtures = {
  "referrals.createKolCampaign": {
    name: "Campaign",
    code: "OFFICE26",
    activationAt: "2026-11-10T00:00:00+07:00",
    expiresAt: "2027-01-01T00:00:00+07:00",
    flatAmountIdr: 10000,
  },
  "referrals.retireKolCampaign": { code: "OFFICE26" },
  "calendar.saveDraft": {
    title: "Competition",
    description: null,
    location: null,
    startDate: "2027-01-01T00:00:00+07:00",
    endDate: "2027-01-02T00:00:00+07:00",
    categoryIds: [],
    educationLevels: ["sma"],
    scale: "national",
    organizer: null,
    registrationDeadline: null,
    registrationLink: null,
    socialMediaLink: null,
  },
  "calendar.publish": { id },
  "blog.saveDraft": {
    title: "Article",
    lang: "id",
    category: "category-id",
    body: [{ type: "paragraph", runs: [{ text: "Article text" }] }],
  },
  "blog.publish": { id, lang: "en" },
  "activities.saveDraft": {
    title: "Activity",
    shortDescription: "Description",
    location: "Jakarta",
    dateTime: "2027-01-01T00:00:00+07:00",
    body: document,
  },
  "activities.publish": { id },
  "faq.saveDraft": {
    question: "Question?",
    answer: "Answer",
    category: "about",
    onLanding: true,
  },
  "faq.publish": { id },
  "knowledge.addDraft": {
    title: "Resource",
    description: null,
    category: "category-id",
    fileUrl: "https://office.cogitoacademy.id/resource.pdf",
  },
};
describe("Office action trust boundary", () => {
  for (const [name, input] of Object.entries(fixtures)) {
    for (const dryRun of [true, false])
      test(`${name} validates ${dryRun ? "preview" : "write"} contract`, () => {
        expect(
          officeActionBody.parse({
            dryRun,
            idempotencyKey: crypto.randomUUID(),
            officeItemId: "item-id",
            requestedBy: "Requester",
            approvedBy: "Approver",
            input,
          }).dryRun,
        ).toBe(dryRun);
        expect(() => parseOfficeAction(name, input)).not.toThrow();
      });
  }
  for (const name of [
    "payment.refund",
    "wallet.credit",
    "payout.paid",
    "pricing.update",
    "referral_settings.update",
    "booking.override",
    "tutor.approve",
    "achievement.approve",
    "invite.create",
    "messages.send",
    "admin.add",
    "blog.delete",
    "__proto__",
    "constructor",
  ])
    test(`denies ${name}`, () =>
      expect(() => parseOfficeAction(name, {})).toThrow(
        "OFFICE_ACTION_DENIED",
      ));
  for (const url of [
    "http://office.cogitoacademy.id/a",
    "https://office.cogitoacademy.id.evil.test/a",
    "https://evil.test/a",
    "https://user:pass@office.cogitoacademy.id/a",
    "https://office.cogitoacademy.id:8443/a",
    "file:///secret",
    "https://office.cogitoacademy.id/a#fragment",
  ])
    test(`rejects asset ${url}`, () =>
      expect(officeAssetUrl.safeParse(url).success).toBe(false));
  test("allows exact Office HTTPS origin", () =>
    expect(
      officeAssetUrl.safeParse("https://office.cogitoacademy.id/a.png").success,
    ).toBe(true));
  test("requires full approval metadata and UUID", () =>
    expect(
      officeActionBody.safeParse({
        dryRun: false,
        idempotencyKey: "not-uuid",
        input: {},
      }).success,
    ).toBe(false));
  test("rejects unexpected action fields", () =>
    expect(
      officeActionSchemas["faq.publish"].safeParse({ id, delete: true })
        .success,
    ).toBe(false));
  test("retirement stops new registrations without touching historical eligibility", () => {
    expect(
      isKolCampaignActive(
        {
          activationAt: new Date("2026-01-01"),
          expiresAt: new Date("2028-01-01"),
          pausedAt: null,
          retiredAt: new Date("2026-11-10"),
        },
        new Date("2026-11-11"),
      ),
    ).toBe(false);
  });
});
describe("Office asset download", () => {
  test("uses the global fetch when no override is provided", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response("asset")) as typeof fetch;
      const result = await downloadOfficeAsset("https://office.cogitoacademy.id/a", 100);
      expect(result.bytes.toString()).toBe("asset");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  test("disables redirects and sets a timeout", async () => {
    let options: RequestInit | undefined;
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      options = init;
      return new Response("%PDF-test");
    }) as unknown as typeof fetch;
    const result = await downloadOfficeAsset(
      "https://office.cogitoacademy.id/a.pdf",
      100,
      fake,
    );
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(result.bytes.toString()).toBe("%PDF-test");
  });
  test("rejects advertised oversize before reading", async () => {
    const fake = (async () =>
      new Response("small", {
        headers: { "content-length": "1000" },
      })) as unknown as typeof fetch;
    await expect(
      downloadOfficeAsset("https://office.cogitoacademy.id/a", 100, fake),
    ).rejects.toThrow("OFFICE_ASSET_TOO_LARGE");
  });
  test("bounds streamed bodies without content-length", async () => {
    const fake = (async () =>
      new Response(new Uint8Array(101))) as unknown as typeof fetch;
    await expect(
      downloadOfficeAsset("https://office.cogitoacademy.id/a", 100, fake),
    ).rejects.toThrow("OFFICE_ASSET_TOO_LARGE");
  });
  test("rejects unsuccessful response", async () => {
    const fake = (async () =>
      new Response("oops", { status: 503 })) as unknown as typeof fetch;
    await expect(
      downloadOfficeAsset("https://office.cogitoacademy.id/a", 100, fake),
    ).rejects.toThrow("OFFICE_ASSET_UNAVAILABLE");
  });
  test("Office PDF size bound is 20MiB, admin default stays 5MiB", () => {
    const bytes = new Uint8Array(6 * 1024 * 1024);
    bytes.set(new TextEncoder().encode("%PDF-"));
    expect(() => assertKbPdf(bytes)).toThrow();
    expect(() => assertKbPdf(bytes, 20 * 1024 * 1024)).not.toThrow();
    expect(() =>
      assertKbPdf(new Uint8Array(20 * 1024 * 1024 + 1), 20 * 1024 * 1024),
    ).toThrow();
    expect(() =>
      assertKbPdf(new TextEncoder().encode("not pdf"), 20 * 1024 * 1024),
    ).toThrow();
  });
});
