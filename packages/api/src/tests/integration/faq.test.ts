import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { db } from "@cogito-app/db";
import { faqEntry } from "@cogito-app/db/schema";
import { and, eq, inArray } from "drizzle-orm";

import type { Context } from "../../context";
import { createFaqModule, createFaqRouter } from "../../modules/faq";
import type { FaqRichTextDocument } from "@cogito-app/db/schema/faq";

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

function richParagraph(text: string): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: [{ type: "paragraph", content: [{ text }] }],
  };
}

function richAnswer(text: string): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: [
      { type: "paragraph", content: [{ text }] },
      {
        type: "list",
        style: "unordered",
        items: [[{ text: "First item" }], [{ text: "Second item" }]],
      },
    ],
  };
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
  let originalLandingSelection: { id: string }[] = [];
  let safeToCleanup = false;
  let clients: ReturnType<typeof createClients>;

  beforeAll(() => {
    assertDedicatedTestDatabase();
    safeToCleanup = true;
    clients = createClients();
  });

  afterAll(async () => {
    if (!safeToCleanup) return;
    assertDedicatedTestDatabase();
    if (fixtureIds.length > 0) {
      await db.delete(faqEntry).where(inArray(faqEntry.id, fixtureIds));
    }
    if (originalLandingSelection.length > 0) {
      await db
        .update(faqEntry)
        .set({ showOnLanding: true })
        .where(
          inArray(
            faqEntry.id,
            originalLandingSelection.map(({ id }) => id),
          ),
        );
    }
  });

  test("keeps public response compatible and orders by localized question", async () => {
    const later = await clients.adminClient.adminFaq.create({
      questionEnRich: richParagraph("Later question"),
      questionIdRich: richParagraph("Pertanyaan berikutnya"),
      answerEnRich: richParagraph("English answer."),
      answerIdRich: richParagraph("Jawaban Indonesia."),
      isActive: true,
      showOnLanding: false,
    });
    fixtureIds.push(later.id);
    const landing = await clients.adminClient.adminFaq.create({
      questionEnRich: richParagraph("Landing question"),
      answerEnRich: richAnswer("First paragraph."),
      isActive: true,
      showOnLanding: true,
    });
    fixtureIds.push(landing.id);
    const inactive = await clients.adminClient.adminFaq.create({
      questionEnRich: richParagraph("Inactive question"),
      answerEnRich: richParagraph("Hidden answer."),
      isActive: false,
      showOnLanding: true,
    });
    fixtureIds.push(inactive.id);

    const adminFaqs = await clients.adminClient.adminFaq.list({});
    expect(
      adminFaqs
        .filter((entry) => fixtureIds.includes(entry.id))
        .map((entry) => entry.id),
    ).toEqual([later.id, landing.id, inactive.id]);
    expect(adminFaqs.find((entry) => entry.id === inactive.id)?.isActive).toBe(
      false,
    );

    const fullFaqs = await clients.publicClient.publicContent.faq.list({
      locale: "en",
      surface: "full",
    });
    expect(
      fullFaqs
        .map((entry) => entry.id)
        .filter((id) => id === landing.id || id === later.id),
    ).toEqual([later.id, landing.id]);

    const landingFaqs = await clients.publicClient.publicContent.faq.list({
      locale: "id",
      surface: "landing",
    });
    const landingIndex = landingFaqs.findIndex(
      (entry) => entry.id === landing.id,
    );
    expect(landingFaqs[landingIndex]).toMatchObject({
      id: landing.id,
      question: "Landing question",
      answer: [
        { type: "paragraph", text: "First paragraph." },
        {
          type: "list",
          style: "unordered",
          items: ["First item", "Second item"],
        },
      ],
      questionRich: richParagraph("Landing question"),
      answerRich: richAnswer("First paragraph."),
    });
    expect(landingFaqs[landingIndex]?.sortOrder).toBeGreaterThanOrEqual(0);

    const saved = await clients.adminClient.adminFaq.update({
      id: later.id,
      expectedVersion: later.version,
      questionEnRich: richParagraph("Updated question"),
      questionIdRich: richParagraph("Pertanyaan terbaru"),
      answerEnRich: richParagraph("Updated answer."),
      answerIdRich: null,
      isActive: true,
      showOnLanding: true,
    });
    expect(saved.version).toBe(later.version + 1);
    expect(saved.modifiedAt).not.toBe(later.modifiedAt);
    const updatedLandingFaqs =
      await clients.publicClient.publicContent.faq.list({
        locale: "id",
        surface: "landing",
      });
    expect(updatedLandingFaqs.map((entry) => entry.id)).toEqual([
      later.id,
      landing.id,
    ]);
    expect(updatedLandingFaqs[0]).toMatchObject({
      question: "Pertanyaan terbaru",
      answer: [{ type: "paragraph", text: "Updated answer." }],
      questionRich: richParagraph("Pertanyaan terbaru"),
      answerRich: richParagraph("Updated answer."),
    });
    expect(updatedLandingFaqs[1]).toMatchObject({
      question: "Landing question",
      answer: [
        { type: "paragraph", text: "First paragraph." },
        {
          type: "list",
          style: "unordered",
          items: ["First item", "Second item"],
        },
      ],
      questionRich: richParagraph("Landing question"),
      answerRich: richAnswer("First paragraph."),
    });
    await expect(
      clients.adminClient.adminFaq.update({
        id: later.id,
        expectedVersion: later.version,
        questionEnRich: richParagraph("Stale question"),
        answerEnRich: richParagraph("Stale answer."),
        isActive: true,
        showOnLanding: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const deactivated = await clients.adminClient.adminFaq.update({
      id: later.id,
      expectedVersion: saved.version,
      questionEnRich: saved.questionEnRich,
      questionIdRich: saved.questionIdRich,
      answerEnRich: saved.answerEnRich,
      answerIdRich: saved.answerIdRich,
      isActive: false,
      showOnLanding: true,
    });
    expect(deactivated.isActive).toBe(false);
    expect(deactivated.showOnLanding).toBe(false);
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

  test("enforces the six-active-entry landing selection cap", async () => {
    const selected = await db
      .select({ id: faqEntry.id })
      .from(faqEntry)
      .where(
        and(eq(faqEntry.isActive, true), eq(faqEntry.showOnLanding, true)),
      );
    originalLandingSelection = selected;
    if (selected.length > 0) {
      await db
        .update(faqEntry)
        .set({ showOnLanding: false })
        .where(
          inArray(
            faqEntry.id,
            selected.map(({ id }) => id),
          ),
        );
    }

    const entries = [];
    for (let index = 0; index < 6; index += 1) {
      const entry = await clients.adminClient.adminFaq.create({
        questionEnRich: richParagraph(`Landing FAQ ${index}`),
        answerEnRich: richParagraph("Answer."),
        isActive: true,
        showOnLanding: true,
      });
      fixtureIds.push(entry.id);
      entries.push(entry);
    }

    await expect(
      clients.adminClient.adminFaq.create({
        questionEnRich: richParagraph("Seventh landing FAQ"),
        answerEnRich: richParagraph("Answer."),
        isActive: true,
        showOnLanding: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const unselected = await clients.adminClient.adminFaq.update({
      id: entries[0]!.id,
      expectedVersion: entries[0]!.version,
      questionEnRich: entries[0]!.questionEnRich,
      answerEnRich: entries[0]!.answerEnRich,
      isActive: true,
      showOnLanding: false,
    });
    const seventh = await clients.adminClient.adminFaq.create({
      questionEnRich: richParagraph("Seventh landing FAQ"),
      answerEnRich: richParagraph("Answer."),
      isActive: true,
      showOnLanding: true,
    });
    fixtureIds.push(seventh.id);
    expect(unselected.showOnLanding).toBe(false);
    expect(seventh.showOnLanding).toBe(true);
  });
});
