import { expect, test } from "bun:test";
import { officeOpenApiPaths, officeActionNames } from "./openapi";
test("OpenAPI exposes snapshot and only approved action names", () => {
  expect(officeOpenApiPaths["/office/snapshot"].get.security).toEqual([
    { officeRead: [] },
  ]);
  expect(officeActionNames).toHaveLength(11);
  expect(
    officeActionNames.some((name) =>
      /delete|refund|payout|wallet|pricing/.test(name),
    ),
  ).toBe(false);
});
