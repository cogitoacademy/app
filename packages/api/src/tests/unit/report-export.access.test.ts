import { describe, expect, test } from "bun:test";
import { authorizeReportExport } from "../../modules/report-export/report-export.access";

describe("private report export access", () => {
  test("students can request only their own report", () => {
    expect(authorizeReportExport({ id: "student-a", role: "student" })).toEqual(
      {
        ok: true,
        studentId: "student-a",
      },
    );
    expect(
      authorizeReportExport({ id: "student-a", role: "student" }, "student-a"),
    ).toEqual({ ok: true, studentId: "student-a" });
    expect(
      authorizeReportExport({ id: "student-a", role: "student" }, "student-b"),
    ).toEqual({ ok: false, status: 403 });
  });

  test("admins must select a student and tutors cannot export student reports", () => {
    expect(authorizeReportExport({ id: "admin-a", role: "admin" })).toEqual({
      ok: false,
      status: 400,
    });
    expect(
      authorizeReportExport({ id: "admin-a", role: "admin" }, "student-b"),
    ).toEqual({ ok: true, studentId: "student-b" });
    expect(
      authorizeReportExport({ id: "tutor-a", role: "tutor" }, "student-b"),
    ).toEqual({ ok: false, status: 403 });
    expect(
      authorizeReportExport({ id: "tutor-a", role: "tutor" }, "tutor-a"),
    ).toEqual({ ok: false, status: 403 });
  });

  test("students cannot use an empty requested id to bypass their own scope", () => {
    expect(
      authorizeReportExport({ id: "student-a", role: "student" }, ""),
    ).toEqual({ ok: true, studentId: "student-a" });
    expect(authorizeReportExport({ id: "admin-a", role: "admin" }, "")).toEqual(
      { ok: false, status: 400 },
    );
    expect(
      authorizeReportExport({ id: "unknown", role: "guardian" }, "student-a"),
    ).toEqual({ ok: false, status: 403 });
  });
});
