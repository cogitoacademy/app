import { createContext } from "@cogito-app/api/context";
import { appRouter } from "@cogito-app/api/routers";
import { readBodyWithLimit } from "@cogito-app/api/lib/request-id";
import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { log as appLog } from "@cogito-app/api/lib/logger";
import { generateRequestId } from "@cogito-app/api/lib/request-id";
import { identifyUser as identifyUserFromSession } from "evlog/better-auth";
import { useLogger } from "evlog/elysia";
import { MAX_BODY_BYTES, bodyLimitResponse, requestUserId } from "./middlewares";
import type { Elysia } from "elysia";

export function logRpcError(
  error: unknown,
  options?: {
    request: {
      url: URL;
      headers: Record<string, string | string[] | undefined>;
      method: string;
    };
  },
) {
  const headerRequestId = options?.request.headers["x-request-id"];
  const requestId =
    typeof headerRequestId === "string" ? headerRequestId : generateRequestId();
  const path = options?.request.url.pathname ?? "/rpc";
  const method = options?.request.method ?? "POST";
  const common = { requestId, path, method };
  if (error instanceof ORPCError) {
    appLog({
      level: "warn",
      action: "rpc_error",
      ...common,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  } else {
    appLog({
      level: "error",
      action: "rpc_error",
      ...common,
      error: {
        message: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...(error instanceof Error && error.cause
          ? { cause: String(error.cause) }
          : {}),
      },
    });
  }
}

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [onError(logRpcError)],
});

/**
 * /rpc* — the oRPC handler behind the bounded-body guard, with session
 * context and per-user identification for the consolidated log line.
 */
export function registerRpcRoutes(app: Elysia) {
  return app.all(
    "/rpc*",
    async (context) => {
      const { body, tooLarge } = await readBodyWithLimit(
        context.request,
        MAX_BODY_BYTES,
      );
      if (tooLarge) {
        return bodyLimitResponse();
      }
      const request = body
        ? new Request(context.request.url, {
            method: context.request.method,
            headers: context.request.headers,
            body,
          })
        : context.request;
      const ctx = await createContext({ context });
      if (ctx.session) {
        requestUserId.set(context.request, ctx.session.user.id);
        identifyUserFromSession(useLogger(), ctx.session, {
          maskEmail: true,
        });
      }
      const { response } = await rpcHandler.handle(request, {
        prefix: "/rpc",
        context: ctx,
      });
      return response ?? new Response("Not Found", { status: 404 });
    },
    { parse: "none" },
  );
}
