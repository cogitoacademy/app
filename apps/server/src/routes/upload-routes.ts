import { env } from "@cogito-app/env/server";
import { auth } from "@cogito-app/auth";
import { MAX_UPLOAD_BYTES } from "@cogito-app/api/modules/upload/upload.types";
import {
  isValidUploadKey,
  readBodyWithLimit,
} from "@cogito-app/api/lib/request-id";
import type { Elysia } from "elysia";

/**
 * /uploads/* — local-mode upload sink (dev only, when R2 is not configured).
 * The browser uploads to this authenticated, size-bounded route instead of a
 * presigned URL. Requires a session so uploads cannot be abused (M9).
 */
export function registerUploadRoutes(app: Elysia) {
  return app
    .get("/uploads/*", async ({ params, set }) => {
      if (env.R2_PUBLIC_URL) {
        set.status = 404;
        return { error: "Not found" };
      }
      const key = (params["*"] as string) ?? "";
      if (!isValidUploadKey(key)) {
        set.status = 404;
        return { error: "Not found" };
      }
      const file = Bun.file(`${env.UPLOAD_DIR}/${key}`);
      if (!(await file.exists())) {
        set.status = 404;
        return { error: "Not found" };
      }
      return new Response(file);
    })
    .post(
      "/uploads/*",
      async ({ params, set, request }) => {
        if (env.R2_PUBLIC_URL) {
          set.status = 404;
          return { error: "Not found" };
        }
        const key = (params["*"] as string) ?? "";
        if (!isValidUploadKey(key)) {
          set.status = 404;
          return { error: "Not found" };
        }
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (!session?.user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        if (!key.startsWith(`${session.user.id}/`)) {
          set.status = 403;
          return { error: "Forbidden" };
        }
        const { body, tooLarge } = await readBodyWithLimit(
          request,
          MAX_UPLOAD_BYTES,
        );
        if (tooLarge) {
          set.status = 413;
          return { error: "Request body too large" };
        }
        const filePath = `${env.UPLOAD_DIR}/${key}`;
        await Bun.write(filePath, body);
        return { ok: true, key };
      },
      { parse: "none" },
    );
}
