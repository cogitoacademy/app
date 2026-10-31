import { expect, test } from "bun:test";
import {
  discoverResettableTests,
  parseCoverageArguments,
  selectCoveragePartitions,
} from "./coverage-partitions";
const partitions = [{ name: "api-resettable" }, { name: "api-payout" }];
test("default keeps full inventory", () => {
  expect(
    selectCoveragePartitions(partitions, parseCoverageArguments([]).groups),
  ).toBe(partitions);
});
test("selection deduplicates and preserves inventory order", () => {
  const options = parseCoverageArguments([
    "--group",
    "api-payout",
    "--group",
    "api-payout",
    "--collect-only",
  ]);
  expect(options.collectOnly).toBe(true);
  expect(selectCoveragePartitions(partitions, options.groups)).toEqual([
    partitions[1]!,
  ]);
});
test("rejects invalid arguments and unknown groups", () => {
  expect(() => selectCoveragePartitions(partitions, ["typo"])).toThrow(
    "Unknown coverage group",
  );
  expect(() => parseCoverageArguments(["--group"])).toThrow("requires");
  expect(() => parseCoverageArguments(["--group", "--list"])).toThrow(
    "requires",
  );
  expect(() => parseCoverageArguments(["--typo"])).toThrow("Unknown");
  expect(parseCoverageArguments(["--list"]).list).toBe(true);
});

test("discovers resetting suites outside integration and preserves full ignore paths", () => {
  const files = discoverResettableTests("packages/api/src/tests", [
    "./packages/api/src/tests/integration/booking-payout-g16.test.ts",
  ]);
  expect(files).toContain(
    "./packages/api/src/tests/tutor-invite-onboarding.test.ts",
  );
  expect(files).toContain(
    "./packages/api/src/tests/unit/role-scope-drift.test.ts",
  );
  expect(files).toContain(
    "./packages/api/src/tests/unit/verification-gate.test.ts",
  );
  expect(files).not.toContain(
    "./packages/api/src/tests/integration/booking-payout-g16.test.ts",
  );
  expect(files).not.toContain(
    "./packages/api/src/tests/unit/booking.service.test.ts",
  );
  expect(files).toEqual(files.toSorted());
});
