import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { auth } from "@cogito-app/auth";
import { createServer } from "./routes/create-server";

const UPLOAD_ROOT = "./uploads";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const HTML_BYTES = new TextEncoder().encode(
  "<!doctype html><html><body>polyglot</body></html>",
);

async function withSession(
  userId: string,
  fn: () => Promise<void>,
): Promise<void> {
  const api = auth.api as unknown as Record<string, unknown>;
  const original = api["getSession"];
  api["getSession"] = async () => ({ user: { id: userId } });
  try {
    await fn();
  } finally {
    api["getSession"] = original;
  }
}

describe("GET /uploads/*", () => {
  test("serves a file under UPLOAD_DIR and returns 404 for a missing file", async () => {
    rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    try {
      const key = "user-1/uuid-avatar.png";
      await Bun.write(`${UPLOAD_ROOT}/${key}`, "fake-image-bytes");

      const res = await createServer().handle(
        new Request(`http://localhost/uploads/${key}`),
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("fake-image-bytes");

      const missing = await createServer().handle(
        new Request("http://localhost/uploads/user-9/does-not-exist.png"),
      );
      expect(missing.status).toBe(404);
    } finally {
      rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    }
  });
});

describe("POST /uploads/* (local-mode sink, M9)", () => {
  test("rejects unauthenticated uploads with 401", async () => {
    const res = await createServer().handle(
      new Request("http://localhost/uploads/user-1/x.png", {
        method: "POST",
        body: "data",
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects traversal keys", async () => {
    const res = await createServer().handle(
      new Request("http://localhost/uploads/../evil.png", {
        method: "POST",
        body: "data",
      }),
    );
    expect(res.status).toBe(404);
  });

  test("accepts PNG bytes even under a .jpg key (lenient image-kind match)", async () => {
    rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    // Pre-create the user dir: Bun.write creates missing parents implicitly,
    // but implicit creation inside app.handle() hangs the bun test runner
    // (no handles left open — runner bookkeeping quirk, verified 2026-09-05).
    mkdirSync(`${UPLOAD_ROOT}/user-1`, { recursive: true });
    try {
      await withSession("user-1", async () => {
        const res = await createServer().handle(
          new Request("http://localhost/uploads/user-1/uuid-photo.jpg", {
            method: "POST",
            body: PNG_BYTES,
          }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true });
      });
    } finally {
      rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    }
  });

  test("rejects HTML polyglot bytes under a .png key with 415", async () => {
    rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    try {
      await withSession("user-1", async () => {
        const res = await createServer().handle(
          new Request("http://localhost/uploads/user-1/uuid-evil.png", {
            method: "POST",
            body: HTML_BYTES,
          }),
        );
        expect(res.status).toBe(415);
      });
    } finally {
      rmSync(UPLOAD_ROOT, { recursive: true, force: true });
    }
  });
});
