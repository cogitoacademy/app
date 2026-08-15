import { describe, test, expect, mock } from "bun:test";
import {
  getById,
  getByUserId,
  atomicHold,
  atomicRelease,
  atomicDeduct,
  atomicCredit,
  atomicCompensateCredit,
  atomicCompensateDeduct,
  insertLedger,
  findLedgerEntries,
  listActivePackages,
  upsert,
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

describe("atomicHold", () => {
  test("returns success result with updated wallet on success", async () => {
    const updated = { id: "w1", heldBalance: 50, availableBalance: 50 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicHold(conn, "w1", 50);

    expect(result).toEqual({ success: true, wallet: updated });
    expect(updateConn.set).toHaveBeenCalledTimes(1);
  });

  test("returns failure result on insufficient balance", async () => {
    const updateConn = makeUpdateConn([]);
    const conn: any = { ...updateConn };

    const result = await atomicHold(conn, "w1", 999);

    expect(result).toEqual({ success: false, reason: "insufficient_balance" });
  });
});

describe("atomicRelease", () => {
  test("releases held balance and returns success result", async () => {
    const updated = { id: "w1", heldBalance: 0, availableBalance: 100 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicRelease(conn, "w1", 50);

    expect(result.success).toBe(true);
    expect(result.wallet).toEqual(updated);
    expect(updateConn.set).toHaveBeenCalledTimes(1);
  });

  test("returns failure when heldBalance < amount", async () => {
    const updateConn = makeUpdateConn([]);
    const conn: any = { ...updateConn };

    const result = await atomicRelease(conn, "w1", 50);

    expect(result.success).toBe(false);
  });
});

describe("atomicDeduct", () => {
  test("returns success result with deducted wallet", async () => {
    const updated = { id: "w1", heldBalance: 0, totalBalance: 50 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicDeduct(conn, "w1", 50);

    expect(result).toEqual({ success: true, wallet: updated });
  });

  test("returns failure result on insufficient held balance", async () => {
    const updateConn = makeUpdateConn([]);
    const conn: any = { ...updateConn };

    const result = await atomicDeduct(conn, "w1", 999);

    expect(result).toEqual({ success: false, reason: "insufficient_held" });
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
  test("deducts balance and returns success result", async () => {
    const updated = { id: "w1", totalBalance: 50, availableBalance: 50 };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await atomicCompensateDeduct(conn, "w1", 50);

    expect(result.success).toBe(true);
    expect(result.wallet).toEqual(updated);
  });

  test("returns failure when availableBalance < amount", async () => {
    const updateConn = makeUpdateConn([]);
    const conn: any = { ...updateConn };

    const result = await atomicCompensateDeduct(conn, "w1", 50);

    expect(result.success).toBe(false);
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

describe("findLedgerEntries", () => {
  test("returns raw rows with limit + 1", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `l${i}`,
      walletId: "w1",
    }));
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    const result = await findLedgerEntries(conn, "w1", { limit: 20 });

    expect(result).toHaveLength(21);
    expect(chain.limit).toHaveBeenCalledWith(21);
  });

  test("returns fewer rows when available", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      walletId: "w1",
    }));
    const { select } = makeSelectConn(rows);
    const conn: any = { select };

    const result = await findLedgerEntries(conn, "w1", { limit: 20 });

    expect(result).toHaveLength(5);
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

describe("upsert", () => {
  test("returns created wallet on successful insert", async () => {
    const created = { id: "w1", userId: "u1", totalBalance: 0 };

    const returning = mock(() => Promise.resolve([created]));
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const mockInsert = mock(() => ({ values }));

    const db: any = { insert: mockInsert };

    const result = await upsert(db, {
      userId: "u1",
      totalBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
    });

    expect(result).toEqual(created);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  test("returns null when conflict occurs", async () => {
    const returning = mock(() => Promise.resolve([undefined as any]));
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const mockInsert = mock(() => ({ values }));

    const db: any = { insert: mockInsert };

    const result = await upsert(db, {
      userId: "u1",
      totalBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
    });

    expect(result).toBeNull();
  });
});

describe("createWalletRepo", () => {
  test("returns object with all repo methods", () => {
    const repo = createWalletRepo();

    expect(repo).toHaveProperty("getById");
    expect(repo).toHaveProperty("getByUserId");
    expect(repo).toHaveProperty("upsert");
    expect(repo).toHaveProperty("atomicHold");
    expect(repo).toHaveProperty("atomicRelease");
    expect(repo).toHaveProperty("atomicDeduct");
    expect(repo).toHaveProperty("atomicCredit");
    expect(repo).toHaveProperty("atomicCompensateCredit");
    expect(repo).toHaveProperty("atomicCompensateDeduct");
    expect(repo).toHaveProperty("insertLedger");
    expect(repo).toHaveProperty("findLedgerEntries");
    expect(repo).toHaveProperty("listActivePackages");
  });
});
