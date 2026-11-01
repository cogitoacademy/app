import { expect, test } from "bun:test";
import { previewTopUpPrice } from "./top-up-price";
import { calculateV3TopUpPrice } from "../../../../packages/api/src/modules/pricing/v3-rate-card";
import { DEFAULT_V3_ECONOMY_CONFIG as config } from "../../../../packages/api/src/modules/pricing/v3-economy.config";

test("preview matches authoritative pricing across package boundaries", () => {
  for (const marks of [
    1,
    99,
    101,
    999,
    1000000,
    ...config.packages.flatMap((p) => [p.marks - 1, p.marks, p.marks + 1]),
  ].filter((n) => n > 0)) {
    expect(
      previewTopUpPrice(marks, config.packages, config.exactSurchargeIdr),
    ).toBe(calculateV3TopUpPrice(marks, config).amountIdr);
  }
});
test("invalid and unavailable inputs have no price", () => {
  for (const marks of [0, -1, 1.5, NaN, 1000001])
    expect(previewTopUpPrice(marks, config.packages, 0)).toBeNull();
  expect(previewTopUpPrice(100, [], 0)).toBeNull();
});

