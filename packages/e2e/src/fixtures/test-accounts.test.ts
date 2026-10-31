import { describe, expect, test } from "bun:test";
import {
  createRunScopedStudentEmail,
  DEFAULT_STUDENT_EMAIL,
  resolveStudentEmail,
} from "./student-identity";

describe("E2E student identity", () => {
  test("uses a distinct email for each test run", () => {
    const firstRunEmail = createRunScopedStudentEmail(
      "cb8ed20a-1c2a-4320-9d45-23b6c81791b2",
    );
    const secondRunEmail = createRunScopedStudentEmail(
      "e89bfc0b-3fa2-47c0-aa39-e1c2eb63545a",
    );

    expect(firstRunEmail).toBe(
      "cogito.e2e.cb8ed20a-1c2a-4320-9d45-23b6c81791b2@yopmail.com",
    );
    expect(secondRunEmail).not.toBe(firstRunEmail);
  });

  test("uses the per-run environment email and keeps the legacy default elsewhere", () => {
    expect(
      resolveStudentEmail({ E2E_STUDENT_EMAIL: "  RUN-STUDENT@EXAMPLE.COM  " }),
    ).toBe("run-student@example.com");
    expect(resolveStudentEmail({})).toBe(DEFAULT_STUDENT_EMAIL);
  });
});
