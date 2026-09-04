import { auth, assertPasswordPolicy } from "@cogito-app/auth";
import { readBodyWithLimit } from "@cogito-app/api/lib/request-id";
import { parseSignupBody } from "../signup-body";
import { MAX_BODY_BYTES, bodyLimitResponse } from "./middlewares";
import type { Elysia } from "elysia";

/**
 * /api/auth/* — better-auth's handler behind the bounded-body + password
 * policy guards. The server owns the body here (better-auth 1.6.11 has no
 * built-in complexity options or effective global-hook short-circuit), so the
 * sign-up route enforces the C6 password policy before delegating.
 */
export function registerAuthRoutes(app: Elysia) {
  return app.all(
    "/api/auth/*",
    async (context) => {
      const { request, status } = context;
      if (!["POST", "GET"].includes(request.method)) {
        return status(405);
      }
      if (request.method === "GET") {
        return auth.handler(request);
      }
      const { body, tooLarge } = await readBodyWithLimit(
        request,
        MAX_BODY_BYTES,
      );
      if (tooLarge) {
        return bodyLimitResponse();
      }
      // C6: enforce the password complexity policy at sign-up.
      if (request.url.endsWith("/api/auth/sign-up/email")) {
        const parsed = parseSignupBody(body);
        if (!parsed) {
          return status(400, { message: "Invalid JSON request body" });
        }
        const policyError = assertPasswordPolicy(parsed.password ?? "");
        if (policyError) {
          return status(400, { message: policyError });
        }
      }
      const bounded = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body,
      });
      return auth.handler(bounded);
    },
    { parse: "none" },
  );
}
