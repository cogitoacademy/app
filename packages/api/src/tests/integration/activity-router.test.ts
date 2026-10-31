import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { activityArticle } from "@cogito-app/db/schema";
import {
  createTestClient,
  createTestContext,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

const body = {
  type: "doc" as const,
  blocks: [
    { type: "paragraph" as const, content: [{ text: "Activity details" }] },
  ],
};

function articleInput(overrides: Record<string, unknown> = {}) {
  const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    titleEn: "Community discussion",
    titleId: null,
    descriptionEn: "A discussion",
    descriptionId: null,
    coverUrl: "https://example.com/cover.jpg",
    location: "Online",
    startAt,
    endAt: new Date(Date.parse(startAt) + 60 * 60 * 1000).toISOString(),
    bodyEn: body,
    bodyId: null,
    state: "draft" as const,
    ...overrides,
  };
}

describe("activity router", () => {
  let admin: ReturnType<typeof createTestClient>;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const identity = `${Date.now()}-${crypto.randomUUID()}`;
    const auth = await signUpAndSignIn(
      `activity-router-${identity}@example.com`,
      "Test1234!",
      "Activity Admin",
    );
    const context = await createTestContext(auth.cookie);
    const userId = context.session!.user.id;
    await setUserRole(userId, "admin");
    admin = createTestClient(await createTestContext(auth.cookie));
  });

  test("lists, creates, version-checks, updates, and deletes admin articles", async () => {
    expect(await admin.adminActivities.list()).toBeArray();

    const created = await admin.adminActivities.save(articleInput());
    createdIds.push(created.id);
    expect(created.version).toBe(1);
    expect(created.startAt).toBeInstanceOf(Date);
    expect(created.endAt).toBeInstanceOf(Date);

    const updated = await admin.adminActivities.save({
      ...articleInput({ titleEn: "Updated discussion" }),
      id: created.id,
      expectedVersion: created.version,
    });
    expect(updated.titleEn).toBe("Updated discussion");
    expect(updated.version).toBe(2);

    await expect(
      admin.adminActivities.save({
        ...articleInput({ titleEn: "Stale edit" }),
        id: created.id,
        expectedVersion: created.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(
      await admin.adminActivities.remove({
        id: created.id,
        expectedVersion: 2,
      }),
    ).toEqual({
      success: true,
    });
    createdIds.splice(createdIds.indexOf(created.id), 1);
    await expect(
      admin.adminActivities.remove({ id: created.id, expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("publishes only public articles with localized content and status", async () => {
    const now = Date.now();
    const translated = await admin.adminActivities.save(
      articleInput({
        titleId: "Diskusi komunitas",
        descriptionId: "Sebuah diskusi",
        bodyId: body,
        state: "published",
        startAt: new Date(now + 60 * 60 * 1000).toISOString(),
        endAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      }),
    );
    createdIds.push(translated.id);

    const fallback = await admin.adminActivities.save(
      articleInput({
        state: "published",
        startAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(now - 60 * 60 * 1000).toISOString(),
      }),
    );
    createdIds.push(fallback.id);

    const draft = await admin.adminActivities.save(articleInput());
    createdIds.push(draft.id);

    const indonesian = await admin.publicContent.activities.list({
      locale: "id",
    });
    expect(indonesian).toHaveLength(2);
    const translatedResult = indonesian.find(
      (row) => row.id === translated.id,
    )!;
    expect(translatedResult).toMatchObject({
      title: "Diskusi komunitas",
      description: "Sebuah diskusi",
      body,
      imageUrl: "https://example.com/cover.jpg",
      status: "upcoming",
    });
    const fallbackResult = indonesian.find((row) => row.id === fallback.id)!;
    expect(fallbackResult).toMatchObject({
      title: "Community discussion",
      description: "A discussion",
      body,
      status: "completed",
    });

    const english = await admin.publicContent.activities.list({ locale: "en" });
    expect(english.find((row) => row.id === translated.id)?.title).toBe(
      "Community discussion",
    );
  });

  // resetDatabase intentionally leaves content articles alone; clean only IDs created here.
  afterAll(async () => {
    if (createdIds.length) {
      await db
        .delete(activityArticle)
        .where(inArray(activityArticle.id, createdIds));
    }
  });
});
