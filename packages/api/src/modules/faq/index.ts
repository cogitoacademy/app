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
export { faqAnswerBlockSchema, faqAnswerBlocksSchema } from "./faq.types";
export type { FaqAnswerBlock, AdminFaqDto, PublicFaqDto } from "./faq.types";
