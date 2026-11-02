import { db } from "@cogito-app/db";
import { faqEntry } from "@cogito-app/db/schema";
import { env } from "@cogito-app/env/server";
import {
  faqAnswerRichTextSchema,
  faqQuestionRichTextSchema,
  faqRichTextToAnswerBlocks,
  faqRichTextToPlainText,
} from "@cogito-app/api/modules/faq/faq-rich-text";
import { faqCategorySchema } from "@cogito-app/api/modules/faq/faq-categories";
import type { FaqRichTextDocument } from "@cogito-app/db/schema/faq";
import { FAQ_LANDING_MAX_ITEMS } from "@cogito-app/api/modules/faq/faq.types";
import { FAQ_SEED_ENTRIES } from "./faq-seed-content";
import { seedPackagesAllowed } from "./seed-packages";

const FAQ_SEED_ID_PREFIX = "f0617000-0000-4000-8000-";

function faqSeedId(index: number) {
  return `${FAQ_SEED_ID_PREFIX}${String(index + 1).padStart(12, "0")}`;
}

function richParagraph(text: string): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: [{ type: "paragraph", content: [{ text }] }],
  };
}

export function buildFaqSeedRows() {
  if (FAQ_SEED_ENTRIES.length !== 55) {
    throw new Error("FAQ seed must contain the 55 approved questions");
  }

  const rows = FAQ_SEED_ENTRIES.map((entry, index) => {
    const questionEnRich = faqQuestionRichTextSchema.parse(
      richParagraph(entry.questionEn),
    );
    const questionIdRich = faqQuestionRichTextSchema.parse(
      richParagraph(entry.questionId),
    );
    const answerEnRich = faqAnswerRichTextSchema.parse(
      richParagraph(entry.answerEn),
    );
    const answerIdRich = faqAnswerRichTextSchema.parse(
      richParagraph(entry.answerId),
    );

    return {
      id: faqSeedId(index),
      category: faqCategorySchema.parse(entry.category),
      sortOrder: index,
      isActive: true,
      showOnLanding: entry.showOnLanding === true,
      questionEn: faqRichTextToPlainText(questionEnRich),
      questionId: faqRichTextToPlainText(questionIdRich),
      answerEn: faqRichTextToAnswerBlocks(answerEnRich),
      answerId: faqRichTextToAnswerBlocks(answerIdRich),
      questionEnRich,
      questionIdRich,
      answerEnRich,
      answerIdRich,
    };
  });

  const landingCount = rows.filter((row) => row.showOnLanding).length;
  if (landingCount > FAQ_LANDING_MAX_ITEMS) {
    throw new Error(
      `FAQ seed selects ${landingCount} landing entries; the limit is ${FAQ_LANDING_MAX_ITEMS}`,
    );
  }

  return rows;
}

export async function seedFaq() {
  const rows = buildFaqSeedRows();
  await db.transaction(async (tx) => {
    await tx
      .insert(faqEntry)
      .values(rows)
      // Stable IDs keep admin edits safe when the seed runs again.
      .onConflictDoNothing({ target: faqEntry.id });
  });
  console.log(
    `Seeded FAQ: ${rows.length} bilingual entries; existing edits preserved.`,
  );
}

if (import.meta.main) {
  if (!seedPackagesAllowed(env.NODE_ENV, process.env.SEED_ALLOWED_IN_PROD)) {
    throw new Error(
      "Refusing to seed FAQ in production/staging without SEED_ALLOWED_IN_PROD=true",
    );
  }
  await seedFaq();
  process.exit(0);
}
