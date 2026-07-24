import { describe, test, expect } from "bun:test";
import { mapXenditStatus } from "../../modules/payment/xendit-payment.provider";

describe("Xendit Payment Provider", () => {
  describe("mapXenditStatus (tested via verifyWebhook integration tests)", () => {
    test("maps PENDING status", () => {
      expect(mapXenditStatus("PENDING")).toBe("PENDING");
    });

    test("maps PAID status", () => {
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

    test("throws for unknown status", () => {
      expect(() => mapXenditStatus("UNKNOWN")).toThrow(
        "Unknown payment status",
      );
    });
  });
});
