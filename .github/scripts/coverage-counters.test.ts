import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const preload = resolve(import.meta.dir, "coverage-instrument.ts");
const reporter = resolve(import.meta.dir, "coverage-report.ts");
const gate = resolve(import.meta.dir, "coverage-comment.ts");
const runner = resolve(import.meta.dir, "coverage-runner.ts");
const source = `type Input = { value: boolean };
export function handlers() {
  return {
    first: ({value}: {
      value: boolean;
    }) => { function sameName() { return value ? "yes" : "no"; } return sameName(); },
    second: ({value}: {
      value: boolean;
    }) => { function sameName() { return value ? "yes" : "no"; } return sameName(); },
  };
}
export function cleanup() { return "done"; }
`;
async function workspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "counter-coverage-"));
  try {
    await Promise.all(
      ["api", "auth", "db", "env"].map((name) =>
        mkdir(join(root, "packages", name, "src"), { recursive: true }),
      ),
    );
    await writeFile(join(root, "packages/api/src/handler.ts"), source);
    await writeFile(
      join(root, "partition.test.ts"),
      `
      import { test, expect, afterAll } from "bun:test";
      import { handlers, cleanup } from "./packages/api/src/handler.ts?fresh";
      afterAll(() => cleanup());
      test("selected partition", () => {
        const method = process.env.METHOD === "second" ? "second" : "first";
        expect(handlers()[method]({value:true})).toBe("yes");
        expect(handlers()[method]({value:false})).toBe("no");
      });
    `,
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function execute(
  root: string,
  args: string[],
  env: Record<string, string> = {},
) {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, output: stdout + stderr };
}
async function collect(root: string, method: string) {
  const result = await execute(
    root,
    ["test", "--preload", preload, "./partition.test.ts"],
    {
      COUNTER_COVERAGE_FILE: `${method}.json`,
      METHOD: method,
    },
  );
  expect(result.output).toContain("1 pass");
  expect(result.code).toBe(0);
}
async function enforce(root: string) {
  return execute(root, [gate], {
    LCOV_FILE: "coverage/lcov.merged.info",
    LCOV_FUNCTION_IDENTITY_MANIFEST: "coverage/lcov.function-identity.json",
    COVERAGE_API_THRESHOLD: "100",
    COVERAGE_OVERALL_THRESHOLD: "100",
    COVERAGE_FUNCTIONS_THRESHOLD: "100",
    COVERAGE_BRANCHES_THRESHOLD: "100",
    GITHUB_TOKEN: "",
    PR_NUMBER: "",
    GITHUB_REPOSITORY: "",
  });
}

test(
  "complementary partitions preserve typed spans, nested identities and real branch coverage",
  () =>
    workspace(async (root) => {
      await collect(root, "first");
      await collect(root, "second");
      const report = await execute(root, [
        reporter,
        "first.json",
        "second.json",
      ]);
      expect(report.output).toContain("Functions    : 100%");
      expect(report.output).toContain("Branches     : 100%");
      expect(report.code).toBe(0);
      const lcov = await readFile(
        join(root, "coverage/lcov.merged.info"),
        "utf8",
      );
      expect(lcov).toContain("BRF:4");
      expect(lcov).toContain("BRH:4");
      expect(lcov.match(/^FN:.*sameName@/gm)).toHaveLength(2);
      const result = await enforce(root);
      expect(result.output).toContain("Coverage gate passed");
      expect(result.code).toBe(0);
    }),
  30_000,
);

test(
  "unloaded modules and missing partitions remain uncovered and fail the unchanged gate",
  () =>
    workspace(async (root) => {
      await writeFile(
        join(root, "packages/api/src/unloaded.ts"),
        "export function unused() { return 42; }\n",
      );
      await collect(root, "first");
      const report = await execute(root, [reporter, "first.json"]);
      expect(report).toMatchObject({ code: 0 });
      const result = await enforce(root);
      expect(result.code).toBe(1);
      expect(result.output).toContain("Coverage gate FAILED");
      expect(result.output).toContain("unloaded.ts");
    }),
  30_000,
);

test(
  "missing, stale, incomplete and negative-counter profiles cannot reuse a previous report",
  () =>
    workspace(async (root) => {
      await collect(root, "first");
      const valid = JSON.parse(
        await readFile(join(root, "first.json"), "utf8"),
      );
      const path = Object.keys(valid.coverage)[0]!;
      const stale = structuredClone(valid);
      stale.hashes[path] = "0".repeat(64);
      const incomplete = structuredClone(valid);
      delete incomplete.coverage[path];
      const negative = structuredClone(valid);
      negative.coverage[path].s["0"] = -1;
      const missingCounter = structuredClone(valid);
      delete missingCounter.coverage[path].f["0"];
      await mkdir(join(root, "coverage"), { recursive: true });
      async function reject(profile: unknown) {
        await Promise.all([
          writeFile(join(root, "bad.json"), JSON.stringify(profile)),
          writeFile(join(root, "coverage/lcov.merged.info"), "stale success"),
        ]);
        expect((await execute(root, [reporter, "bad.json"])).code).toBe(1);
        expect(
          await Bun.file(join(root, "coverage/lcov.merged.info")).exists(),
        ).toBe(false);
      }
      for (const profile of [{}, stale, incomplete, negative, missingCounter]) {
        // eslint-disable-next-line no-await-in-loop -- Each case overwrites the same report paths.
        await reject(profile);
      }
      expect((await execute(root, [reporter, "absent.json"])).code).toBe(1);
    }),
  30_000,
);

test(
  "coverage runner refuses development targets before launching any resettable suite",
  () =>
    workspace(async (root) => {
      const result = await execute(root, [runner], {
        NODE_ENV: "test",
        DATABASE_URL:
          "postgresql://postgres:synthetic@localhost:6767/cogito-app",
        PAYOUT_DATABASE_URL:
          "postgresql://postgres:synthetic@localhost:6770/cogito-test-payout",
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain("exact test target");
      expect(
        await Bun.file(
          join(root, "coverage/api-resettable/counters.json"),
        ).exists(),
      ).toBe(false);
    }),
  30_000,
);

test(
  "coverage runner requires a deliberate reset window and refuses ambient reset overrides",
  () =>
    workspace(async (root) => {
      const targets = {
        NODE_ENV: "test",
        DATABASE_URL:
          "postgresql://postgres:synthetic@localhost:6769/cogito-test",
        PAYOUT_DATABASE_URL:
          "postgresql://postgres:synthetic@localhost:6770/cogito-test-payout",
        COVERAGE_DB_RESET_WINDOW: "",
      };
      const missingWindow = await execute(root, [runner], targets);
      expect(missingWindow.code).toBe(1);
      expect(missingWindow.output).toContain(
        "requires COVERAGE_DB_RESET_WINDOW=confirmed",
      );
      const ambient = await execute(root, [runner], {
        ...targets,
        COVERAGE_DB_RESET_WINDOW: "confirmed",
        TEST_DATABASE_ALLOW_RESET: "true",
      });
      expect(ambient.code).toBe(1);
      expect(ambient.output).toContain("unset ambient reset flags");
      expect(
        await Bun.file(
          join(root, "coverage/api-resettable/counters.json"),
        ).exists(),
      ).toBe(false);
    }),
  30_000,
);

test(
  "malformed reset targets never print embedded credentials",
  () =>
    workspace(async (root) => {
      const result = await execute(root, [runner], {
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://user:do-not-log@[",
        PAYOUT_DATABASE_URL:
          "postgresql://postgres:synthetic@localhost:6770/cogito-test-payout",
        COVERAGE_DB_RESET_WINDOW: "confirmed",
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain("exact test target");
      expect(result.output).not.toContain("do-not-log");
    }),
  30_000,
);
