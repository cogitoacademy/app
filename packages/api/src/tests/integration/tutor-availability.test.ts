import { describe, test, expect, beforeAll } from "bun:test";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

describe("Tutor availability", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.avail.${ts}@cogito.test`;
  let tutorClient: TestClient;

  beforeAll(async () => {
    const res = await signUpAndSignIn(tutorEmail, "Test1234!", "Tutor Avail");
    const ctx = await createTestContext(res.cookie);
    if (!ctx.session?.user) throw new Error("Tutor session not found");
    await setUserRole(ctx.session.user.id, "tutor");
    tutorClient = createTestClient(await createTestContext(res.cookie));
  });

  // eslint-disable-next-line unicorn/consistent-function-scoping
  function slotStart(minutesFromNow = 60) {
    return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
  }

  // eslint-disable-next-line unicorn/consistent-function-scoping
  function slotEnd(minutesFromNow = 120) {
    return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
  }

  test("creates an availability window", async () => {
    const slot = await tutorClient.tutor.upsertAvailability({
      startDate: slotStart(60),
      endDate: slotEnd(120),
      modality: "online",
    });

    expect(slot.tutorId).toBeDefined();
    expect(slot.modality).toBe("online");
    expect(slot.isActive).toBe(true);
  });

  test("creates multiple dates and time ranges atomically with both modality", async () => {
    const base = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const created = await tutorClient.tutor.createDateOverrides({
      slots: [
        {
          startDate: new Date(base),
          endDate: new Date(base + 60 * 60 * 1000),
          modality: "both",
        },
        {
          startDate: new Date(base + 2 * 60 * 60 * 1000),
          endDate: new Date(base + 3 * 60 * 60 * 1000),
          modality: "both",
        },
        {
          startDate: new Date(base + 24 * 60 * 60 * 1000),
          endDate: new Date(base + 25 * 60 * 60 * 1000),
          modality: "both",
        },
      ],
    });

    expect(created).toHaveLength(3);
    expect(created.every((slot) => slot.modality === "both")).toBe(true);
    expect(created.every((slot) => slot.isRecurring === false)).toBe(true);
  });

  test("rolls back a date-override batch when one slot conflicts", async () => {
    const base = Date.now() + 5 * 24 * 60 * 60 * 1000;
    await tutorClient.tutor.upsertAvailability({
      startDate: new Date(base),
      endDate: new Date(base + 60 * 60 * 1000),
      modality: "online",
    });
    const nonConflictingStart = new Date(base + 4 * 60 * 60 * 1000);

    await expect(
      tutorClient.tutor.createDateOverrides({
        slots: [
          {
            startDate: nonConflictingStart,
            endDate: new Date(nonConflictingStart.getTime() + 60 * 60 * 1000),
            modality: "offline",
          },
          {
            startDate: new Date(base + 30 * 60 * 1000),
            endDate: new Date(base + 90 * 60 * 1000),
            modality: "offline",
          },
        ],
      }),
    ).rejects.toThrow();

    const slots = await tutorClient.tutor.listAvailability();
    expect(
      slots.some(
        (slot) =>
          new Date(slot.startDate).getTime() === nonConflictingStart.getTime(),
      ),
    ).toBe(false);
  });

  test("date overrides replace conflicting recurring occurrences", async () => {
    const base = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const recurring = await tutorClient.tutor.upsertAvailability({
      startDate: new Date(base),
      endDate: new Date(base + 3 * 60 * 60 * 1000),
      modality: "online",
      isRecurring: true,
      recurrenceRule: "FREQ=WEEKLY",
    });
    if (!recurring) throw new Error("Recurring availability was not created");

    const [override] = await tutorClient.tutor.createDateOverrides({
      slots: [
        {
          startDate: new Date(base + 60 * 60 * 1000),
          endDate: new Date(base + 2 * 60 * 60 * 1000),
          modality: "both",
        },
      ],
    });

    const slots = await tutorClient.tutor.listAvailability();
    expect(slots.some((slot) => slot.id === recurring.id)).toBe(false);
    expect(override?.modality).toBe("both");
    expect(override?.isRecurring).toBe(false);
  });

  test("lists active availability windows", async () => {
    const slots = await tutorClient.tutor.listAvailability();
    expect(slots.length).toBeGreaterThanOrEqual(1);
    expect(slots[0]!.modality).toBe("online");
  });

  test("rejects overlapping availability windows", async () => {
    const start = slotStart(60);
    const end = slotEnd(120);

    await expect(
      tutorClient.tutor.upsertAvailability({
        startDate: start,
        endDate: end,
        modality: "both",
      }),
    ).rejects.toThrow();
  });

  test("updates an existing availability window", async () => {
    const slots = await tutorClient.tutor.listAvailability();
    const id = slots[0]!.id;

    const updated = await tutorClient.tutor.upsertAvailability({
      id,
      startDate: slotStart(180),
      endDate: slotEnd(240),
      modality: "offline",
    });

    expect(updated.id).toBe(id);
    expect(updated.modality).toBe("offline");
  });

  test("deletes an availability window", async () => {
    const slotsBefore = await tutorClient.tutor.listAvailability();
    const id = slotsBefore[0]!.id;

    await tutorClient.tutor.deleteAvailability({ id });

    const slotsAfter = await tutorClient.tutor.listAvailability();
    expect(slotsAfter.find((s) => s.id === id)).toBeUndefined();
  });

  test("rejects endDate before startDate", async () => {
    await expect(
      tutorClient.tutor.upsertAvailability({
        startDate: slotEnd(60),
        endDate: slotStart(30),
        modality: "online",
      }),
    ).rejects.toThrow();
  });
});
