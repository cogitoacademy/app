import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isValidUploadKey } from "./request-id";

export interface StoragePort {
  put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<{ key: string; url: string }>;
  getSignedUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; method: "PUT" }>;
  resolvePublicUrl(key: string): string;
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${key}`);
    this.name = "InvalidStorageKeyError";
  }
}

function assertValidKey(key: string): void {
  if (!isValidUploadKey(key)) throw new InvalidStorageKeyError(key);
}

export function createLocalStorage(opts: {
  dir: string;
  baseUrl?: string;
}): StoragePort {
  const baseUrl = opts.baseUrl ?? "/uploads";

  return {
    async put(key, body, _contentType) {
      assertValidKey(key);
      const filePath = join(opts.dir, key);
      await mkdir(dirname(filePath), { recursive: true });
      await Bun.write(filePath, body);
      return { key, url: `${baseUrl}/${key}` };
    },
    async getSignedUploadUrl(key, _contentType) {
      assertValidKey(key);
      return { url: `${baseUrl}/${key}`, method: "PUT" };
    },
    resolvePublicUrl(key) {
      assertValidKey(key);
      return `${baseUrl}/${key}`;
    },
  };
}

export function createR2Storage(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string;
}): StoragePort {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    },
  });

  return {
    async put(key, body, contentType) {
      assertValidKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { key, url: opts.publicUrl ? `${opts.publicUrl}/${key}` : key };
    },
    async getSignedUploadUrl(key, contentType) {
      assertValidKey(key);
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: 300 },
      );
      return { url, method: "PUT" };
    },
    resolvePublicUrl(key) {
      assertValidKey(key);
      return opts.publicUrl ? `${opts.publicUrl}/${key}` : key;
    },
  };
}

export interface StorageEnvLike {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_URL?: string;
  UPLOAD_DIR?: string;
}

export function createStorage(envLike: StorageEnvLike): StoragePort {
  const hasR2Credentials =
    !!envLike.R2_ACCOUNT_ID &&
    !!envLike.R2_ACCESS_KEY_ID &&
    !!envLike.R2_SECRET_ACCESS_KEY &&
    !!envLike.R2_BUCKET;

  if (hasR2Credentials) {
    return createR2Storage({
      accountId: envLike.R2_ACCOUNT_ID!,
      accessKeyId: envLike.R2_ACCESS_KEY_ID!,
      secretAccessKey: envLike.R2_SECRET_ACCESS_KEY!,
      bucket: envLike.R2_BUCKET!,
      publicUrl: envLike.R2_PUBLIC_URL,
    });
  }

  return createLocalStorage({
    dir: envLike.UPLOAD_DIR ?? "./uploads",
    baseUrl: "/uploads",
  });
}
