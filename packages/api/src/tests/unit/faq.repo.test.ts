import { describe, expect, test } from "bun:test";

import { FaqLandingLimitError } from "../../modules/faq/faq.errors";
import { createFaqRepo } from "../../modules/faq/faq.repo";
import { FAQ_LANDING_MAX_ITEMS } from "../../modules/faq/faq.types";

describe("FAQ repository empty database results", () => {
  test("throws when an insert returns no FAQ row", async () => {
    const tx = {
      execute: async () => undefined,
      insert: () => ({
        values: () => ({ returning: async () => [] }),
      }),
    };
    const db = {
      transaction: async (fn: (transaction: unknown) => unknown) => fn(tx),
    };
    const repo = createFaqRepo(db as any);

    await expect(
      repo.create({
        questionEn: "Question",
        questionId: "Pertanyaan",
        answerEn: "Answer",
        answerId: "Jawaban",
        isActive: false,
        showOnLanding: false,
      } as any),
    ).rejects.toThrow("FAQ insert returned no row");
  });

  test("returns undefined when an update cannot find the current row", async () => {
    const tx = {
      execute: async () => undefined,
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    };
    const db = {
      transaction: async (fn: (transaction: unknown) => unknown) => fn(tx),
    };
    const repo = createFaqRepo(db as any);

    await expect(
      repo.updateIfVersion("missing-faq", 1, { questionEn: "Updated" }),
    ).resolves.toBeUndefined();
  });

  test("rejects a create that would exceed the landing FAQ limit", async () => {
    const tx = {
      execute: async () => undefined,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              Array.from({ length: FAQ_LANDING_MAX_ITEMS }, (_, index) => ({
                id: `faq-${index}`,
              })),
          }),
        }),
      }),
    };
    const db = {
      transaction: async (fn: (transaction: unknown) => unknown) => fn(tx),
    };
    const repo = createFaqRepo(db as any);

    await expect(
      repo.create({
        questionEn: "Question",
        questionId: "Pertanyaan",
        answerEn: "Answer",
        answerId: "Jawaban",
        isActive: true,
        showOnLanding: true,
      } as any),
    ).rejects.toBeInstanceOf(FaqLandingLimitError);
  });
});
