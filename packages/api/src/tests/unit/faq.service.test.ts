import { describe, expect, mock, test } from "bun:test";
import type { FaqRepo, FaqRow } from "../../modules/faq/faq.repo";
import { createFaqService } from "../../modules/faq/faq.service";
import type { CreateFaqInput } from "../../modules/faq/faq.types";

const question = (text: string) => ({
  type: "doc" as const,
  blocks: [{ type: "paragraph" as const, content: [{ text }] }],
});

const answer = (text: string) => ({
  type: "doc" as const,
  blocks: [{ type: "paragraph" as const, content: [{ text }] }],
});

function row(overrides: Partial<FaqRow> = {}): FaqRow {
  return {
    id: "faq-1",
    questionEn: "Question?",
    questionId: "Pertanyaan?",
    answerEn: [{ type: "paragraph", text: "Answer." }],
    answerId: [{ type: "paragraph", text: "Jawaban." }],
    questionEnRich: question("Question?"),
    questionIdRich: question("Pertanyaan?"),
    answerEnRich: answer("Answer."),
    answerIdRich: answer("Jawaban."),
    isActive: true,
    showOnLanding: true,
    sortOrder: 0,
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as FaqRow;
}

describe("FAQ service", () => {
  test("maps admin rows and rejects invalid modification timestamps", async () => {
    const repo = {
      listAdmin: mock(async () => [row()]),
    } as unknown as FaqRepo;
    const service = createFaqService({ repo });
    expect((await service.listAdmin())[0]?.modifiedAt).toBe(
      "2026-01-02T00:00:00.000Z",
    );

    repo.listAdmin = mock(async () => [
      row({ updatedAt: "not-a-date" as never } as Partial<FaqRow>),
    ]);
    await expect(service.listAdmin()).rejects.toThrow(
      "FAQ faq-1 has an invalid updatedAt value",
    );
  });

  test("localizes public fields with Indonesian fallbacks and landing filter", async () => {
    const listPublic = mock(async () => [
      row(),
      row({
        id: "faq-2",
        questionId: "  ",
        answerId: null,
        questionIdRich: null,
        answerIdRich: null,
      }),
    ]);
    const service = createFaqService({
      repo: { listPublic } as unknown as FaqRepo,
    });

    const localized = await service.listPublic({
      locale: "id",
      surface: "landing",
    });
    expect(listPublic).toHaveBeenCalledWith(true);
    expect(localized.map(({ question, answer }) => [question, answer])).toEqual(
      [
        ["Pertanyaan?", [{ type: "paragraph", text: "Jawaban." }]],
        ["Question?", [{ type: "paragraph", text: "Answer." }]],
      ],
    );
    expect(localized[1]?.questionRich).toEqual(question("Question?"));

    await service.listPublic({ locale: "en", surface: "full" });
    expect(listPublic).toHaveBeenLastCalledWith(false);
  });

  test("normalizes rich text before create and reorder", async () => {
    const faq = row({ questionId: null, answerId: null, showOnLanding: false });
    const create = mock(async () => faq);
    const reorder = mock(async () => undefined);
    const listAdmin = mock(async () => [faq]);
    const service = createFaqService({
      repo: { create, reorder, listAdmin } as unknown as FaqRepo,
    });
    const input: CreateFaqInput = {
      questionEnRich: question("  Why?  "),
      answerEnRich: {
        type: "doc",
        blocks: [
          { type: "paragraph", content: [{ text: " Answer. " }] },
          {
            type: "list",
            style: "unordered",
            items: [[{ text: " One " }], [{ text: "Two" }]],
          },
        ],
      },
      isActive: false,
      showOnLanding: true,
    };

    await service.create(input);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        questionEn: "Why?",
        questionId: null,
        answerEn: [
          { type: "paragraph", text: "Answer." },
          { type: "list", style: "unordered", items: ["One", "Two"] },
        ],
        answerId: null,
        showOnLanding: false,
      }),
    );

    expect(await service.reorder({ ids: ["faq-1"] })).toHaveLength(1);
    expect(reorder).toHaveBeenCalledWith(["faq-1"]);
  });

  test("normalizes optional Indonesian rich text fields", async () => {
    const create = mock(async () => row());
    const service = createFaqService({
      repo: { create } as unknown as FaqRepo,
    });
    await service.create({
      questionEnRich: question("Question"),
      questionIdRich: question("Pertanyaan"),
      answerEnRich: answer("Answer"),
      answerIdRich: answer("Jawaban"),
      isActive: true,
      showOnLanding: true,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: "Pertanyaan",
        answerId: [{ type: "paragraph", text: "Jawaban" }],
        showOnLanding: true,
      }),
    );
  });

  test("updates a row, reports version conflicts, and reports missing IDs", async () => {
    const updateIfVersion = mock(async () => row());
    const findById = mock(async () => row({ version: 4 }));
    const service = createFaqService({
      repo: { updateIfVersion, findById } as unknown as FaqRepo,
    });
    const input = {
      id: "faq-1",
      expectedVersion: 1,
      questionEnRich: question("Q"),
      answerEnRich: answer("A"),
      isActive: true,
      showOnLanding: true,
    } as const;
    expect((await service.update(input)).id).toBe("faq-1");

    updateIfVersion.mockImplementation(async () => undefined);
    await expect(service.update(input)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    findById.mockImplementation(async () => undefined);
    await expect(service.update(input)).rejects.toMatchObject({
      code: "FAQ_NOT_FOUND",
    });
  });
});
