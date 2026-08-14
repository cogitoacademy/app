import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { createServer } from "./routes";

const UPLOAD_ROOT = "./uploads";

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
