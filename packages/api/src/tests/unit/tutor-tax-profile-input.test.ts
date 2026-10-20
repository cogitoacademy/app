import { describe, expect, it } from "bun:test";
import { tutorTaxProfileInput } from "../../modules/tutor/tutor-tax-profile";

describe("tutor tax profile input", () => {
  it("keeps leading zeroes in NIK and NPWP strings", () => {
    const parsed = tutorTaxProfileInput.parse({
      taxLegalName: "Tutor Legal Name",
      nik: "0012345678901234",
      npwp: "000.123.456.7-890.000",
    });

    expect(parsed.nik).toBe("0012345678901234");
    expect(parsed.npwp).toBe("000.123.456.7-890.000");
  });

  it("rejects NIK values that are not exactly sixteen digits", () => {
    for (const nik of [
      "123456789012345",
      "12345678901234567",
      "0012-5678901234",
    ]) {
      expect(tutorTaxProfileInput.safeParse({ nik }).success).toBe(false);
    }
  });
});
