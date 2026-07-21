import { describe, test, expect, mock } from "bun:test";
import {
  getById,
  getByUserId,
  insert,
  updateBalances,
  atomicHold,
  atomicRelease,
  atomicDeduct,
  atomicCredit,
  atomicCompensateCredit,
  atomicCompensateDeduct,
  insertLedger,
  listLedger,
  listActivePackages,
  createWalletRepo,
} from "../../modules/wallet/wallet.repo";

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

function makeUpdateConn(returningRows: any[] = []) {
  const returning = mock(() => Promise.resolve(returningRows));
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

describe("getById", () => {
  test("returns wallet when found", async () => {
    const row = { id: "w1", userId: "u1", totalBalance: 100 };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await getById(conn, "w1");

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await getById(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("getByUserId", () => {
  test("returns wallet when found", async () => {
    const row = { id: "w1", userId: "u1" };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await getByUserId(conn, "u1");

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await getByUserId(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("insert", () => {
  test("inserts wallet and returns created row", async () => {
    const created = { id: "w1", userId: "u1", totalBalance: 0 };
    const returning = mock(() => Promise.resolve([created]));
    const values = mock(() => ({ returning }));
    const insertFn = mock(() => ({ values }));
    const conn: any = { insert: insertFn };

    const result = await insert(conn, {
      userId: "u1",
      totalBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
    });

    expect(result).toEqual(created);
    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
  });
});

describe("updateBalances", () => {
  test("updates balances and returns updated row", async () => {
    const updated = {
      id: "w1",
      totalBalance: 200,
      heldBalance: 0,
      availableBalance: 200,
    };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await updateBalances(conn, "w1", {
      totalBalance: 200,
      heldBalance: 0,
      availableBalance: 200,
    });

    expect(result).toEqual(updated);
    expect(updateConn.set).toHaveBeenCalledWith({
      totalBalance: 200,
      heldBalance: 0,
      availableBalance: 200,
    });
  });
});

describe("atomicHold", () => {
  test("returns updated wallet on success", async () => {
    const updated = { id: "w1", heldBalance: 50, availableBalance: 50 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicHold(conn, "w1", 50);

    expect(result).toEqual(updated);
    expect(updateConn.set).toHaveBeenCalledTimes(1);
  });

  test("throws badRequest on insufficient balance", async () => {
    const updateConn = makeUpdateConn([]);
    const conn: any = { ...updateConn };

    try {
      await atomicHold(conn, "w1", 999);
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("BAD_REQUEST");
    }
  });
});

describe("atomicRelease", () => {
  test("releases held balance and returns updated wallet", async () => {
    const updated = { id: "w1", heldBalance: 0, availableBalance: 100 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicRelease(conn, "w1", 50);

    expect(result).toEqual(updated);
    expect(updateConn.set).toHaveBeenCalledTimes(1);
  });
});

describe("atomicDeduct", () => {
  test("deducts held balance and returns updated wallet", async () => {
    const updated = { id: "w1", heldBalance: 0, totalBalance: 50 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicDeduct(conn, "w1", 50);

    expect(result).toEqual(updated);
  });

  test("throws badRequest on insufficient held balance", async () => {
    const updateConn = makeUpdateConn([]);
    const conn: any = { ...updateConn };

    try {
      await atomicDeduct(conn, "w1", 999);
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("BAD_REQUEST");
    }
  });
});

describe("atomicCredit", () => {
  test("credits balance and returns updated wallet", async () => {
    const updated = { id: "w1", totalBalance: 150, availableBalance: 150 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicCredit(conn, "w1", 50);

    expect(result).toEqual(updated);
    expect(updateConn.set).toHaveBeenCalledTimes(1);
  });
});

describe("atomicCompensateCredit", () => {
  test("credits balance and returns updated wallet", async () => {
    const updated = { id: "w1", totalBalance: 150, availableBalance: 150 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicCompensateCredit(conn, "w1", 50);

    expect(result).toEqual(updated);
  });
});

describe("atomicCompensateDeduct", () => {
  test("deducts balance and returns updated wallet", async () => {
    const updated = { id: "w1", totalBalance: 50, availableBalance: 50 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicCompensateDeduct(conn, "w1", 50);

    expect(result).toEqual(updated);
  });
});

describe("insertLedger", () => {
  test("inserts ledger entry and returns void", async () => {
    const values = mock(async () => {});
    const mockInsert = mock(() => ({ values }));
    const conn: any = { insert: mockInsert };

    await insertLedger(conn, {
      walletId: "w1",
      entryType: "credit",
      actorType: "system",
      amount: 100,
      eventKey: "evt1",
      beforeBalance: 0,
      afterBalance: 100,
      balanceAfterTotal: 100,
      balanceAfterHeld: 0,
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
  });

  test("inserts with optional fields", async () => {
    const values = mock(async () => {});
    const mockInsert = mock(() => ({ values }));
    const conn: any = { insert: mockInsert };

    await insertLedger(conn, {
      walletId: "w1",
      entryType: "hold",
      actorType: "admin",
      amount: 50,
      eventKey: "evt2",
      sourceReference: "ref1",
      reason: "booking hold",
      beforeBalance: 100,
      afterBalance: 50,
      balanceAfterTotal: 100,
      balanceAfterHeld: 50,
      bookingId: "b1",
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});

describe("listLedger", () => {
  test("returns items and nextCursor when more rows exist", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `l${i}`,
      walletId: "w1",
    }));
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    const result = await listLedger(conn, "w1", { limit: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe("l19");
    expect(chain.limit).toHaveBeenCalledWith(21);
  });

  test("returns null nextCursor when no more rows", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      walletId: "w1",
    }));
    const { select } = makeSelectConn(rows);
    const conn: any = { select };

    const result = await listLedger(conn, "w1", { limit: 20 });

    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
  });

  test("uses default limit of 20", async () => {
    const { select, chain } = makeSelectConn([]);
    const conn: any = { select };

    await listLedger(conn, "w1");

    expect(chain.limit).toHaveBeenCalledWith(21);
  });
});

describe("listActivePackages", () => {
  test("selects from markPackage with active filter", async () => {
    const rows = [{ id: "p1", isActive: true }];
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    await listActivePackages(conn);

    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });
});

describe("createWalletRepo", () => {
  test("returns object with all repo methods", () => {
    const db: any = {};
    const repo = createWalletRepo(db);

    expect(repo).toHaveProperty("getById");
    expect(repo).toHaveProperty("getByUserId");
    expect(repo).toHaveProperty("getOrCreate");
    expect(repo).toHaveProperty("insert");
    expect(repo).toHaveProperty("updateBalances");
    expect(repo).toHaveProperty("atomicHold");
    expect(repo).toHaveProperty("atomicRelease");
    expect(repo).toHaveProperty("atomicDeduct");
    expect(repo).toHaveProperty("atomicCredit");
    expect(repo).toHaveProperty("atomicCompensateCredit");
    expect(repo).toHaveProperty("atomicCompensateDeduct");
    expect(repo).toHaveProperty("insertLedger");
    expect(repo).toHaveProperty("listLedger");
    expect(repo).toHaveProperty("listActivePackages");
  });

  describe("getOrCreate", () => {
    test("returns existing wallet if found", async () => {
      const existing = { id: "w1", userId: "u1", totalBalance: 0 };

      const { promise: selectPromise } = makeQueryChain([existing]);
      const select = mock(() => selectPromise);

      const db: any = { select };

      const repo = createWalletRepo(db);
      const result = await repo.getOrCreate("u1");

      expect(result).toEqual(existing);
    });

    test("inserts new wallet when not found", async () => {
      const created = { id: "w1", userId: "u1", totalBalance: 0 };

      const { promise: selectPromise } = makeQueryChain([]);
      const select = mock(() => selectPromise);

      const returning = mock(() => Promise.resolve([created]));
      const onConflictDoNothing = mock(() => ({ returning }));
      const values = mock(() => ({ onConflictDoNothing }));
      const mockInsert = mock(() => ({ values }));

      const db: any = { select, insert: mockInsert };

      const repo = createWalletRepo(db);
      const result = await repo.getOrCreate("u1");

      expect(result).toEqual(created);
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
      expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    test("falls back to select when insert returns nothing due to conflict", async () => {
      const existingAfter = { id: "w1", userId: "u1", totalBalance: 0 };

      const { promise: selectPromise1 } = makeQueryChain([]);
      const { promise: selectPromise2 } = makeQueryChain([existingAfter]);
      const select = mock(() => selectPromise1)
        .mockImplementationOnce(() => selectPromise1)
        .mockImplementationOnce(() => selectPromise2);

      const returning = mock(() => Promise.resolve([undefined as any]));
      const onConflictDoNothing = mock(() => ({ returning }));
      const values = mock(() => ({ onConflictDoNothing }));
      const mockInsert = mock(() => ({ values }));

      const db: any = { select, insert: mockInsert };

      const repo = createWalletRepo(db);
      const result = await repo.getOrCreate("u1");

      expect(result).toEqual(existingAfter);
    });
  });
});
