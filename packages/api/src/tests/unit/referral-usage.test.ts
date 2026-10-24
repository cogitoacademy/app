import { expect, test } from "bun:test";
import { listReferralUsageInput } from "../../modules/referral/referral.types";
import { referralUsageSearchPattern } from "../../modules/referral/referral-usage.repo";

test("usage search treats SQL wildcard characters as literal input", () => {
  expect(referralUsageSearchPattern("a%_\\b")).toBe("%a\\%\\_\\\\b%");
  expect(referralUsageSearchPattern("' OR 1=1")).toBe("%' OR 1=1%");
});
test("bounds admin pagination, type and search input", () => {
  expect(listReferralUsageInput.parse({})).toEqual({
    search: "",
    kind: "all",
    page: 0,
    limit: 25,
  });
  for (const input of [
    { page: -1 },
    { limit: 0 },
    { limit: 101 },
    { kind: "admin" },
    { search: "x".repeat(121) },
  ])
    expect(listReferralUsageInput.safeParse(input).success).toBe(false);
});
