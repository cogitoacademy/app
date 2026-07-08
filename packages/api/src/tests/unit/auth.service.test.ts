import { describe, test, expect } from "bun:test";
import { validateUpdateInput } from "../../modules/auth/auth.service";

describe("Auth Service", () => {
  describe("validateUpdateInput", () => {
    test("returns ok for empty input", () => {
      const result = validateUpdateInput({});
      expect(result.ok).toBe(true);
    });

    test("returns ok for valid non-empty fields", () => {
      const result = validateUpdateInput({
        phoneNumber: "0812345678",
        schoolName: "SMA 1",
      });
      expect(result.ok).toBe(true);
    });

    test("returns error for blank phoneNumber", () => {
      const result = validateUpdateInput({ phoneNumber: "   " });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("phoneNumber");
    });

    test("returns error for blank schoolName", () => {
      const result = validateUpdateInput({ schoolName: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("schoolName");
    });

    test("returns error for blank gradeLevel", () => {
      const result = validateUpdateInput({ gradeLevel: "  " });
      expect(result.ok).toBe(false);
    });

    test("returns error for blank parentName", () => {
      const result = validateUpdateInput({ parentName: " " });
      expect(result.ok).toBe(false);
    });

    test("returns error for blank parentPhone", () => {
      const result = validateUpdateInput({ parentPhone: "\t" });
      expect(result.ok).toBe(false);
    });

    test("returns error for blank parentEmail", () => {
      const result = validateUpdateInput({ parentEmail: " " });
      expect(result.ok).toBe(false);
    });

    test("returns ok for undefined optional fields", () => {
      const result = validateUpdateInput({
        phoneNumber: undefined,
        schoolName: undefined,
      });
      expect(result.ok).toBe(true);
    });

    test("returns ok for valid string fields alongside undefined", () => {
      const result = validateUpdateInput({
        phoneNumber: "123",
        schoolName: undefined,
      });
      expect(result.ok).toBe(true);
    });
  });
});
