import { describe, expect, mock, test } from "bun:test";
import * as tutorRepo from "../../modules/tutor/tutor.repo";
import type { DbOrTx } from "../../lib/tx";
import {
  deactivateFutureRecurringAvailability,
  listProfileHistory,
  updateProfileDisplayName,
  updateStatus,
} from "../../modules/tutor/tutor.repo";

describe("TutorRepo", () => {
  test("lists availability with optional lower date bound and preserves slot defaults", async () => {
    const writes: unknown[] = [];
    const conflicts: unknown[] = [];
    const returning = async () => [{ id: "slot1" }];
    const conn = {
      select: () => ({
        from: () => ({ where: async () => [{ id: "slot1" }] }),
      }),
      update: () => ({
        set: (value: unknown) => {
          writes.push(value);
          return { where: () => ({ returning }) };
        },
      }),
      insert: () => ({
        values: (value: unknown) => {
          writes.push(value);
          return {
            onConflictDoUpdate: (value: unknown) => {
              conflicts.push(value);
              return { returning };
            },
          };
        },
      }),
    } as unknown as DbOrTx;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 3600000);
    for (const opts of [undefined, {}, { from: startDate }]) {
      expect(await tutorRepo.listAvailability(conn, "tutor1", opts)).toEqual([
        { id: "slot1" },
      ]);
    }
    for (const id of [undefined, "slot1"]) {
      const input = { id, startDate, endDate, modality: "online" as const };
      expect(await tutorRepo.upsertAvailability(conn, "tutor1", input)).toEqual(
        { id: "slot1" },
      );
      expect(writes.at(-1)).toMatchObject({
        isRecurring: false,
        recurrenceRule: null,
        isActive: true,
      });
      expect(
        await tutorRepo.upsertAvailability(conn, "tutor1", {
          ...input,
          isRecurring: true,
          recurrenceRule: "FREQ=WEEKLY",
          isActive: false,
        }),
      ).toEqual({ id: "slot1" });
      expect(writes.at(-1)).toMatchObject({
        isRecurring: true,
        recurrenceRule: "FREQ=WEEKLY",
        isActive: false,
      });
    }
    expect(conflicts).toHaveLength(2);
    await tutorRepo.deleteAvailability(conn, "slot1");
    expect(writes.at(-1)).toEqual({ isActive: false });
  });

  test("empty specialization selections avoid lookups and clear old assignments", async () => {
    const deleted = mock(async () => []);
    const conn = { delete: () => ({ where: deleted }) } as unknown as DbOrTx;
    expect(await tutorRepo.listActiveChildSubjects(conn, [])).toEqual([]);
    expect(
      await tutorRepo.replaceProfileSubjects(conn, "profile1", []),
    ).toEqual([]);
    expect(deleted).toHaveBeenCalledTimes(1);
  });
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

  test("updates the canonical profile display name", async () => {
    const returning = mock(async () => [{ id: "user-1", name: "New Name" }]);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn = { update } as any;

    await expect(
      updateProfileDisplayName(conn, "user-1", "New Name"),
    ).resolves.toEqual({ id: "user-1", name: "New Name" });
    expect(set).toHaveBeenCalledWith({ name: "New Name" });
  });
});
