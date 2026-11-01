import { describe, expect, test, mock } from "bun:test";
import { createRouterClient } from "@orpc/server";

import type { Context } from "../../context";
import { createFaqHandler } from "../../modules/faq/faq.handler";
import {
  FaqNotFoundError,
  FaqVersionConflictError,
} from "../../modules/faq/faq.errors";
import type { FaqRepo, FaqRow } from "../../modules/faq/faq.repo";
import { createFaqRouter } from "../../modules/faq/faq.router";
import { createFaqService } from "../../modules/faq/faq.service";
import { createFaqInput, updateFaqInput } from "../../modules/faq/faq.types";
import type { FaqRichTextDocument } from "@cogito-app/db/schema/faq";

function paragraph(text: string): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: [{ type: "paragraph", content: text ? [{ text }] : [] }],
  };
}

function makeRow(overrides: Partial<FaqRow> = {}): FaqRow {
  return {
    id: "faq-1",
    questionEn: "Where can I get help?",
    questionId: null,
    questionEnRich: paragraph("Where can I get help?"),
    questionIdRich: null,
    answerEn: [{ type: "paragraph", text: "Contact the support team." }],
    answerId: null,
    answerEnRich: paragraph("Contact the support team."),
    answerIdRich: null,
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

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    questionEnRich: paragraph("How do I join?"),
    questionIdRich: null,
    answerEnRich: paragraph("Open the app."),
    answerIdRich: null,
    ...overrides,
  };
}

