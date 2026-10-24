import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  assertKbPdf,
  type PrivateKbStorage,
} from "../../lib/private-kb-storage";
import type { ContentAdminRepo } from "./content-admin.repo";
import { ContentInvalidError } from "./content-admin.errors";
import {
  createContentInput,
  updateContentInput,
  deleteContentInput,
  uploadPdfInput,
  type ContentKind,
} from "./content-admin.types";
export function createContentAdminService(deps: {
  repo: ContentAdminRepo;
  storage: () => PrivateKbStorage;
  enabled: () => boolean;
}) {
  function ready() {
    if (!deps.enabled())
      throw new ContentInvalidError(
        "KB/calendar authoring is not activated. Complete migration and import first.",
      );
  }
  return {
    async list(kind: ContentKind) {
      ready();
      const rows = await deps.repo.list(kind);
      return JSON.parse(
        JSON.stringify(rows.map(({ sourceHash: _sourceHash, ...row }) => row)),
      ) as Array<{
        id: string;
        sourceId: string | null;
        title: string;
        version: number;
        isActive: boolean;
        [key: string]: unknown;
      }>;
    },
    async categories() {
      ready();
      return (await deps.repo.categories()).map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        parentId: c.parentId,
      }));
    },
    async create(input: z.infer<typeof createContentInput>, actorId: string) {
      ready();
      return deps.repo.save(
        createContentInput.parse(input).entry,
        actorId,
        input.reason,
      );
    },
    async update(input: z.infer<typeof updateContentInput>, actorId: string) {
      ready();
      const parsed = updateContentInput.parse(input);
      return deps.repo.save(parsed.entry, actorId, parsed.reason, parsed);
    },
    async remove(input: z.infer<typeof deleteContentInput>, actorId: string) {
      ready();
      const p = deleteContentInput.parse(input);
      return deps.repo.remove(
        p.kind,
        p.id,
        p.expectedVersion,
        actorId,
        p.reason,
      );
    },
    async uploadPdf(input: z.infer<typeof uploadPdfInput>) {
      ready();
      const p = uploadPdfInput.parse(input);
      const bytes = Buffer.from(p.base64, "base64");
      if (bytes.toString("base64") !== p.base64)
        throw new ContentInvalidError("Invalid PDF encoding");
      try {
        assertKbPdf(bytes);
      } catch {
        throw new ContentInvalidError("Upload a PDF of at most 5 MiB");
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await deps.storage().put(`${sha256}.pdf`, bytes);
      const file = await deps.repo.registerFile({
        id: sha256,
        storageKey: `${sha256}.pdf`,
        fileName: p.fileName,
        bytes: bytes.length,
        sha256,
      });
      return { fileId: file.id, fileName: file.fileName, bytes: file.bytes };
    },
  };
}
export type ContentAdminService = ReturnType<typeof createContentAdminService>;
