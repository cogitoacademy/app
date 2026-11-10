import { createOfficeHandler } from "./http";
import { getRedisClient } from "@cogito-app/api/lib/redis";
import type { Elysia } from "elysia";

// Separate child app keeps browser CORS middleware away from server-to-server routes.
export function registerOfficeRoutes(app: Elysia) {
  const handler = createOfficeHandler({
    readKey: () => process.env.OFFICE_READ_KEY,
    writeKey: () => process.env.OFFICE_WRITE_KEY,
    writesEnabled: () => process.env.OFFICE_WRITES_ENABLED === "true",
    limit: async (kind) => {
      const redis = getRedisClient();
      const count = await redis.eval(
        `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 3600) end; return n`,
        [`cogito:office:limit:${kind}`],
        [],
      );
      return Number(count) <= (kind === "read" ? 120 : 60);
    },
    snapshot: async () => {
      const redis = getRedisClient();
      const cached = await redis.get("cogito:office:snapshot:v1");
      if (cached) return JSON.parse(cached);
      const { getOfficeSnapshot } =
        await import("@cogito-app/api/modules/office/office-snapshot");
      const result = await getOfficeSnapshot();
      await redis.set("cogito:office:snapshot:v1", JSON.stringify(result), {
        type: "EX",
        value: 120,
      });
      return result;
    },
    action: async (name, body) => {
      const { executeOfficeAction } =
        await import("@cogito-app/api/modules/office/office-actions");
      return executeOfficeAction(name, body);
    },
  });
  return app.onRequest(({ request, set }) => {
    if (!new URL(request.url).pathname.startsWith("/office/")) return;
    for (const key of Object.keys(set.headers)) {
      if (key.toLowerCase().startsWith("access-control-"))
        delete set.headers[key];
    }
    return handler(request);
  });
}
