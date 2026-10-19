import type { FaqAnswerBlock as DbFaqAnswerBlock } from "@cogito-app/db/schema/faq";

import type { FaqRepo, FaqRow } from "./faq.repo";
import { FaqNotFoundError, FaqVersionConflictError } from "./faq.errors";
import type { CreateFaqInput, UpdateFaqInput } from "./faq.types";
import type { AdminFaqDto, PublicFaqDto } from "./faq.types";

function toAdminFaqDto(row: FaqRow): AdminFaqDto {
  return {
    id: row.id,
    questionEn: row.questionEn,
    questionId: row.questionId,
    answerEn: row.answerEn,
    answerId: row.answerId,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    showOnLanding: row.showOnLanding,
    version: row.version,
  };
}

function localizedText(
  english: string,
  indonesian: string | null,
  locale: "en" | "id",
) {
  return locale === "id" && indonesian?.trim() ? indonesian : english;
}

function toPublicFaqDto(
  row: Pick<
    FaqRow,
    "id" | "questionEn" | "questionId" | "answerEn" | "answerId" | "sortOrder"
  >,
  locale: "en" | "id",
): PublicFaqDto {
  const answerId = row.answerId?.length ? row.answerId : null;
  return {
    id: row.id,
    question: localizedText(row.questionEn, row.questionId, locale),
    answer: locale === "id" && answerId ? answerId : row.answerEn,
    sortOrder: row.sortOrder,
  };
}

function normalizedFields(input: CreateFaqInput | UpdateFaqInput) {
  return {
    questionEn: input.questionEn.trim(),
    questionId: input.questionId?.trim() || null,
    answerEn: input.answerEn as DbFaqAnswerBlock[],
    answerId: input.answerId?.length
      ? (input.answerId as DbFaqAnswerBlock[])
      : null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    showOnLanding: input.showOnLanding,
  };
}

export function createFaqService(deps: { repo: FaqRepo }) {
  const { repo } = deps;

  return {
    async listAdmin() {
      return (await repo.listAdmin()).map(toAdminFaqDto);
    },

    async listPublic(input: {
      locale: "en" | "id";
      surface: "full" | "landing";
    }) {
      const rows = await repo.listPublic(input.surface === "landing");
      return rows.map((row) => toPublicFaqDto(row, input.locale));
    },

    async create(input: CreateFaqInput) {
      return toAdminFaqDto(await repo.create(normalizedFields(input)));
    },

    async update(input: UpdateFaqInput) {
      const { id, expectedVersion, ...fields } = input;
      const row = await repo.updateIfVersion(
        id,
        expectedVersion,
        normalizedFields({ ...fields, expectedVersion, id }),
      );
      if (row) return toAdminFaqDto(row);

      const current = await repo.findById(id);
      if (!current) throw new FaqNotFoundError(id);
      throw new FaqVersionConflictError(id, expectedVersion, current.version);
    },
  };
}

export type FaqService = ReturnType<typeof createFaqService>;
