import { describe, test, expect } from "bun:test";
import { generateRequestId } from "../../lib/request-id";

describe("generateRequestId", () => {
  test("returns string starting with req_", () => {
    const id = generateRequestId();
    expect(id.startsWith("req_")).toBe(true);
  });

  test("produces unique values", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  test("contains underscore separator between timestamp and random part", () => {
    const id = generateRequestId();
    const parts = id.split("_");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toBe("req");
  });
});
