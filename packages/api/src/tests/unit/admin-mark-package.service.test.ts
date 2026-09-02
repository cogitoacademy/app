import { describe, expect, mock, test } from "bun:test";
import {
  MarkPackageCodeConflictError,
  MarkPackageNotFoundError,
} from "../../modules/admin-mark-package/admin-mark-package.errors";
import { createAdminMarkPackageService } from "../../modules/admin-mark-package/admin-mark-package.service";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "package-1",
    code: "starter",
    name: "Starter Pack",
    marks: 50,
    priceIdr: 312_500,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeDb() {
  const tx = { name: "transaction" };
  return {
    tx,
    db: {
      transaction: mock(async (callback: (connection: unknown) => unknown) =>
        callback(tx),
      ),
    } as any,
  };
}

function makeService(overrides: Record<string, unknown> = {}) {
  const { db, tx } = makeDb();
  const repo = {
    listAll: mock(async () => [makeRow()]),
    getById: mock(async () => makeRow()),
    insert: mock(async (_connection: unknown, input: unknown) =>
      makeRow(input as Record<string, unknown>),
    ),
    updateDetails: mock(async () => makeRow({ name: "Updated Pack" })),
    setActive: mock(async () => makeRow({ isActive: false })),
    ...overrides,
  };
  const auditPort = { record: mock(async () => undefined) };
  const service = createAdminMarkPackageService({
    db,
    repo: repo as any,
    auditPort,
  });
  return { db, tx, repo, auditPort, service };
}

describe("admin mark package service", () => {
  test("lists all packages through the repository", async () => {
    const { db, repo, service } = makeService();

    await expect(service.list()).resolves.toEqual([expect.any(Object)]);
    expect(repo.listAll).toHaveBeenCalledWith(db);
  });

  test("creates a package and audits the resulting state", async () => {
    const { tx, repo, auditPort, service } = makeService();
    const input = {
      code: "learner",
      name: "Learner Pack",
      marks: 120,
      priceIdr: 690_000,
      isActive: true,
    };

    const result = await service.create("admin-1", input);

    expect(result.code).toBe("learner");
    expect(repo.insert).toHaveBeenCalledWith(tx, input);
    expect(auditPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        db: tx,
        actorId: "admin-1",
        action: "mark_package_created",
        targetId: "package-1",
        afterState: expect.objectContaining({ code: "learner" }),
      }),
    );
  });

  test("maps duplicate package codes to a conflict error", async () => {
    const { service } = makeService({
      insert: mock(async () => {
        throw { code: "23505" };
      }),
    });

    await expect(
      service.create("admin-1", {
        code: "starter",
        name: "Starter Pack",
        marks: 50,
        priceIdr: 312_500,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(MarkPackageCodeConflictError);
  });

  test("rethrows non-unique insert failures", async () => {
    const error = new Error("database unavailable");
    const { service } = makeService({
      insert: mock(async () => {
        throw error;
      }),
    });

    await expect(
      service.create("admin-1", {
        code: "starter",
        name: "Starter Pack",
        marks: 50,
        priceIdr: 312_500,
        isActive: true,
      }),
    ).rejects.toBe(error);
  });

  test("rethrows primitive and null insert failures", async () => {
    const input = {
      code: "starter",
      name: "Starter Pack",
      marks: 50,
      priceIdr: 312_500,
      isActive: true,
    };
    const primitive = makeService({
      insert: mock(async () => {
        throw "database unavailable";
      }),
    });
    const nullFailure = makeService({
      insert: mock(async () => {
        throw null;
      }),
    });

    await expect(primitive.service.create("admin-1", input)).rejects.toBe(
      "database unavailable",
    );
    await expect(nullFailure.service.create("admin-1", input)).rejects.toBe(
      null,
    );
  });

  test("updates package details and records before/after audit state", async () => {
    const before = makeRow();
    const updated = makeRow({ name: "Updated Pack", marks: 75 });
    const { tx, repo, auditPort, service } = makeService({
      getById: mock(async () => before),
      updateDetails: mock(async () => updated),
    });

    await expect(
      service.update("admin-1", {
        id: "package-1",
        name: "Updated Pack",
        marks: 75,
        priceIdr: 450_000,
      }),
    ).resolves.toBe(updated);
    expect(repo.updateDetails).toHaveBeenCalledWith(tx, "package-1", {
      name: "Updated Pack",
      marks: 75,
      priceIdr: 450_000,
    });
    expect(auditPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mark_package_updated",
        beforeState: expect.objectContaining({ name: "Starter Pack" }),
        afterState: expect.objectContaining({ name: "Updated Pack" }),
      }),
    );
  });

  test("rejects updates for a missing package", async () => {
    const { service } = makeService({
      getById: mock(async () => null),
    });

    await expect(
      service.update("admin-1", {
        id: "missing",
        name: "Name",
        marks: 10,
        priceIdr: 100,
      }),
    ).rejects.toBeInstanceOf(MarkPackageNotFoundError);
  });

  test("rejects when a package disappears during update", async () => {
    const { service } = makeService({
      updateDetails: mock(async () => null),
    });

    await expect(
      service.update("admin-1", {
        id: "package-1",
        name: "Name",
        marks: 10,
        priceIdr: 100,
      }),
    ).rejects.toBeInstanceOf(MarkPackageNotFoundError);
  });

  test("returns unchanged state without an audit entry", async () => {
    const row = makeRow({ isActive: false });
    const { repo, auditPort, service } = makeService({
      getById: mock(async () => row),
    });

    await expect(
      service.setActive("admin-1", { id: "package-1", isActive: false }),
    ).resolves.toBe(row);
    expect(repo.setActive).not.toHaveBeenCalled();
    expect(auditPort.record).not.toHaveBeenCalled();
  });

  test("activates or deactivates a package and audits the transition", async () => {
    const before = makeRow({ isActive: true });
    const updated = makeRow({ isActive: false });
    const { tx, repo, auditPort, service } = makeService({
      getById: mock(async () => before),
      setActive: mock(async () => updated),
    });

    await expect(
      service.setActive("admin-1", { id: "package-1", isActive: false }),
    ).resolves.toBe(updated);
    expect(repo.setActive).toHaveBeenCalledWith(tx, "package-1", false);
    expect(auditPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        db: tx,
        action: "mark_package_activation_changed",
        beforeState: expect.objectContaining({ isActive: true }),
        afterState: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  test("rejects activation changes for missing or concurrently removed packages", async () => {
    const missing = makeService({ getById: mock(async () => null) });
    await expect(
      missing.service.setActive("admin-1", {
        id: "missing",
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(MarkPackageNotFoundError);

    const removed = makeService({
      setActive: mock(async () => null),
    });
    await expect(
      removed.service.setActive("admin-1", {
        id: "package-1",
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(MarkPackageNotFoundError);
  });
});
