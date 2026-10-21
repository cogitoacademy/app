import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

test.each([
  ["development database", "cogito-app", "6381"],
  ["unpaired Redis", "cogito-test", "6379"],
])(
  "signup rate-limit reset rejects %s before connecting",
  (_label, database, redisPort) => {
    const result = spawnSync(
      process.execPath,
      [path.join(import.meta.dir, "reset-e2e-signup-rate-limit.ts")],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: `postgresql://test:test@127.0.0.1:6769/${database}`,
          REDIS_URL: `redis://127.0.0.1:${redisPort}`,
        },
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Signup rate-limit reset requires the paired local test DB/Redis target",
    );
  },
);
