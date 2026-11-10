import { expect, test } from "bun:test";
import { parseConfiguredAdminEmails, isConfiguredAdminEmail } from "./admin";
test("public yopmail inboxes cannot regain admin through configured allowlist", () => {
  expect(
    parseConfiguredAdminEmails("operator@yopmail.com,owner@example.com"),
  ).toEqual(["owner@example.com"]);
  expect(
    isConfiguredAdminEmail("operator@yopmail.fr", "operator@yopmail.fr"),
  ).toBe(false);
});
