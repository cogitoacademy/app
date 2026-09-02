import { describe, expect, mock, test } from "bun:test";
import {
  deactivateFutureRecurringAvailability,
  listProfileHistory,
  updateStatus,
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

  test("lists tutor profile history with actor names only", async () => {
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
          actor: { columns: { id: true, name: true } },
        },
      }),
    );
  });

  test("updates tutor status without changing terms by default", async () => {
    const returning = mock(async () => [{ id: "profile-1" }]);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn = { update } as any;

    await updateStatus(conn, "user-1", "pending_review");

    expect(set).toHaveBeenCalledWith({ onboardingStatus: "pending_review" });
  });

  test("records terms only when accepting during submission", async () => {
    const returning = mock(async () => [{ id: "profile-1" }]);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn = { update } as any;

    await updateStatus(conn, "user-1", "pending_review", {
      acceptTerms: true,
      termsVersion: "2026-09",
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingStatus: "pending_review" }),
    );
    const values = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values.termsOfServiceAcceptedAt).toBeDefined();
    expect(values.termsOfServiceVersion).toBeDefined();
  });
});
