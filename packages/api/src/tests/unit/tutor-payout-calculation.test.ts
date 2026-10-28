import { describe, expect, it } from "bun:test";
import {
  calculateTutorPayoutAmounts,
  calculateTutorTaxIdr,
  sumSafeIdr,
  tutorTaxStatus,
  TutorPayoutCalculationError,
} from "../../modules/booking/tutor-payout-calculation";

describe("tutor payout calculation", () => {
  it("rounds whole-rupiah withholding for default, custom, and large amounts", () => {
    expect(calculateTutorTaxIdr(1, 2_500)).toBe(0);
    expect(calculateTutorTaxIdr(2, 2_500)).toBe(1);
    expect(
      calculateTutorPayoutAmounts({
        grossIdr: 10_000,
        taxRateBps: 250,
        bankName: "BCA",
      }),
    ).toEqual({ taxIdr: 250, transferFeeIdr: 0, netIdr: 9_750 });
    expect(
      calculateTutorPayoutAmounts({
        grossIdr: 10_001,
        taxRateBps: 300,
        bankName: "Mandiri",
      }),
    ).toEqual({ taxIdr: 300, transferFeeIdr: 2_500, netIdr: 7_201 });
    expect(
      calculateTutorPayoutAmounts({
        grossIdr: 5_000_000_000_000,
        taxRateBps: 9_999,
        bankName: "BCA",
      }),
    ).toEqual({
      taxIdr: 4_999_500_000_000,
      transferFeeIdr: 0,
      netIdr: 500_000_000,
    });
    expect(
      calculateTutorPayoutAmounts({
        grossIdr: 10_000,
        taxRateBps: 325,
        bankName: "BCA",
      }),
    ).toEqual({ taxIdr: 325, transferFeeIdr: 0, netIdr: 9_675 });
    expect(() =>
      calculateTutorPayoutAmounts({
        grossIdr: 10_000,
        taxRateBps: 10_001,
        bankName: "BCA",
      }),
    ).toThrow(TutorPayoutCalculationError);
  });

  it("charges one bank fee for the batch and rejects a negative zero-gross net", () => {
    expect(
      calculateTutorPayoutAmounts({
        grossIdr: 10_000,
        taxRateBps: 0,
        bankName: "BCA",
      }).transferFeeIdr,
    ).toBe(0);
    expect(
      calculateTutorPayoutAmounts({
        grossIdr: 10_000,
        taxRateBps: 0,
        bankName: "bca syariah",
      }).transferFeeIdr,
    ).toBe(2_500);
    expect(
      calculateTutorPayoutAmounts({
        grossIdr: 0,
        taxRateBps: 300,
        bankName: "BCA",
      }),
    ).toEqual({ taxIdr: 0, transferFeeIdr: 0, netIdr: 0 });
    expect(() =>
      calculateTutorPayoutAmounts({
        grossIdr: 0,
        taxRateBps: 300,
        bankName: "Mandiri",
      }),
    ).toThrow(TutorPayoutCalculationError);
    expect(sumSafeIdr([1_000, 2_000, 3_000])).toBe(6_000);
  });

  it("rejects negative net, unsafe amounts, and incomplete tax identity", () => {
    expect(() =>
      calculateTutorPayoutAmounts({
        grossIdr: 2_000,
        taxRateBps: 3_000,
        bankName: "Mandiri",
      }),
    ).toThrow(TutorPayoutCalculationError);
    expect(() =>
      calculateTutorPayoutAmounts({
        grossIdr: Number.MAX_SAFE_INTEGER + 1,
        taxRateBps: 0,
        bankName: "BCA",
      }),
    ).toThrow(TutorPayoutCalculationError);
    expect(() => sumSafeIdr([Number.MAX_SAFE_INTEGER, 1])).toThrow(
      TutorPayoutCalculationError,
    );
    expect(
      tutorTaxStatus({
        legalName: "A Tutor",
        nik: "0012345678901234",
        npwp: null,
      }),
    ).toBe("nik_only");
    expect(
      tutorTaxStatus({
        legalName: "A Tutor",
        nik: "0012345678901234",
        npwp: "000123",
      }),
    ).toBe("nik_npwp");
    expect(
      tutorTaxStatus({ legalName: "", nik: "0012345678901234", npwp: null }),
    ).toBe("missing");
  });

  it("rejects negative and fractional IDR inputs and invalid tax rates", () => {
    expect(() => calculateTutorTaxIdr(-1, 0)).toThrow(
      "Gross amount must be a non-negative safe integer",
    );
    expect(() => calculateTutorTaxIdr(1.5, 0)).toThrow(
      "Gross amount must be a non-negative safe integer",
    );
    expect(() => calculateTutorTaxIdr(1, -1)).toThrow(
      "Tax rate must be from 0.00% to 100.00%",
    );
    expect(() => calculateTutorTaxIdr(1, 1.5)).toThrow(
      "Tax rate must be from 0.00% to 100.00%",
    );
    expect(() => sumSafeIdr([-1])).toThrow(
      "Session fee must be a non-negative safe integer",
    );
  });
});
