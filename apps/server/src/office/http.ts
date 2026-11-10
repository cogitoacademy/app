import { createHash, timingSafeEqual } from "node:crypto";
import { officeActionNames } from "./openapi";

export function officeAuthorized(
  header: string | null,
  key: string | undefined,
): boolean {
  const expected = createHash("sha256")
    .update(key ?? "")
    .digest();
  const actual = createHash("sha256")
    .update(header?.startsWith("Bearer ") ? header.slice(7) : "")
    .digest();
  return (
    timingSafeEqual(expected, actual) &&
    !!key &&
    header?.startsWith("Bearer ") === true
  );
}

export interface OfficeHttpDependencies {
  readKey(): string | undefined;
  writeKey(): string | undefined;
  writesEnabled(): boolean;
  limit(kind: "read" | "write"): Promise<boolean>;
  snapshot(): Promise<unknown>;
  action(name: string, body: unknown): Promise<unknown>;
}

export function createOfficeHandler(deps: OfficeHttpDependencies) {
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const write = path.startsWith("/office/actions/");
    const json = (value: unknown, status = 200) =>
      Response.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    if (
      !officeAuthorized(
        request.headers.get("authorization"),
        write ? deps.writeKey() : deps.readKey(),
      )
    )
      return json(
        { ok: false, code: "UNAUTHORIZED", message: "Unauthorized" },
        401,
      );
    let allowed: boolean;
    try {
      allowed = await deps.limit(write ? "write" : "read");
    } catch {
      return json(
        {
          ok: false,
          code: "UNAVAILABLE",
          message: "Office rate limiter unavailable",
        },
        503,
      );
    }
    if (!allowed)
      return json(
        { ok: false, code: "RATE_LIMITED", message: "Hourly limit exceeded" },
        429,
      );
    if (write && !deps.writesEnabled())
      return json(
        {
          ok: false,
          code: "WRITES_DISABLED",
          message: "Office writes disabled",
        },
        403,
      );
    try {
      if (!write && path === "/office/snapshot" && request.method === "GET")
        return json(await deps.snapshot());
      if (write && request.method === "POST") {
        const name = decodeURIComponent(path.slice("/office/actions/".length));
        if (!officeActionNames.some((allowedName) => allowedName === name))
          return json(
            {
              ok: false,
              code: "ACTION_DENIED",
              message: "Office action is not allowed",
            },
            403,
          );
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        if (reader) {
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              length += value.byteLength;
              if (length > 1024 * 1024)
                return json(
                  {
                    ok: false,
                    code: "BODY_TOO_LARGE",
                    message: "Request body exceeds 1 MiB",
                  },
                  413,
                );
              chunks.push(value);
            }
          } finally {
            await reader.cancel();
          }
        }
        const body: unknown = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        );
        return json(await deps.action(name, body));
      }
      return json(
        { ok: false, code: "NOT_FOUND", message: "Unknown Office endpoint" },
        404,
      );
    } catch {
      return json(
        {
          ok: false,
          code: "INVALID_REQUEST",
          message: "Office request could not be processed",
        },
        400,
      );
    }
  };
}