describe("FAQ content", () => {
  test("accepts rich text, lists and safe links, but rejects unsafe URLs", () => {
    const parsed = createFaqInput.parse(
      validInput({
        questionEnRich: {
          type: "doc",
          blocks: [
            {
              type: "paragraph",
              content: [
                { text: "How do I " },
                { text: "join", bold: true, href: "https://example.com/join" },
                { text: "?" },
              ],
            },
          ],
        },
        answerEnRich: {
          type: "doc",
          blocks: [
            { type: "paragraph", content: [{ text: "Start here." }] },
            {
              type: "list",
              style: "ordered",
              items: [
                [{ text: "Open the app." }],
                [{ text: "Create an account." }],
              ],
            },
          ],
        },
      }),
    );

    expect(parsed.questionEnRich).toMatchObject({
      blocks: [
        {
          content: [
            { text: "How do I " },
            { text: "join", bold: true, href: "https://example.com/join" },
            { text: "?" },
          ],
        },
      ],
    });
    expect(parsed.isActive).toBe(true);
    expect(parsed.showOnLanding).toBe(false);
    expect(
      createFaqInput.safeParse(
        validInput({
          answerEnRich: {
            type: "doc",
            blocks: [
              {
                type: "paragraph",
                content: [{ text: "Bad link", href: "javascript:alert(1)" }],
              },
            ],
          },
        }),
      ).success,
    ).toBe(false);
    expect(
      createFaqInput.safeParse(
        validInput({
          answerEnRich: {
            type: "doc",
            blocks: [
              {
                type: "paragraph",
                content: [{ text: "Bad shape", html: "<b>" }],
              },
            ],
          },
        }),
      ).success,
    ).toBe(false);
  });

  test("uses Indonesian per field and falls back to English independently", async () => {
    const rowWithQuestionOnly = makeRow({
      id: "faq-question-id",
      questionId: "Bagaimana cara bergabung?",
      questionIdRich: paragraph("Bagaimana cara bergabung?"),
      answerId: null,
    });
    const rowWithAnswerOnly = makeRow({
      id: "faq-answer-id",
      questionId: null,
      answerId: [{ type: "list", style: "ordered", items: ["Pertama"] }],
      answerIdRich: {
        type: "doc",
        blocks: [
          { type: "list", style: "ordered", items: [[{ text: "Pertama" }]] },
        ],
      },
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
        questionRich: rowWithQuestionOnly.questionIdRich,
        answerRich: rowWithQuestionOnly.answerEnRich,
        sortOrder: rowWithQuestionOnly.sortOrder,
      },
      {
        id: "faq-answer-id",
        question: rowWithAnswerOnly.questionEn,
        answer: rowWithAnswerOnly.answerId,
        questionRich: rowWithAnswerOnly.questionEnRich,
        answerRich: rowWithAnswerOnly.answerIdRich,
        sortOrder: rowWithAnswerOnly.sortOrder,
      },
    ]);
    expect(Object.keys(entries[0]!)).toEqual([
      "id",
      "question",
      "answer",
      "questionRich",
      "answerRich",
      "sortOrder",
    ]);
  });

  test("stores rich content and maintains a plain public compatibility projection", async () => {
    const input = createFaqInput.parse(
      validInput({
        questionEnRich: {
          type: "doc",
          blocks: [
            {
              type: "paragraph",
              content: [
                { text: "How to " },
                { text: "join", href: "https://example.com" },
                { text: "?" },
              ],
            },
          ],
        },
        answerEnRich: {
          type: "doc",
          blocks: [
            { type: "paragraph", content: [{ text: "Read the guide." }] },
            {
              type: "list",
              style: "unordered",
              items: [
                [{ text: "Create an account." }],
                [{ text: "Join a class." }],
              ],
            },
          ],
        },
        showOnLanding: true,
      }),
    );
    const create = mock(async (values) =>
      makeRow({ ...values, id: "created" }),
    );
    const service = createFaqService({ repo: makeRepo({ create }) as FaqRepo });

    const created = await service.create(input);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        questionEn: "How to join?",
        questionEnRich: input.questionEnRich,
        questionId: null,
        answerEn: [
          { type: "paragraph", text: "Read the guide." },
          {
            type: "list",
            style: "unordered",
            items: ["Create an account.", "Join a class."],
          },
        ],
        showOnLanding: true,
      }),
    );
    expect(created.id).toBe("created");
    expect(created.version).toBe(1);
    expect(created.modifiedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  test("serializes admin modification timestamps as valid ISO dates", async () => {
    const service = createFaqService({
      repo: makeRepo({
        listAdmin: mock(async () => [
          makeRow({ updatedAt: "2026-10-01T00:00:00.000Z" as unknown as Date }),
        ]),
      }) as FaqRepo,
    });

    const [entry] = await service.listAdmin();
    expect(entry?.modifiedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  test("rejects invalid modification timestamps from the repository", async () => {
    const service = createFaqService({
      repo: makeRepo({
        listAdmin: mock(async () => [
          makeRow({ updatedAt: "invalid" as unknown as Date }),
        ]),
      }) as FaqRepo,
    });

    await expect(service.listAdmin()).rejects.toThrow(
      "FAQ faq-1 has an invalid updatedAt value",
    );
  });

  test("preserves repository ordering and persisted sort positions for each locale", async () => {
    const service = createFaqService({
      repo: makeRepo({
        listPublic: mock(async () => [
          makeRow({
            id: "a",
            questionEn: "How?",
            questionId: "Bagaimana?",
            sortOrder: 0,
          }),
          makeRow({
            id: "z",
            questionEn: "When?",
            questionId: "Kapan?",
            sortOrder: 1,
          }),
        ]),
      }) as FaqRepo,
    });

    expect(
      (await service.listPublic({ locale: "en", surface: "full" })).map(
        ({ id, sortOrder }) => [id, sortOrder],
      ),
    ).toEqual([
      ["a", 0],
      ["z", 1],
    ]);
    expect(
      (await service.listPublic({ locale: "id", surface: "full" })).map(
        ({ id, sortOrder }) => [id, sortOrder],
      ),
    ).toEqual([
      ["a", 0],
      ["z", 1],
    ]);
  });

  test("preserves repository ordering when localized questions match", async () => {
    const service = createFaqService({
      repo: makeRepo({
        listPublic: mock(async () => [
          makeRow({ id: "a", questionEn: "Same?", sortOrder: 0 }),
          makeRow({ id: "z", questionEn: "Same?", sortOrder: 1 }),
        ]),
      }) as FaqRepo,
    });

    expect(
      (await service.listPublic({ locale: "en", surface: "full" })).map(
        ({ id }) => id,
      ),
    ).toEqual(["a", "z"]);
  });

  test("uses an atomic expected-version update and reports stale edits", async () => {
    const input = updateFaqInput.parse({
      id: "faq-1",
      expectedVersion: 1,
      ...validInput({
        questionEnRich: paragraph("Updated question"),
        answerEnRich: paragraph("Updated answer"),
      }),
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

  test("reports deletion between an update attempt and version lookup", async () => {
    const input = updateFaqInput.parse({
      id: "faq-1",
      expectedVersion: 1,
      ...validInput(),
    });
    const service = createFaqService({
      repo: makeRepo({
        updateIfVersion: mock(async () => undefined),
        findById: mock(async () => undefined),
      }) as FaqRepo,
    });

    await expect(service.update(input)).rejects.toBeInstanceOf(
      FaqNotFoundError,
    );
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
    const adminClient = createRouterClient(
      createFaqRouter(createFaqHandler(service)),
      { context: context("admin") },
    );
    expect(await adminClient.adminFaq.list({})).toEqual([]);
    expect(
      await adminClient.adminFaq.create(createFaqInput.parse(validInput())),
    ).toMatchObject({ id: "faq-1", questionEn: "How do I join?" });
  });
});
