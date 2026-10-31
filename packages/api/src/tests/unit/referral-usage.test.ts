import { expect, test } from "bun:test";
import { listReferralUsageInput } from "../../modules/referral/referral.types";
import {
  createReferralUsageReader,
  referralUsageSearchPattern,
} from "../../modules/referral/referral-usage.repo";

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

test("unfiltered usage listing uses a consistent read-only snapshot", async () => {
  const results = [
    [],
    [{ signups: 0, codesUsed: 0, welcomeMarks: 0, friendMarks: 0 }],
  ];
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    // eslint-disable-next-line unicorn/no-thenable -- Drizzle builders are PromiseLike.
    then: (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(resolve),
  };
  let transactionOptions: unknown;
  const db = {
    transaction: async (
      fn: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      transactionOptions = options;
      return fn({ select: () => chain });
    },
  };
  const result = await createReferralUsageReader(
    db as unknown as Parameters<typeof createReferralUsageReader>[0],
  )(listReferralUsageInput.parse({}));
  expect(result.items).toEqual([]);
  expect(result.summary.signups).toBe(0);
  expect(transactionOptions).toEqual({
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
});
