import { expect, test } from "bun:test";
import { percentToBasisPoints } from "./tax-rate-input";

test("percentage inputs retain the API's integer tax-rate unit", () => {
  expect(percentToBasisPoints(2.5)).toBe(250);
  expect(percentToBasisPoints(3)).toBe(300);
  expect(percentToBasisPoints(2.55)).toBe(255);
  expect(percentToBasisPoints(0)).toBe(0);
  expect(percentToBasisPoints(100)).toBe(10000);
  expect(percentToBasisPoints(-0.01)).toBe(-1);
  expect(percentToBasisPoints(100.01)).toBe(10001);
});
