import { describe, expect, test } from "bun:test";

import { isRedirectCheckoutUrl } from "./checkout";

describe("isRedirectCheckoutUrl", () => {
  test("treats a Midtrans Snap redirect URL as a redirect checkout", () => {
    expect(
      isRedirectCheckoutUrl(
        "https://app.sandbox.midtrans.com/snap/v2/vtweb/66e4fa55-fdac-4ef9-91b5-733b97d1b862",
      ),
    ).toBe(true);
  });

  test("treats an Xendit QRIS payload as an inline QR checkout", () => {
    expect(
      isRedirectCheckoutUrl(
        "00020101021226580018ID.CO.EXAMPLE0118ID102431234567803ID",
      ),
    ).toBe(false);
  });

  test("rejects empty and non-URL payloads", () => {
    expect(isRedirectCheckoutUrl("")).toBe(false);
    expect(isRedirectCheckoutUrl("NOT-A-URL")).toBe(false);
  });

  test("accepts an uppercase scheme with surrounding whitespace", () => {
    expect(
      isRedirectCheckoutUrl("  HTTPS://app.midtrans.com/snap/v2/vtweb/abc  "),
    ).toBe(true);
  });
});
