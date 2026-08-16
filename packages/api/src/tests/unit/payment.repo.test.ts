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
    const returning = mock(async () => [
      {
        id: "p1",
        userId: "u1",
        walletId: "w1",
        provider: "xendit",
        providerReference: "xendit:u1:starter",
        amountIdr: 50000,
        marks: 100,
        status: "PENDING",
      },
    ]);
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const mockInsert = mock(() => ({ values }));
    const conn: any = { insert: mockInsert };

    const result = await insertPayment(conn, {
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
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
  });

  test("returns null when a concurrent writer already inserted the same provider reference", async () => {
    const returning = mock(async () => []);
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const conn: any = { insert: mock(() => ({ values })) };

    const result = await insertPayment(conn, {
      id: "p1",
      userId: "u1",
      walletId: "w1",
      provider: "xendit",
      providerReference: "xendit:u1:starter",
      amountIdr: 50000,
      marks: 100,
      status: "PENDING",
    });

    expect(result).toBeNull();
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

  test("repo methods default to db when conn not provided", async () => {
    const row = { id: "pkg1", code: "starter", marks: 50 };
    const limit = mock(async () => [row]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const db: any = { select };

    const repo = createPaymentRepo(db);
    const result = await repo.findPackageByCode("starter");
    expect(result).toEqual(row);
    expect(select).toHaveBeenCalledTimes(1);
  });

  test("repo methods use provided conn when given", async () => {
    const row = { id: "pkg1", code: "starter", marks: 50 };
    const limit = mock(async () => [row]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn: any = { select };

    const repo = createPaymentRepo({} as any);
    const result = await repo.findPackageByCode("starter", conn);
    expect(result).toEqual(row);
    expect(select).toHaveBeenCalledTimes(1);
  });

  test("repo insertPayment uses conn when provided", async () => {
    const returning = mock(async () => []);
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const mockInsert = mock(() => ({ values }));
    const conn: any = { insert: mockInsert };

    const repo = createPaymentRepo({} as any);
    await repo.insertPayment(
      {
        id: "p1",
        userId: "u1",
        walletId: "w1",
        packageId: "pkg1",
        provider: "xendit",
        providerReference: "xendit:u1:starter",
        amountIdr: 50000,
        marks: 100,
        status: "PENDING",
      },
      conn,
    );

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  test("repo updatePaymentStatus uses conn when provided", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn: any = { update };

    const repo = createPaymentRepo({} as any);
    await repo.updatePaymentStatus("p1", { status: "PAID" }, conn);

    expect(update).toHaveBeenCalledTimes(1);
  });

  test("repo findPaymentByProviderReference uses conn when provided", async () => {
    const row = { id: "p1" };
    const { select } = makeSelectConn([row]);
    const conn: any = { select };

    const repo = createPaymentRepo({} as any);
    const result = await repo.findPaymentByProviderReference("ref1", conn);
    expect(result).toEqual(row);
  });

  test("repo findPaymentById uses conn when provided", async () => {
    const row = { id: "p1" };
    const { select } = makeSelectConn([row]);
    const conn: any = { select };

    const repo = createPaymentRepo({} as any);
    const result = await repo.findPaymentById("p1", conn);
    expect(result).toEqual(row);
  });

  test("repo findPaymentByProviderEventId uses conn when provided", async () => {
    const row = { id: "p1" };
    const { select } = makeSelectConn([row]);
    const conn: any = { select };

    const repo = createPaymentRepo({} as any);
    const result = await repo.findPaymentByProviderEventId("evt1", conn);
    expect(result).toEqual(row);
  });
});
