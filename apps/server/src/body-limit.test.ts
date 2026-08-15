import { describe, expect, test } from "bun:test";
import { readBodyWithLimit } from "@cogito-app/api/lib/request-id";

describe("readBodyWithLimit", () => {
  test("reads a chunked body without content-length under the limit", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(2000)));
        controller.enqueue(new TextEncoder().encode("y".repeat(2000)));
        controller.close();
      },
    });
    const req = new Request("http://x/", { method: "POST", body: stream });
    const { body, tooLarge } = await readBodyWithLimit(req, 5000);
    expect(tooLarge).toBe(false);
    expect(body.length).toBe(4000);
  });

  test("rejects a chunked body over the limit at read time", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("a".repeat(3000)));
        controller.enqueue(new TextEncoder().encode("b".repeat(3000)));
        controller.close();
      },
    });
    const req = new Request("http://x/", { method: "POST", body: stream });
    const { tooLarge } = await readBodyWithLimit(req, 3000);
    expect(tooLarge).toBe(true);
  });

  test("returns an empty body when there is no request body", async () => {
    const req = new Request("http://x/", { method: "GET" });
    const { body, tooLarge } = await readBodyWithLimit(req, 1000);
    expect(tooLarge).toBe(false);
    expect(body).toBe("");
  });
});
