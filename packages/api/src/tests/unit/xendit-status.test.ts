import { describe, test, expect } from "bun:test";
import { mapXenditStatus } from "../../modules/payment/xendit-payment.provider";

describe("Xendit Payment Provider", () => {
  describe("mapXenditStatus (2024-11-11 statuses)", () => {
    test("maps SUCCEEDED to PAID", () => {
      expect(mapXenditStatus("SUCCEEDED")).toBe("PAID");
    });

    test("maps REQUIRES_ACTION to PENDING", () => {
      expect(mapXenditStatus("REQUIRES_ACTION")).toBe("PENDING");
    });

    test("maps AUTHORIZED to PENDING", () => {
      expect(mapXenditStatus("AUTHORIZED")).toBe("PENDING");
    });

    test("maps CANCELED to FAILED", () => {
      expect(mapXenditStatus("CANCELED")).toBe("FAILED");
    });

    test("maps legacy PENDING status", () => {
      expect(mapXenditStatus("PENDING")).toBe("PENDING");
    });

    test("maps legacy PAID status", () => {
      expect(mapXenditStatus("PAID")).toBe("PAID");
    });

    test("maps SETTLED status", () => {
      expect(mapXenditStatus("SETTLED")).toBe("SETTLED");
    });

    test("maps FAILED status", () => {
      expect(mapXenditStatus("FAILED")).toBe("FAILED");
    });

    test("maps EXPIRED status", () => {
      expect(mapXenditStatus("EXPIRED")).toBe("EXPIRED");
    });

    test("maps REFUNDED status", () => {
      expect(mapXenditStatus("REFUNDED")).toBe("REFUNDED");
    });

    test("throws for unknown status", () => {
      expect(() => mapXenditStatus("UNKNOWN")).toThrow(
        "Unknown payment status",
      );
    });
  });
});
