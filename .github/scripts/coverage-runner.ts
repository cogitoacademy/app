import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  discoverResettableTests,
  isolatedIntegrationPartitions,
  parseCoverageArguments,
  selectCoveragePartitions,
} from "./coverage-partitions";

function assertTarget(
  value: string | undefined,
  port: string,
  database: string,
) {
  const message = `Coverage requires exact test target loopback ${port}/${database}`;
  let target: URL;
  try {
    target = new URL(value ?? "");
  } catch {
    throw new Error(message);
  }
  if (
    process.env.NODE_ENV !== "test" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.port !== port ||
    target.pathname !== `/${database}` ||
    target.search ||
    target.hash
  )
    throw new Error(message);
}
async function main() {
  const options = parseCoverageArguments(process.argv.slice(2));
  if (!options.list) {
    assertTarget(process.env.DATABASE_URL, "6769", "cogito-test");
    assertTarget(process.env.PAYOUT_DATABASE_URL, "6770", "cogito-test-payout");
    if (process.env.COVERAGE_DB_RESET_WINDOW !== "confirmed")
      throw new Error(
        "Coverage resets both isolated test databases; requires COVERAGE_DB_RESET_WINDOW=confirmed",
      );
    if (
      process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
      process.env.TEST_DATABASE_RESET_TARGET !== undefined
    )
      throw new Error(
        "Coverage owns reset overrides; unset ambient reset flags",
      );
  }
  const fixtures = [
    "booking-admin-reports",
    "class-enrollment",
    "report-export",
    "booking.report-reminders",
    "referral-completion",
    "referral-kol-commission",
    "kb-calendar",
    "academy-class-absence",
  ].map((name) => `./packages/api/src/tests/integration/${name}.test.ts`);
  const payout =
    "./packages/api/src/tests/integration/booking-payout-g16.test.ts";
  const guardedAcceptance = [
    "class-payout-lifecycle",
    "admin-operations-analytics",
  ].map((name) => `./packages/api/src/tests/integration/${name}.test.ts`);
  const resettableIntegrationFiles = discoverResettableTests(
    "packages/api/src/tests",
    [payout],
  );
  const partitions = [
    {
      name: "api-resettable",
      arguments: [...fixtures, payout, ...guardedAcceptance]
        .concat(resettableIntegrationFiles)
        .flatMap((path) => ["--path-ignore-patterns", `**/${path.slice(2)}`])
        .concat([
          "./packages/api/src/tests/",
          "./packages/env/src/",
          "./packages/auth/src/",
          "./packages/db/src/",
          "./apps/server/src/openapi.test.ts",
        ]),
      env: {
        TEST_DATABASE_ALLOW_RESET: "true",
        TEST_DATABASE_RESET_TARGET: process.env.DATABASE_URL,
      },
    },
    ...isolatedIntegrationPartitions(
      resettableIntegrationFiles,
      process.env.DATABASE_URL!,
    ),
    {
      name: "api-fixtures",
      arguments: fixtures,
      env: { KB_DB_TEST_WINDOW: "confirmed" },
    },
    {
      name: "api-payout",
      arguments: [payout],
      env: {
        DATABASE_URL: process.env.PAYOUT_DATABASE_URL,
        TEST_DATABASE_ALLOW_RESET: "true",
        TEST_DATABASE_RESET_TARGET: process.env.PAYOUT_DATABASE_URL,
      },
    },
  ];
  if (options.list) {
    for (const partition of partitions)
      console.log(
        `${partition.name}: ${partition.arguments.filter((argument) => argument.startsWith("./")).join(" ")}`,
      );
    return;
  }
  const selected = selectCoveragePartitions(partitions, options.groups);
  const profiles = selected.map(({ name }) =>
    resolve("coverage", name, "counters.json"),
  );
  for (const profile of profiles) {
    mkdirSync(resolve(profile, ".."), { recursive: true });
    rmSync(profile, { force: true });
  }
  const failures: string[] = [];
  for (const [index, partition] of selected.entries()) {
    console.log(`Collecting ${partition.name}`);
    const child = Bun.spawn(
      [
        process.execPath,
        "test",
        "--preload",
        resolve(import.meta.dir, "coverage-instrument.ts"),
        "--timeout",
        "30000",
        ...partition.arguments,
      ],
      {
        env: {
          ...process.env,
          ...partition.env,
          COUNTER_COVERAGE_FILE: profiles[index],
        },
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    // eslint-disable-next-line no-await-in-loop -- Partitions share resettable database fixtures.
    const code = await child.exited;
    console.log(
      `${code === 0 ? "PASS" : "FAIL"} ${partition.name} (exit ${code})`,
    );
    if (code !== 0) failures.push(partition.name);
  }
  if (options.groups.length) {
    console.log(
      "Partial coverage only; full merged report and 100% gate require all groups.",
    );
    if (failures.length)
      throw new Error(`Coverage collection failed: ${failures.join(", ")}`);
    return;
  }
  const report = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "coverage-report.ts"),
      ...profiles,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await report.exited) !== 0) failures.push("report");
  if (failures.length)
    throw new Error(`Coverage collection failed: ${failures.join(", ")}`);
  if (!options.collectOnly) {
    const gate = Bun.spawn(
      [process.execPath, resolve(import.meta.dir, "coverage-comment.ts")],
      {
        env: {
          ...process.env,
          PR_NUMBER: "",
          GITHUB_TOKEN: "",
          LCOV_FILE: "coverage/lcov.merged.info",
          LCOV_FUNCTION_IDENTITY_MANIFEST:
            "coverage/lcov.function-identity.json",
          COVERAGE_API_THRESHOLD: "100",
          COVERAGE_OVERALL_THRESHOLD: "100",
          COVERAGE_FUNCTIONS_THRESHOLD: "100",
          COVERAGE_BRANCHES_THRESHOLD: "100",
        },
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    if ((await gate.exited) !== 0) throw new Error("Coverage gate failed");
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
