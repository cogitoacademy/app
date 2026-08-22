import { describe, expect, test } from "bun:test";
import {
  createWeeklyAvailabilityInput,
  deleteAvailabilityInput,
  replaceWeeklyAvailabilityInput,
  upsertAvailabilityInput,
} from "../../modules/tutor/availability.types";

const future = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe("upsertAvailabilityInput", () => {
  test("accepts a valid full input", () => {
    const result = upsertAvailabilityInput.safeParse({
      id: "avail_1",
      startDate: future(2),
      endDate: future(5),
      modality: "both",
      isRecurring: true,
      recurrenceRule: "FREQ=WEEKLY",
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  test("accepts a minimal input without optional fields", () => {
    const result = upsertAvailabilityInput.safeParse({
      startDate: future(2),
      endDate: future(5),
      modality: "online",
    });
    expect(result.success).toBe(true);
  });

  test("rejects endDate before startDate", () => {
    const result = upsertAvailabilityInput.safeParse({
      startDate: future(5),
      endDate: future(2),
      modality: "online",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "endDate");
      expect(issue?.message).toBe("endDate must be after startDate");
    }
  });

  test("rejects a past endDate", () => {
    const result = upsertAvailabilityInput.safeParse({
      startDate: future(2),
      endDate: new Date(Date.now() - 1000).toISOString(),
      modality: "online",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === "Must be in the future"),
      ).toBe(true);
    }
  });

  test("rejects an id over 100 chars", () => {
    const result = upsertAvailabilityInput.safeParse({
      id: "a".repeat(101),
      startDate: future(2),
      endDate: future(5),
      modality: "online",
    });
    expect(result.success).toBe(false);
  });

  test("rejects an invalid modality", () => {
    const result = upsertAvailabilityInput.safeParse({
      startDate: future(2),
      endDate: future(5),
      modality: "video" as never,
    });
    expect(result.success).toBe(false);
  });

  test("rejects a recurrence rule over 255 chars", () => {
    const result = upsertAvailabilityInput.safeParse({
      startDate: future(2),
      endDate: future(5),
      modality: "online",
      recurrenceRule: "a".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  test("rejects a weekly range whose end time is not after its start time", () => {
    const result = replaceWeeklyAvailabilityInput.safeParse({
      effectiveFrom: future(2),
      repeatUntil: future(30),
      ranges: [
        {
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "10:00",
          modality: "online",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "endTime must be after startTime",
      );
    }
  });

  test("rejects a weekly replacement ending before its effective date", () => {
    const effectiveFrom = future(10);
    const result = replaceWeeklyAvailabilityInput.safeParse({
      effectiveFrom,
      repeatUntil: future(2),
      ranges: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.message === "repeatUntil must be on or after effectiveFrom",
        ),
      ).toBe(true);
    }
  });

  test("rejects a weekly replacement scheduled beyond 52 weeks", () => {
    const effectiveFrom = future(2);
    const effectiveDate = new Date(effectiveFrom);
    const result = replaceWeeklyAvailabilityInput.safeParse({
      effectiveFrom,
      repeatUntil: new Date(
        effectiveDate.getTime() + 367 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      ranges: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.message ===
            "Weekly availability can be scheduled for up to 52 weeks",
        ),
      ).toBe(true);
    }
  });
});

describe("deleteAvailabilityInput", () => {
  test("accepts a valid id", () => {
    expect(deleteAvailabilityInput.safeParse({ id: "avail_1" }).success).toBe(
      true,
    );
  });

  test("rejects a missing id", () => {
    expect(deleteAvailabilityInput.safeParse({}).success).toBe(false);
  });

  test("rejects an id over 100 chars", () => {
    expect(
      deleteAvailabilityInput.safeParse({ id: "a".repeat(101) }).success,
    ).toBe(false);
  });
});

describe("createWeeklyAvailabilityInput", () => {
  const base = {
    startDate: future(2),
    endDate: future(3),
    repeatUntil: future(30),
    modality: "offline" as const,
  };

  test("accepts a valid window", () => {
    expect(createWeeklyAvailabilityInput.safeParse(base).success).toBe(true);
  });

  test("accepts a window starting on the repeatUntil date", () => {
    const start = future(2);
    expect(
      createWeeklyAvailabilityInput.safeParse({
        ...base,
        startDate: start,
        repeatUntil: start,
      }).success,
    ).toBe(true);
  });

  test("rejects endDate on or before startDate", () => {
    const start = future(2);
    const result = createWeeklyAvailabilityInput.safeParse({
      ...base,
      startDate: start,
      endDate: start,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "endDate");
      expect(issue?.message).toBe("endDate must be after startDate");
    }
  });

  test("rejects repeatUntil before startDate", () => {
    const start = future(10);
    const result = createWeeklyAvailabilityInput.safeParse({
      ...base,
      startDate: start,
      repeatUntil: future(2),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "repeatUntil",
      );
      expect(issue?.message).toBe("repeatUntil must be on or after startDate");
    }
  });

  test("rejects a window of 7 days or longer", () => {
    const start = future(2);
    const startDate = new Date(start);
    const result = createWeeklyAvailabilityInput.safeParse({
      ...base,
      startDate: start,
      endDate: new Date(
        startDate.getTime() + 8 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "endDate");
      expect(issue?.message).toBe(
        "A weekly availability window must be shorter than 7 days",
      );
    }
  });

  test("rejects a repeatUntil more than 52 weeks out", () => {
    const start = future(2);
    const startDate = new Date(start);
    const result = createWeeklyAvailabilityInput.safeParse({
      ...base,
      startDate: start,
      repeatUntil: new Date(
        startDate.getTime() + 367 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "repeatUntil",
      );
      expect(issue?.message).toBe(
        "Weekly availability can be scheduled for up to 52 weeks",
      );
    }
  });

  test("rejects a past startDate", () => {
    const result = createWeeklyAvailabilityInput.safeParse({
      ...base,
      startDate: new Date(Date.now() - 1000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  test("rejects an invalid modality", () => {
    const result = createWeeklyAvailabilityInput.safeParse({
      ...base,
      modality: "video" as never,
    });
    expect(result.success).toBe(false);
  });
});
