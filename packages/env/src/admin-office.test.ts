import { officeCampaignLabelsSchema } from "./office-campaigns";
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

test("campaign config is bounded and fails closed on malformed or unsafe values", () => {
  expect(officeCampaignLabelsSchema.prefault("{}").parse(undefined)).toEqual(
    {},
  );
  expect(officeCampaignLabelsSchema.parse("{}")).toEqual({});
  expect(
    officeCampaignLabelsSchema.parse('{"school-open-day":"School Open Day"}'),
  ).toEqual({ "school-open-day": "School Open Day" });
  for (const value of [
    "invalid",
    "[]",
    "null",
    '{"081234567890":"Phone"}',
    '{"school":"a@example.com"}',
    '{"school":"081234567890"}',
    '{"school":" Bad "}',
    JSON.stringify({ school: "a".repeat(81) }),
    JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [`campaign-${i}`, "Campaign"]),
      ),
    ),
    " ".repeat(16385),
  ]) {
    expect(officeCampaignLabelsSchema.safeParse(value).success).toBe(false);
  }
});
