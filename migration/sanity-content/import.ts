/** Offline by default. Source manifests and PDFs must remain outside version control. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { z } from "zod";
import {
  resourceFields,
  eventFields,
  type ContentEntry,
} from "../../packages/api/src/modules/content-admin/content-admin.types";
import { assertKbPdf } from "../../packages/api/src/lib/private-kb-storage";

const hash = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const preparedSchema = z.object({
  resources: z.array(
    z.object({
      id: z.string().min(1),
      sourceId: z.string().min(1),
      title: z.string(),
      description: z.string().nullable(),
      category: z.string(),
      file: z.string(),
      bytes: z.number().int().positive(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      isActive: z.boolean(),
    }),
  ),
  competitions: z.array(
    z.object({
      id: z.string().min(1),
      sourceId: z.string().min(1),
      title: z.string(),
      description: z.string().nullable(),
      location: z.string().nullable(),
      startDate: z.string(),
      endDate: z.string(),
      categorySourceIds: z.array(z.string()),
      educationLevels: z
        .array(z.string())
        .transform((levels) =>
          levels.filter((level) => level.trim().length > 0),
        ),
      scale: z.string().nullable(),
      organizer: z.string().nullable(),
      registrationDeadline: z.string().nullable(),
      registrationLink: z.string().nullable(),
      socialMediaLink: z.string().nullable(),
      isActive: z.boolean(),
    }),
  ),
});
export async function prepareImport(
  raw: unknown,
  mapping: Record<string, string>,
  assetDir: string,
) {
  const manifest = preparedSchema.parse(raw);
  const result: Array<{
    id: string;
    sourceId: string;
    sourceHash: string;
    entry: ContentEntry;
    asset?: { bytes: Uint8Array; fileName: string; sha256: string };
  }> = [];
  const identities = new Set<string>();
  for (const row of [...manifest.resources, ...manifest.competitions]) {
    if (
      row.id !== row.sourceId ||
      identities.has(row.id) ||
      row.id.startsWith("drafts.")
    )
      throw new Error(
        "Source identities must be unique, published and preserved",
      );
    identities.add(row.id);
  }
  const used = new Set(
    manifest.competitions.flatMap((row) => row.categorySourceIds),
  );
  if (
    [...used].some((id) => !mapping[id]) ||
    Object.keys(mapping).some((id) => !used.has(id))
  )
    throw new Error(
      "Category mapping must explicitly cover exactly the referenced source categories",
    );
  for (const row of manifest.resources) {
    if (basename(row.file) !== row.file || row.file.includes("\\"))
      throw new Error("Asset filename must not contain a path");
    const bytes = new Uint8Array(await readFile(resolve(assetDir, row.file)));
    assertKbPdf(bytes);
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256)
      throw new Error(`PDF integrity mismatch: ${row.id}`);
    const entry: ContentEntry = {
      kind: "resource",
      values: resourceFields.parse({
        title: row.title,
        description: row.description,
        category: row.category,
        fileId: row.sha256,
        isActive: row.isActive,
        sortOrder: 0,
      }),
    };
    result.push({
      id: row.id,
      sourceId: row.sourceId,
      sourceHash: hash(JSON.stringify(entry)),
      entry,
      asset: { bytes, fileName: row.file, sha256: row.sha256 },
    });
  }
  for (const row of manifest.competitions) {
    const { id, sourceId, categorySourceIds, ...fields } = row;
    const categoryIds = [
      ...new Set(
        categorySourceIds.map((sourceCategoryId) => mapping[sourceCategoryId]!),
      ),
    ].toSorted();
    const entry: ContentEntry = {
      kind: "event",
      values: eventFields.parse({ ...fields, categoryIds, sortOrder: 0 }),
    };
    result.push({
      id,
      sourceId,
      sourceHash: hash(JSON.stringify(entry)),
      entry,
    });
  }
  return result.toSorted((a, b) => a.id.localeCompare(b.id));
}
export function importReplay(
  existing:
    | { sourceId: string | null; sourceHash: string | null; version: number }
    | undefined,
  incoming: { sourceId: string; sourceHash: string },
) {
  if (!existing) return "insert";
  if (
    existing.sourceId === incoming.sourceId &&
    existing.sourceHash === incoming.sourceHash &&
    existing.version === 1
  )
    return "skip";
  throw new Error(
    "Import conflict: identity/payload differs or an admin edited the record; reconcile manually",
  );
}
async function main() {
  const args = process.argv.slice(2);
  const arg = (key: string) => {
    const i = args.indexOf(key);
    return i < 0 ? undefined : args[i + 1];
  };
  const manifestPath = arg("--manifest"),
    mappingPath = arg("--mapping"),
    assets = arg("--assets");
  if (!manifestPath || !mappingPath || !assets)
    throw new Error(
      "Required: --manifest local-prepared.json --mapping local-category-map.json --assets local-assets-directory [--apply --expect-target host:port/database --actor admin-id]",
    );
  const rows = await prepareImport(
    JSON.parse(await readFile(manifestPath, "utf8")),
    z
      .record(z.string(), z.string().min(1))
      .parse(JSON.parse(await readFile(mappingPath, "utf8"))),
    assets,
  );
  console.log(
    JSON.stringify({
      mode: args.includes("--apply") ? "apply-requested" : "dry-run",
      resources: rows.filter((r) => r.entry.kind === "resource").length,
      competitions: rows.filter((r) => r.entry.kind === "event").length,
      manifestSha256: hash(await readFile(manifestPath)),
      mappingSha256: hash(await readFile(mappingPath)),
    }),
  );
  if (!args.includes("--apply")) return;
  const url = new URL(process.env.DATABASE_URL ?? "");
  const target = `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  const actorId = arg("--actor");
  if (arg("--expect-target") !== target || !actorId)
    throw new Error(
      "Apply requires exact --expect-target host:port/database and --actor admin-id",
    );
  const { env } = await import("../../packages/env/src/server");
  if (
    !args.includes("--seed-mode") &&
    (env.CONTENT_ADMIN_ENABLED ||
      env.KB_SOURCE !== "sanity" ||
      env.CC_SOURCE !== "sanity")
  )
    throw new Error(
      "Import requires authoring disabled and both consumers still on Sanity",
    );
  const { db } = await import("../../packages/api/src/lib/db");
  const actor = await db.query.user.findFirst({
    where: (user, { eq }) => eq(user.id, actorId),
  });
  if (actor?.role !== "admin")
    throw new Error("Import actor must be an existing admin");
  const { createContentAdminRepo } =
    await import("../../packages/api/src/modules/content-admin/content-admin.repo");
  const { insertAuditLog } =
    await import("../../packages/api/src/modules/audit/audit.repo");
  const { createPrivateKbStorage } =
    await import("../../packages/api/src/lib/private-kb-storage");
  const repo = createContentAdminRepo(db, {
    record: (p) => insertAuditLog(p.db, { ...p }),
  });
  const previous = [
    ...(await repo.list("resource")),
    ...(await repo.list("event")),
  ];
  const pending = rows.filter(
    (row) =>
      importReplay(
        previous.find((p) => p.id === row.id),
        row,
      ) === "insert",
  );
  const catalog = await repo.categories();
  for (const row of pending)
    if (
      row.entry.kind === "event" &&
      row.entry.values.categoryIds.some(
        (id) =>
          !catalog.some(
            (c) => c.id === id && c.parentId === null && c.isActive,
          ),
      )
    )
      throw new Error(
        "Import category must map to an existing active parent competition",
      );
  const storage = createPrivateKbStorage(env);
  // Immutable hash-addressed files first. DB failure can leave an unreferenced private file, never a public object.
  for (const row of pending) {
    if (row.asset) {
      await storage.put(`${row.asset.sha256}.pdf`, row.asset.bytes);
      await repo.registerFile({
        id: row.asset.sha256,
        storageKey: `${row.asset.sha256}.pdf`,
        fileName: row.asset.fileName,
        bytes: row.asset.bytes.length,
        sha256: row.asset.sha256,
      });
    }
    await repo.save(
      row.entry,
      actorId,
      "Sanity published snapshot import",
      undefined,
      row,
    );
  }
  console.log(
    JSON.stringify({
      inserted: pending.length,
      skipped: rows.length - pending.length,
      target,
    }),
  );
  process.exit(0);
}
if (import.meta.main) await main();
