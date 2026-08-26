import { describe, expect, test } from "bun:test";

import {
  MAX_PROXY_BYTES,
  fetchProxyFile,
  isAllowedProxyHost,
} from "./content-proxy";

function fetchLike(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return impl as unknown as typeof fetch;
}

describe("isAllowedProxyHost", () => {
  test("allows cdn.sanity.io and subdomains of sanity.io", () => {
    expect(isAllowedProxyHost("cdn.sanity.io")).toBe(true);
    expect(isAllowedProxyHost("files.sanity.io")).toBe(true);
    expect(isAllowedProxyHost("cdn.sanity.io")).toBe(true);
  });

  test("rejects other hosts and lookalikes", () => {
    expect(isAllowedProxyHost("evil.com")).toBe(false);
    expect(isAllowedProxyHost("sanity.io.evil.com")).toBe(false);
    expect(isAllowedProxyHost("notsanity.io")).toBe(false);
    expect(isAllowedProxyHost("")).toBe(false);
  });
});

describe("fetchProxyFile", () => {
  test("rejects a fileUrl whose host is not on the allowlist without fetching", async () => {
    let fetched = false;
    const result = await fetchProxyFile("https://evil.com/file.pdf", {
      fetchImpl: fetchLike(async () => {
        fetched = true;
        return new Response("x");
      }),
    });

    expect(fetched).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(502);
  });

  test("rejects a malformed fileUrl without fetching", async () => {
    const result = await fetchProxyFile("not-a-url", {
      fetchImpl: fetchLike(async () => new Response("x")),
    });
    expect(result.ok).toBe(false);
  });

  test("returns 502 when the upstream request exceeds the timeout", async () => {
    const slowFetch = fetchLike((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("Aborted"));
        });
      });
    });

    const result = await fetchProxyFile("https://cdn.sanity.io/x.pdf", {
      fetchImpl: slowFetch,
      timeoutMs: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(502);
  });

  test("rejects upstream responses with content-length above the cap", async () => {
    const big = fetchLike(async () => {
      return new Response("x".repeat(MAX_PROXY_BYTES + 1), {
        headers: { "content-length": String(MAX_PROXY_BYTES + 1) },
      });
    });

    const result = await fetchProxyFile("https://cdn.sanity.io/big.pdf", {
      fetchImpl: big,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(502);
  });

  test("rejects streamed bodies that exceed the cap (no content-length)", async () => {
    const chunk = "x".repeat(1024 * 1024);
    const streamed = fetchLike(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 10; i++) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });
      return new Response(body);
    });

    const result = await fetchProxyFile("https://cdn.sanity.io/stream.pdf", {
      fetchImpl: streamed,
      maxBytes: 5 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(502);
  });

  test("streams a file within the cap", async () => {
    const payload = new TextEncoder().encode("small-file-bytes");
    const ok = fetchLike(async () => {
      return new Response(payload, {
        headers: { "content-type": "application/pdf" },
      });
    });

    const result = await fetchProxyFile("https://cdn.sanity.io/ok.pdf", {
      fetchImpl: ok,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const buf = await new Response(result.body).arrayBuffer();
    expect(new TextDecoder().decode(buf)).toBe("small-file-bytes");
  });

  test("returns 502 when the upstream responds non-ok or without a body", async () => {
    const notOk = fetchLike(async () => new Response("nope", { status: 500 }));
    const noBody = fetchLike(async () => new Response(null));

    const a = await fetchProxyFile("https://cdn.sanity.io/a.pdf", {
      fetchImpl: notOk,
    });
    expect(a.ok).toBe(false);

    const b = await fetchProxyFile("https://cdn.sanity.io/b.pdf", {
      fetchImpl: noBody,
    });
    expect(b.ok).toBe(false);
  });
});
