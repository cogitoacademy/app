import { auth } from "@cogito-app/auth";
import type { Context as ElysiaContext } from "elysia";

import { services } from "./services";

export type CreateContextOptions = {
  context: ElysiaContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });
  return {
    session,
    services,
    headers: context.request.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
