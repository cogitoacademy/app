import { describe, expect, test } from "bun:test";

import { NETWORK_ERROR_MESSAGE, getUserFacingError } from "./error-message";

describe("getUserFacingError", () => {
  test("translates browser network errors into plain language", () => {
    expect(getUserFacingError(new TypeError("Failed to fetch"))).toBe(
      NETWORK_ERROR_MESSAGE,
    );
    expect(getUserFacingError({ error: { message: "Load failed" } })).toBe(
      NETWORK_ERROR_MESSAGE,
    );
  });

  test("keeps helpful domain messages intact", () => {
    expect(
      getUserFacingError(new Error("This booking is no longer available.")),
    ).toBe("This booking is no longer available.");
  });

  test("translates payment provider failures into plain language", () => {
    expect(
      getUserFacingError(
        new Error(
          "Payment provider error: 503 SERVICE_UNAVAILABLE - The maximum amount for a payment request is 1000000.00 IDR",
        ),
      ),
    ).toBe(
      "The payment provider is temporarily unavailable. Please try again in a few minutes.",
    );
    expect(getUserFacingError(new Error("Service unavailable"))).toBe(
      "The payment provider is temporarily unavailable. Please try again in a few minutes.",
    );
  });
});
