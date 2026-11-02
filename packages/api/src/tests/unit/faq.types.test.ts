import { describe, expect, test } from "bun:test";
import {
  createFaqInput,
  faqAnswerBlockSchema,
  faqAnswerBlocksSchema,
  listAdminFaqInput,
  listPublicFaqInput,
  reorderFaqInput,
  updateFaqInput,
} from "../../modules/faq/faq.types";
import {
  DEFAULT_FAQ_CATEGORY,
  FAQ_CATEGORY_KEYS,
  FAQ_CATEGORY_LABELS,
} from "../../modules/faq/faq-categories";

const doc = (text: string) => ({
  type: "doc" as const,
  blocks: [{ type: "paragraph" as const, content: [{ text }] }],
});

describe("FAQ input schemas", () => {
  test("applies input defaults and validates unique reorder IDs", () => {
    expect(listPublicFaqInput.parse({})).toEqual({
      locale: "en",
      surface: "full",
    });
    expect(listAdminFaqInput.parse({})).toEqual({});
    expect(
      createFaqInput.parse({
        questionEnRich: doc("Q"),
        answerEnRich: doc("A"),
      }),
    ).toMatchObject({ isActive: true, showOnLanding: false });
    expect(reorderFaqInput.safeParse({ ids: ["faq-1", "faq-1"] }).success).toBe(
      false,
    );
    expect(reorderFaqInput.safeParse({ ids: ["faq-1", "faq-2"] }).success).toBe(
      true,
    );
  });

  test("defaults and validates FAQ categories", () => {
    const base = {
      questionEnRich: doc("Q"),
      answerEnRich: doc("A"),
    };
    expect(createFaqInput.parse(base).category).toBe(DEFAULT_FAQ_CATEGORY);
    expect(createFaqInput.parse({ ...base, category: "tutors" }).category).toBe(
      "tutors",
    );
    expect(
      createFaqInput.safeParse({ ...base, category: "unknown" }).success,
    ).toBe(false);
    expect(FAQ_CATEGORY_KEYS).toEqual(Object.keys(FAQ_CATEGORY_LABELS));
    expect(FAQ_CATEGORY_KEYS).toContain(DEFAULT_FAQ_CATEGORY);
  });

  test("requires valid question/answer content and strict update fields", () => {
    expect(
      createFaqInput.safeParse({
        questionEnRich: doc("Q"),
        answerEnRich: doc(""),
      }).success,
    ).toBe(false);
    expect(
      updateFaqInput.safeParse({
        id: "faq-1",
        expectedVersion: 1,
        questionEnRich: doc("Q"),
        answerEnRich: doc("A"),
        isActive: true,
        showOnLanding: false,
        extra: true,
      }).success,
    ).toBe(false);
  });

  test("validates paragraph and list answer blocks", () => {
    expect(
      faqAnswerBlockSchema.safeParse({ type: "paragraph", text: "Answer" })
        .success,
    ).toBe(true);
    expect(
      faqAnswerBlockSchema.safeParse({
        type: "list",
        style: "ordered",
        items: ["First", "Second"],
      }).success,
    ).toBe(true);
    expect(
      faqAnswerBlockSchema.safeParse({
        type: "list",
        style: "invalid",
        items: [],
      }).success,
    ).toBe(false);
    expect(faqAnswerBlocksSchema.safeParse([]).success).toBe(false);
  });
});
