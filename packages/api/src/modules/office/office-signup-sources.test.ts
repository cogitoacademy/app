import { expect, test } from "bun:test";
import { projectOfficeSignupSources } from "./office-signup-sources";
test("unapproved personal attribution collapses into safe aggregate buckets", () => {
  expect(
    projectOfficeSignupSources([
      {
        source: "StudentFullName",
        campaign: "081234567890",
        registered: 2,
        paidTopUp: 1,
      },
      {
        source: "AnotherStudent",
        campaign: "AnotherName",
        registered: 3,
        paidTopUp: 2,
      },
      { source: "instagram", campaign: "test", registered: 1, paidTopUp: 0 },
    ]),
  ).toEqual([
    { source: "other", campaign: "", registered: 5, paidTopUp: 3 },
    { source: "instagram", campaign: "test", registered: 1, paidTopUp: 0 },
  ]);
});
