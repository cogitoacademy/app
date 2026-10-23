import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const scriptPath = resolve(import.meta.dir, "merge-lcov.ts");
const coverageCommentPath = resolve(import.meta.dir, "coverage-comment.ts");

async function withWorkspace(run: (workspace: string) => Promise<void>) {
  const workspace = await mkdtemp(join(tmpdir(), "merge-lcov-"));
  try {
    await mkdir(join(workspace, "coverage"));
    await run(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function runMerger(workspace: string, inputs: string[]) {
  const child = Bun.spawn([process.execPath, scriptPath, ...inputs], {
    cwd: workspace,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function runCoverageGate(workspace: string) {
  const child = Bun.spawn([process.execPath, coverageCommentPath], {
    cwd: workspace,
    env: {
      ...process.env,
      LCOV_FILE: "coverage/lcov.merged.info",
      LCOV_FUNCTION_IDENTITY_MANIFEST: "coverage/lcov.function-identity.json",
      COVERAGE_API_THRESHOLD: "100",
      COVERAGE_OVERALL_THRESHOLD: "100",
      COVERAGE_FUNCTIONS_THRESHOLD: "100",
      COVERAGE_BRANCHES_THRESHOLD: "100",
      PR_NUMBER: "",
      GITHUB_TOKEN: "",
      GITHUB_REPOSITORY: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

test("merges line, function, and branch unions using maximum hits", async () => {
  await withWorkspace(async (workspace) => {
    const rawProfilePath = join(workspace, "coverage/lcov.info");
    await writeFile(rawProfilePath, "raw profile remains intact\n");
    const source = resolve(workspace, "src/file.ts");
    const first = join(workspace, "first.info");
    const second = join(workspace, "second.info");
    await writeFile(
      first,
      [
        `SF:${source}`,
        "FN:10,alpha",
        "FNDA:1,alpha",
        "FNF:1",
        "FNH:1",
        "DA:10,1",
        "DA:11,0",
        "LF:2",
        "LH:1",
        "BRDA:10,0,0,1",
        "BRF:1",
        "BRH:1",
        "end_of_record",
      ].join("\n"),
    );
    await writeFile(
      second,
      [
        `SF:${source}`,
        "FN:10,alpha",
        "FN:20,beta",
        "FNDA:3,alpha",
        "FNDA:1,beta",
        "FNF:2",
        "FNH:2",
        "DA:10,2",
        "DA:12,1",
        "LF:2",
        "LH:2",
        "BRDA:10,0,0,2",
        "BRDA:20,0,1,0",
        "BRF:2",
        "BRH:1",
        "end_of_record",
      ].join("\n"),
    );

    const result = await runMerger(workspace, [first, second]);
    expect(result.exitCode).toBe(0);

    const output = await readFile(
      join(workspace, "coverage/lcov.merged.info"),
      "utf8",
    );
    expect(await readFile(rawProfilePath, "utf8")).toBe(
      "raw profile remains intact\n",
    );
    expect(output).toContain(
      "FN:10,alpha\nFNDA:3,alpha\nFN:20,beta\nFNDA:1,beta",
    );
    expect(output).toContain("FNF:2\nFNH:2");
    expect(output).toContain("DA:10,2\nDA:11,0\nDA:12,1\nLF:3\nLH:2");
    expect(output).toContain("BRDA:10,0,0,2\nBRDA:20,0,1,0\nBRF:2\nBRH:1");
    expect(
      JSON.parse(
        await readFile(
          join(workspace, "coverage/lcov.function-identity.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      version: 1,
      identityIncompleteSources: [],
      unresolvedUncoveredSources: [],
    });
  });
});

test("uses the maximum summary counts and blocks an uncovered summary-only union", async () => {
  await withWorkspace(async (workspace) => {
    const source = resolve(workspace, "packages/api/src/opaque.ts");
    const firstProfile = join(workspace, "first.info");
    const secondProfile = join(workspace, "second.info");
    const firstRaw = [
      `SF:${source}`,
      "FNF:2",
      "FNH:1",
      "DA:10,1",
      "LF:1",
      "LH:1",
      "BRF:0",
      "BRH:0",
      "end_of_record",
    ].join("\n");
    await writeFile(firstProfile, firstRaw);
    await writeFile(
      secondProfile,
      [
        `SF:${source}`,
        "FNF:2",
        "FNH:1",
        "DA:10,1",
        "LF:1",
        "LH:1",
        "BRF:0",
        "BRH:0",
        "end_of_record",
      ].join("\n"),
    );

    const result = await runMerger(workspace, [firstProfile, secondProfile]);
    expect(result.exitCode).toBe(0);
    expect(await readFile(firstProfile, "utf8")).toBe(firstRaw);

    const output = await readFile(
      join(workspace, "coverage/lcov.merged.info"),
      "utf8",
    );
    expect(output).toContain("FNF:2\nFNH:1");
    expect(output).not.toContain("FN:");
    const manifest = JSON.parse(
      await readFile(
        join(workspace, "coverage/lcov.function-identity.json"),
        "utf8",
      ),
    );
    expect(manifest).toEqual({
      version: 1,
      identityIncompleteSources: [source],
      unresolvedUncoveredSources: [source],
    });

    const gate = await runCoverageGate(workspace);
    expect(gate.exitCode).toBe(1);
    expect(gate.stdout).toContain("function union is unverified");
    expect(gate.stdout).toContain("lower-bound counts ≥1/≥2");
  });
});

test("reconciles a summary-only profile with a complete named profile", async () => {
  await withWorkspace(async (workspace) => {
    const source = resolve(workspace, "packages/api/src/reconciled.ts");
    const namedProfile = join(workspace, "named.info");
    const summaryProfile = join(workspace, "summary.info");
    await writeFile(
      namedProfile,
      [
        `SF:${source}`,
        "FN:10,alpha",
        "FN:20,beta",
        "FNDA:1,alpha",
        "FNDA:2,beta",
        "FNF:2",
        "FNH:2",
        "DA:10,1",
        "LF:1",
        "LH:1",
        "BRF:0",
        "BRH:0",
        "end_of_record",
      ].join("\n"),
    );
    await writeFile(
      summaryProfile,
      [
        `SF:${source}`,
        "FNF:2",
        "FNH:1",
        "DA:10,1",
        "LF:1",
        "LH:1",
        "BRF:0",
        "BRH:0",
        "end_of_record",
      ].join("\n"),
    );

    const result = await runMerger(workspace, [namedProfile, summaryProfile]);
    expect(result.exitCode).toBe(0);
    expect(
      await readFile(join(workspace, "coverage/lcov.merged.info"), "utf8"),
    ).toContain("FNF:2\nFNH:2");
    expect(
      JSON.parse(
        await readFile(
          join(workspace, "coverage/lcov.function-identity.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      version: 1,
      identityIncompleteSources: [],
      unresolvedUncoveredSources: [],
    });
    expect((await runCoverageGate(workspace)).exitCode).toBe(0);
  });
});

test("preserves named functions beside summary-only coverage", async () => {
  await withWorkspace(async (workspace) => {
    const source = resolve(workspace, "packages/api/src/mixed.ts");
    const namedProfile = join(workspace, "named.info");
    const summaryProfile = join(workspace, "summary.info");
    await writeFile(
      namedProfile,
      [
        `SF:${source}`,
        "FN:10,known",
        "FNDA:1,known",
        "FNF:2",
        "FNH:1",
        "DA:10,1",
        "LF:1",
        "LH:1",
        "BRF:0",
        "BRH:0",
        "end_of_record",
      ].join("\n"),
    );
    await writeFile(
      summaryProfile,
      [
        `SF:${source}`,
        "FNF:3",
        "FNH:2",
        "DA:10,1",
        "LF:1",
        "LH:1",
        "BRF:0",
        "BRH:0",
        "end_of_record",
      ].join("\n"),
    );

    const result = await runMerger(workspace, [namedProfile, summaryProfile]);
    expect(result.exitCode).toBe(0);
    const output = await readFile(
      join(workspace, "coverage/lcov.merged.info"),
      "utf8",
    );
    expect(output).toContain("FN:10,known\nFNDA:1,known\nFNF:3\nFNH:2");
    expect(
      JSON.parse(
        await readFile(
          join(workspace, "coverage/lcov.function-identity.json"),
          "utf8",
        ),
      ).unresolvedUncoveredSources,
    ).toEqual([source]);
  });
});

test("rejects missing, empty, and recordless profile inputs", async () => {
  await withWorkspace(async (workspace) => {
    const empty = join(workspace, "empty.info");
    const recordless = join(workspace, "recordless.info");
    const valid = join(workspace, "valid.info");
    await writeFile(empty, "\n");
    await writeFile(recordless, "TN:\n");
    await writeFile(
      valid,
      [
        `SF:${resolve(workspace, "src/valid.ts")}`,
        "DA:1,1",
        "LF:1",
        "end_of_record",
      ].join("\n"),
    );

    const cases = [
      {
        inputs: [join(workspace, "missing.info")],
        error: "Coverage file missing",
      },
      { inputs: [empty], error: "Coverage file is empty" },
      {
        inputs: [valid, recordless],
        error: "No LCOV records were found in",
      },
    ];

    const results = await Promise.all(
      cases.map(async (item) => ({
        item,
        result: await runMerger(workspace, item.inputs),
        outputExists: await Bun.file(
          join(workspace, "coverage/lcov.merged.info"),
        ).exists(),
      })),
    );
    for (const { item, result, outputExists } of results) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(item.error);
      expect(outputExists).toBe(false);
    }
  });
});

test("rejects invalid function summaries and missing required details", async () => {
  const cases = [
    { body: ["FNF:1", "FNH:2"], error: "LCOV FNH exceeds FNF" },
    {
      body: ["FNH:0"],
      error: "LCOV FNH summary is missing FNF",
    },
    { body: ["FNF:-1", "FNH:0"], error: "Invalid LCOV FNF summary" },
    { body: ["FNF:1.5", "FNH:1"], error: "Invalid LCOV FNF summary" },
    { body: ["FNF:1", "FNH:-1"], error: "Invalid LCOV FNH summary" },
    { body: ["FNF:1", "FNH:0.5"], error: "Invalid LCOV FNH summary" },
    { body: ["LF:1"], error: "LCOV line details missing" },
    { body: ["BRF:1", "BRH:0"], error: "LCOV branch details missing" },
  ];

  for (const [index, item] of cases.entries()) {
    await withWorkspace(async (workspace) => {
      const input = join(workspace, `invalid-${index}.info`);
      await writeFile(
        input,
        [
          `SF:${resolve(workspace, `src/invalid-${index}.ts`)}`,
          ...item.body,
          ...(item.error === "LCOV line details missing"
            ? []
            : ["DA:1,1", "LF:1"]),
          "end_of_record",
        ].join("\n"),
      );
      const result = await runMerger(workspace, [input]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(item.error);
      expect(
        await Bun.file(join(workspace, "coverage/lcov.merged.info")).exists(),
      ).toBe(false);
    });
  }
});
