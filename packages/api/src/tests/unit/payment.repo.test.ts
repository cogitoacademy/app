import { describe, test, expect, mock } from "bun:test";
import {
  findPackageByCode,
  findPaymentByProviderReference,
  findLatestPaymentByUserAndPackage,
  findTopUpQuoteById,
  insertTopUpQuote,
  findPaymentById,
  findPaymentByProviderEventId,
  findPaymentsForReconciliation,
  insertPayment,
  updatePaymentStatus,
  createPaymentRepo,
} from "../../modules/payment/payment.repo";

function makeQueryChain(resolvedValue: any) {
  const chain: any = {};
  const methods = [
    "from",
    "innerJoin",
    "where",
    "limit",
    "offset",
    "orderBy",
    "for",
  ];
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
  test("bound latest-package lookup honors an explicit transaction instead of its default database", async () => {
    const base = makeSelectConn([{ id: "base" }]);
    const tx = makeSelectConn([{ id: "transaction" }]);
    const repo = createPaymentRepo({ select: base.select } as any);
    expect(
      await repo.findLatestPaymentByUserAndPackage("u1", "pkg1", "midtrans"),
    ).toEqual({ id: "base" });
    expect(
      await repo.findLatestPaymentByUserAndPackage("u1", "pkg1", "midtrans", {
        select: tx.select,
      } as any),
    ).toEqual({ id: "transaction" });
    expect(base.select).toHaveBeenCalledTimes(1);
    expect(tx.select).toHaveBeenCalledTimes(1);
  });
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

  test("locks the matching provider reference when requested", async () => {
    const row = { id: "p2", providerReference: "ref-2" };
    const { select, chain } = makeSelectConn([row]);
    const result = await findPaymentByProviderReference(
      { select } as any,
      "ref-2",
      true,
    );
    expect(result).toEqual(row);
    expect(chain.for).toHaveBeenCalledWith("update");
    expect(chain.limit).toHaveBeenCalledWith(1);
  });
});

describe("findTopUpQuoteById", () => {
  test("uses an update lock when requested and returns null when unavailable", async () => {
    const quote = { id: "quote1", userId: "u1" };
    const locked = makeSelectConn([quote]);
    await expect(
      findTopUpQuoteById(
        { select: locked.select } as any,
        "u1",
        "quote1",
        true,
      ),
    ).resolves.toEqual(quote);
    expect(locked.chain.for).toHaveBeenCalledWith("update");

    await expect(
      findTopUpQuoteById(
        { select: makeSelectConn([]).select } as any,
        "u1",
        "absent",
      ),
    ).resolves.toBeNull();
  });
});

describe("insertTopUpQuote", () => {
  test("returns the inserted quote or null when the request key already exists", async () => {
    for (const rows of [[{ id: "quote1" }], []]) {
      const returning = mock(async () => rows);
      const onConflictDoNothing = mock(() => ({ returning }));
      const values = mock(() => ({ onConflictDoNothing }));
      const insert = mock(() => ({ values }));
      const result = await insertTopUpQuote(
        { insert } as any,
        {
          id: "quote1",
          userId: "u1",
          requestKey: "request1",
        } as any,
      );
      expect(result).toEqual(rows[0] ?? null);
      expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    }
  });
});

