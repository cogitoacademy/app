import { createContext } from "@cogito-app/api/context";
import { appRouter } from "@cogito-app/api/routers/index";
import { auth } from "@cogito-app/auth";
import { env } from "@cogito-app/env/server";
import { cors } from "@elysiajs/cors";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import {
  createAuthMiddleware,
  type BetterAuthInstance,
} from "evlog/better-auth";
import { evlog } from "evlog/elysia";
import { enrichOpenAPISpec, openApiTags, scalarHtml } from "./openapi";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

async function generateOpenAPISpec(request: Request) {
  const url = new URL(request.url);
  const spec = await openAPIGenerator.generate(appRouter, {
    info: {
      title: "Cogito API",
      version: "1.0.0",
    },
    servers: [{ url: `${url.protocol}//${url.host}/api-reference` }],
    tags: openApiTags,
  });

  return enrichOpenAPISpec(spec);
}

const apiHandler = new OpenAPIHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

initLogger({
  env: { service: "cogito-app-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

new Elysia()
  .use(evlog())
  .derive(async ({ request, log }) => {
    await identifyUser(log, request.headers, new URL(request.url).pathname);
    return {};
  })
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
  .all("/api/auth/*", async (context) => {
    const { request, status } = context;
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    return status(405);
  })
  .all(
    "/rpc*",
    async (context) => {
      const { response } = await rpcHandler.handle(context.request, {
        prefix: "/rpc",
        context: await createContext({ context }),
      });
      return response ?? new Response("Not Found", { status: 404 });
    },
    {
      parse: "none",
    },
  )
  .get("/openapi.json", async ({ request }) => {
    return Response.json(await generateOpenAPISpec(request));
  })
  .get("/api-reference", () => {
    return new Response(scalarHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })
  .all(
    "/api-reference*",
    async (context) => {
      const { response } = await apiHandler.handle(context.request, {
        prefix: "/api-reference",
        context: await createContext({ context }),
      });
      return response ?? new Response("Not Found", { status: 404 });
    },
    {
      parse: "none",
    },
  )
  .get("/", () => "OK")
  .listen(3001, () => {
    console.log("Server is running on http://localhost:3001");
  });
