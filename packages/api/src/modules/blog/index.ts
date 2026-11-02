import type { DbType } from "../../lib/db";
import type { StoragePort } from "../../lib/storage";
import type { AuditPort } from "../audit/audit.service";
import { createBlogHandler } from "./blog.handler";
import { createBlogRepo } from "./blog.repo";
import { createBlogService } from "./blog.service";

export function createBlogModule(deps: {
  db: DbType;
  storage: StoragePort;
  audit: AuditPort;
}) {
  const repo = createBlogRepo(deps.db);
  const service = createBlogService({
    repo,
    storage: deps.storage,
    db: deps.db,
    audit: deps.audit,
  });
  const handler = createBlogHandler(service);
  return { repo, service, handler };
}

export { createBlogRouter } from "./blog.router";
export * from "./blog.types";
export { mapBlogError } from "./blog.errors";
