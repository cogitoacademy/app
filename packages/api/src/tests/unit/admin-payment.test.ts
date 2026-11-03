import { describe, test, expect, mock } from "bun:test";
import { ORPCError } from "@orpc/server";

import {
  InvalidPaymentCursorError,
  InvalidPaymentFilterError,
} from "../../modules/admin-payment/admin-payment.errors";
import { createAdminPaymentHandler } from "../../modules/admin-payment/admin-payment.handler";
import {
  createAdminPaymentService,
  parsePaymentCursor,
} from "../../modules/admin-payment/admin-payment.service";
import { adminListPaymentsInput } from "../../modules/admin-payment/admin-payment.types";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "u1",
    userName: "Ada Lovelace",
    userEmail: "ada@example.com",
    amountIdr: 100_000,
    marks: 40,
    status: "PAID",
    provider: "midtrans",
    providerReference: "pay-ref-1",
    purchaseLabel: "40 Marks",
    createdAt: new Date("2026-11-01T03:04:05.000Z"),
    providerSuccessAt: new Date("2026-11-01T03:05:00.000Z"),
    providerRefundKind: null,
    providerRefundAmountIdr: null,
    ...overrides,
  };
}

function makeRepo(rows: Array<Record<string, unknown>>, total = rows.length) {
  return {
    listRows: mock(async () => rows),
    countRows: mock(async () => total),
  } as any;
}

function makeService(rows: Array<Record<string, unknown>>, total?: number) {
  const repo = makeRepo(rows, total);
  const service = createAdminPaymentService({
    db: {} as any,
    repo,
  });
  return { repo, service };
}

