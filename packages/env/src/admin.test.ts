import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PRODUCTION_ADMIN_EMAIL,
  isConfiguredAdminEmail,
  parseConfiguredAdminEmails,
} from "./admin";

describe("configured production admins", () => {
  test("defaults to the initial operator email", () => {
    expect(parseConfiguredAdminEmails(undefined)).toEqual([
      DEFAULT_PRODUCTION_ADMIN_EMAIL,
    ]);
    expect(parseConfiguredAdminEmails("   ")).toEqual([
      DEFAULT_PRODUCTION_ADMIN_EMAIL,
    ]);
  });

  test("normalizes, filters, and deduplicates the email list", () => {
    expect(
      parseConfiguredAdminEmails(
        " Admin@Example.com, ,admin@example.com, Other@Example.com ",
      ),
    ).toEqual(["admin@example.com", "other@example.com"]);
  });

  test("matches emails case-insensitively and rejects blank input", () => {
    expect(
      isConfiguredAdminEmail("  ADMIN@example.com ", "admin@example.com"),
    ).toBe(true);
    expect(
      isConfiguredAdminEmail("other@example.com", "admin@example.com"),
    ).toBe(false);
    expect(isConfiguredAdminEmail("   ", "admin@example.com")).toBe(false);
  });
});
