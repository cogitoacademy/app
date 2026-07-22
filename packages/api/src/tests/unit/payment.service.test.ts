import { describe, test, expect, mock } from "bun:test";
import { createPaymentService } from "../../modules/payment/payment.service";
import { PAYMENT_STATUS } from "../../shared/constants";
import type { PaymentRepo } from "../../modules/payment/payment.repo";
import type { PaymentStatus } from "../../modules/payment/payment.service";

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

function makeRepo(overrides: Partial<PaymentRepo> = {}): PaymentRepo {
  return {
    findPackageByCode: mock(async () => null),
    findPaymentByProviderReference: mock(async () => null),
    findPaymentById: mock(async () => null),
    findPaymentByProviderEventId: mock(async () => null),
    insertPayment: mock(async () => {}),
    updatePaymentStatus: mock(async () => {}),
    ...overrides,
  } as PaymentRepo;
}

function makeDb() {
  return {
    transaction: mock(async (fn: any) => fn({})),
  } as any;
}

describe("PaymentService", () => {
  describe("createIntent", () => {
    test("throws notFound when package does not exist", async () => {
      const repo = makeRepo({
        findPackageByCode: mock(async () => null),
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
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
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        findPaymentByProviderReference: mock(async () => ({
          id: "pay_existing",
          status: "PAID",
          providerReference: "stub:user1:pkg1",
        })),
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
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
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        findPaymentByProviderReference: mock(async () => ({
          id: "pay_existing",
          status: PAYMENT_STATUS.PENDING,
          providerReference: "stub:user1:pkg1",
        })),
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.checkoutUrl).toBeDefined();
      expect(result.paymentId).toBe("pay_existing");
      expect(result.providerReference).toBe("stub:user1:pkg1");
    });

    test("creates new payment intent when no existing payment", async () => {
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        findPaymentByProviderReference: mock(async () => null),
        insertPayment: mock(async () => {}),
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.checkoutUrl).toBe("https://checkout.test/123");
      expect(result.providerReference).toBe("stub:user1:pkg1");
    });

    test("updates payment to EXPIRED and re-throws when provider.createIntent throws", async () => {
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        findPaymentByProviderReference: mock(async () => null),
        insertPayment: mock(async () => {}),
        updatePaymentStatus,
      });
      const db = makeDb();

      const provider = {
        ...makeProvider(),
        createIntent: mock(async () => {
          throw new Error("Provider unavailable");
        }),
      };

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "stub",
      });

      try {
        await service.createIntent("user1", "w1", "pkg1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toBe("Payment provider temporarily unavailable");
      }

      expect(updatePaymentStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("confirmFromWebhook", () => {
    test("throws notFound for unknown provider reference", async () => {
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => null),
      });
      const db = {
        transaction: mock(async (fn: any) => fn({})),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: makeWallet() as any,
        repo,
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
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: "PAID",
        })),
      });
      const db = {
        transaction: mock(async (fn: any) => fn({})),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: makeWallet() as any,
        repo,
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
      const wallet = makeWallet();
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.PENDING,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatus: mock(async () => {}),
      });

      const tx = {};
      const db = {
        transaction: mock(async (fn: any) => fn(tx)),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        repo,
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
      const wallet = makeWallet();
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.PENDING,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatus: mock(async () => {}),
      });

      const db = {
        transaction: mock(async (fn: any) => fn({})),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        repo,
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
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.EXPIRED,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
        })),
        updatePaymentStatus,
      });

      const db = {
        transaction: mock(async (fn: any) => fn({})),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        repo,
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
      expect(updatePaymentStatus).toHaveBeenCalledTimes(0);
    });

    test("REFUNDED status returns early without updating", async () => {
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.REFUNDED,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
        })),
        updatePaymentStatus,
      });

      const db = {
        transaction: mock(async (fn: any) => fn({})),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        repo,
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
      expect(updatePaymentStatus).toHaveBeenCalledTimes(0);
    });

    test("providerEventId deduplication returns existing status when event matches different payment", async () => {
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.PENDING,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => ({
          id: "pay2",
          status: PAYMENT_STATUS.PAID,
          walletId: "w2",
          marks: 200,
          providerReference: "stub:user2:pkg2",
        })),
        updatePaymentStatus,
      });

      const db = {
        transaction: mock(async (fn: any) => fn({})),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        repo,
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
      expect(updatePaymentStatus).toHaveBeenCalledTimes(0);
    });

    test("skips credit when record is already not PENDING (PAID record returns early)", async () => {
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
        })),
        updatePaymentStatus,
      });

      const db = {
        transaction: mock(async (fn: any) => fn({})),
      };

      const service = createPaymentService({
        db: db as any,
        wallet: wallet as any,
        repo,
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
      expect(updatePaymentStatus).toHaveBeenCalledTimes(0);
    });
  });

  describe("getPurchase", () => {
    test("throws notFound when payment not found", async () => {
      const repo = makeRepo({
        findPaymentById: mock(async () => null),
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
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
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "other_user",
        })),
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
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
      const repo = makeRepo({
        findPaymentById: mock(async () => paymentRecord),
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
        provider: makeProvider() as any,
        providerName: "stub",
      });

      const result = await service.getPurchase("pay1", "user1");
      expect(result).toEqual(paymentRecord);
    });
  });
});