describe("findPaymentByProviderReference", () => {
  test("returns record when found", async () => {
    const row = { id: "p1", providerReference: "midtrans:u1:starter" };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findPaymentByProviderReference(
      conn,
      "midtrans:u1:starter",
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

describe("findLatestPaymentByUserAndPackage", () => {
  test("returns the most recent matching provider attempt", async () => {
    const row = {
      id: "p2",
      userId: "u1",
      packageId: "pkg1",
      provider: "midtrans",
    };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findLatestPaymentByUserAndPackage(
      conn,
      "u1",
      "pkg1",
      "midtrans",
    );

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  test("returns null when no matching attempt exists", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await findLatestPaymentByUserAndPackage(
      conn,
      "u1",
      "pkg1",
      "midtrans",
    );

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

describe("findPaymentsForReconciliation", () => {
  test("returns stale non-terminal payment attempts", async () => {
    const rows = [
      { id: "p1", provider: "midtrans", status: "PENDING" },
      { id: "p2", provider: "midtrans", status: "FAILED" },
    ];
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };
    const olderThan = new Date("2026-09-25T00:00:00.000Z");

    const result = await findPaymentsForReconciliation(
      conn,
      "midtrans",
      olderThan,
      25,
      new Date("2026-09-18T00:00:00.000Z"),
    );

    expect(result).toEqual(rows);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(25);
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
        provider: "midtrans",
        providerReference: "midtrans:u1:starter",
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
      provider: "midtrans",
      providerReference: "midtrans:u1:starter",
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
      provider: "midtrans",
      providerReference: "midtrans:u1:starter",
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
  test("package-code lookup uses the provided connection and handles a missing attempt", async () => {
    const row = { id: "payment-1", userId: "u1", provider: "midtrans" };
    const defaultConn = makeSelectConn([row]);
    const repo = createPaymentRepo(defaultConn as any);
    expect(
      await repo.findLatestPaymentByUserAndPackageCode(
        "u1",
        "starter",
        "midtrans",
      ),
    ).toEqual(row);
    expect(defaultConn.chain.innerJoin).toHaveBeenCalledTimes(1);
    expect(defaultConn.chain.orderBy).toHaveBeenCalledTimes(1);
    expect(defaultConn.chain.limit).toHaveBeenCalledWith(1);
    const tx = makeSelectConn([]);
    expect(
      await repo.findLatestPaymentByUserAndPackageCode(
        "u1",
        "starter",
        "midtrans",
        tx as any,
      ),
    ).toBeNull();
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(defaultConn.select).toHaveBeenCalledTimes(1);
  });
  test("returns object with all repo methods", () => {
    const db: any = {};
    const repo = createPaymentRepo(db);

    expect(repo).toHaveProperty("findPackageByCode");
    expect(repo).toHaveProperty("findPaymentByProviderReference");
    expect(repo).toHaveProperty("findLatestPaymentByUserAndPackage");
    expect(repo).toHaveProperty("findPaymentById");
    expect(repo).toHaveProperty("findPaymentByProviderEventId");
    expect(repo).toHaveProperty("findPaymentsForReconciliation");
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

  test("top-up quote methods default to db and use the default unlocked lookup", async () => {
    const quote = { id: "quote1", userId: "u1" };
    const db = makeSelectConn([quote]);
    const repo = createPaymentRepo(db as any);
    await expect(
      repo.findTopUpQuoteByRequestKey("u1", "request1"),
    ).resolves.toEqual(quote);
    await expect(repo.findTopUpQuoteById("u1", "quote1")).resolves.toEqual(
      quote,
    );
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.chain.for).not.toHaveBeenCalled();
  });

  test("provider-reference lookup defaults to the repository database", async () => {
    const row = { id: "payment1", providerReference: "ref1" };
    const db = makeSelectConn([row]);
    const repo = createPaymentRepo(db as any);
    await expect(repo.findPaymentByProviderReference("ref1")).resolves.toEqual(
      row,
    );
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  test("payment readers use the default database when no transaction is supplied", async () => {
    const row = { id: "payment1" };
    for (const method of ["quote", "event", "id"] as const) {
      const db = makeSelectConn([row]);
      const repo = createPaymentRepo(db as any);
      const result =
        method === "quote"
          ? repo.findPaymentByQuote("quote1")
          : method === "event"
            ? repo.findPaymentByProviderEventId("event1")
            : repo.findPaymentById("payment1");
      await expect(result).resolves.toEqual(row);
      expect(db.select).toHaveBeenCalledTimes(1);
    }
  });

  test("quote insert defaults to db and returns the inserted row", async () => {
    const quote = { id: "quote1" };
    const returning = mock(async () => [quote]);
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const insert = mock(() => ({ values }));
    const repo = createPaymentRepo({ insert } as any);
    await expect(
      repo.insertTopUpQuote({ id: "quote1" } as any),
    ).resolves.toEqual(quote);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  test("reconciliation query defaults to db and returns its bounded result", async () => {
    const rows = [{ id: "payment1" }];
    const db = makeSelectConn(rows);
    const repo = createPaymentRepo(db as any);
    await expect(
      repo.findPaymentsForReconciliation(
        "midtrans",
        new Date("2026-10-01T00:00:00Z"),
        5,
        new Date("2026-09-01T00:00:00Z"),
      ),
    ).resolves.toEqual(rows);
    expect(db.chain.limit).toHaveBeenCalledWith(5);
  });

  test("status mutation wrappers default to db", async () => {
    const returning = mock(async () => []);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const repo = createPaymentRepo({ update } as any);
    await repo.updatePaymentStatus("payment1", { status: "FAILED" });
    await repo.updatePaymentIntent("payment1", {
      providerIntentState: "READY",
    });
    await repo.updatePaymentStatusIfInCreditState("payment1", {
      status: "REFUNDED",
    });
    expect(update).toHaveBeenCalledTimes(3);
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
        provider: "midtrans",
        providerReference: "midtrans:u1:starter",
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

  test("repo findPaymentsForReconciliation uses conn when provided", async () => {
    const rows = [{ id: "p1", provider: "midtrans", status: "PENDING" }];
    const { select } = makeSelectConn(rows);
    const conn: any = { select };

    const repo = createPaymentRepo({} as any);
    const result = await repo.findPaymentsForReconciliation(
      "midtrans",
      new Date("2026-09-25T00:00:00.000Z"),
      10,
      new Date("2026-09-18T00:00:00.000Z"),
      conn,
    );
    expect(result).toEqual(rows);
  });
});
