import { describe, test, expect } from "bun:test";
import {
  INVITE_EXPIRY_DAYS,
  GROUP_SERIES_DISCLAIMER,
} from "../../shared/constants";

describe("Shared Constants", () => {
  test("INVITE_EXPIRY_DAYS is 7", () => {
    expect(INVITE_EXPIRY_DAYS).toBe(7);
  });

  test("P3: GROUP_SERIES_DISCLAIMER carries the full-series commitment meaning", () => {
    // PRD-required meaning: full-series commitment / cannot opt out / missed
    // sessions after H-2 are non-refundable / confirm availability for all dates.
    expect(GROUP_SERIES_DISCLAIMER).toMatch(/cannot opt out/i);
    expect(GROUP_SERIES_DISCLAIMER).toMatch(/non-refundable/i);
    expect(GROUP_SERIES_DISCLAIMER).toMatch(/available for all/i);
    expect(GROUP_SERIES_DISCLAIMER).toMatch(/full-series commitment/i);
  });
});
