import { describe, expect, it } from "bun:test";
import {
  formatPayoutCoverageLabel,
  formatTaxRateSnapshot,
} from "./tutor-payout-presentation";

describe("tutor payout history labels", () => {
  it("does not turn missing coverage into a zero-session claim", () => {
    expect(formatPayoutCoverageLabel(0, false)).toBe(
      "Session coverage unavailable",
    );
    expect(formatPayoutCoverageLabel(0, true)).toBe("0 session(s)");
    expect(formatPayoutCoverageLabel(2, true)).toBe("2 session(s)");
  });

  it("distinguishes an unavailable tax snapshot from a recorded zero rate", () => {
    expect(formatTaxRateSnapshot(null)).toBe("Tax snapshot unavailable");
    expect(formatTaxRateSnapshot(0)).toBe("0.00%");
    expect(formatTaxRateSnapshot(250)).toBe("2.50%");
  });
});
