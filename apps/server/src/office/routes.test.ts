import { expect, test } from "bun:test";
import { Elysia } from "elysia";
import { registerOfficeRoutes } from "./routes";
import { registerCors } from "../routes/middlewares";

test("actual Elysia Office route excludes browser CORS on denied requests and preflight", async () => {
  const app = new Elysia().use(registerOfficeRoutes).use(registerCors);
  for (const method of ["GET", "OPTIONS"]) {
    const response = await app.handle(
      new Request("http://localhost/office/snapshot", {
        method,
        headers: {
          origin: "http://localhost:3001",
          "access-control-request-method": "GET",
        },
      }),
    );
    expect(
      [...response.headers.keys()].filter((k) =>
        k.startsWith("access-control-"),
      ),
    ).toEqual([]);
  }
});
