import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  InvalidStorageKeyError,
  createLocalStorage,
  createR2Storage,
  createStorage,
} from "./storage";

const dir = mkdtempSync(join(tmpdir(), "cogito-uploads-test-"));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createLocalStorage", () => {
  test("put stores bytes under dir and returns a public URL", async () => {
    const s = createLocalStorage({ dir, baseUrl: "/uploads" });
    const { key, url } = await s.put(
      "a/b.png",
      new TextEncoder().encode("hi"),
      "image/png",
    );
    expect(key).toBe("a/b.png");
    expect(url).toBe("/uploads/a/b.png");
    expect(await Bun.file(join(dir, "a/b.png")).text()).toBe("hi");
  });

  test("defaults baseUrl to /uploads", async () => {
    const s = createLocalStorage({ dir });
    const { url } = await s.getSignedUploadUrl("u1/f.png", "image/png");
    expect(url).toBe("/uploads/u1/f.png");
  });

  test("getSignedUploadUrl returns a POST url for the key", async () => {
    const s = createLocalStorage({ dir });
    const { url, method, fields } = await s.getSignedUploadUrl(
      "user-1/uuid-avatar.png",
      "image/png",
    );
    expect(method).toBe("POST");
    expect(url).toBe("/uploads/user-1/uuid-avatar.png");
    expect(fields).toEqual({});
  });

  test("resolvePublicUrl returns the served URL for a key", () => {
    const s = createLocalStorage({ dir });
    expect(s.resolvePublicUrl("user-1/uuid-note.pdf")).toBe(
      "/uploads/user-1/uuid-note.pdf",
    );
  });

  test("rejects keys with path traversal", async () => {
    const s = createLocalStorage({ dir });
    await expect(
      s.put("../evil.png", new TextEncoder().encode("x"), "image/png"),
    ).rejects.toThrow(InvalidStorageKeyError);
    await expect(
      s.getSignedUploadUrl("/etc/passwd", "image/png"),
    ).rejects.toThrow(InvalidStorageKeyError);
  });
});

describe("createR2Storage", () => {
  const s = createR2Storage({
    accountId: "acct",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "bucket",
  });

  test("resolvePublicUrl falls back to the key when publicUrl is unset", () => {
    expect(s.resolvePublicUrl("user-1/uuid-avatar.png")).toBe(
      "user-1/uuid-avatar.png",
    );
  });

  test("resolvePublicUrl prefixes the public URL when set", () => {
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
  });

  test("getSignedUploadUrl produces a POST url with a bounded policy (M9)", async () => {
    const { url, method, fields } = await s.getSignedUploadUrl(
      "user-1/uuid-avatar.png",
      "image/png",
    );
    expect(method).toBe("POST");
    expect(url).toBe("https://acct.r2.cloudflarestorage.com/bucket");
    expect(fields["x-amz-algorithm"]).toBe("AWS4-HMAC-SHA256");
    expect(fields.policy).toBeTruthy();
    expect(fields["x-amz-signature"]).toBeTruthy();

    const policy = JSON.parse(
      Buffer.from(fields.policy, "base64").toString("utf-8"),
    ) as { conditions: unknown[] };
    const sizeCondition = policy.conditions.find(
      (c) => Array.isArray(c) && c[0] === "content-length-range",
    ) as [string, number, number];
    expect(sizeCondition).toBeTruthy();
    expect(sizeCondition[2]).toBe(5 * 1024 * 1024);
  });
});

describe("createStorage", () => {
  test("picks local storage when R2 credentials are missing", async () => {
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

  test("picks R2 storage when all R2 credentials are present", () => {
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

  test("R2 public URL is used for served URLs when configured", () => {
    const s = createStorage({
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
      R2_PUBLIC_URL: "https://cdn.example.com",
    });
    expect(s.resolvePublicUrl("user-1/uuid-avatar.png")).toBe(
      "https://cdn.example.com/user-1/uuid-avatar.png",
    );
  });
});
