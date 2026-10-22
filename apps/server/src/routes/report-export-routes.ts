import { authorizeReportExport } from "@cogito-app/api/modules/report-export/report-export.access";
import { Elysia, t } from "elysia";
import type { Context as ApiContext } from "@cogito-app/api/context";
import type { Context as ElysiaContext } from "elysia";

type ContextFactory = (options: {
  context: ElysiaContext;
}) => Promise<ApiContext>;

async function createRequestContext(options: { context: ElysiaContext }) {
  const { createContext } = await import("@cogito-app/api/context");
  return createContext(options);
}

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

export function registerReportExportRoutes(
  app: Elysia,
  deps: { createContext?: ContextFactory } = {},
) {
  const contextFactory = deps.createContext ?? createRequestContext;
  const body = t.Object({
    studentId: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  });

  app.post(
    "/reports/student/summary",
    async ({ request, set, ...routeContext }) => {
      const context = await contextFactory({
        context: { request, ...routeContext } as ElysiaContext,
      });
      const actor = context.session?.user as
        | { id: string; role?: string }
        | undefined;
      if (!actor) return jsonError(401, "Unauthorized");

      const authorization = authorizeReportExport(
        { id: actor.id, role: actor.role ?? "" },
        routeContext.body.studentId,
      );
      if (!authorization.ok) {
        return jsonError(authorization.status, "Report export is not allowed");
      }

      const summary = await context.services.reportExport.getSummary(
        authorization.studentId,
      );
      if (!summary) return jsonError(404, "Student not found");
      set.headers["Cache-Control"] = privateHeaders["Cache-Control"];
      set.headers["X-Content-Type-Options"] =
        privateHeaders["X-Content-Type-Options"];
      return summary;
    },
    { body },
  );

  return app.post(
    "/reports/student/pdf",
    async ({ request, set, ...routeContext }) => {
      const context = await contextFactory({
        context: { request, ...routeContext } as ElysiaContext,
      });
      const actor = context.session?.user as
        | { id: string; role?: string }
        | undefined;
      if (!actor) return jsonError(401, "Unauthorized");

      const authorization = authorizeReportExport(
        { id: actor.id, role: actor.role ?? "" },
        routeContext.body.studentId,
      );
      if (!authorization.ok) {
        return jsonError(authorization.status, "Report export is not allowed");
      }

      const pdf = await context.services.reportExport.generatePdf(
        authorization.studentId,
      );
      if (!pdf)
        return new Response(null, { status: 204, headers: privateHeaders });

      set.headers["Cache-Control"] = privateHeaders["Cache-Control"];
      set.headers["X-Content-Type-Options"] =
        privateHeaders["X-Content-Type-Options"];
      set.headers["Content-Type"] = "application/pdf";
      set.headers["Content-Disposition"] =
        'attachment; filename="student-session-reports.pdf"';
      return new Response(pdf, {
        headers: {
          ...privateHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition":
            'attachment; filename="student-session-reports.pdf"',
        },
      });
    },
    { body },
  );
}
