import { createContext } from "@cogito-app/api/context";
import { USER_ROLE } from "@cogito-app/api/shared/constants";
import { fetchProxyFile } from "../content-proxy";
import type { Elysia } from "elysia";

/**
 * /content/knowledge-bank/:resourceId/file — streams a published Sanity
 * asset server-side behind the role + wallet-threshold gate. Hardened proxy:
 * host allowlist (cdn.sanity.io / *.sanity.io), 10s timeout, 5MB cap
 * (content-length pre-check + streamed byte counter).
 */
export function registerContentRoutes(app: Elysia) {
  return app.get(
    "/content/knowledge-bank/:resourceId/file",
    async (routeContext) => {
      const { params, set } = routeContext;
      const context = await createContext({ context: routeContext });
      const sessionUser = context.session?.user as
        | { id: string; role?: string }
        | undefined;

      if (!sessionUser) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const isStudent = sessionUser.role === USER_ROLE.STUDENT;
      const isTutor = sessionUser.role === USER_ROLE.TUTOR;
      const isAdmin = sessionUser.role === USER_ROLE.ADMIN;
      if (!isStudent && !isTutor && !isAdmin) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      const access = await context.services.wallet.knowledgeBankEligible(
        sessionUser.id,
        sessionUser.role,
      );
      if (!access.eligible) {
        set.status = 403;
        return { error: "Knowledge Bank access requires 35 Marks" };
      }

      const file = await context.services.content.getStudentResourceFile(
        params.resourceId,
      );
      if (!file?.fileUrl) {
        set.status = 404;
        return { error: "Not found" };
      }

      const proxy = await fetchProxyFile(file.fileUrl);
      if (!proxy.ok) {
        set.status = proxy.reason;
        return { error: "Unable to retrieve resource" };
      }

      const filename =
        (file.fileName ?? "knowledge-bank-resource.pdf")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .replace(/\.{2,}/g, ".")
          .replace(/^\.+/, "")
          .slice(0, 120) || "knowledge-bank-resource.pdf";

      return new Response(proxy.body, {
        headers: {
          "Content-Type": file.mimeType ?? "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
    { parse: "none" },
  );
}
