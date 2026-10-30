import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DbType } from "../../lib/db";
import { listPrivateReportSessions } from "../../modules/booking/private-report-sessions";

const base = {
  bookingId: "booking-a",
  bookingNumber: 42,
  bookingType: "solo",
  parentState: "scheduled",
  learningGoal: "Algebra",
  sessionTopic: null,
  modality: "online",
  reportId: null,
  reportVersion: null,
  sessionId: null,
  sessionPosition: null,
  startAt: new Date("2026-01-01"),
  endAt: new Date("2026-01-02"),
  state: "scheduled",
};
function fixture(single: object[], series: object[] = []) {
  const conditions: string[] = [];
  let reads = 0;
  const db = {
    select() {
      const rows = reads++ === 0 ? single : series;
      const chain = {
        from: () => chain,
        leftJoin: () => chain,
        innerJoin: () => chain,
        where: (condition: any) => {
          conditions.push(new PgDialect().sqlToQuery(condition).sql);
          return Promise.resolve(rows);
        },
      };
      return chain;
    },
  };
  return { db: db as unknown as DbType, conditions, reads: () => reads };
}
describe("private reporting catalog", () => {
  test("denies students before reading any bookings", async () => {
    const f = fixture([]);
    await expect(
      listPrivateReportSessions(f.db, "student", "student"),
    ).rejects.toThrow();
    expect(f.reads()).toBe(0);
  });
  test("scopes both tutor queries and includes an ended-session cutoff", async () => {
    const f = fixture([base]);
    const rows = await listPrivateReportSessions(f.db, "tutor-a", "tutor");
    expect(rows[0]).toMatchObject({
      reference: "BKG-42",
      canRecord: true,
      canEdit: false,
    });
    expect(
      f.conditions.every(
        (sql) =>
          sql.includes('"tutor_id"') && sql.includes('"scheduled_end_at" <= '),
      ),
    ).toBe(true);
  });
  test("only admin can correct recorded private reports and excludes group no-shows", async () => {
    const f = fixture([
      { ...base, state: "completed", reportId: "report-a" },
      { ...base, bookingType: "group", state: "no_show" },
    ]);
    const rows = await listPrivateReportSessions(f.db, "admin", "admin");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ canRecord: false, canEdit: true });
    expect(f.conditions.every((sql) => !sql.includes('"tutor_id"'))).toBe(true);
    const tutor = fixture([
      { ...base, state: "completed", reportId: "report-a" },
    ]);
    expect(
      (await listPrivateReportSessions(tutor.db, "tutor", "tutor"))[0]?.canEdit,
    ).toBe(false);
  });
  test("series references retain child position and cancelled parents cannot be completed", async () => {
    const f = fixture(
      [],
      [
        {
          ...base,
          bookingType: "series",
          sessionId: "child-a",
          sessionPosition: 3,
          parentState: "cancelled",
        },
      ],
    );
    expect(
      (await listPrivateReportSessions(f.db, "tutor", "tutor"))[0],
    ).toMatchObject({
      id: "private:child-a",
      reference: "BKG-42-S3",
      sessionId: "child-a",
      canRecord: false,
    });
  });
});
