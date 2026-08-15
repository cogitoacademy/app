import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isValidUploadKey } from "./request-id";

export interface SignedUpload {
  url: string;
  method: "POST";
  fields: Record<string, string>;
}

export interface StoragePort {
  put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<{ key: string; url: string }>;
  getSignedUploadUrl(key: string, contentType: string): Promise<SignedUpload>;
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

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key as Parameters<typeof createHmac>[0])
    .update(data)
    .digest();
}/**
 * Builds an S3-compatible presigned POST (R2 supports S3 POST policies).
 * The policy binds an exact object key, the content type, and a
 * `content-length-range` so an authenticated client cannot upload an
 * arbitrarily large object (M9) — a PUT URL cannot express a size bound.
 */
export function createPresignedPost(opts: {
  endpoint: string;
  bucket: string;
  region?: string;
  key: string;
  contentType: string;
  maxBytes: number;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds?: number;
}): SignedUpload {
  const region = opts.region ?? "auto";
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credential = `${opts.accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;
  const expiration = new Date(
    date.getTime() + (opts.expiresInSeconds ?? 300) * 1000,
  ).toISOString();

  const policy = {
    expiration,
    conditions: [
      { bucket: opts.bucket },
      { key: opts.key },
      ["eq", "$Content-Type", opts.contentType],
      ["content-length-range", 1, opts.maxBytes],
    ],
  };
  const policyBase64 = Buffer.from(JSON.stringify(policy)).toString("base64");

  const kDate = hmac(`AWS4${opts.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, policyBase64).toString("hex");

  return {
    url: `${opts.endpoint}/${opts.bucket}`,
    method: "POST",
    fields: {
      key: opts.key,
      "Content-Type": opts.contentType,
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-credential": credential,
      "x-amz-date": amzDate,
      policy: policyBase64,
      "x-amz-signature": signature,
    },
  };
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
      // so the client uses one upload mechanism in both modes.
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
    async getSignedUploadUrl(key, contentType) {
      assertValidKey(key);
      return createPresignedPost({
        endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
        bucket: opts.bucket,
        key,
        contentType,
        maxBytes: 5 * 1024 * 1024,
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      });
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
