import { describe, expect, test, mock } from "bun:test";
import { createRouterClient } from "@orpc/server";

import type { Context } from "../../context";
import { createFaqHandler } from "../../modules/faq/faq.handler";
import { FaqVersionConflictError } from "../../modules/faq/faq.errors";
import type { FaqRepo, FaqRow } from "../../modules/faq/faq.repo";
import { createFaqRouter } from "../../modules/faq/faq.router";
import { createFaqService } from "../../modules/faq/faq.service";
import { createFaqInput, updateFaqInput } from "../../modules/faq/faq.types";

function makeRow(overrides: Partial<FaqRow> = {}): FaqRow {
  return {
    id: "faq-1",
    questionEn: "Where can I get help?",
    questionId: null,
    answerEn: [{ type: "paragraph", text: "Contact the support team." }],
    answerId: null,
    sortOrder: 1,
    isActive: true,
    showOnLanding: false,
    version: 1,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<FaqRepo> = {}): FaqRepo {
  return {
    listAdmin: mock(async () => []),
    listPublic: mock(async () => []),
    create: mock(async (values) => makeRow(values)),
    updateIfVersion: mock(async () => undefined),
    findById: mock(async () => undefined),
    ...overrides,
  } as FaqRepo;
}

function context(role: "admin" | "student" | null): Context {
  return {
    session: role
      ? { user: { id: "user-1", role, emailVerified: true } }
      : null,
    services: {} as Context["services"],
    headers: new Headers(),
  } as Context;
}

describe("FAQ content", () => {
  test("requires English content and accepts only paragraph or list blocks", () => {
    const parsed = createFaqInput.parse({
      questionEn: "  How do I join?  ",
      answerEn: [{ type: "paragraph", text: "  Open the app.  " }],
    });

    expect(parsed.questionEn).toBe("How do I join?");
    expect(parsed.answerEn).toEqual([
      { type: "paragraph", text: "Open the app." },
    ]);
    expect(parsed.isActive).toBe(true);
    expect(parsed.showOnLanding).toBe(false);
    expect(
      createFaqInput.safeParse({
        questionEn: " ",
        answerEn: [{ type: "paragraph", text: "Answer" }],
      }).success,
    ).toBe(false);
    expect(
      createFaqInput.safeParse({
        questionEn: "Question",
        answerEn: [{ type: "html", html: "<script>alert(1)</script>" }],
      }).success,
    ).toBe(false);
    expect(
      createFaqInput.safeParse({
        questionEn: "Question",
        answerEn: [{ type: "paragraph", text: "Answer", html: "<b>" }],
      }).success,
    ).toBe(false);
  });

  test("uses Indonesian per field and falls back to English independently", async () => {
    const rowWithQuestionOnly = makeRow({
      id: "faq-question-id",
      questionId: "Bagaimana cara bergabung?",
      answerId: null,
    });
    const rowWithAnswerOnly = makeRow({
      id: "faq-answer-id",
      questionId: null,
      answerId: [{ type: "list", style: "ordered", items: ["Pertama"] }],
    });
    const listPublic = mock(async () => [
      rowWithQuestionOnly,
      rowWithAnswerOnly,
    ]);
    const service = createFaqService({
      repo: makeRepo({ listPublic }) as FaqRepo,
    });

    const entries = await service.listPublic({
      locale: "id",
      surface: "landing",
    });

    expect(listPublic).toHaveBeenCalledWith(true);
    expect(entries).toEqual([
      {
        id: "faq-question-id",
        question: "Bagaimana cara bergabung?",
        answer: rowWithQuestionOnly.answerEn,
        sortOrder: 1,
      },
      {
        id: "faq-answer-id",
        question: rowWithAnswerOnly.questionEn,
        answer: rowWithAnswerOnly.answerId,
        sortOrder: 1,
      },
    ]);
    expect(Object.keys(entries[0]!)).toEqual([
      "id",
      "question",
      "answer",
      "sortOrder",
    ]);
  });

  test("normalizes empty Indonesian fields when creating an entry", async () => {
    const input = createFaqInput.parse({
      questionEn: "Question",
      questionId: "   ",
      answerEn: [{ type: "paragraph", text: "Answer" }],
      answerId: null,
      showOnLanding: true,
    });
    const create = mock(async (values) =>
      makeRow({ ...values, id: "created" }),
    );
    const service = createFaqService({ repo: makeRepo({ create }) as FaqRepo });

    const created = await service.create(input);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        questionEn: "Question",
        questionId: null,
        answerId: null,
        showOnLanding: true,
      }),
    );
    expect(created.id).toBe("created");
    expect(created.version).toBe(1);
  });

  test("uses an atomic expected-version update and reports stale edits", async () => {
    const input = updateFaqInput.parse({
      id: "faq-1",
      expectedVersion: 1,
      questionEn: "Updated question",
      answerEn: [{ type: "paragraph", text: "Updated answer" }],
    });
    const updateIfVersion = mock(async () => undefined);
    const findById = mock(async () => makeRow({ version: 2 }));
    const service = createFaqService({
      repo: makeRepo({ updateIfVersion, findById }) as FaqRepo,
    });

    await expect(service.update(input)).rejects.toBeInstanceOf(
      FaqVersionConflictError,
    );
    expect(updateIfVersion).toHaveBeenCalledWith(
      "faq-1",
      1,
      expect.objectContaining({ questionEn: "Updated question" }),
    );
    expect(findById).toHaveBeenCalledWith("faq-1");
  });

  test("allows anonymous public reads and keeps admin writes protected", async () => {
    const service = createFaqService({
      repo: makeRepo({ listPublic: mock(async () => [makeRow()]) }) as FaqRepo,
    });
    const client = createRouterClient(
      createFaqRouter(createFaqHandler(service)),
      { context: context(null) },
    );

    expect(
      await client.publicContent.faq.list({ locale: "en", surface: "full" }),
    ).toHaveLength(1);
    await expect(client.adminFaq.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    const studentClient = createRouterClient(
      createFaqRouter(createFaqHandler(service)),
      { context: context("student") },
    );
    await expect(studentClient.adminFaq.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
