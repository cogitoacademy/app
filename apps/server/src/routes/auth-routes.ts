import {
  auth,
  assertPasswordPolicy,
  completePreAccountSignup,
  getPreAccountSignupOtpForTest,
  getPreAccountSignupOutcome,
  sendPreAccountSignupOtp,
} from "@cogito-app/auth";
import { isAllowedFrontendOrigin } from "@cogito-app/env/origins";
import { env } from "@cogito-app/env/server";
import { readBodyWithLimit } from "@cogito-app/api/lib/request-id";
import { normalizeRequestPath } from "../rate-limit-paths";
import { hasSignupEmailProof, parseSignupBody } from "../signup-body";
import { MAX_BODY_BYTES, bodyLimitResponse } from "./middlewares";
import type { Elysia } from "elysia";

const SIGNUP_PATH = "/api/auth/sign-up/email";
const SEND_SIGNUP_OTP_PATH = "/api/auth/sign-up/email-otp";
const SIGNUP_OUTCOME_PATH = "/api/auth/sign-up/email-outcome";
const TEST_SIGNUP_OTP_PATH = "/api/__test/auth/signup-otp";
const CUSTOM_SIGNUP_PATHS = new Set([
  SEND_SIGNUP_OTP_PATH,
  SIGNUP_OUTCOME_PATH,
  SIGNUP_PATH,
]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function jsonResponse(body: unknown, status = 200, retryAfterSeconds?: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(retryAfterSeconds === undefined
        ? {}
        : { "Retry-After": String(retryAfterSeconds) }),
    },
  });
}

function isLocalSignupOtpTestTarget() {
  try {
    const databaseUrl = new URL(env.DATABASE_URL);
    const hostname = databaseUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      ["postgres:", "postgresql:"].includes(databaseUrl.protocol) &&
      LOOPBACK_HOSTS.has(hostname) &&
      ["6767", "6768"].includes(databaseUrl.port) &&
      databaseUrl.pathname === "/cogito-test"
    );
  } catch {
    return false;
  }
}

function hasTrustedBrowserOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return false;
  if (
    origin &&
    !isAllowedFrontendOrigin(origin, env.CORS_ORIGIN, env.NODE_ENV)
  ) {
    return false;
  }
  if (referer) {
    try {
      if (
        !isAllowedFrontendOrigin(
          new URL(referer).origin,
          env.CORS_ORIGIN,
          env.NODE_ENV,
        )
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * /api/auth/* — better-auth's handler behind the bounded-body + password
 * policy guards. The server owns the body here (better-auth 1.6.11 has no
 * built-in complexity options or effective global-hook short-circuit), so the
 * sign-up route enforces the C6 password policy before delegating.
 */
export function registerAuthRoutes(app: Elysia) {
  const appWithTestOtpRoute =
    env.NODE_ENV === "test" && isLocalSignupOtpTestTarget()
      ? app.get(TEST_SIGNUP_OTP_PATH, ({ request, server }) => {
          const peerAddress = server?.requestIP(request)?.address;
          if (
            !peerAddress ||
            !LOOPBACK_ADDRESSES.has(peerAddress.toLowerCase())
          ) {
            return jsonResponse({ message: "Not found" }, 404);
          }
          const url = new URL(request.url);
          const requestHostname = url.hostname
            .toLowerCase()
            .replace(/^\[|\]$/g, "");
          if (!LOOPBACK_HOSTS.has(requestHostname)) {
            return jsonResponse({ message: "Not found" }, 404);
          }
          const email = url.searchParams.get("email") ?? "";
          const otp = getPreAccountSignupOtpForTest(email);
          return otp
            ? jsonResponse({ otp })
            : jsonResponse({ message: "No test code is available." }, 404);
        })
      : app;

  return appWithTestOtpRoute.all(
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
      let path: string;
      try {
        path = normalizeRequestPath(new URL(request.url).pathname);
      } catch {
        return jsonResponse({ message: "Invalid request path." }, 400);
      }
      if (CUSTOM_SIGNUP_PATHS.has(path) && !hasTrustedBrowserOrigin(request)) {
        return jsonResponse({ message: "Invalid request origin." }, 403);
      }

      if (path === SEND_SIGNUP_OTP_PATH) {
        const parsed = parseSignupBody(body);
        if (!parsed?.email || !parsed.signupAttemptId) {
          return jsonResponse(
            { message: "Enter a valid email address to request a code." },
            400,
          );
        }
        const result = await sendPreAccountSignupOtp({
          email: parsed.email,
          signupAttemptId: parsed.signupAttemptId,
        });
        if (!result.ok) {
          return jsonResponse(
            {
              message: result.error,
              ...(result.retryAfterSeconds === undefined
                ? {}
                : { retryAfterSeconds: result.retryAfterSeconds }),
              ...(result.signupAttemptId
                ? { signupAttemptId: result.signupAttemptId }
                : {}),
            },
            result.status,
            result.retryAfterSeconds,
          );
        }
        return jsonResponse(result);
      }

      if (path === SIGNUP_OUTCOME_PATH) {
        const parsed = parseSignupBody(body);
        const created =
          parsed?.email && parsed.signupAttemptId
            ? await getPreAccountSignupOutcome({
                email: parsed.email,
                signupAttemptId: parsed.signupAttemptId,
              })
            : false;
        return jsonResponse({ created });
      }

      // C6: enforce the password complexity policy at sign-up.
      if (path === SIGNUP_PATH) {
        const parsed = parseSignupBody(body);
        if (!parsed) {
          return status(400, { message: "Invalid JSON request body" });
        }
        const policyError = assertPasswordPolicy(parsed.password ?? "");
        if (policyError) {
          return status(400, { message: policyError });
        }
        if (!hasSignupEmailProof(parsed)) {
          return jsonResponse(
            { message: "Verify your email before creating an account." },
            400,
          );
        }
        const result = await completePreAccountSignup({
          email: parsed.email,
          password: parsed.password ?? "",
          name: parsed.name,
          otp: parsed.otp,
          signupAttemptId: parsed.signupAttemptId,
          headers: request.headers,
        });
        return result.ok
          ? result.response
          : jsonResponse({ message: result.error }, result.status);
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
