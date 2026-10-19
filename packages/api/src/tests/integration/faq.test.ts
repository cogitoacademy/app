import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { db } from "@cogito-app/db";
import { faqEntry } from "@cogito-app/db/schema";
import { inArray } from "drizzle-orm";

import type { Context } from "../../context";
import { createFaqModule, createFaqRouter } from "../../modules/faq";

function assertDedicatedTestDatabase() {
  let parsedUrl: URL | undefined;
  try {
    if (process.env.DATABASE_URL) {
      parsedUrl = new URL(process.env.DATABASE_URL);
    }
  } catch {
    parsedUrl = undefined;
  }
  const host = parsedUrl?.hostname.toLowerCase();
  const databaseName = parsedUrl?.pathname.replace(/^\/+/, "");
  if (
    process.env.NODE_ENV !== "test" ||
    databaseName !== "cogito-test" ||
    !["localhost", "127.0.0.1", "::1"].includes(host ?? "")
  ) {
    throw new Error(
      "FAQ integration tests require the local cogito-test database.",
    );
  }
}

function createClients() {
  const module = createFaqModule({ db });
  const router = createFaqRouter(module.handler);
  return {
    adminClient: createRouterClient(router, { context: context("admin") }),
    publicClient: createRouterClient(router, { context: context(null) }),
  };
}

function context(role: "admin" | null): Context {
  return {
    session: role
      ? { user: { id: "faq-test-admin", role, emailVerified: true } }
      : null,
    services: {} as Context["services"],
    headers: new Headers(),
  } as Context;
}

describe("FAQ Postgres integration", () => {
  const fixtureIds: string[] = [];
  let safeToCleanup = false;
  let clients: ReturnType<typeof createClients>;

  beforeAll(() => {
    assertDedicatedTestDatabase();
    safeToCleanup = true;
    clients = createClients();
  });

  afterAll(async () => {
    if (safeToCleanup && fixtureIds.length > 0) {
      assertDedicatedTestDatabase();
      await db.delete(faqEntry).where(inArray(faqEntry.id, fixtureIds));
    }
  });

  test("saves are visible on request-time reads, ordered by surface and locale", async () => {
    const later = await clients.adminClient.adminFaq.create({
      questionEn: "Later question",
      questionId: "Pertanyaan berikutnya",
      answerEn: [{ type: "paragraph", text: "English answer." }],
      answerId: [{ type: "paragraph", text: "Jawaban Indonesia." }],
      sortOrder: 20,
      isActive: true,
      showOnLanding: false,
    });
    fixtureIds.push(later.id);
    const landing = await clients.adminClient.adminFaq.create({
      questionEn: "Landing question",
      answerEn: [
        { type: "paragraph", text: "First paragraph." },
        { type: "list", style: "unordered", items: ["First", "Second"] },
      ],
      sortOrder: 10,
      isActive: true,
      showOnLanding: true,
    });
    fixtureIds.push(landing.id);
    const inactive = await clients.adminClient.adminFaq.create({
      questionEn: "Inactive question",
      answerEn: [{ type: "paragraph", text: "Hidden answer." }],
      sortOrder: 0,
      isActive: false,
      showOnLanding: true,
    });
    fixtureIds.push(inactive.id);

    expect(
      (
        await clients.publicClient.publicContent.faq.list({
          locale: "en",
          surface: "full",
        })
      ).map((entry) => entry.id),
    ).toEqual([landing.id, later.id]);
    expect(
      await clients.publicClient.publicContent.faq.list({
        locale: "id",
        surface: "landing",
      }),
    ).toEqual([
      {
        id: landing.id,
        question: "Landing question",
        answer: [
          { type: "paragraph", text: "First paragraph." },
          { type: "list", style: "unordered", items: ["First", "Second"] },
        ],
        sortOrder: 10,
      },
    ]);

    const saved = await clients.adminClient.adminFaq.update({
      id: later.id,
      expectedVersion: later.version,
      questionEn: "Updated question",
      questionId: "Pertanyaan terbaru",
      answerEn: [{ type: "paragraph", text: "Updated answer." }],
      answerId: null,
      sortOrder: 5,
      isActive: true,
      showOnLanding: true,
    });
    expect(saved.version).toBe(later.version + 1);
    expect(
      await clients.publicClient.publicContent.faq.list({
        locale: "id",
        surface: "landing",
      }),
    ).toEqual([
      {
        id: later.id,
        question: "Pertanyaan terbaru",
        answer: [{ type: "paragraph", text: "Updated answer." }],
        sortOrder: 5,
      },
      {
        id: landing.id,
        question: "Landing question",
        answer: [
          { type: "paragraph", text: "First paragraph." },
          { type: "list", style: "unordered", items: ["First", "Second"] },
        ],
        sortOrder: 10,
      },
    ]);
    await expect(
      clients.adminClient.adminFaq.update({
        id: later.id,
        expectedVersion: later.version,
        questionEn: "Stale question",
        answerEn: [{ type: "paragraph", text: "Stale answer." }],
        sortOrder: 1,
        isActive: true,
        showOnLanding: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const deactivated = await clients.adminClient.adminFaq.update({
      id: later.id,
      expectedVersion: saved.version,
      questionEn: saved.questionEn,
      questionId: saved.questionId ?? undefined,
      answerEn: saved.answerEn,
      answerId: saved.answerId,
      sortOrder: saved.sortOrder,
      isActive: false,
      showOnLanding: true,
    });
    expect(deactivated.isActive).toBe(false);
    expect(
      (
        await clients.publicClient.publicContent.faq.list({
          locale: "en",
          surface: "full",
        })
      ).map((entry) => entry.id),
    ).toEqual([landing.id]);
    expect(
      (
        await clients.publicClient.publicContent.faq.list({
          locale: "en",
          surface: "landing",
        })
      ).map((entry) => entry.id),
    ).toEqual([landing.id]);
  });
});
