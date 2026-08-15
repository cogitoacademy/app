import { afterAll, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockSend = () => Promise.resolve({});
const mockPutObjectCommand = class {
  constructor(public input: unknown) {}
};

mock.module("@aws-sdk/client-s3", () => ({
  PutObjectCommand: mockPutObjectCommand,
  S3Client: class {
    send = mockSend;
  },
}));

import {
  InvalidStorageKeyError,
  createLocalStorage,
  createPresignedPost,
  createR2Storage,
  createStorage,
} from "../../lib/storage";

const dir = mkdtempSync(join(tmpdir(), "cogito-storage-unit-test-"));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createPresignedPost", () => {
  const opts = {
    endpoint: "https://acct.r2.cloudflarestorage.com",
    bucket: "bucket",
    key: "user-1/uuid-avatar.png",
    contentType: "image/png",
    maxBytes: 1024 * 1024,
    accessKeyId: "akid",
    secretAccessKey: "secret",
  };

  function decodePolicy(signed: ReturnType<typeof createPresignedPost>) {
    return JSON.parse(
      Buffer.from(signed.fields.policy, "base64").toString("utf-8"),
    ) as {
      expiration: string;
      conditions: unknown[];
    };
  }

  test("produces a POST signed upload with all expected fields", () => {
    const signed = createPresignedPost(opts);
    expect(signed.method).toBe("POST");
    expect(signed.url).toBe("https://acct.r2.cloudflarestorage.com/bucket");
    expect(signed.fields.key).toBe("user-1/uuid-avatar.png");
    expect(signed.fields["Content-Type"]).toBe("image/png");
    expect(signed.fields["x-amz-algorithm"]).toBe("AWS4-HMAC-SHA256");
    expect(signed.fields["x-amz-credential"]).toMatch(
      /^akid\/\d{8}\/auto\/s3\/aws4_request$/,
    );
    expect(signed.fields["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(signed.fields.policy).toBeTruthy();
    expect(signed.fields["x-amz-signature"]).toBeTruthy();
  });

  test("policy conditions bind bucket, key, content type, x-amz fields and size range", () => {
    const signed = createPresignedPost(opts);
    const policy = decodePolicy(signed);
    expect(policy.conditions).toContainEqual({ bucket: "bucket" });
    expect(policy.conditions).toContainEqual({ key: "user-1/uuid-avatar.png" });
    expect(policy.conditions).toContainEqual([
      "eq",
      "$Content-Type",
      "image/png",
    ]);
    expect(policy.conditions).toContainEqual([
      "eq",
      "$x-amz-algorithm",
      "AWS4-HMAC-SHA256",
    ]);
    expect(policy.conditions).toContainEqual([
      "eq",
      "$x-amz-credential",
      signed.fields["x-amz-credential"],
    ]);
    expect(policy.conditions).toContainEqual([
      "eq",
      "$x-amz-date",
      signed.fields["x-amz-date"],
    ]);
    expect(policy.conditions).toContainEqual([
      "content-length-range",
      1,
      1024 * 1024,
    ]);
  });

  test("signature is a valid HMAC-SHA256 of the policy over the signing key chain", () => {
    const signed = createPresignedPost(opts);
    const amzDate = signed.fields["x-amz-date"];
    const dateStamp = amzDate.slice(0, 8);
    const policy = signed.fields.policy;

    const hmacStep = (key: string | Buffer, data: string | Buffer) =>
      createHmac("sha256", key as Parameters<typeof createHmac>[0])
        .update(data)
        .digest();

    const kDate = hmacStep(`AWS4secret`, dateStamp);
    const kRegion = hmacStep(kDate, "auto");
    const kService = hmacStep(kRegion, "s3");
    const kSigning = hmacStep(kService, "aws4_request");
    const expected = hmacStep(kSigning, policy).toString("hex");

    expect(signed.fields["x-amz-signature"]).toBe(expected);
  });

  test("defaults region to auto and expires after 300 seconds", () => {
    const before = Date.now();
    const signed = createPresignedPost(opts);
    const policy = decodePolicy(signed);
    const expiryMs = Date.parse(policy.expiration);
    expect(signed.fields["x-amz-credential"]).toContain("/auto/s3/");
    expect(expiryMs - before).toBeGreaterThanOrEqual(299_000);
    expect(expiryMs - before).toBeLessThanOrEqual(301_000);
  });

  test("honors a custom region and expiresInSeconds", () => {
    const before = Date.now();
    const signed = createPresignedPost({
      ...opts,
      region: "us-east-1",
      expiresInSeconds: 60,
    });
    const policy = decodePolicy(signed);
    expect(signed.fields["x-amz-credential"]).toContain(
      "/us-east-1/s3/aws4_request",
    );
    const expiryMs = Date.parse(policy.expiration);
    expect(expiryMs - before).toBeGreaterThanOrEqual(59_000);
    expect(expiryMs - before).toBeLessThanOrEqual(61_000);
  });
});

describe("createLocalStorage", () => {
  const s = createLocalStorage({ dir, baseUrl: "/uploads" });

  test("put writes bytes under the key directory", async () => {
    const { key, url } = await s.put(
      "nested/deep/note.pdf",
      new TextEncoder().encode("content"),
      "application/pdf",
    );
    expect(key).toBe("nested/deep/note.pdf");
    expect(url).toBe("/uploads/nested/deep/note.pdf");
    expect(await Bun.file(join(dir, "nested/deep/note.pdf")).text()).toBe(
      "content",
    );
  });

  test("getSignedUploadUrl advertises the POST flow for a key", async () => {
    const { url, method, fields } = await s.getSignedUploadUrl(
      "user-1/uuid-note.pdf",
      "application/pdf",
    );
    expect(method).toBe("POST");
    expect(url).toBe("/uploads/user-1/uuid-note.pdf");
    expect(fields).toEqual({});
  });

  test("resolvePublicUrl returns the served URL", () => {
    expect(s.resolvePublicUrl("user-1/uuid-note.pdf")).toBe(
      "/uploads/user-1/uuid-note.pdf",
    );
  });

  test("rejects traversal and absolute keys on every method", async () => {
    for (const badKey of ["../evil.png", "a/../../evil.png", "/etc/passwd"]) {
      await expect(
        s.put(badKey, new TextEncoder().encode("x"), "image/png"),
      ).rejects.toThrow(InvalidStorageKeyError);
      await expect(s.getSignedUploadUrl(badKey, "image/png")).rejects.toThrow(
        InvalidStorageKeyError,
      );
      expect(() => s.resolvePublicUrl(badKey)).toThrow(InvalidStorageKeyError);
    }
  });
});

describe("createR2Storage", () => {
  test("put resolves the URL to the publicUrl prefix when configured", async () => {
    const s = createR2Storage({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
      publicUrl: "https://cdn.example.com",
    });
    const { key, url } = await s.put(
      "user-1/uuid-avatar.png",
      new TextEncoder().encode("x"),
      "image/png",
    );
    expect(key).toBe("user-1/uuid-avatar.png");
    expect(url).toBe("https://cdn.example.com/user-1/uuid-avatar.png");
  });

  test("put resolves the URL to the key when no publicUrl is set", async () => {
    const s = createR2Storage({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
    });
    const { url } = await s.put(
      "user-1/uuid-avatar.png",
      new TextEncoder().encode("x"),
      "image/png",
    );
    expect(url).toBe("user-1/uuid-avatar.png");
  });

  test("getSignedUploadUrl delegates to createPresignedPost", async () => {
    const s = createR2Storage({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
    });
    const { url, method, fields } = await s.getSignedUploadUrl(
      "user-1/uuid-avatar.png",
      "image/png",
    );
    expect(method).toBe("POST");
    expect(url).toBe("https://acct.r2.cloudflarestorage.com/bucket");
    expect(fields.policy).toBeTruthy();
    expect(fields["x-amz-signature"]).toBeTruthy();
  });

  test("resolvePublicUrl prefixes when publicUrl is set and returns key otherwise", () => {
    const withPublic = createR2Storage({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
      publicUrl: "https://cdn.example.com",
    });
    expect(withPublic.resolvePublicUrl("user-1/uuid-avatar.png")).toBe(
      "https://cdn.example.com/user-1/uuid-avatar.png",
    );
    const withoutPublic = createR2Storage({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
    });
    expect(withoutPublic.resolvePublicUrl("user-1/uuid-avatar.png")).toBe(
      "user-1/uuid-avatar.png",
    );
  });

  test("rejects invalid keys on every method", async () => {
    const s = createR2Storage({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
    });
    await expect(
      s.put("../evil.png", new TextEncoder().encode("x"), "image/png"),
    ).rejects.toThrow(InvalidStorageKeyError);
    await expect(
      s.getSignedUploadUrl("../evil.png", "image/png"),
    ).rejects.toThrow(InvalidStorageKeyError);
    expect(() => s.resolvePublicUrl("../evil.png")).toThrow(
      InvalidStorageKeyError,
    );
  });
});

describe("createStorage", () => {
  test("selects local storage when R2 credentials are missing", async () => {
    const s = createStorage({ UPLOAD_DIR: dir });
    const { url, method } = await s.getSignedUploadUrl(
      "user-1/uuid-avatar.png",
      "image/png",
    );
    expect(method).toBe("POST");
    expect(url).toBe("/uploads/user-1/uuid-avatar.png");
  });

  test("defaults the local dir to ./uploads", () => {
    const s = createStorage({});
    expect(s.resolvePublicUrl("user-1/uuid-avatar.png")).toBe(
      "/uploads/user-1/uuid-avatar.png",
    );
  });

  test("selects R2 storage when all credentials are present", () => {
    const s = createStorage({
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
    });
    expect(s.resolvePublicUrl("user-1/uuid-avatar.png")).toBe(
      "user-1/uuid-avatar.png",
    );
  });
});
