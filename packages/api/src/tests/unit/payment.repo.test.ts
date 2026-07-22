import { describe, test, expect, mock } from "bun:test";
import {
  findPackageByCode,
  findPaymentByProviderReference,
  findPaymentById,
  findPaymentByProviderEventId,
  insertPayment,
  updatePaymentStatus,
  createPaymentRepo,
} from "../../modules/payment/payment.repo";

function makeQueryChain(resolvedValue: any) {
  const chain: any = {};
  const methods = ["from", "where", "limit", "offset", "orderBy"];
  const promise = Promise.resolve(resolvedValue);

  for (const method of methods) {
    chain[method] = mock(() => promise);
  }

  for (const method of methods) {
    (promise as any)[method] = chain[method];
  }

  return { chain, promise };
}

function makeSelectConn(resolvedValue: any) {
  const { chain, promise } = makeQueryChain(resolvedValue);
  const select = mock(() => promise);
  return { select, chain };
}

describe("findPackageByCode", () => {
  test("returns package when found", async () => {
    const row = { id: "pkg1", code: "starter", isActive: true };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findPackageByCode(conn, "starter");

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await findPackageByCode(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("findPaymentByProviderReference", () => {
  test("returns record when found", async () => {
    const row = { id: "p1", providerReference: "xendit:u1:starter" };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findPaymentByProviderReference(
      conn,
      "xendit:u1:starter",
    );

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await findPaymentByProviderReference(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("findPaymentById", () => {
  test("returns record when found", async () => {
    const row = { id: "p1", status: "PENDING" };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findPaymentById(conn, "p1");

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await findPaymentById(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("findPaymentByProviderEventId", () => {
  test("returns record when found", async () => {
    const row = { id: "p1", providerEventId: "evt123" };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findPaymentByProviderEventId(conn, "evt123");

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await findPaymentByProviderEventId(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("insertPayment", () => {
  test("inserts payment record", async () => {
    const values = mock(async () => {});
    const mockInsert = mock(() => ({ values }));
    const conn: any = { insert: mockInsert };

    await insertPayment(conn, {
      id: "p1",
      userId: "u1",
      walletId: "w1",
      packageId: "pkg1",
      provider: "xendit",
      providerReference: "xendit:u1:starter",
      amountIdr: 50000,
      marks: 100,
      status: "PENDING",
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
  });
});

describe("updatePaymentStatus", () => {
  test("updates status and additional fields", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn: any = { update: update };

    await updatePaymentStatus(conn, "p1", {
      status: "PAID",
      providerEventId: "evt123",
      receiptUrl: "https://receipt.url",
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      status: "PAID",
      providerEventId: "evt123",
      receiptUrl: "https://receipt.url",
    });
    expect(where).toHaveBeenCalledTimes(1);
  });

  test("updates status with minimal fields", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn: any = { update: update };

    await updatePaymentStatus(conn, "p1", {
      status: "EXPIRED",
    });

    expect(set).toHaveBeenCalledWith({ status: "EXPIRED" });
  });
});

describe("createPaymentRepo", () => {
  test("returns object with all repo methods", () => {
    const db: any = {};
    const repo = createPaymentRepo(db);

    expect(repo).toHaveProperty("findPackageByCode");
    expect(repo).toHaveProperty("findPaymentByProviderReference");
    expect(repo).toHaveProperty("findPaymentById");
    expect(repo).toHaveProperty("findPaymentByProviderEventId");
    expect(repo).toHaveProperty("insertPayment");
    expect(repo).toHaveProperty("updatePaymentStatus");
  });
});
