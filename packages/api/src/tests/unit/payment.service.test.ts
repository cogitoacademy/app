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

    test("updates payment to EXPIRED and re-throws when provider.createIntent throws", async () => {
      let selectCallCount = 0;
      const updateSetMock = mock(() => ({
        where: mock(async () => [{ id: "pay_new", status: "EXPIRED" }]),
      }));
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
          values: mock(async () => {}),
        })),
        update: mock(() => ({
          set: updateSetMock,
        })),
      } as any;

      const provider = {
        ...makeProvider(),
        createIntent: mock(async () => {
          throw new Error("Provider unavailable");
        }),
      };

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        provider: provider as any,
        providerName: "stub",
      });

      try {
        await service.createIntent("user1", "w1", "pkg1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toBe("Payment provider temporarily unavailable");
      }

      expect(db.update).toHaveBeenCalled();
      expect(updateSetMock).toHaveBeenCalledWith({
        status: PAYMENT_STATUS.EXPIRED,
      });
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

    test("SETTLED from PENDING credits wallet and updates record", async () => {
      const pendingRecord = {
        id: "pay1",
        status: PAYMENT_STATUS.PENDING,
        walletId: "w1",
        marks: 100,
        providerReference: "stub:user1:pkg1",
      };
      let selectCallCount = 0;
      const wallet = makeWallet();
      const tx = {
        select: mock(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return {
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(async () => [pendingRecord]),
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
        update: mock(() => ({
          set: mock(() => ({
            where: mock(async () => {}),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_settled",
        status: PAYMENT_STATUS.SETTLED as PaymentStatus,
        receiptUrl: "https://receipt.test/1",
      });

      expect(result.status).toBe(PAYMENT_STATUS.SETTLED);
      expect(wallet.credit).toHaveBeenCalledTimes(1);
      expect(wallet.credit).toHaveBeenCalledWith(tx, {
        walletId: "w1",
        actorType: "student",
        amount: 100,
        eventKey: "purchase.pay1",
        sourceReference: "pay1",
        reason: "Purchase: 100 Marks",
      });
    });

    test("FAILED status updates record without crediting wallet", async () => {
      const pendingRecord = {
        id: "pay1",
        status: PAYMENT_STATUS.PENDING,
        walletId: "w1",
        marks: 100,
        providerReference: "stub:user1:pkg1",
      };
      let selectCallCount = 0;
      const wallet = makeWallet();
      const tx = {
        select: mock(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return {
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(async () => [pendingRecord]),
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
        update: mock(() => ({
          set: mock(() => ({
            where: mock(async () => {}),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_failed",
        status: PAYMENT_STATUS.FAILED as PaymentStatus,
        failureReason: "Insufficient funds",
      });

      expect(result.status).toBe(PAYMENT_STATUS.FAILED);
      expect(wallet.credit).toHaveBeenCalledTimes(0);
    });

    test("EXPIRED status returns early without updating", async () => {
      const expiredRecord = {
        id: "pay1",
        status: PAYMENT_STATUS.EXPIRED,
        walletId: "w1",
        marks: 100,
        providerReference: "stub:user1:pkg1",
      };
      const wallet = makeWallet();
      const tx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [expiredRecord]),
            })),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(async () => {}),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_expired",
        status: PAYMENT_STATUS.EXPIRED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.EXPIRED);
      expect(wallet.credit).toHaveBeenCalledTimes(0);
      expect(tx.update).toHaveBeenCalledTimes(0);
    });

    test("REFUNDED status returns early without updating", async () => {
      const refundedRecord = {
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
        walletId: "w1",
        marks: 100,
        providerReference: "stub:user1:pkg1",
      };
      const wallet = makeWallet();
      const tx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [refundedRecord]),
            })),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(async () => {}),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(wallet.credit).toHaveBeenCalledTimes(0);
      expect(tx.update).toHaveBeenCalledTimes(0);
    });

    test("providerEventId deduplication returns existing status when event matches different payment", async () => {
      const pendingRecord = {
        id: "pay1",
        status: PAYMENT_STATUS.PENDING,
        walletId: "w1",
        marks: 100,
        providerReference: "stub:user1:pkg1",
      };
      const differentRecord = {
        id: "pay2",
        status: PAYMENT_STATUS.PAID,
        walletId: "w2",
        marks: 200,
        providerReference: "stub:user2:pkg2",
      };
      let selectCallCount = 0;
      const wallet = makeWallet();
      const tx = {
        select: mock(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return {
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(async () => [pendingRecord]),
                })),
              })),
            };
          }
          return {
            from: mock(() => ({
              where: mock(() => ({
                limit: mock(async () => [differentRecord]),
              })),
            })),
          };
        }),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(async () => {}),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_duplicate",
        status: PAYMENT_STATUS.PAID as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.PAID);
      expect(wallet.credit).toHaveBeenCalledTimes(0);
      expect(tx.update).toHaveBeenCalledTimes(0);
    });

    test("skips credit when record is already not PENDING (PAID record returns early)", async () => {
      const paidRecord = {
        id: "pay1",
        status: PAYMENT_STATUS.PAID,
        walletId: "w1",
        marks: 100,
        providerReference: "stub:user1:pkg1",
      };
      const wallet = makeWallet();
      const tx = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [paidRecord]),
            })),
          })),
        })),
        update: mock(() => ({
          set: mock(() => ({
            where: mock(async () => {}),
          })),
        })),
      };
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_settled_2",
        status: PAYMENT_STATUS.SETTLED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.PAID);
      expect(wallet.credit).toHaveBeenCalledTimes(0);
      expect(tx.update).toHaveBeenCalledTimes(0);
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

    test("returns record for valid owner", async () => {
      const paymentRecord = {
        id: "pay1",
        userId: "user1",
        walletId: "w1",
        status: "PAID",
        marks: 100,
        amountIdr: 50000,
        providerReference: "stub:user1:pkg1",
      };
      const db = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [paymentRecord]),
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

      const result = await service.getPurchase("pay1", "user1");
      expect(result).toEqual(paymentRecord);
    });
  });
});
