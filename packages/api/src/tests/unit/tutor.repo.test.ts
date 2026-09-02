import { describe, expect, mock, test } from "bun:test";
import {
  deactivateFutureRecurringAvailability,
  listProfileHistory,
} from "../../modules/tutor/tutor.repo";

describe("TutorRepo", () => {
  test("deactivates future recurring availability for a tutor", async () => {
    const where = mock(async () => undefined);
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn = { update } as any;
    const from = new Date("2026-09-01T00:00:00Z");

    await deactivateFutureRecurringAvailability(conn, "u1", from);

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ isActive: false });
  });

  test("lists tutor profile history with actor details", async () => {
    const rows = [{ id: "audit-1", action: "tutor_profile_updated" }];
    const findMany = mock(async () => rows);
    const conn = {
      query: {
        auditLog: { findMany },
      },
    } as any;

    await expect(listProfileHistory(conn, "profile-1")).resolves.toEqual(rows);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        with: {
          actor: { columns: { id: true, name: true, email: true } },
        },
      }),
    );
  });
});
