import { describe, expect, test } from "bun:test";

import { createDashboardGreeting, getDayPeriod } from "./dashboard-greetings";

describe("dashboard greetings", () => {
  test.each([
    [5, "morning"],
    [10, "morning"],
    [11, "midday"],
    [14, "midday"],
    [15, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [4, "evening"],
  ] as const)("maps hour %i to %s", (hour, expected) => {
    expect(getDayPeriod(hour)).toBe(expected);
  });

  test("uses role-specific copy and the first name", () => {
    expect(createDashboardGreeting("student", "Alya Putri", 8, 0).title).toBe(
      "Good morning, Alya — ready to learn?",
    );
    expect(createDashboardGreeting("tutor", "Bima", 8, 0).title).toContain(
      "inspire",
    );
    expect(createDashboardGreeting("admin", "Citra", 8, 0).title).toBe(
      "Good morning, Admin — let's keep Cogito moving",
    );
  });

  test("surfaces relevant role workload", () => {
    expect(
      createDashboardGreeting("tutor", "Bima", 12, 0, { reviewCount: 2 })
        .description,
    ).toContain("2 student requests");
    expect(
      createDashboardGreeting("admin", "Citra", 12, 0, { priorityCount: 1 })
        .description,
    ).toContain("1 priority item needs");
  });
});
