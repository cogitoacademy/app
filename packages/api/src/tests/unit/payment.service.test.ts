import { describe, test, expect, mock } from "bun:test";
import { ORPCError } from "@orpc/server";
import { createPaymentService } from "../../modules/payment/payment.service";
import {
  PackageNotFoundError,
  PaymentNotFoundError,
  PackageAlreadyPurchasedError,
  PaymentProviderError,
} from "../../modules/payment/payment.errors";
import { PAYMENT_STATUS } from "../../shared/constants";
import type { PaymentRepo } from "../../modules/payment/payment.repo";
import type { PaymentStatus } from "../../modules/payment/payment.service";

function makeProvider() {
  return {
    createIntent: mock(async () => ({
      checkoutUrl: "https://checkout.test/123",
    })),
    simulatePayment: mock(async () => ({
      status: "PENDING" as const,
      message: "being processed",
    })),
    getPaymentRequestStatus: mock(async () => ({
      providerReference: "stub-user1-pkg1",
      providerEventId: "py-test-1",
      status: "PAID" as PaymentStatus,
      receiptUrl: null,
      failureReason: null,
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
    deduct: mock(async () => ({ id: "w1", totalBalance: 0 })),
    release: mock(async () => ({
      id: "w1",
      totalBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
    })),
    compensate: mock(async () => ({ id: "w1", totalBalance: 0 })),
    getById: mock(async () => ({ id: "w1" })),
    getByUserId: mock(async () => ({
      id: "w1",
      totalBalance: 100,
      heldBalance: 0,
      availableBalance: 100,
    })),
    getOrCreate: mock(async () => ({
      id: "w1",
      totalBalance: 100,
      heldBalance: 0,
      availableBalance: 100,
    })),
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
    updatePaymentStatusIfInCreditState: mock(async () => ({})),
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
    test("throws PackageNotFoundError when package does not exist", async () => {
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
        expect(e).toBeInstanceOf(PackageNotFoundError);
        expect(e.code).toBe("PACKAGE_NOT_FOUND");
      }
    });

    test("throws PackageAlreadyPurchasedError when package already purchased (non-pending)", async () => {
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
        expect(e).toBeInstanceOf(PackageAlreadyPurchasedError);
        expect(e.code).toBe("PACKAGE_ALREADY_PURCHASED");
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

    test("persists a provider request id when refreshing a PENDING intent", async () => {
      const updatePaymentStatus = mock(async () => {});
      const provider = {
        ...makeProvider(),
        createIntent: mock(async () => ({
          checkoutUrl: "https://checkout.test/refreshed",
          paymentRequestId: "pr_refreshed",
        })),
      };
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
        updatePaymentStatus,
      });

      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.checkoutUrl).toBe("https://checkout.test/refreshed");
      expect(updatePaymentStatus).toHaveBeenCalledWith("pay_existing", {
        status: PAYMENT_STATUS.PENDING,
        providerRequestId: "pr_refreshed",
        checkoutUrl: "https://checkout.test/refreshed",
      });
    });

    test("H4: PENDING re-purchase returns the stored checkoutUrl without re-calling the provider", async () => {
      const provider = makeProvider();
      const updatePaymentStatus = mock(async () => {});
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
          checkoutUrl: "https://checkout.test/stored",
        })),
        updatePaymentStatus,
      });
      const db = makeDb();

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.paymentId).toBe("pay_existing");
      expect(result.checkoutUrl).toBe("https://checkout.test/stored");
      // The provider must NOT be re-called and no DB update is needed.
      expect(provider.createIntent).not.toHaveBeenCalled();
      expect(updatePaymentStatus).not.toHaveBeenCalled();
    });

    test("B6: createIntent reuses the existing row when its insert conflicts (check-then-insert race)", async () => {
      let lookupCount = 0;
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        // The pre-check misses the row (race window), the insert loses the
        // unique provider_reference conflict, and the re-read finds the
        // winner's PENDING row — createIntent must reuse it.
        findPaymentByProviderReference: mock(async () => {
          lookupCount += 1;
          return lookupCount === 1
            ? null
            : {
                id: "pay_winner",
                status: "PENDING",
                walletId: "w1",
                providerReference: "stub:user1:pkg1",
              };
        }),
        insertPayment: mock(async () => null),
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
      expect(result.paymentId).toBe("pay_winner");
      expect(result.providerReference).toBe("stub:user1:pkg1");
      expect(result.checkoutUrl).toBeDefined();
    });

    test("B6: persists the winner's provider request id when refreshing its intent", async () => {
      let lookupCount = 0;
      const updatePaymentStatus = mock(async () => {});
      const provider = {
        ...makeProvider(),
        createIntent: mock(async () => ({
          checkoutUrl: "https://checkout.test/winner",
          paymentRequestId: "pr_winner",
        })),
      };
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        findPaymentByProviderReference: mock(async () => {
          lookupCount += 1;
          return lookupCount === 1
            ? null
            : {
                id: "pay_winner",
                status: PAYMENT_STATUS.PENDING,
                providerReference: "stub:user1:pkg1",
              };
        }),
        insertPayment: mock(async () => null),
        updatePaymentStatus,
      });

      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "stub",
      });

      await service.createIntent("user1", "w1", "pkg1");
      expect(updatePaymentStatus).toHaveBeenCalledWith("pay_winner", {
        status: PAYMENT_STATUS.PENDING,
        providerRequestId: "pr_winner",
        checkoutUrl: "https://checkout.test/winner",
      });
    });

    test("B6: reuses the winner's stored checkout URL", async () => {
      let lookupCount = 0;
      const provider = makeProvider();
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        findPaymentByProviderReference: mock(async () => {
          lookupCount += 1;
          return lookupCount === 1
            ? null
            : {
                id: "pay_winner",
                status: PAYMENT_STATUS.PENDING,
                providerReference: "stub:user1:pkg1",
                checkoutUrl: "https://checkout.test/winner-stored",
              };
        }),
        insertPayment: mock(async () => null),
      });

      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.checkoutUrl).toBe("https://checkout.test/winner-stored");
      expect(provider.createIntent).not.toHaveBeenCalled();
    });

    test("persists a provider request id for a newly created intent", async () => {
      const updatePaymentStatus = mock(async () => {});
      const provider = {
        ...makeProvider(),
        createIntent: mock(async () => ({
          checkoutUrl: "https://checkout.test/new",
          paymentRequestId: "pr_new",
        })),
      };
      const repo = makeRepo({
        findPackageByCode: mock(async () => ({
          id: "pkg1",
          code: "pkg1",
          isActive: true,
          priceIdr: 50000,
          marks: 100,
        })),
        insertPayment: mock(async () => {}),
        updatePaymentStatus,
      });

      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "stub",
      });

      await service.createIntent("user1", "w1", "pkg1");
      expect(updatePaymentStatus).toHaveBeenCalledWith(expect.any(String), {
        status: PAYMENT_STATUS.PENDING,
        providerRequestId: "pr_new",
        checkoutUrl: "https://checkout.test/new",
      });
    });

    test("createIntent re-purchases after a FAILED payment (new checkout)", async () => {
      const updatePaymentStatus = mock(async () => {});
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
          status: PAYMENT_STATUS.FAILED,
          providerReference: "stub:user1:pkg1",
        })),
        updatePaymentStatus,
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
      expect(result.paymentId).toBe("pay_existing");
      expect(result.providerReference).toBe("stub:user1:pkg1");
      expect(result.checkoutUrl).toBe("https://checkout.test/123");
      expect(updatePaymentStatus).toHaveBeenCalledWith("pay_existing", {
        status: PAYMENT_STATUS.PENDING,
        checkoutUrl: "https://checkout.test/123",
      });
    });

    test("createIntent re-purchases after an EXPIRED payment (new checkout)", async () => {
      const updatePaymentStatus = mock(async () => {});
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
          status: PAYMENT_STATUS.EXPIRED,
          providerReference: "stub:user1:pkg1",
        })),
        updatePaymentStatus,
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
      expect(result.paymentId).toBe("pay_existing");
      expect(result.checkoutUrl).toBe("https://checkout.test/123");
      expect(updatePaymentStatus).toHaveBeenCalledWith("pay_existing", {
        status: PAYMENT_STATUS.PENDING,
        checkoutUrl: "https://checkout.test/123",
      });
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

    test("wraps ORPCError as PaymentProviderError instead of re-throwing", async () => {
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

      const orpcError = new ORPCError("BAD_REQUEST", {
        message: "Invalid request",
      });
      const provider = {
        ...makeProvider(),
        createIntent: mock(async () => {
          throw orpcError;
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
        expect(e).toBeInstanceOf(PaymentProviderError);
        expect(e).not.toBeInstanceOf(ORPCError);
        expect(e.code).toBe("PAYMENT_PROVIDER_ERROR");
      }

      expect(updatePaymentStatus).toHaveBeenCalledTimes(1);
    });

    test("updates payment to EXPIRED and throws PaymentProviderError when provider.createIntent throws", async () => {
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
        expect(e).toBeInstanceOf(PaymentProviderError);
        expect(e.code).toBe("PAYMENT_PROVIDER_ERROR");
      }

      expect(updatePaymentStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("simulatePurchase", () => {
    test("simulates an owned pending payment using the stored provider request id", async () => {
      const provider = makeProvider();
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: "PENDING",
          providerRequestId: "pr-test-1",
          amountIdr: 100_000,
        })),
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(service.simulatePurchase("pay1", "user1")).resolves.toEqual({
        status: "PENDING",
        message: "being processed",
      });
      expect(provider.simulatePayment).toHaveBeenCalledWith(
        "pr-test-1",
        100_000,
      );
    });

    test("does not expose or simulate another user's payment", async () => {
      const provider = makeProvider();
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "user2",
          status: "PENDING",
          providerRequestId: "pr-test-1",
          amountIdr: 100_000,
        })),
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(
        service.simulatePurchase("pay1", "user1"),
      ).rejects.toBeInstanceOf(PaymentNotFoundError);
      expect(provider.simulatePayment).not.toHaveBeenCalled();
    });

    test("rejects a payment that cannot be simulated", async () => {
      const provider = makeProvider();
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: "PAID",
          providerRequestId: "pr-test-1",
          amountIdr: 100_000,
        })),
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(
        service.simulatePurchase("pay1", "user1"),
      ).rejects.toMatchObject({ code: "PAYMENT_SIMULATION_UNAVAILABLE" });
    });

    test("wraps provider simulation failures", async () => {
      const provider = makeProvider();
      provider.simulatePayment.mockImplementation(async () => {
        throw new Error("provider unavailable");
      });
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: "PENDING",
          providerRequestId: "pr-test-1",
          amountIdr: 100_000,
        })),
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(
        service.simulatePurchase("pay1", "user1"),
      ).rejects.toBeInstanceOf(PaymentProviderError);
    });

    test("reconciles an already-completed payment when Xendit reports an inactive QR", async () => {
      const provider = makeProvider();
      provider.simulatePayment.mockImplementation(async () => {
        throw new Error(
          "Payment simulation error: 400 INACTIVE_PAYMENT_METHOD - Could not pay QR code that is inactive",
        );
      });
      const record = {
        id: "pay1",
        userId: "user1",
        walletId: "w1",
        status: "PENDING",
        providerRequestId: "pr-test-1",
        providerReference: "stub-user1-pkg1",
        amountIdr: 100_000,
        marks: 100,
      };
      const repo = makeRepo({
        findPaymentById: mock(async () => record),
        findPaymentByProviderReference: mock(async () => record),
      });
      const wallet = makeWallet();
      const service = createPaymentService({
        db: makeDb(),
        wallet: wallet as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(service.simulatePurchase("pay1", "user1")).resolves.toEqual({
        status: "PENDING",
        message:
          "Payment was already completed; confirmation has been reconciled",
      });
      expect(provider.getPaymentRequestStatus).toHaveBeenCalledWith(
        "pr-test-1",
      );
      expect(wallet.credit).toHaveBeenCalledTimes(1);
    });

    test("reconciles an inactive QR that Xendit reports as settled", async () => {
      const provider = makeProvider();
      provider.simulatePayment.mockImplementation(async () => {
        throw new Error(
          "Payment simulation error: 400 INACTIVE_PAYMENT_METHOD - Could not pay QR code that is inactive",
        );
      });
      provider.getPaymentRequestStatus.mockImplementation(async () => ({
        providerReference: "stub-user1-pkg1",
        providerEventId: "py-test-settled",
        status: "SETTLED" as PaymentStatus,
      }));
      const record = {
        id: "pay1",
        userId: "user1",
        walletId: "w1",
        status: "PENDING",
        providerRequestId: "pr-test-1",
        providerReference: "stub-user1-pkg1",
        amountIdr: 100_000,
        marks: 100,
      };
      const repo = makeRepo({
        findPaymentById: mock(async () => record),
        findPaymentByProviderReference: mock(async () => record),
      });
      const wallet = makeWallet();
      const service = createPaymentService({
        db: makeDb(),
        wallet: wallet as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(service.simulatePurchase("pay1", "user1")).resolves.toEqual({
        status: "PENDING",
        message:
          "Payment was already completed; confirmation has been reconciled",
      });
      expect(wallet.credit).toHaveBeenCalledTimes(1);
    });

    test("preserves the inactive QR error while the authoritative status is pending", async () => {
      const provider = makeProvider();
      provider.simulatePayment.mockImplementation(async () => {
        throw new Error(
          "Payment simulation error: 400 INACTIVE_PAYMENT_METHOD - Could not pay QR code that is inactive",
        );
      });
      provider.getPaymentRequestStatus.mockImplementation(async () => ({
        providerReference: "stub-user1-pkg1",
        providerEventId: "pr-test-1",
        status: "PENDING" as PaymentStatus,
      }));
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: "PENDING",
          providerRequestId: "pr-test-1",
        })),
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(
        service.simulatePurchase("pay1", "user1"),
      ).rejects.toMatchObject({
        code: "PAYMENT_PROVIDER_ERROR",
        message:
          "Payment simulation error: 400 INACTIVE_PAYMENT_METHOD - Could not pay QR code that is inactive",
      });
    });

    test("preserves the inactive QR error when reconciliation is unavailable", async () => {
      const provider = makeProvider();
      provider.simulatePayment.mockImplementation(async () => {
        throw new Error(
          "Payment simulation error: 400 INACTIVE_PAYMENT_METHOD - Could not pay QR code that is inactive",
        );
      });
      provider.getPaymentRequestStatus.mockImplementation(async () => {
        throw new Error("status unavailable");
      });
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: "PENDING",
          providerRequestId: "pr-test-1",
        })),
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(
        service.simulatePurchase("pay1", "user1"),
      ).rejects.toMatchObject({
        code: "PAYMENT_PROVIDER_ERROR",
        message:
          "Payment simulation error: 400 INACTIVE_PAYMENT_METHOD - Could not pay QR code that is inactive",
      });
    });
  });

  describe("reconcilePurchase", () => {
    test("rejects a payment owned by another user", async () => {
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo: makeRepo({
          findPaymentById: mock(async () => ({
            id: "pay1",
            userId: "user2",
          })),
        }),
        provider: makeProvider() as any,
        providerName: "xendit",
      });

      await expect(
        service.reconcilePurchase("pay1", "user1"),
      ).rejects.toBeInstanceOf(PaymentNotFoundError);
    });

    test("does not query Xendit for an already terminal payment", async () => {
      const provider = makeProvider();
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo: makeRepo({
          findPaymentById: mock(async () => ({
            id: "pay1",
            userId: "user1",
            status: "PAID",
          })),
        }),
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(service.reconcilePurchase("pay1", "user1")).resolves.toEqual(
        { status: "PAID" },
      );
      expect(provider.getPaymentRequestStatus).not.toHaveBeenCalled();
    });

    test("confirms a provider-authoritative successful payment", async () => {
      const provider = makeProvider();
      provider.getPaymentRequestStatus.mockImplementation(async () => ({
        providerReference: "",
        providerEventId: "py-test-1",
        status: "PAID" as PaymentStatus,
        receiptUrl: null,
        failureReason: null,
      }));
      const record = {
        id: "pay1",
        userId: "user1",
        walletId: "w1",
        status: "PENDING",
        providerRequestId: "pr-test-1",
        providerReference: "stub-user1-pkg1",
        amountIdr: 100_000,
        marks: 100,
      };
      const repo = makeRepo({
        findPaymentById: mock(async () => record),
        findPaymentByProviderReference: mock(async () => record),
      });
      const wallet = makeWallet();
      const service = createPaymentService({
        db: makeDb(),
        wallet: wallet as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(service.reconcilePurchase("pay1", "user1")).resolves.toEqual(
        { status: "PAID" },
      );
      expect(provider.getPaymentRequestStatus).toHaveBeenCalledWith(
        "pr-test-1",
      );
      expect(wallet.credit).toHaveBeenCalledTimes(1);
    });

    test("leaves a remotely pending payment unchanged", async () => {
      const provider = makeProvider();
      provider.getPaymentRequestStatus.mockImplementation(async () => ({
        providerReference: "stub-user1-pkg1",
        providerEventId: "pr-test-1",
        status: "PENDING" as PaymentStatus,
      }));
      const repo = makeRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: "PENDING",
          providerRequestId: "pr-test-1",
        })),
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(service.reconcilePurchase("pay1", "user1")).resolves.toEqual(
        { status: "PENDING" },
      );
    });

    test("wraps provider status lookup failures", async () => {
      const provider = makeProvider();
      provider.getPaymentRequestStatus.mockImplementation(async () => {
        throw new Error("status unavailable");
      });
      const service = createPaymentService({
        db: makeDb(),
        wallet: makeWallet() as any,
        repo: makeRepo({
          findPaymentById: mock(async () => ({
            id: "pay1",
            userId: "user1",
            status: "PENDING",
            providerRequestId: "pr-test-1",
          })),
        }),
        provider: provider as any,
        providerName: "xendit",
      });

      await expect(
        service.reconcilePurchase("pay1", "user1"),
      ).rejects.toBeInstanceOf(PaymentProviderError);
    });
  });

  describe("confirmFromWebhook", () => {
    test("throws PaymentNotFoundError for unknown provider reference", async () => {
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
        expect(e).toBeInstanceOf(PaymentNotFoundError);
        expect(e.code).toBe("PAYMENT_NOT_FOUND");
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

    test("PAID webhook when record is FAILED (out-of-order) returns FAILED, no credit", async () => {
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.FAILED,
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
        providerEventId: "evt_paid_late",
        status: PAYMENT_STATUS.PAID as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.FAILED);
      expect(wallet.credit).toHaveBeenCalledTimes(0);
      expect(updatePaymentStatus).toHaveBeenCalledTimes(0);
    });

    test("PENDING then PAID credits wallet exactly once", async () => {
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
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatus,
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
        providerEventId: "evt_paid",
        status: PAYMENT_STATUS.PAID as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.PAID);
      expect(wallet.credit).toHaveBeenCalledTimes(1);
    });

    test("PAID credit writes a payment notification for the payer", async () => {
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PENDING,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatus,
      });
      const notification = { writeBestEffort: mock(async () => {}) };

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
        notification: notification as any,
      });

      await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_paid_notif",
        status: PAYMENT_STATUS.PAID as PaymentStatus,
      });

      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({
          db: tx,
          userId: "user1",
          category: "payment",
          eventKey: "payment.pay1.credited",
          emailRequired: true,
        }),
      );
    });

    test("REFUNDED webhook on a PAID payment writes a refund notification", async () => {
      const wallet = makeWallet();
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };

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
        notification: notification as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded_notif",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(updatePaymentStatusIfInCreditState).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({
          db: tx,
          userId: "user1",
          category: "refund",
          eventKey: "payment.pay1.refunded",
          emailRequired: true,
        }),
      );
    });

    test("REFUNDED webhook reverses the previously credited marks (R5)", async () => {
      const wallet = {
        ...makeWallet(),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };

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
        notification: notification as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded_reverse",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(wallet.compensate).toHaveBeenCalledWith(tx, {
        walletId: "w1",
        amount: 100,
        eventKey: "refund.pay1.reverse",
        sourceReference: "pay1",
        actorType: "system",
        reason: "Refund: reversed credited marks",
        type: "compensate_deduct",
      });
    });

    test("H4: REFUNDED webhook with spent marks does not compensate, writes audit + refundRecord, returns REFUNDED", async () => {
      const wallet = {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 0,
          availableBalance: 30,
        })),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };
      const audit = { record: mock(async () => {}) };
      const refundRecord = { insertRefundRecord: mock(async () => {}) };

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
        notification: notification as any,
        audit: audit as any,
        refundRecord: refundRecord as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded_spent",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(wallet.compensate).toHaveBeenCalledTimes(0);
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(0);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          db: tx,
          actorId: null,
          actorType: "system",
          action: "refund_webhook_reconciliation",
          targetId: "pay1",
          targetType: "payment_record",
          details: {
            paymentId: "pay1",
            marks: 100,
            availableBalance: 30,
            heldBalance: 0,
            spent: 70,
          },
        }),
      );
      expect(refundRecord.insertRefundRecord).toHaveBeenCalledTimes(1);
      expect(refundRecord.insertRefundRecord).toHaveBeenCalledWith(tx, {
        paymentId: "pay1",
        walletId: "w1",
        amountIdr: 50000,
        marks: 100,
        reason:
          "REFUNDED webhook: marks already spent; manual reconciliation required",
      });
    });

    test("H4: REFUNDED webhook with sufficient available balance still compensates (clean case)", async () => {
      const wallet = {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 0,
          availableBalance: 100,
        })),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };
      const audit = { record: mock(async () => {}) };
      const refundRecord = { insertRefundRecord: mock(async () => {}) };

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
        notification: notification as any,
        audit: audit as any,
        refundRecord: refundRecord as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded_clean",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(0);
      expect(refundRecord.insertRefundRecord).toHaveBeenCalledTimes(0);
    });

    test("REFUNDED webhook on a PENDING (never credited) payment does not reverse", async () => {
      const wallet = {
        ...makeWallet(),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PENDING,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatus,
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
        providerEventId: "evt_refunded_pending",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      // PENDING has no REFUNDED transition — the webhook is ignored and the
      // payment (never credited) is not reversed.
      expect(result.status).toBe(PAYMENT_STATUS.PENDING);
      expect(wallet.compensate).toHaveBeenCalledTimes(0);
      expect(updatePaymentStatus).toHaveBeenCalledTimes(0);
    });

    test("B2: REFUNDED webhook with a stale PAID snapshot does not reverse when the row is already REFUNDED (admin refund won)", async () => {
      const wallet = {
        ...makeWallet(),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      // The conditional update is a no-op (returns null): the real row was
      // already moved to REFUNDED by the admin refund. The webhook read a
      // stale PAID snapshot before the admin refund committed.
      const updatePaymentStatusIfInCreditState = mock(async () => null);
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };

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
        notification: notification as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_b2_stale",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(updatePaymentStatusIfInCreditState).toHaveBeenCalledTimes(1);
      expect(wallet.compensate).toHaveBeenCalledTimes(0);
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(0);
    });

    test("H3: createIntent re-purchase after FAILED retains old providerEventId as stale marker", async () => {
      const updatePaymentStatus = mock(async () => {});
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
          status: PAYMENT_STATUS.FAILED,
          providerReference: "stub:user1:pkg1",
          providerEventId: "evt_old_failed",
        })),
        updatePaymentStatus,
      });
      const db = makeDb();
      const provider = {
        ...makeProvider(),
        createIntent: mock(async () => ({
          checkoutUrl: "https://checkout.test/new",
          paymentRequestId: "pr_new_attempt",
        })),
      };

      const service = createPaymentService({
        db,
        wallet: makeWallet() as any,
        repo,
        provider: provider as any,
        providerName: "stub",
      });

      const result = await service.createIntent("user1", "w1", "pkg1");
      expect(result.paymentId).toBe("pay_existing");
      // The providerRequestId rotates to the new attempt; the old providerEventId
      // is retained as the stale marker (not cleared).
      expect(updatePaymentStatus).toHaveBeenCalledWith("pay_existing", {
        status: PAYMENT_STATUS.PENDING,
        providerRequestId: "pr_new_attempt",
        checkoutUrl: "https://checkout.test/new",
      });
    });

    test("H3: stale FAILED webhook for the OLD attempt after re-purchase is ignored (row stays PENDING)", async () => {
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.PENDING,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
          providerEventId: "evt_old_failed",
          providerRequestId: "pr_new_attempt",
        })),
        findPaymentByProviderEventId: mock(async () => null),
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

      // OLD attempt's FAILED webhook carries the retained stale-marker id.
      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_old_failed",
        status: PAYMENT_STATUS.FAILED as PaymentStatus,
        failureReason: "Late old-attempt failure",
      });

      expect(result.status).toBe(PAYMENT_STATUS.PENDING);
      expect(updatePaymentStatus).toHaveBeenCalledTimes(0);
      expect(wallet.credit).toHaveBeenCalledTimes(0);
    });

    test("H3: new attempt SUCCEEDED webhook after re-purchase credits once", async () => {
      const wallet = makeWallet();
      const updatePaymentStatus = mock(async () => {});
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          status: PAYMENT_STATUS.PENDING,
          walletId: "w1",
          marks: 100,
          providerReference: "stub:user1:pkg1",
          providerEventId: null,
          providerRequestId: "pr_new_attempt",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatus,
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

      // New attempt's SUCCEEDED webhook carries the current generation id.
      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "pr_new_attempt",
        status: PAYMENT_STATUS.PAID as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.PAID);
      expect(wallet.credit).toHaveBeenCalledTimes(1);
    });

    test("H3: no double-credit when both old and new SUCCEEDED arrive", async () => {
      const wallet = makeWallet();
      // Stateful row: the first webhook transitions PENDING → PAID; the second
      // call must observe the PAID row so the early-return blocks a re-credit.
      const row = {
        id: "pay1",
        status: PAYMENT_STATUS.PENDING,
        walletId: "w1",
        marks: 100,
        providerReference: "stub:user1:pkg1",
        providerEventId: null,
        providerRequestId: "pr_new_attempt",
      };
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => row),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatus: mock(async (_id: string, data: any) => {
          if (data.status) row.status = data.status;
        }),
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

      // New attempt succeeds and credits.
      const result1 = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "pr_new_attempt",
        status: PAYMENT_STATUS.PAID as PaymentStatus,
      });
      expect(result1.status).toBe(PAYMENT_STATUS.PAID);
      expect(wallet.credit).toHaveBeenCalledTimes(1);

      // Old attempt's SUCCEEDED arrives late — the row is now PAID and the
      // terminal early-return prevents a second credit.
      const result2 = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "pr_old_succeeded",
        status: PAYMENT_STATUS.PAID as PaymentStatus,
      });
      expect(result2.status).toBe(PAYMENT_STATUS.PAID);
      expect(wallet.credit).toHaveBeenCalledTimes(1);
    });

    test("M1: REFUNDED webhook reverses from total balance when payer holds all credited marks", async () => {
      const wallet = {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 100,
          availableBalance: 0,
        })),
        release: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 0,
          availableBalance: 100,
        })),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };
      const audit = { record: mock(async () => {}) };
      const refundRecord = { insertRefundRecord: mock(async () => {}) };

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
        notification: notification as any,
        audit: audit as any,
        refundRecord: refundRecord as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded_held",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      // Held marks are released back to available first, then the full marks
      // are reversed — the reversal ran despite available being 0.
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          walletId: "w1",
          amount: 100,
          eventKey: "refund.pay1.release",
          actorType: "system",
        }),
      );
      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(0);
      expect(refundRecord.insertRefundRecord).toHaveBeenCalledTimes(0);
    });

    test("M1: REFUNDED webhook with payer having spent some and held some reverses the remainder", async () => {
      const wallet = {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 30,
          availableBalance: 70,
        })),
        release: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 0,
          availableBalance: 100,
        })),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };
      const audit = { record: mock(async () => {}) };
      const refundRecord = { insertRefundRecord: mock(async () => {}) };

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
        notification: notification as any,
        audit: audit as any,
        refundRecord: refundRecord as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded_held_some",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          walletId: "w1",
          amount: 30,
          eventKey: "refund.pay1.release",
          actorType: "system",
        }),
      );
      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(0);
      expect(refundRecord.insertRefundRecord).toHaveBeenCalledTimes(0);
    });

    test("M1: REFUNDED webhook with spent all marks (total below payment marks) reconciles", async () => {
      const wallet = {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 10,
          heldBalance: 0,
          availableBalance: 10,
        })),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };
      const audit = { record: mock(async () => {}) };
      const refundRecord = { insertRefundRecord: mock(async () => {}) };

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
        notification: notification as any,
        audit: audit as any,
        refundRecord: refundRecord as any,
      });

      const result = await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_refunded_all_spent",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);
      expect(wallet.release).toHaveBeenCalledTimes(0);
      expect(wallet.compensate).toHaveBeenCalledTimes(0);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(refundRecord.insertRefundRecord).toHaveBeenCalledTimes(1);
    });

    test("N4: REFUNDED webhook reads the wallet through the transaction (getByUserId with tx)", async () => {
      const wallet = {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 0,
          availableBalance: 100,
        })),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
      };
      const updatePaymentStatusIfInCreditState = mock(async () => ({
        id: "pay1",
        status: PAYMENT_STATUS.REFUNDED,
      }));
      const repo = makeRepo({
        findPaymentByProviderReference: mock(async () => ({
          id: "pay1",
          userId: "user1",
          status: PAYMENT_STATUS.PAID,
          walletId: "w1",
          marks: 100,
          amountIdr: 50000,
          providerReference: "stub:user1:pkg1",
        })),
        findPaymentByProviderEventId: mock(async () => null),
        updatePaymentStatusIfInCreditState,
      });
      const notification = { writeBestEffort: mock(async () => {}) };

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
        notification: notification as any,
      });

      await service.confirmFromWebhook({
        provider: "stub",
        providerReference: "stub:user1:pkg1",
        providerEventId: "evt_n4_tx_read",
        status: PAYMENT_STATUS.REFUNDED as PaymentStatus,
      });

      expect(wallet.getByUserId).toHaveBeenCalledWith(tx, "user1");
      expect(wallet.getOrCreate).not.toHaveBeenCalled();
    });
  });

  describe("getPurchase", () => {
    test("throws PaymentNotFoundError when payment not found", async () => {
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
        expect(e).toBeInstanceOf(PaymentNotFoundError);
        expect(e.code).toBe("PAYMENT_NOT_FOUND");
      }
    });

    test("throws PaymentNotFoundError when userId does not match", async () => {
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
        expect(e).toBeInstanceOf(PaymentNotFoundError);
        expect(e.code).toBe("PAYMENT_NOT_FOUND");
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
