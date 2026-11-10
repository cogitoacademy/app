import { PDFDocument } from "pdf-lib";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const MAX_KB_BYTES = 5 * 1024 * 1024;
export const MAX_STORED_KB_BYTES = 20 * 1024 * 1024;
export interface PrivateKbStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
}
export function assertKbPdf(bytes: Uint8Array, maxBytes = MAX_KB_BYTES) {
  if (
    !bytes.length ||
    bytes.length > maxBytes ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new Error("Upload a PDF of at most 5 MiB");
  }
}
export async function validateKbPdf(
  bytes: Uint8Array,
  maxBytes = MAX_KB_BYTES,
) {
  assertKbPdf(bytes, maxBytes);
  try {
    const document = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
    });
    if (document.getPageCount() < 1) throw new Error("No pages");
    document.getPages();
  } catch {
    throw new Error("Upload a valid, unencrypted PDF with pages");
  }
}
function assertKey(key: string) {
  if (!/^[a-f0-9]{64}\.pdf$/.test(key))
    throw new Error("Invalid private PDF key");
}
function inside(a: string, b: string) {
  const rel = relative(a, b);
  return !rel || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function assertPrivateDirectory(dir: string, publicDir: string) {
  const privatePath = resolve(dir);
  const publicPath = resolve(publicDir);
  if (inside(publicPath, privatePath) || inside(privatePath, publicPath))
    throw new Error(
      "KB private directory must be separate from public uploads",
    );
}
export function createPrivateKbStorage(config: {
  KB_PRIVATE_DIR?: string;
  UPLOAD_DIR?: string;
  KB_PRIVATE_BUCKET?: string;
  R2_BUCKET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  NODE_ENV?: string;
}): PrivateKbStorage {
  if (config.KB_PRIVATE_BUCKET) {
    if (config.KB_PRIVATE_BUCKET === config.R2_BUCKET)
      throw new Error("KB requires a separate private bucket");
    if (
      !config.R2_ACCOUNT_ID ||
      !config.R2_ACCESS_KEY_ID ||
      !config.R2_SECRET_ACCESS_KEY
    )
      throw new Error("Missing private bucket credentials");
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
    });
    return {
      async put(key, bytes) {
        assertKey(key);
        await validateKbPdf(bytes, MAX_STORED_KB_BYTES);
        await client.send(
          new PutObjectCommand({
            Bucket: config.KB_PRIVATE_BUCKET,
            Key: key,
            Body: bytes,
            ContentType: "application/pdf",
          }),
        );
      },
      async read(key) {
        assertKey(key);
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.KB_PRIVATE_BUCKET, Key: key }),
        );
        if (
          !result.Body ||
          !result.ContentLength ||
          result.ContentLength > MAX_STORED_KB_BYTES
        )
          throw new Error("Invalid private PDF size");
        const bytes = await result.Body.transformToByteArray();
        await validateKbPdf(bytes, MAX_STORED_KB_BYTES);
        return bytes;
      },
    };
  }
  if (["production", "staging"].includes(config.NODE_ENV ?? ""))
    throw new Error(
      "KB_PRIVATE_BUCKET is required for private PDFs in production/staging",
    );
  const dir = resolve(config.KB_PRIVATE_DIR ?? "./private-kb");
  const publicDir = resolve(config.UPLOAD_DIR ?? "./uploads");
  assertPrivateDirectory(dir, publicDir);
  async function checkedDir() {
    await mkdir(dir, { recursive: true });
    // Resolve symlinks too: a configured private directory may not alias uploads.
    const resolvedPublic = await realpath(publicDir).catch(() => publicDir);
    assertPrivateDirectory(await realpath(dir), resolvedPublic);
  }
  return {
    async put(key, bytes) {
      assertKey(key);
      await validateKbPdf(bytes, MAX_STORED_KB_BYTES);
      await checkedDir();
      await writeFile(resolve(dir, key), bytes, { flag: "wx" }).catch(
        async (error) => {
          if (error.code !== "EEXIST") throw error;
          const existing = await readFile(resolve(dir, key));
          if (!existing.equals(Buffer.from(bytes)))
            throw new Error("Private file hash collision");
        },
      );
    },
    async read(key) {
      assertKey(key);
      await checkedDir();
      const path = resolve(dir, key);
      if ((await realpath(path)) !== path)
        throw new Error("Private file symlinks are forbidden");
      const bytes = await readFile(path);
      await validateKbPdf(bytes, MAX_STORED_KB_BYTES);
      return bytes;
    },
  };
}
