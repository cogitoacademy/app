import { describe, expect, mock, test } from "bun:test";
import { deactivateFutureRecurringAvailability } from "../../modules/tutor/tutor.repo";

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
});
