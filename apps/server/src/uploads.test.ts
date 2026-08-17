import { describe, expect, test } from "bun:test";
import { isValidUploadKey } from "@cogito-app/api/lib/request-id";

describe("isValidUploadKey", () => {
  test("accepts keys shaped {userId}/{uuid}-{filename}", () => {
    expect(isValidUploadKey("user-1/uuid-avatar.png")).toBe(true);
    expect(isValidUploadKey("user-2/8f3b-5f0d-note.pdf")).toBe(true);
  });

  test("rejects empty, traversal, and leading-slash keys", () => {
    expect(isValidUploadKey("")).toBe(false);
    expect(isValidUploadKey("a/b/../../secret")).toBe(false);
    expect(isValidUploadKey("../server.ts")).toBe(false);
    expect(isValidUploadKey("/etc/passwd")).toBe(false);
  });
});
