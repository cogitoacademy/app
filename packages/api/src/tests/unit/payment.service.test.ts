import { describe, test, expect, mock } from "bun:test";
import { createPaymentService } from "../../modules/payment/payment.service";
import { PAYMENT_STATUS } from "../../shared/constants";

function makeProvider() {
  return {
    createIntent: mock(async () => ({
      checkoutUrl: "https://checkout.test/123",
    })),
    verifyWebhook: mock(async () => ({
      providerReference: "stub-user1-pkg1",
      providerEventId: "evt_1",
      status: "PAID",
      receiptUrl: null,
      failureReason: null,
    })),
  };
}

function makeWallet() {
  return {
    credit: mock(async () => ({ id: "w1", totalBalance: 150 })),
    getById: mock(async () => ({ id: "w1" })),
  };
}

describe("PaymentService", () => {
  describe("createIntent", () => {
    test("throws notFound when package does not exist", async () => {
      const db = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => []),
            })),
          })),
        })),
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(async () => [{ id: "pay1" }]),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(async () => [{ id: "pay1" }]),
            })),
          })),
        })),
      } as any;

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      try {
        await service.createIntent("user1", "w1", "nonexistent_pkg");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("not found");
      }
    });

    test("throws conflict when package already purchased (non-pending)", async () => {
      let selectCallCount = 0;
      const db = {
        select: mock(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return {
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(async () => [
                    {
                      id: "pkg1",
                      code: "pkg1",
                      isActive: true,
                      priceIdr: 50000,
                      marks: 100,
                    },
                  ]),
                })),
              })),
            };
          }
          return {
            from: mock(() => ({
              where: mock(() => ({
                limit: mock(async () => [
                  {
                    id: "pay_existing",
                    status: "PAID",
                    providerReference: "stub:user1:pkg1",
                  },
                ]),
              })),
            })),
          };
        }),
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(async () => [{ id: "pay1" }]),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(async () => [{ id: "pay1" }]),
            })),
          })),
        })),
      } as any;

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      try {
        await service.createIntent("user1", "w1", "pkg1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("already");
      }
    });

    test("returns existing intent for PENDING payment", async () => {
      let selectCallCount = 0;
      const db = {
        select: mock(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return {
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(async () => [
                    {
                      id: "pkg1",
                      code: "pkg1",
                      isActive: true,
                      priceIdr: 50000,
                      marks: 100,
                    },
                  ]),
                })),
              })),
            };
          }
          return {
            from: mock(() => ({
              where: mock(() => ({
                limit: mock(async () => [
                  {
                    id: "pay_existing",
                    status: PAYMENT_STATUS.PENDING,
                    providerReference: "stub:user1:pkg1",
                  },
                ]),
              })),
            })),
          };
        }),
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(async () => [{ id: "pay1" }]),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(async () => [{ id: "pay1" }]),
            })),
          })),
        })),
      } as any;

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.checkoutUrl).toBeDefined();
      expect(result.paymentId).toBe("pay_existing");
      expect(result.providerReference).toBe("stub:user1:pkg1");
    });

    test("creates new payment intent when no existing payment", async () => {
      let selectCallCount = 0;
      const db = {
        select: mock(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return {
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(async () => [
                    {
                      id: "pkg1",
                      code: "pkg1",
                      isActive: true,
                      priceIdr: 50000,
                      marks: 100,
                    },
                  ]),
                })),
              })),
            };
          }
          return {
            from: mock(() => ({
              where: mock(() => ({
                limit: mock(async () => []),
              })),
            })),
          };
        }),
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(async () => [{ id: "pay_new" }]),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(async () => [{ id: "pay1", status: "EXPIRED" }]),
            })),
          })),
        })),
      } as any;

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.checkoutUrl).toBe("https://checkout.test/123");
      expect(result.providerReference).toBe("stub:user1:pkg1");
    });
  });

  describe("confirmFromWebhook", () => {
    test("throws notFound for unknown provider reference", async () => {
      const tx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => []),
            })),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      try {
        await service.confirmFromWebhook({
          provider: "stub",
          providerReference: "unknown_ref",
          providerEventId: "evt_1",
          status: "PAID" as PaymentStatus,
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("not found");
      }
    });

    test("returns existing status for already-PAID record", async () => {
      const existingRecord = { id: "pay1", status: "PAID" };
      const tx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [existingRecord]),
            })),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(() => ({
              returning: mock(async () => [existingRecord]),
            })),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub-user1-pkg1",
        providerEventId: "evt_1",
        status: "PAID" as PaymentStatus,
      });

      expect(result.status).toBe("PAID");
    });
  });

  describe("getPurchase", () => {
    test("throws notFound when payment not found", async () => {
      const db = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => []),
            })),
          })),
        })),
      } as any;

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      try {
        await service.getPurchase("nonexistent", "user1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("not found");
      }
    });

    test("throws notFound when userId does not match", async () => {
      const db = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [{ id: "pay1", userId: "other_user" }]),
            })),
          })),
        })),
      } as any;

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      try {
        await service.getPurchase("pay1", "user1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("not found");
      }
    });
  });
});
