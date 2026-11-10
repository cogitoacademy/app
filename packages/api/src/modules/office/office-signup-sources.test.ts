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
    { source: "instagram", campaign: "", registered: 1, paidTopUp: 0 },
  ]);
});

test("approved identifiers export only explicit labels and merge counts, including manual sources", () => {
  expect(
    projectOfficeSignupSources(
      [
        {
          source: "school",
          campaign: "school-open-day",
          registered: 2,
          paidTopUp: 1,
        },
        {
          source: "school",
          campaign: "school-open-day-alias",
          registered: 3,
          paidTopUp: 2,
        },
        {
          source: "instagram",
          campaign: "school-open-day",
          registered: 4,
          paidTopUp: 2,
        },
        ...[
          "081234567890",
          "Student Name",
          "unknown",
          "toString",
          "__proto__",
          "SCHOOL-OPEN-DAY",
        ].map((campaign) => ({
          source: "school",
          campaign,
          registered: 1,
          paidTopUp: 0,
        })),
      ],
      {
        "school-open-day": "School Open Day",
        "school-open-day-alias": "School Open Day",
      },
    ),
  ).toEqual([
    {
      source: "school",
      campaign: "School Open Day",
      registered: 5,
      paidTopUp: 3,
    },
    {
      source: "instagram",
      campaign: "School Open Day",
      registered: 4,
      paidTopUp: 2,
    },
    { source: "school", campaign: "", registered: 6, paidTopUp: 0 },
  ]);
});
