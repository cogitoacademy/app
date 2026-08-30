import { describe, expect, test } from "bun:test";
import { externalHttpUrl } from "../../lib/url-schema";

describe("externalHttpUrl", () => {
  test("accepts HTTP and HTTPS URLs", () => {
    expect(externalHttpUrl.safeParse("http://example.com").success).toBe(true);
    expect(externalHttpUrl.safeParse("https://example.com/path").success).toBe(
      true,
    );
  });

  test("rejects browser-executable and non-web schemes", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "file:///etc/passwd",
      "ftp://example.com/file",
    ]) {
      expect(externalHttpUrl.safeParse(value).success).toBe(false);
    }
  });
});
