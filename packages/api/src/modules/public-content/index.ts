import type { DbType } from "../../lib/db";
import { createPublicContentHandler } from "./public-content.handler";
import { createPublicContentRepo } from "./public-content.repo";
import { createPublicContentService } from "./public-content.service";

export function createPublicContentModule(deps: { db: DbType }) {
  const repo = createPublicContentRepo(deps.db);
  const service = createPublicContentService({ repo });
  const handler = createPublicContentHandler({ service });
  return { service, handler };
}

export type { PublicContentHandler } from "./public-content.handler";
export type { PublicContentService } from "./public-content.service";
export type { PublicTutorDto } from "./public-content.types";
