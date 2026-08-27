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
});
