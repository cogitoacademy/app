import type { DbType } from "../../lib/db";
import { createFaqHandler } from "./faq.handler";
import { createFaqRepo } from "./faq.repo";
import { createFaqService } from "./faq.service";

export function createFaqModule(deps: { db: DbType }) {
  const repo = createFaqRepo(deps.db);
  const service = createFaqService({ repo });
  const handler = createFaqHandler(service);
  return { service, handler };
}

export { createFaqRouter } from "./faq.router";
export {
  FAQ_LANDING_MAX_ITEMS,
  faqAnswerBlockSchema,
  faqAnswerBlocksSchema,
} from "./faq.types";
export {
  faqAnswerRichTextSchema,
  faqQuestionRichTextSchema,
  faqRichTextDocumentSchema,
} from "./faq-rich-text";
export type { FaqAnswerBlock, AdminFaqDto, PublicFaqDto } from "./faq.types";
export type { FaqRichTextDocument } from "@cogito-app/db/schema/faq";
