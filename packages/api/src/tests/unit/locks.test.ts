import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DbOrTx } from "../../lib/tx";
import * as locks from "../../lib/locks";

test("business advisory locks use transaction scope and distinct namespaces", async () => {
  const execute = mock(async (_query: SQL) => undefined);
  const conn = { execute } as unknown as DbOrTx;
  await locks.lockTutorForBooking(conn, "tutor1");
  await locks.lockTutorForPayout(conn, "tutor1");
  await locks.lockTutorTaxConfig(conn);
  await locks.lockBookingReschedule(conn, "booking1");
  await locks.lockRoomForBooking(conn, "room1");
  await locks.lockPaymentIntent(conn, "user1", "package1", "midtrans");
  const queries = execute.mock.calls.map(([query]) =>
    new PgDialect().sqlToQuery(query),
  );
  expect(
    queries.every((query) => query.sql.includes("pg_advisory_xact_lock")),
  ).toBe(true);
  expect(queries.map((query) => query.params)).toEqual([
    ["tutor1"],
    ["tutor1"],
    [],
    ["booking1"],
    ["room1"],
    ["midtrans:user1:package1"],
  ]);
  expect(queries.map((query) => query.sql.match(/, (\d)\)/)?.[1])).toEqual([
    "0",
    "2",
    "2",
    "1",
    "3",
    "4",
  ]);
});

test("completion request locks normalize equivalent UUID spellings and propagate lock failures", async () => {
  const execute = mock(async (_query: SQL) => undefined);
  const conn = { execute } as unknown as DbOrTx;
  await locks.lockCompletionReportRequest(conn, "ABC-DEF");
  await locks.lockCompletionReportRequest(conn, "abc-def");
  const queries = execute.mock.calls.map(([query]) =>
    new PgDialect().sqlToQuery(query),
  );
  expect(queries[0]).toEqual(queries[1]);
  expect(queries[0]?.params).toEqual(["booking-completion-report:abc-def"]);
  const error = new Error("transaction aborted");
  await expect(
    locks.lockTutorForBooking(
      {
        execute: async () => {
          throw error;
        },
      } as unknown as DbOrTx,
      "tutor1",
    ),
  ).rejects.toBe(error);
});
