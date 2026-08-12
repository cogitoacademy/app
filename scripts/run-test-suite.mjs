import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile =
  process.env.ENV_FILE && existsSync(path.resolve(process.env.ENV_FILE))
    ? path.resolve(process.env.ENV_FILE)
    : [".env.test", ".env.test.example"]
        .map((name) => path.join(rootDir, "apps/server", name))
        .find((candidate) => existsSync(candidate)) ??
      path.join(rootDir, "apps/server/.env.test.example");
const dbDir = path.join(rootDir, "packages/db");
const e2eDir = path.join(rootDir, "packages/e2e");

const mode = process.argv[2] ?? "all";
const extraArgs = process.argv.slice(3);

function run(command, args, cwd = rootDir, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: "inherit",
      shell: false,
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ?? code ?? "unknown exit"}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

function hasExplicitTarget(args, cwd = rootDir) {
  return args.some(
    (arg) =>
      !arg.startsWith("-") &&
      existsSync(path.resolve(cwd, arg)),
  );
}

function withDefaultTarget(defaultTarget, args, cwd = rootDir) {
  return hasExplicitTarget(args, cwd) ? args : [defaultTarget, ...args];
}

async function prepareTestDatabase() {
  await run("node", ["ensure-test-database.mjs"], dbDir, {
    ENV_FILE: envFile,
  });
  await run(
    "bun",
    ["run", "db:migrate"],
    dbDir,
    {
      ENV_FILE: envFile,
    },
  );
}

async function main() {
  await prepareTestDatabase();

  switch (mode) {
    case "all":
      await run("bun", ["test", "--env-file", envFile, ...extraArgs], rootDir, {
        ENV_FILE: envFile,
      });
      return;
    case "api":
      await run(
        "bun",
        [
          "test",
          "--env-file",
          envFile,
          ...withDefaultTarget("packages/api/src/tests", extraArgs),
        ],
        rootDir,
        {
          ENV_FILE: envFile,
        },
      );
      return;
    case "coverage":
      await run(
        "bun",
        [
          "test",
          "--coverage",
          "--env-file",
          envFile,
          ...withDefaultTarget("packages/api/src/tests", extraArgs),
        ],
        rootDir,
        {
          ENV_FILE: envFile,
        },
      );
      return;
    case "e2e":
      await run(
        "bun",
        ["run", "--env-file", envFile, "test", ...extraArgs],
        e2eDir,
        {
          ENV_FILE: envFile,
        },
      );
      return;
    case "e2e:ui":
      await run(
        "bun",
        ["run", "--env-file", envFile, "test:ui", ...extraArgs],
        e2eDir,
        {
          ENV_FILE: envFile,
        },
      );
      return;
    default:
      throw new Error(`Unknown test mode '${mode}'.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
