import type { FaqRepo, FaqRow } from "./faq.repo";
import {
  faqRichTextToAnswerBlocks,
  faqRichTextToPlainText,
} from "./faq-rich-text";
import { FaqNotFoundError, FaqVersionConflictError } from "./faq.errors";
import type { CreateFaqInput, UpdateFaqInput } from "./faq.types";
import type { AdminFaqDto, PublicFaqDto } from "./faq.types";

function toAdminFaqDto(row: FaqRow): AdminFaqDto {
  const modifiedAt =
    row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
  if (!Number.isFinite(modifiedAt.getTime())) {
    throw new Error(`FAQ ${row.id} has an invalid updatedAt value`);
  }

  return {
    id: row.id,
    questionEn: row.questionEn,
    questionId: row.questionId,
    answerEn: row.answerEn,
    answerId: row.answerId,
    questionEnRich: row.questionEnRich,
    questionIdRich: row.questionIdRich,
    answerEnRich: row.answerEnRich,
    answerIdRich: row.answerIdRich,
    isActive: row.isActive,
    showOnLanding: row.showOnLanding,
    version: row.version,
    modifiedAt: modifiedAt.toISOString(),
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
    | "id"
    | "questionEn"
    | "questionId"
    | "questionEnRich"
    | "questionIdRich"
    | "answerEn"
    | "answerId"
    | "answerEnRich"
    | "answerIdRich"
    | "sortOrder"
  >,
  locale: "en" | "id",
): PublicFaqDto {
  const questionId = row.questionId?.trim() ? row.questionId : null;
  const answerId = row.answerId?.length ? row.answerId : null;
  return {
    id: row.id,
    question: localizedText(row.questionEn, row.questionId, locale),
    answer: locale === "id" && answerId ? answerId : row.answerEn,
    questionRich:
      locale === "id" && questionId && row.questionIdRich
        ? row.questionIdRich
        : row.questionEnRich,
    answerRich:
      locale === "id" && answerId && row.answerIdRich
        ? row.answerIdRich
        : row.answerEnRich,
    sortOrder: row.sortOrder,
  };
}

function normalizedFields(input: CreateFaqInput | UpdateFaqInput) {
  const questionIdRich = input.questionIdRich ?? null;
  const answerIdRich = input.answerIdRich ?? null;
  return {
    questionEn: faqRichTextToPlainText(input.questionEnRich),
    questionId: questionIdRich ? faqRichTextToPlainText(questionIdRich) : null,
    answerEn: faqRichTextToAnswerBlocks(input.answerEnRich),
    answerId: answerIdRich ? faqRichTextToAnswerBlocks(answerIdRich) : null,
    questionEnRich: input.questionEnRich,
    questionIdRich,
    answerEnRich: input.answerEnRich,
    answerIdRich,
    isActive: input.isActive,
    showOnLanding: input.isActive && input.showOnLanding,
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
      const collator = new Intl.Collator(input.locale, { sensitivity: "base" });
      return rows
        .map((row) => toPublicFaqDto(row, input.locale))
        .toSorted(
          (left, right) =>
            collator.compare(left.question, right.question) ||
            left.id.localeCompare(right.id),
        )
        .map((entry, index) => ({ ...entry, sortOrder: index }));
    },

    async create(input: CreateFaqInput) {
      return toAdminFaqDto(await repo.create(normalizedFields(input)));
    },

    async update(input: UpdateFaqInput) {
      const { id, expectedVersion } = input;
      const row = await repo.updateIfVersion(
        id,
        expectedVersion,
        normalizedFields(input),
      );
      if (row) return toAdminFaqDto(row);

      const current = await repo.findById(id);
      if (!current) throw new FaqNotFoundError(id);
      throw new FaqVersionConflictError(id, expectedVersion, current.version);
    },
  };
}

export type FaqService = ReturnType<typeof createFaqService>;
