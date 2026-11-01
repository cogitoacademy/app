import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { S3Client } from "@aws-sdk/client-s3";
import * as presigner from "@aws-sdk/s3-request-presigner";

let restoreSdk = () => {};
beforeEach(() => {
  const send = spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
  const sign = spyOn(presigner, "getSignedUrl").mockImplementation(
    async (_client, command) => {
      const input = command.input as { Key?: string };
      return `https://signed.example/${input.Key ?? "upload"}`;
    },
  );
  restoreSdk = () => {
    send.mockRestore();
    sign.mockRestore();
  };
});
afterEach(() => restoreSdk());

import {
  InvalidStorageKeyError,
  createLocalStorage,
  createR2Storage,
  createStorage,
} from "../../lib/storage";

const dir = mkdtempSync(join(tmpdir(), "cogito-storage-unit-test-"));

async function withMockedS3Send<T>(action: () => Promise<T>) {
  const send = spyOn(S3Client.prototype, "send");
  send.mockResolvedValue({} as never);
  try {
    return await action();
  } finally {
    send.mockRestore();
  }
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
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

  test("omitting a public URL uses the authenticated local upload route", () => {
    expect(
      createLocalStorage({ dir }).resolvePublicUrl("user-1/uuid-note.pdf"),
    ).toBe("/uploads/user-1/uuid-note.pdf");
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
    await withMockedS3Send(async () => {
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
  });

  test("put resolves the URL to the key when no publicUrl is set", async () => {
    await withMockedS3Send(async () => {
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
  });

  test("getSignedUploadUrl returns an R2 presigned PUT URL", async () => {
    const s = createR2Storage({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
    });
    const { url, method, fields } = await s.getSignedUploadUrl(
      "user-1/uuid-avatar.png",
      "image/png",
      128,
    );
    expect(method).toBe("PUT");
    expect(url).toBe("https://signed.example/user-1/uuid-avatar.png");
    expect(fields).toEqual({});
    expect(presigner.getSignedUrl).toHaveBeenLastCalledWith(
      expect.any(S3Client),
      expect.objectContaining({
        input: expect.objectContaining({ ContentLength: 128 }),
      }),
      { expiresIn: 300 },
    );
    await s.getSignedUploadUrl("user-1/uuid-avatar.png", "image/png");
    expect(presigner.getSignedUrl).toHaveBeenLastCalledWith(
      expect.any(S3Client),
      expect.objectContaining({
        input: {
          Bucket: "bucket",
          Key: "user-1/uuid-avatar.png",
          ContentType: "image/png",
        },
      }),
      { expiresIn: 300 },
    );
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
