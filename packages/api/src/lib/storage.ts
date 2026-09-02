import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isValidUploadKey } from "./request-id";

export interface SignedUpload {
  url: string;
  method: "POST" | "PUT";
  fields: Record<string, string>;
}

export interface StoragePort {
  put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<{ key: string; url: string }>;
  getSignedUploadUrl(
    key: string,
    contentType: string,
    contentLength?: number,
  ): Promise<SignedUpload>;
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
      // Local mode uploads go through the authenticated server route
      // POST /uploads/* (size-bounded); the response advertises the POST flow
      // so the client uses the same raw-body upload mechanism in both modes.
      return { url: `${baseUrl}/${key}`, method: "POST", fields: {} };
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
    async getSignedUploadUrl(key, contentType, contentLength) {
      assertValidKey(key);
      // R2 supports presigned PUT URLs, but not S3 multipart-form POST
      // policies. Sign the content length when the caller provides it so the
      // upload cannot exceed the module's size limit.
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          ContentType: contentType,
          ...(contentLength !== undefined
            ? { ContentLength: contentLength }
            : {}),
        }),
        { expiresIn: 300 },
      );
      return { url: uploadUrl, method: "PUT", fields: {} };
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
