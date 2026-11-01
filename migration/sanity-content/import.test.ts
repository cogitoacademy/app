import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { prepareImport, importReplay } from "./import";
test("stable identities, explicit mapping, PDF integrity and replay without title merging", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kb-import-"));
  try {
    const bytes = Buffer.from("%PDF-synthetic");
    await writeFile(join(dir, "synthetic.pdf"), bytes);
    const resource = {
      id: "r",
      sourceId: "r",
      title: "Panduan",
      description: null,
      category: "guide",
      file: "synthetic.pdf",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      isActive: true,
    };
    const event = {
      id: "e1",
      sourceId: "e1",
      title: "Lomba",
      description: null,
      location: null,
      startDate: "2026-10-24T17:00:00Z",
      endDate: "2026-10-25T17:00:00Z",
      categorySourceIds: ["legacy"],
      educationLevels: [],
      scale: null,
      organizer: null,
      registrationDeadline: null,
      registrationLink: null,
      socialMediaLink: null,
      isActive: true,
    };
    const raw = {
      resources: [resource],
      competitions: [event, { ...event, id: "e2", sourceId: "e2" }],
    };
    await expect(prepareImport(raw, {}, dir)).rejects.toThrow("mapping");
    const result = await prepareImport(raw, { legacy: "catalog-id" }, dir);
    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe("e1");
    expect(result[1]!.id).toBe("e2");
    const first = result[0]!;
    expect(importReplay(undefined, first)).toBe("insert");
    expect(importReplay({ ...first, version: 1 }, first)).toBe("skip");
    expect(() => importReplay({ ...first, version: 2 }, first)).toThrow(
      "admin edited",
    );
    expect(() =>
      importReplay({ ...first, sourceHash: "changed", version: 1 }, first),
    ).toThrow("conflict");
    await expect(
      prepareImport(
        { ...raw, resources: [{ ...resource, sha256: "a".repeat(64) }] },
        { legacy: "catalog-id" },
        dir,
      ),
    ).rejects.toThrow("integrity");
    await expect(
      prepareImport(
        { ...raw, competitions: [event, event] },
        { legacy: "catalog-id" },
        dir,
      ),
    ).rejects.toThrow("identities");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
