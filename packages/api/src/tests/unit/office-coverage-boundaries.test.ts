import { expect, test } from "bun:test";
import { projectOfficeSignupSources } from "../../modules/office/office-signup-sources";
import { parseSignupSource } from "@cogito-app/auth/signup-source";
import { validateKbPdf } from "../../lib/private-kb-storage";
import { PDFDocument } from "pdf-lib";
import "../../modules/office/office-signup-sources.test";

test("non-string attribution values collapse to safe defaults", () => {
  expect(
    projectOfficeSignupSources([
      { source: null, campaign: 12, registered: "2", paidTopUp: "1" },
    ]),
  ).toEqual([{ source: "other", campaign: "", registered: 2, paidTopUp: 1 }]);
});
test("attribution parser rejects nonobjects and absent input", () => {
  for (const value of [null, undefined, false, "source", 1])
    expect(parseSignupSource(value)).toBeNull();
});
test("structurally valid PDF without pages is rejected", async () => {
  const bytes = await (
    await PDFDocument.create()
  ).save({ addDefaultPage: false });
  await expect(validateKbPdf(bytes)).rejects.toThrow(
    "Upload a valid, unencrypted PDF with pages",
  );
});
