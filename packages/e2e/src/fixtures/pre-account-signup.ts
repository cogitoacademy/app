import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { request } from "@playwright/test";

import { resolveE2eEnvironment } from "./e2e-environment";

export async function createPreAccountSignupFixture() {
  const environment = resolveE2eEnvironment(process.env);
  function resetAuthRateLimit() {
    execFileSync("bun", ["run", "src/seed/reset-e2e-signup-rate-limit.ts"], {
      cwd: path.resolve(process.cwd(), "../../apps/server"),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: environment.databaseUrl,
      },
      stdio: "pipe",
      timeout: 10_000,
    });
  }
  resetAuthRateLimit();
  const api = await request.newContext({
    baseURL: environment.serverUrl,
    extraHTTPHeaders: { Origin: environment.webUrl },
  });
  const apiWithoutOrigin = await request.newContext({
    baseURL: environment.serverUrl,
  });
  const email = `e2e.signup.${randomUUID()}@cogito.test`;

  return {
    api,
    apiWithoutOrigin,
    email,
    resetAuthRateLimit,
    async readOtp() {
      const response = await api.get(
        `/api/__test/auth/signup-otp?email=${encodeURIComponent(email)}`,
      );
      if (!response.ok()) {
        throw new Error(
          `Local signup OTP fixture returned ${response.status()}.`,
        );
      }
      const body = (await response.json()) as { otp?: unknown };
      if (typeof body.otp !== "string") {
        throw new Error("Local signup OTP fixture returned no code.");
      }
      return body.otp;
    },
    cleanup() {
      const serverDir = path.resolve(process.cwd(), "../../apps/server");
      const output = execFileSync(
        "bun",
        ["run", "src/seed/cleanup-e2e-signup.ts", email],
        {
          cwd: serverDir,
          env: {
            ...process.env,
            NODE_ENV: "test",
            DATABASE_URL: environment.databaseUrl,
          },
          encoding: "utf8",
        },
      );
      console.log(output.trim());
    },
  };
}
