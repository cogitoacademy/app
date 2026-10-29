import { expect, spyOn, test } from "bun:test";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  createPrivateKbStorage,
  MAX_KB_BYTES,
} from "../../lib/private-kb-storage";

const config = {
  KB_PRIVATE_BUCKET: "synthetic-private",
  R2_BUCKET: "synthetic-public",
  R2_ACCOUNT_ID: "synthetic",
  R2_ACCESS_KEY_ID: "synthetic",
  R2_SECRET_ACCESS_KEY: "synthetic",
};
const key = `${"a".repeat(64)}.pdf`;
const pdf = new TextEncoder().encode("%PDF-synthetic");

test("private bucket uses authenticated object commands and validates downloads", async () => {
  const send = spyOn(S3Client.prototype, "send");
  try {
    send.mockResolvedValue({} as never);
    const store = createPrivateKbStorage(config);
    await store.put(key, pdf);
    const upload = send.mock.calls[0]![0] as PutObjectCommand;
    expect(upload).toBeInstanceOf(PutObjectCommand);
    expect(upload.input).toEqual({
      Bucket: config.KB_PRIVATE_BUCKET,
      Key: key,
      Body: pdf,
      ContentType: "application/pdf",
    });

    send.mockResolvedValue({
      ContentLength: pdf.length,
      Body: { transformToByteArray: async () => pdf },
    } as never);
    expect(await store.read(key)).toEqual(pdf);
    const download = send.mock.calls[1]![0] as GetObjectCommand;
    expect(download).toBeInstanceOf(GetObjectCommand);
    expect(download.input).toEqual({
      Bucket: config.KB_PRIVATE_BUCKET,
      Key: key,
    });

    for (const response of [
      {},
      { ContentLength: 0, Body: {} },
      { ContentLength: MAX_KB_BYTES + 1, Body: {} },
      {
        ContentLength: 3,
        Body: { transformToByteArray: async () => new Uint8Array(3) },
      },
      {
        ContentLength: 1,
        Body: {
          transformToByteArray: async () => new Uint8Array(MAX_KB_BYTES + 1),
        },
      },
    ]) {
      send.mockResolvedValue(response as never);
      // eslint-disable-next-line no-await-in-loop -- Each case replaces the shared SDK response.
      await expect(store.read(key)).rejects.toThrow("PDF");
    }

    send.mockRejectedValue(new Error("synthetic storage unavailable"));
    await expect(store.read(key)).rejects.toThrow("storage unavailable");
    await expect(store.put(key, pdf)).rejects.toThrow("storage unavailable");
  } finally {
    send.mockRestore();
  }
});

test("private bucket rejects invalid configuration and uploads before contacting storage", async () => {
  expect(() =>
    createPrivateKbStorage({ KB_PRIVATE_BUCKET: "private" }),
  ).toThrow("credentials");
  const send = spyOn(S3Client.prototype, "send");
  try {
    const store = createPrivateKbStorage(config);
    await expect(store.read("../secret")).rejects.toThrow("key");
    await expect(store.put("../secret", pdf)).rejects.toThrow("key");
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array(5),
      new Uint8Array(MAX_KB_BYTES + 1),
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Keep each rejected write isolated on the shared SDK spy.
      await expect(store.put(key, bytes)).rejects.toThrow("PDF");
    }
    expect(send).not.toHaveBeenCalled();
  } finally {
    send.mockRestore();
  }
});

test("defaults to separate development directories without creating them", () => {
  const store = createPrivateKbStorage({ NODE_ENV: "test" });

  expect(store.put).toBeTypeOf("function");
  expect(store.read).toBeTypeOf("function");
});
