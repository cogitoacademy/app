import { describe, expect, mock, test } from "bun:test";

import {
  KnowledgeBankAccessGrantAlreadyExistsError,
  KnowledgeBankAccessGrantNotFoundError,
  InvalidKnowledgeBankAccessExpiryError,
  StudentNotFoundError,
  TargetUserNotStudentError,
} from "../../modules/admin-knowledge-bank/admin-knowledge-bank.errors";
import { createAdminKnowledgeBankService } from "../../modules/admin-knowledge-bank/admin-knowledge-bank.service";

const FUTURE_EXPIRY = "2099-01-02T03:04:05.000Z";

function makeGrant(overrides: Record<string, unknown> = {}) {
  return {
    id: "grant-1",
    userId: "student-1",
    grantedByUserId: "admin-1",
    expiresAt: new Date(FUTURE_EXPIRY),
    note: "legacy package",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeListRow(overrides: Record<string, unknown> = {}) {
  const grant = makeGrant(overrides);
  return {
    id: grant.id,
    userId: grant.userId,
    studentName: "Ada Lovelace",
    studentEmail: "ada@example.com",
    expiresAt: grant.expiresAt,
    note: grant.note,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt,
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
    listAll: mock(async () => [makeListRow()]),
    getActiveByUserId: mock(async () => makeGrant()),
    findUserByEmail: mock(async () => ({
      id: "student-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "student",
    })),
    getByUserId: mock(async () => null),
    insert: mock(
      async (_connection: unknown, values: Record<string, unknown>) =>
        makeGrant(values),
    ),
    getListItemById: mock(async () => makeListRow()),
    getById: mock(async () => makeGrant()),
    updateDetails: mock(
      async (
        _connection: unknown,
        _id: string,
        values: Record<string, unknown>,
      ) => makeGrant(values),
    ),
    remove: mock(async () => makeGrant()),
    ...overrides,
  };
  const auditPort = { record: mock(async () => undefined) };
  const service = createAdminKnowledgeBankService({
    db,
    repo: repo as any,
    auditPort,
  });
  return { db, tx, repo, auditPort, service };
}

describe("admin Knowledge Bank access service", () => {
  test("lists grants with ISO dates and derived status", async () => {
    const expired = makeListRow({
      id: "grant-expired",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    const { db, repo, service } = makeService({
      listAll: mock(async () => [makeListRow(), expired]),
    });

    const result = await service.list({ status: "all" });

    expect(repo.listAll).toHaveBeenCalledWith(
      db,
      { status: "all" },
      expect.any(Date),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "grant-1",
        expiresAt: FUTURE_EXPIRY,
        status: "active",
      }),
      expect.objectContaining({
        id: "grant-expired",
        status: "expired",
      }),
    ]);
  });

  test("returns active access for eligibility checks", async () => {
    const { db, repo, service } = makeService();
    const now = new Date("2026-01-01T00:00:00.000Z");

    await expect(service.getActiveByUserId("student-1", now)).resolves.toEqual(
      expect.any(Object),
    );
    expect(repo.getActiveByUserId).toHaveBeenCalledWith(db, "student-1", now);
  });

  test("creates and audits a grant for an existing student", async () => {
    const { tx, repo, auditPort, service } = makeService();
    const input = {
      email: " ADA@EXAMPLE.COM ",
      expiresAt: FUTURE_EXPIRY,
      note: "  legacy package  ",
    };

    const result = await service.create("admin-1", input);

    expect(repo.findUserByEmail).toHaveBeenCalledWith(tx, "ADA@EXAMPLE.COM");
    expect(repo.insert).toHaveBeenCalledWith(tx, {
      userId: "student-1",
      grantedByUserId: "admin-1",
      expiresAt: new Date(FUTURE_EXPIRY),
      note: "legacy package",
    });
    expect(auditPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "knowledge_bank_access_grant_created",
        targetType: "knowledge_bank_access_grant",
      }),
    );
    expect(result).toEqual(expect.objectContaining({ status: "active" }));
  });

  test("rejects a missing or non-student target", async () => {
    const missing = makeService({
      findUserByEmail: mock(async () => null),
    });
    await expect(
      missing.service.create("admin-1", {
        email: "missing@example.com",
        expiresAt: FUTURE_EXPIRY,
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);

    const nonStudent = makeService({
      findUserByEmail: mock(async () => ({
        id: "tutor-1",
        name: "Tutor",
        email: "tutor@example.com",
        role: "tutor",
      })),
    });
    await expect(
      nonStudent.service.create("admin-1", {
        email: "tutor@example.com",
        expiresAt: FUTURE_EXPIRY,
      }),
    ).rejects.toBeInstanceOf(TargetUserNotStudentError);
  });

  test("rejects duplicate grants and translates unique conflicts", async () => {
    const existing = makeService({
      getByUserId: mock(async () => makeGrant()),
    });
    await expect(
      existing.service.create("admin-1", {
        email: "ada@example.com",
        expiresAt: FUTURE_EXPIRY,
      }),
    ).rejects.toBeInstanceOf(KnowledgeBankAccessGrantAlreadyExistsError);

    const uniqueConflict = makeService({
      insert: mock(async () => {
        throw { code: "23505" };
      }),
    });
    await expect(
      uniqueConflict.service.create("admin-1", {
        email: "ada@example.com",
        expiresAt: FUTURE_EXPIRY,
      }),
    ).rejects.toBeInstanceOf(KnowledgeBankAccessGrantAlreadyExistsError);
  });

  test("rejects non-unique insert failures and non-future expiry", async () => {
    const error = new Error("database unavailable");
    const failedInsert = makeService({
      insert: mock(async () => {
        throw error;
      }),
    });
    await expect(
      failedInsert.service.create("admin-1", {
        email: "ada@example.com",
        expiresAt: FUTURE_EXPIRY,
      }),
    ).rejects.toBe(error);

    const service = makeService().service;
    await expect(
      service.create("admin-1", {
        email: "ada@example.com",
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(InvalidKnowledgeBankAccessExpiryError);
  });

  test("updates and audits a grant", async () => {
    const { tx, repo, auditPort, service } = makeService();
    const input = {
      id: "grant-1",
      expiresAt: "2099-02-02T03:04:05.000Z",
      note: " renewed ",
    };

    const result = await service.update("admin-1", input);

    expect(repo.updateDetails).toHaveBeenCalledWith(tx, "grant-1", {
      expiresAt: new Date(input.expiresAt),
      note: "renewed",
    });
    expect(auditPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "knowledge_bank_access_grant_updated",
      }),
    );
    expect(result.status).toBe("active");
  });

  test("rejects updates for missing or concurrently removed grants", async () => {
    const missing = makeService({ getById: mock(async () => null) });
    await expect(
      missing.service.update("admin-1", {
        id: "missing",
        expiresAt: FUTURE_EXPIRY,
      }),
    ).rejects.toBeInstanceOf(KnowledgeBankAccessGrantNotFoundError);

    const disappeared = makeService({ updateDetails: mock(async () => null) });
    await expect(
      disappeared.service.update("admin-1", {
        id: "grant-1",
        expiresAt: FUTURE_EXPIRY,
      }),
    ).rejects.toBeInstanceOf(KnowledgeBankAccessGrantNotFoundError);
  });

  test("removes and audits a grant", async () => {
    const { tx, repo, auditPort, service } = makeService();

    await expect(service.remove("admin-1", "grant-1")).resolves.toBeNull();
    expect(repo.remove).toHaveBeenCalledWith(tx, "grant-1");
    expect(auditPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "knowledge_bank_access_grant_removed",
      }),
    );

    const missing = makeService({ getById: mock(async () => null) });
    await expect(
      missing.service.remove("admin-1", "missing"),
    ).rejects.toBeInstanceOf(KnowledgeBankAccessGrantNotFoundError);

    const disappeared = makeService({ remove: mock(async () => null) });
    await expect(
      disappeared.service.remove("admin-1", "grant-1"),
    ).rejects.toBeInstanceOf(KnowledgeBankAccessGrantNotFoundError);
  });
});
