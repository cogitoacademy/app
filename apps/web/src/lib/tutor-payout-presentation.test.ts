import { describe, expect, it } from "bun:test";
import {
  formatBankAccountOwnership,
  formatPayoutCoverageLabel,
  formatPayoutDeliveryStatus,
  formatPayoutReconciliationStatus,
  formatPayoutSourceType,
  formatPayoutTaxRateSource,
  formatPayoutTaxStatus,
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

describe("tutor payout enum labels", () => {
  it("shows readable tax status and rate source labels", () => {
    expect(formatPayoutTaxStatus("nik_npwp")).toBe("NIK + NPWP");
    expect(formatPayoutTaxStatus("nik_only")).toBe("NIK only");
    expect(formatPayoutTaxStatus("missing")).toBe("Missing identity");
    expect(formatPayoutTaxStatus(null)).toBe("Not recorded");

    expect(formatPayoutTaxRateSource("default_nik_npwp")).toBe(
      "Default (NIK + NPWP)",
    );
    expect(formatPayoutTaxRateSource("default_nik_only")).toBe(
      "Default (NIK only)",
    );
    expect(formatPayoutTaxRateSource("default_missing")).toBe(
      "Default (missing identity)",
    );
    expect(formatPayoutTaxRateSource("tutor_override")).toBe("Tutor override");
  });

  it("never renders raw snake_case values for known or unknown enums", () => {
    expect(formatPayoutReconciliationStatus("not_required")).toBe(
      "Not required",
    );
    expect(formatPayoutReconciliationStatus("required")).toBe("Required");
    expect(formatPayoutReconciliationStatus("resolved")).toBe("Resolved");
    expect(formatBankAccountOwnership("self")).toBe("Self-owned");
    expect(formatBankAccountOwnership("trusted_person")).toBe("Trusted person");
    expect(formatPayoutDeliveryStatus("completed")).toBe("Completed");
    expect(formatPayoutDeliveryStatus("no_show")).toBe("No-show");
    expect(formatPayoutSourceType("fee_event")).toBe("Session fee");

    expect(formatPayoutTaxStatus("legacy_snapshot")).toBe("Legacy snapshot");
    expect(formatPayoutReconciliationStatus("needs_review")).toBe(
      "Needs review",
    );
  });

  it("labels absent values instead of inventing a state", () => {
    expect(formatPayoutTaxRateSource(null)).toBe("Not recorded");
    expect(formatBankAccountOwnership(null)).toBe("Not provided");
    expect(formatPayoutSourceType(null)).toBe("Not recorded");
  });
});
