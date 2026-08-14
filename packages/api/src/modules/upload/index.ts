import type { DbType } from "../../lib/db";
import type { StoragePort } from "../../lib/storage";
import { createUploadService } from "./upload.service";
import { createUploadHandler } from "./upload.handler";
import type { UploadService } from "./upload.service";
import type { UploadHandler } from "./upload.handler";

export type UploadModule = ReturnType<typeof createUploadModule>;

export function createUploadModule(deps: {
  db?: DbType;
  storage: StoragePort;
}) {
  const { storage } = deps;
  const service = createUploadService({ storage });
  const handler = createUploadHandler({ uploadService: service });
  return { service, handler };
}

export type { UploadService, UploadHandler };
