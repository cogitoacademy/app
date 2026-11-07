/* eslint-disable no-await-in-loop -- These small policy cases are deliberately checked in sequence. */
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fingerprintTree, findSuccessfulRun } from "./coverage-reuse.mjs";

const entry = (path, hash = "abc", mode = "100644") =>
  `${mode} blob ${hash}\t${path}\0`;
const backend = entry("packages/api/src/service.ts");

test("required workflow gate accepts fresh/reused/docs results and rejects failures", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  const gate = workflow
    .slice(workflow.lastIndexOf("        run: |\n") + "        run: |\n".length)
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
  const directory = mkdtempSync(join(tmpdir(), "coverage-gate-"));
  const shell =
    process.platform === "win32"
      ? join(process.env.ProgramFiles, "Git/bin/bash.exe")
      : "bash";
  try {
    for (const [patch, expected] of [
      [{}, 0],
      [{ REUSED: "true", SOURCE_RUN: "42", BACKEND_RESULT: "skipped" }, 0],
      [{ CODE_CHANGED: "false", BACKEND_RESULT: "skipped" }, 0],
      [{ DETECT_RESULT: "failure" }, 1],
      [{ DETECT_RESULT: "cancelled" }, 1],
      [{ BACKEND_RESULT: "failure" }, 1],
      [{ BACKEND_RESULT: "cancelled" }, 1],
      [{ BACKEND_RESULT: "skipped" }, 1],
      [{ REUSED: "true", BACKEND_RESULT: "skipped", SOURCE_RUN: "" }, 1],
      [
        {
          CODE_CHANGED: "false",
          EVENT_NAME: "workflow_dispatch",
          BACKEND_RESULT: "skipped",
        },
        1,
      ],
    ]) {
      const result = spawnSync(
        shell,
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", gate],
        {
          env: {
            ...process.env,
            CODE_CHANGED: "true",
            EVENT_NAME: "pull_request",
            DETECT_RESULT: "success",
            BACKEND_RESULT: "success",
            REUSED: "false",
            SOURCE_RUN: "",
            GITHUB_STEP_SUMMARY: join(directory, "summary.md").replaceAll(
              "\\",
              "/",
            ),
            ...patch,
          },
          encoding: "utf8",
        },
      );
      assert.equal(
        result.status,
        expected,
        JSON.stringify(patch) + result.stderr,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI forces manual runs and falls back to fresh coverage on API errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coverage-reuse-"));
  const eventPath = join(directory, "event.json");
  const outputPath = join(directory, "output.txt");
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(403).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: { number: 354, head: { repo: { id: 12 } } },
      }),
    );
    const env = {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
      GITHUB_REPOSITORY: "cogitoacademy/app",
      GITHUB_TOKEN: "test-token",
    };
    const execute = promisify(execFile);
    await execute(process.execPath, [".github/scripts/coverage-reuse.mjs"], {
      env: { ...env, GITHUB_EVENT_NAME: "workflow_dispatch" },
    });
    assert.equal(requests, 0);
    assert.match(
      readFileSync(outputPath, "utf8"),
      /reused=false\nsource_run=\n/,
    );
    writeFileSync(outputPath, "");
    const result = await execute(
      process.execPath,
      [".github/scripts/coverage-reuse.mjs"],
      {
        env: { ...env, GITHUB_EVENT_NAME: "pull_request" },
      },
    );
    assert.equal(requests, 1);
    assert.match(result.stdout, /running full suite: Actions API returned 403/);
    assert.match(
      readFileSync(outputPath, "utf8"),
      /reused=false\nsource_run=\n/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("frontend edits/additions/deletions preserve the merged-tree fingerprint", () => {
  const original = fingerprintTree(backend);
  for (const path of [
    "apps/web/src/page.tsx",
    "apps/web/public/logo.svg",
    "packages/ui/components/selia/button.tsx",
    "packages/ui/src/styles/globals.css",
    "docs/RUNBOOK.md",
  ]) {
    assert.equal(fingerprintTree(backend + entry(path)), original);
    assert.equal(fingerprintTree(entry(path, "changed") + backend), original);
  }
});

test("backend, fixtures, manifests, tooling and unknown paths invalidate reuse", () => {
  for (const path of [
    "packages/api/src/service.ts",
    "apps/server/src/seed.ts",
    "packages/db/src/migrations/001.sql",
    "packages/auth/src/auth.ts",
    "packages/env/src/server.ts",
    "apps/web/package.json",
    "packages/ui/package.json",
    "bun.lock",
    "bunfig.toml",
    ".github/workflows/ci.yml",
    ".github/scripts/coverage-runner.ts",
    "scripts/new-fixture.json",
  ]) {
    assert.notEqual(
      fingerprintTree(backend + entry(path)),
      fingerprintTree(backend + entry(path, "changed")),
    );
    assert.notEqual(
      fingerprintTree(backend),
      fingerprintTree(backend + entry(path)),
    );
  }
  assert.notEqual(
    fingerprintTree(backend),
    fingerprintTree(entry("packages/api/src/service.ts", "abc", "100755")),
  );
  assert.throws(() => fingerprintTree(""));
});

const name = "coverage-success-pr-354-fingerprint";
const context = { name, pr: 354, headRepoId: 12, runId: "99" };
const artifact = {
  name,
  expired: false,
  workflow_run: { id: 42, head_repository_id: 12 },
};
const run = {
  id: 42,
  status: "completed",
  conclusion: "success",
  event: "pull_request",
  path: ".github/workflows/ci.yml",
  head_repository: { id: 12 },
  pull_requests: [{ number: 354 }],
};
const job = {
  name: "Backend tests + coverage",
  status: "completed",
  conclusion: "success",
};
const apiFor =
  (candidate = artifact, result = run, jobs = [job]) =>
  async (path) => {
    if (path.startsWith("/actions/artifacts?"))
      return { artifacts: [candidate] };
    if (path.endsWith("/jobs?per_page=100")) return { jobs };
    return result;
  };

test("reuse requires a successful producer job and completed successful CI for this PR", async () => {
  assert.equal(await findSuccessfulRun(apiFor(), context), 42);
  for (const patch of [
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { status: "in_progress" },
    { event: "workflow_dispatch" },
    { path: ".github/workflows/other.yml" },
    { pull_requests: [] },
    { pull_requests: [{ number: 355 }] },
    { head_repository: { id: 13 } },
  ]) {
    assert.equal(
      await findSuccessfulRun(apiFor(artifact, { ...run, ...patch }), context),
      null,
    );
  }
  for (const jobs of [
    [],
    [{ ...job, conclusion: "skipped" }],
    [{ ...job, conclusion: "failure" }],
  ])
    assert.equal(
      await findSuccessfulRun(apiFor(artifact, run, jobs), context),
      null,
    );
});

test("expired, foreign, current-run and missing artifacts cannot authorize reuse", async () => {
  for (const patch of [
    { expired: true },
    { name: "other-fingerprint" },
    { workflow_run: null },
    { workflow_run: { id: 99, head_repository_id: 12 } },
    { workflow_run: { id: 42, head_repository_id: 13 } },
  ])
    assert.equal(
      await findSuccessfulRun(apiFor({ ...artifact, ...patch }), context),
      null,
    );
  assert.equal(
    await findSuccessfulRun(async () => ({ artifacts: [] }), context),
    null,
  );
  await assert.rejects(
    findSuccessfulRun(async () => {
      throw new Error("API unavailable");
    }, context),
  );
});