describe("adminListPaymentsInput", () => {
  test("defaults the limit to 50", () => {
    expect(adminListPaymentsInput.parse({})).toEqual({ limit: 50 });
  });

  test("accepts supported filters and trims the query", () => {
    expect(
      adminListPaymentsInput.parse({
        query: "  ada ",
        status: "PAID",
        userId: " u1 ",
        dateFrom: "2026-11-01T00:00:00.000Z",
        dateTo: "2026-11-30T23:59:59.999Z",
      }),
    ).toEqual({
      limit: 50,
      query: "ada",
      status: "PAID",
      userId: "u1",
      dateFrom: "2026-11-01T00:00:00.000Z",
      dateTo: "2026-11-30T23:59:59.999Z",
    });
  });

  test("rejects out-of-range limits and short queries", () => {
    expect(adminListPaymentsInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(adminListPaymentsInput.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(adminListPaymentsInput.safeParse({ query: "a" }).success).toBe(
      false,
    );
    expect(adminListPaymentsInput.safeParse({ query: "ab" }).success).toBe(
      true,
    );
  });

  test("rejects unsupported statuses and non-ISO dates", () => {
    expect(
      adminListPaymentsInput.safeParse({ status: "CHARGEBACK" }).success,
    ).toBe(false);
    expect(
      adminListPaymentsInput.safeParse({ dateFrom: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      adminListPaymentsInput.safeParse({ dateTo: "not-a-date" }).success,
    ).toBe(false);
  });
});

describe("parsePaymentCursor", () => {
  test("parses the createdAt/id cursor", () => {
    const cursor = parsePaymentCursor(
      "2026-11-01T03:04:05.000Z~00000000-0000-4000-8000-000000000001",
    );
    expect(cursor.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(cursor.createdAt.toISOString()).toBe("2026-11-01T03:04:05.000Z");
  });

  test("rejects malformed cursors", () => {
    expect(() => parsePaymentCursor("plain-id")).toThrow(
      InvalidPaymentCursorError,
    );
    expect(() => parsePaymentCursor("not-a-date~id")).toThrow(
      InvalidPaymentCursorError,
    );
    expect(() => parsePaymentCursor("2026-11-01T03:04:05.000Z~")).toThrow(
      InvalidPaymentCursorError,
    );
  });
});

describe("AdminPaymentService.list", () => {
  test("passes filters to the repo and returns total", async () => {
    const { repo, service } = makeService([makeRow()], 12);
    const input = {
      limit: 10,
      status: "PAID" as const,
      query: "ada",
      userId: "u1",
      dateFrom: "2026-11-01T00:00:00.000Z",
      dateTo: "2026-11-30T23:59:59.999Z",
    };

    const result = await service.list(input);

    expect(result.total).toBe(12);
    expect(result.nextCursor).toBeNull();
    expect(result.items[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      userId: "u1",
      userName: "Ada Lovelace",
      userEmail: "ada@example.com",
      amountIdr: 100_000,
      marks: 40,
      status: "PAID",
      provider: "midtrans",
      providerReference: "pay-ref-1",
      purchaseLabel: "40 Marks",
      createdAt: "2026-11-01T03:04:05.000Z",
      providerSuccessAt: "2026-11-01T03:05:00.000Z",
      providerRefundKind: null,
      providerRefundAmountIdr: null,
    });

    const [, filters, limit] = repo.listRows.mock.calls[0]!;
    expect(filters.status).toBe("PAID");
    expect(filters.query).toBe("ada");
    expect(filters.userId).toBe("u1");
    expect(filters.dateFrom.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(filters.dateTo.toISOString()).toBe("2026-11-30T23:59:59.999Z");
    expect(limit).toBe(10);
    expect(repo.countRows.mock.calls[0]![1]).toEqual(filters);
  });

  test("returns only a full page and a cursor when another page exists", async () => {
    const rows = [
      makeRow({ id: "id-3", createdAt: new Date("2026-11-03T00:00:00.000Z") }),
      makeRow({ id: "id-2", createdAt: new Date("2026-11-02T00:00:00.000Z") }),
    ];
    const { repo, service } = makeService(rows, 5);

    const result = await service.list({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("id-3");
    expect(result.nextCursor).toBe("2026-11-03T00:00:00.000Z~id-3");
    expect(repo.listRows.mock.calls[0]![2]).toBe(1);
    expect(repo.listRows.mock.calls[0]![3]).toBeUndefined();
  });

  test("forwards the parsed cursor to the repo", async () => {
    const { repo, service } = makeService([]);

    await service.list({
      cursor: "2026-11-01T00:00:00.000Z~id-9",
    });

    const cursor = repo.listRows.mock.calls[0]![3];
    expect(cursor.id).toBe("id-9");
    expect(cursor.createdAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  test("defaults the limit when called without input", async () => {
    const { repo, service } = makeService([]);

    await service.list();

    expect(repo.listRows.mock.calls[0]![2]).toBe(50);
    expect(repo.listRows.mock.calls[0]![3]).toBeUndefined();
  });

  test("maps a null provider success date", async () => {
    const { service } = makeService([makeRow({ providerSuccessAt: null })]);

    const result = await service.list({ limit: 1 });

    expect(result.items[0]!.providerSuccessAt).toBeNull();
  });

  test("rejects a reversed date range without querying", async () => {
    const { repo, service } = makeService([]);

    await expect(
      service.list({
        dateFrom: "2026-11-30T00:00:00.000Z",
        dateTo: "2026-11-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(InvalidPaymentFilterError);
    expect(repo.listRows).not.toHaveBeenCalled();
    expect(repo.countRows).not.toHaveBeenCalled();
  });

  test("rejects invalid ISO dates on direct service calls", async () => {
    const { service } = makeService([]);

    await expect(service.list({ dateFrom: "not-a-date" })).rejects.toThrow(
      InvalidPaymentFilterError,
    );
  });
});

describe("AdminPaymentHandler.listPayments", () => {
  test("delegates to the service with the input", async () => {
    const list = mock(async () => ({ items: [], nextCursor: null, total: 0 }));
    const handler = createAdminPaymentHandler({ list } as any);
    const input = { limit: 20, status: "PAID" as const };

    await expect(
      handler.listPayments({ context: {} as any, input }),
    ).resolves.toEqual({ items: [], nextCursor: null, total: 0 });
    expect(list).toHaveBeenCalledWith(input);
  });

  test("falls back to the default limit when input is absent", async () => {
    const list = mock(async () => ({ items: [], nextCursor: null, total: 0 }));
    const handler = createAdminPaymentHandler({ list } as any);

    await handler.listPayments({
      context: {} as any,
      input: undefined as never,
    });

    expect(list).toHaveBeenCalledWith({ limit: 50 });
  });

  test("maps domain errors to a bad request response", async () => {
    const list = mock(async () => {
      throw new InvalidPaymentFilterError("dateFrom must not be after dateTo");
    });
    const handler = createAdminPaymentHandler({ list } as any);

    const error = await handler
      .listPayments({ context: {} as any, input: { limit: 50 } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("BAD_REQUEST");
    expect((error as ORPCError<string, unknown>).message).toBe(
      "dateFrom must not be after dateTo",
    );
  });
});
