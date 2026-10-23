import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { registerReportExportRoutes } from "./report-export-routes";

function makeApp(
  actor: { id: string; role: string } | null,
  summary = {
    reportCount: 1,
    periodStart: "2026-07-21T17:00:00.000Z",
    generatedAt: "2026-10-22T04:30:00.000Z",
    timezone: "Asia/Jakarta" as const,
  },
  pdf: Uint8Array | null = new Uint8Array([37, 80, 68, 70]),
) {
  const getSummary = mock(async (studentId: string) => {
    void studentId;
    return summary;
  });
  const generatePdf = mock(async (studentId: string) => {
    void studentId;
    return pdf;
  });
  const createContext = mock(
    async () =>
      ({
        session: actor ? { user: actor } : null,
        services: { reportExport: { getSummary, generatePdf } },
      }) as never,
  );
  return {
    app: registerReportExportRoutes(new Elysia(), {
      createContext: createContext as never,
    }),
    getSummary,
    generatePdf,
  };
}

function post(
  app: { handle(request: Request): Response | Promise<Response> },
  path: string,
  body: unknown = {},
) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("private report export routes", () => {
  test("require a session and deny arbitrary student ids to students and tutors", async () => {
    const anonymous = makeApp(null);
    expect((await post(anonymous.app, "/reports/student/pdf")).status).toBe(
      401,
    );

    const student = makeApp({ id: "student-a", role: "student" });
    expect(
      (
        await post(student.app, "/reports/student/pdf", {
          studentId: "student-b",
        })
      ).status,
    ).toBe(403);
    expect(student.generatePdf).not.toHaveBeenCalled();

    const tutor = makeApp({ id: "tutor-a", role: "tutor" });
    expect(
      (
        await post(tutor.app, "/reports/student/summary", {
          studentId: "student-b",
        })
      ).status,
    ).toBe(403);
    expect(tutor.getSummary).not.toHaveBeenCalled();
  });

  test("requires admin selection, passes the selected student, and returns a private PDF", async () => {
    const admin = makeApp({ id: "admin-a", role: "admin" });
    expect((await post(admin.app, "/reports/student/summary")).status).toBe(
      400,
    );

    const summary = await post(admin.app, "/reports/student/summary", {
      studentId: "student-b",
    });
    expect(summary.status).toBe(200);
    expect(summary.headers.get("cache-control")).toBe("private, no-store");
    expect(await summary.json()).toEqual({
      reportCount: 1,
      periodStart: "2026-07-21T17:00:00.000Z",
      generatedAt: "2026-10-22T04:30:00.000Z",
      timezone: "Asia/Jakarta",
    });
    expect(admin.getSummary).toHaveBeenCalledWith("student-b");

    expect((await post(admin.app, "/reports/student/pdf")).status).toBe(400);

    const response = await post(admin.app, "/reports/student/pdf", {
      studentId: "student-b",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "student-session-reports.pdf",
    );
    expect(admin.generatePdf).toHaveBeenCalledWith("student-b");
  });

  test("returns an explicit empty result when the authorized student has no reports", async () => {
    const student = makeApp(
      { id: "student-a", role: "student" },
      {
        reportCount: 0,
        periodStart: "2026-07-21T17:00:00.000Z",
        generatedAt: "2026-10-22T04:30:00.000Z",
        timezone: "Asia/Jakarta",
      },
      null,
    );
    const summary = await post(student.app, "/reports/student/summary");
    expect(await summary.json()).toMatchObject({ reportCount: 0 });
    expect(student.getSummary).toHaveBeenCalledWith("student-a");
    const pdf = await post(student.app, "/reports/student/pdf");
    expect(pdf.status).toBe(204);
    expect(student.generatePdf).toHaveBeenCalledWith("student-a");
  });
});
