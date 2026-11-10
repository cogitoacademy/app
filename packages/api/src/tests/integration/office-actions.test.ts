import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  activityArticle,
  auditLog,
  blogArticle,
  blogArticleVersion,
  blogCategory,
  blogMedia,
  calendarEvent,
  faqEntry,
  kbFile,
  kbResource,
  officeActionReceipt,
  referralCampaign,
  referralCode,
} from "@cogito-app/db/schema";
import { executeOfficeAction } from "../../modules/office/office-actions";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database-safety";
import type { StoragePort } from "../../lib/storage";
const prefix = `office-${crypto.randomUUID()}`;
const ids = new Set<string>();
const keys: string[] = [];
const stored = new Map<string, Uint8Array>();
const document = {
  type: "doc",
  blocks: [{ type: "paragraph", content: [{ text: "Office test" }] }],
};
const config = {
  authoringEnabled: true,
  storage: {
    async put(key: string, body: Uint8Array) {
      stored.set(key, body);
      return { key, url: `https://office.cogitoacademy.id/${key}` };
    },
    resolvePublicUrl(key: string) {
      return `https://office.cogitoacademy.id/${key}`;
    },
    async getSignedUploadUrl() {
      throw new Error("unused");
    },
  } as StoragePort,
  privateStorage: {
    async put(key: string, bytes: Uint8Array) {
      stored.set(key, bytes);
    },
    async read(key: string) {
      return stored.get(key)!;
    },
  },
  fetcher: (async (url: string) =>
    url.endsWith(".jpg")
      ? new Response(
          Buffer.concat([
            Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
            Buffer.from(prefix),
          ]),
          { headers: { "content-type": "image/jpeg" } },
        )
      : new Response(
          `%PDF-1.7\n${prefix}\n1 0 obj <<>> endobj\n%%EOF`,
        )) as unknown as typeof fetch,
};
function envelope(input: unknown, dryRun = false, key = crypto.randomUUID()) {
  keys.push(key);
  return {
    input,
    dryRun,
    idempotencyKey: key,
    officeItemId: prefix,
    requestedBy: "Office test requester",
    approvedBy: "Office test approver",
  };
}
async function action(name: string, input: unknown) {
  const beforeAudits = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, `office.${name}`));
  const storedBefore = stored.size;
  const preview = await executeOfficeAction(
    name,
    envelope(input, true),
    config,
  );
  expect(preview.ok).toBe(true);
  expect(preview.dryRun).toBe(true);
  expect(stored.size).toBe(storedBefore);
  expect(
    (
      await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, `office.${name}`))
    ).length,
  ).toBe(beforeAudits.length);
  const result = await executeOfficeAction(name, envelope(input), config);
  expect(result.ok).toBe(true);
  expect(result.dryRun).toBe(false);
  ids.add(String(result.id));
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.targetId, String(result.id)));
  expect(
    rows.some(
      (r) =>
        r.actorType === "office" &&
        r.actorId === null &&
        r.details?.requestedBy === "Office test requester" &&
        r.details?.approvedBy === "Office test approver",
    ),
  ).toBe(true);
  return String(result.id);
}
describe("Office actions guarded database acceptance", () => {
  let previousSwitch: string | undefined;
  beforeAll(() => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);
    previousSwitch = process.env.OFFICE_WRITES_ENABLED;
    process.env.OFFICE_WRITES_ENABLED = "true";
  });
  afterAll(async () => {
    if (previousSwitch === undefined) delete process.env.OFFICE_WRITES_ENABLED;
    else process.env.OFFICE_WRITES_ENABLED = previousSwitch;
    const targets = [...ids];
    if (targets.length) {
      await db
        .delete(auditLog)
        .where(sql`${auditLog.details}->>'officeItemId' = ${prefix}`);
      await db
        .delete(blogArticleVersion)
        .where(inArray(blogArticleVersion.articleId, targets));
      await db.delete(blogArticle).where(inArray(blogArticle.id, targets));
      await db
        .delete(referralCode)
        .where(inArray(referralCode.campaignId, targets));
      await db
        .delete(referralCampaign)
        .where(inArray(referralCampaign.id, targets));
      await db
        .delete(activityArticle)
        .where(inArray(activityArticle.id, targets));
      await db.delete(faqEntry).where(inArray(faqEntry.id, targets));
      await db.delete(calendarEvent).where(inArray(calendarEvent.id, targets));
      await db.delete(kbResource).where(inArray(kbResource.id, targets));
      await db.delete(blogCategory).where(inArray(blogCategory.id, targets));
    }
    if (stored.size) {
      await db
        .delete(blogMedia)
        .where(inArray(blogMedia.storageKey, [...stored.keys()]));
      await db
        .delete(kbFile)
        .where(inArray(kbFile.storageKey, [...stored.keys()]));
    }
    if (keys.length)
      await db
        .delete(officeActionReceipt)
        .where(inArray(officeActionReceipt.idempotencyKey, keys));
  });
  test("every allowlisted action previews without mutation, writes and records Office audit actor", async () => {
    const [category] = await db
      .insert(blogCategory)
      .values({
        id: crypto.randomUUID(),
        titleId: prefix,
        titleEn: prefix,
        slugId: prefix,
        slugEn: prefix,
      })
      .returning();
    ids.add(category!.id);
    const code =
      `O${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`.toUpperCase();
    await action("referrals.createKolCampaign", {
      name: prefix,
      code,
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      flatAmountIdr: 1000,
    });
    await action("referrals.retireKolCampaign", { code });
    const event = await action("calendar.saveDraft", {
      title: prefix,
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
    });
    expect(
      (
        await db.select().from(calendarEvent).where(eq(calendarEvent.id, event))
      )[0]?.isActive,
    ).toBe(false);
    await action("calendar.publish", { id: event });
    const article = await action("blog.saveDraft", {
      title: prefix,
      lang: "id",
      category: category!.id,
      body: [{ type: "paragraph", runs: [{ text: "Test article" }] }],
      coverImageUrl: "https://office.cogitoacademy.id/test.jpg",
      seoTitle: "Test article",
      metaDescription: "Test article description",
      lead: "Test lead",
      keyFacts: [{ text: "Fact" }],
    });
    await action("blog.publish", { id: article, lang: "id" });
    const activity = await action("activities.saveDraft", {
      title: prefix,
      shortDescription: "Test",
      location: "Online",
      dateTime: "2027-01-01T00:00:00+07:00",
      body: document,
    });
    expect(
      (
        await db
          .select()
          .from(activityArticle)
          .where(eq(activityArticle.id, activity))
      )[0]?.state,
    ).toBe("draft");
    await action("activities.publish", { id: activity });
    const faq = await action("faq.saveDraft", {
      question: prefix,
      answer: "Test answer",
      category: "about",
      onLanding: false,
    });
    expect(
      (await db.select().from(faqEntry).where(eq(faqEntry.id, faq)))[0]
        ?.isActive,
    ).toBe(false);
    await action("faq.publish", { id: faq });
    const knowledge = await action("knowledge.addDraft", {
      title: prefix,
      description: null,
      category: "test-category",
      fileUrl: "https://office.cogitoacademy.id/test.pdf",
    });
    expect(
      (
        await db.select().from(kbResource).where(eq(kbResource.id, knowledge))
      )[0]?.isActive,
    ).toBe(false);
  });
  test("concurrent same key replays first result for 7 days, expired key may create again", async () => {
    const body = envelope({
      title: prefix,
      shortDescription: "Test",
      location: "Online",
      dateTime: "2027-01-01T00:00:00+07:00",
      body: document,
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        executeOfficeAction("activities.saveDraft", body, config),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    ids.add(String(results[0]!.id));
    const replay = await executeOfficeAction(
      "activities.saveDraft",
      body,
      config,
    );
    expect(replay).toEqual(results[0]!);
    await db
      .update(officeActionReceipt)
      .set({ createdAt: new Date(Date.now() - 8 * 86400_000) })
      .where(eq(officeActionReceipt.idempotencyKey, body.idempotencyKey));
    const next = await executeOfficeAction(
      "activities.saveDraft",
      body,
      config,
    );
    ids.add(String(next.id));
    expect(next.id).not.toBe(results[0]!.id);
  });
  test("disabled switch refuses writes", async () => {
    process.env.OFFICE_WRITES_ENABLED = "false";
    try {
      expect(
        (
          (await executeOfficeAction(
            "faq.publish",
            envelope({ id: "none" }),
            config,
          )) as Record<string, unknown>
        ).code,
      ).toBe("OFFICE_WRITES_DISABLED");
    } finally {
      process.env.OFFICE_WRITES_ENABLED = "true";
    }
  });
});
