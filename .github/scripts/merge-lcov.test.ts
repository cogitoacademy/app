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

async function writeCoverageGateInput(workspace: string, profile: string) {
  await writeFile(join(workspace, "coverage/lcov.merged.info"), profile);
  await writeFile(
    join(workspace, "coverage/lcov.function-identity.json"),
    JSON.stringify({
      version: 1,
      identityIncompleteSources: [],
      unresolvedUncoveredSources: [],
    }),
  );
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
        "FNF:0",
        "FNH:0",
        "BRF:0",
        "BRH:0",
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

test("rejects partial line details and source-only records", async () => {
  const cases = [
    {
      body: ["DA:1,1", "LF:100", "LH:1", "BRF:0", "BRH:0"],
      error: "LCOV LF summary does not match DA details",
    },
    { body: [], error: "LCOV record has no coverage data" },
  ];

  for (const [index, item] of cases.entries()) {
    await withWorkspace(async (workspace) => {
      const input = join(workspace, `incomplete-${index}.info`);
      await writeFile(
        input,
        [
          `SF:${resolve(workspace, `packages/api/src/incomplete-${index}.ts`)}`,
          ...item.body,
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

test("rejects negative and fractional counters or invalid coordinates", async () => {
  const cases = [
    { entry: "DA:-1,1", error: "Invalid LCOV DA line" },
    { entry: "DA:1.5,1", error: "Invalid LCOV DA line" },
    { entry: "DA:1,-1", error: "Invalid LCOV DA count" },
    { entry: "DA:1,-", error: "Invalid LCOV DA count" },
    { entry: "DA:1,0.5", error: "Invalid LCOV DA count" },
    { entry: "FN:0,alpha", error: "Invalid LCOV FN line" },
    { entry: "FN:1.5,alpha", error: "Invalid LCOV FN line" },
    { entry: "FNDA:-1,alpha", error: "Invalid LCOV FNDA count" },
    { entry: "FNDA:0.5,alpha", error: "Invalid LCOV FNDA count" },
    { entry: "BRDA:-1,0,0,0", error: "Invalid LCOV BRDA line" },
    { entry: "BRDA:1,-1,0,0", error: "Invalid LCOV BRDA block" },
    { entry: "BRDA:1,0,0.5,0", error: "Invalid LCOV BRDA branch" },
    { entry: "BRDA:1,0,0,-1", error: "Invalid LCOV BRDA count" },
    { entry: "BRDA:1,0,0,0.5", error: "Invalid LCOV BRDA count" },
    { entry: "LF:-1", error: "Invalid LCOV LF summary" },
    { entry: "LH:0.5", error: "Invalid LCOV LH summary" },
    { entry: "BRF:-1", error: "Invalid LCOV BRF summary" },
    { entry: "BRH:0.5", error: "Invalid LCOV BRH summary" },
  ];

  for (const [index, item] of cases.entries()) {
    await withWorkspace(async (workspace) => {
      const input = join(workspace, `malformed-${index}.info`);
      await writeFile(
        input,
        [
          `SF:${resolve(workspace, `src/malformed-${index}.ts`)}`,
          item.entry,
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

test("accepts untaken branch details and branchless source records", async () => {
  await withWorkspace(async (workspace) => {
    const input = join(workspace, "branches.info");
    const source = resolve(workspace, "packages/api/src/branches.ts");
    await writeFile(
      input,
      [
        `SF:${source}`,
        "DA:1,1",
        "LF:1",
        "LH:1",
        "FNF:0",
        "FNH:0",
        "BRDA:1,0,0,-",
        "BRF:1",
        "BRH:0",
        "end_of_record",
        `SF:${resolve(workspace, "packages/api/src/branchless.ts")}`,
        "DA:1,1",
        "LF:1",
        "LH:1",
        "FNF:0",
        "FNH:0",
        "end_of_record",
      ].join("\n"),
    );

    const result = await runMerger(workspace, [input]);
    expect(result.exitCode).toBe(0);
    const output = await readFile(
      join(workspace, "coverage/lcov.merged.info"),
      "utf8",
    );
    expect(output).toContain("BRDA:1,0,0,-\nBRF:1\nBRH:0");
    expect(output).toContain("BRF:0\nBRH:0");
  });
});

test("coverage gate rejects malformed LCOV counters and coordinates", async () => {
  const source = "packages/api/src/comment-validation.ts";
  const cases = [
    { entry: "DA:1,-1", error: "Invalid LCOV DA count" },
    { entry: "DA:1.5,1", error: "Invalid LCOV DA line" },
    { entry: "FNDA:0.5,alpha", error: "Invalid LCOV FNDA count" },
    { entry: "FN:-1,alpha", error: "Invalid LCOV FN line" },
    { entry: "BRDA:1,0,0,-1", error: "Invalid LCOV BRDA count" },
    { entry: "BRDA:1.5,0,0,0", error: "Invalid LCOV BRDA line" },
    { entry: "LF:-1", error: "Invalid LCOV LF summary" },
  ];

  for (const item of cases) {
    await withWorkspace(async (workspace) => {
      const profile = [
        `SF:${source}`,
        item.entry,
        "FN:1,alpha",
        "FNDA:1,alpha",
        "FNF:1",
        "FNH:1",
        "DA:1,1",
        "LF:1",
        "LH:1",
        "BRF:0",
        "BRH:0",
        "end_of_record",
      ].join("\n");
      await writeCoverageGateInput(workspace, profile);
      const result = await runCoverageGate(workspace);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(item.error);
    });
  }
});

test("coverage gate requires API line and function denominators but accepts branchless coverage", async () => {
  await withWorkspace(async (workspace) => {
    const apiSource = resolve(workspace, "packages/api/src/branchless.ts");
    const validProfile = [
      `SF:${apiSource}`,
      "FN:1,alpha",
      "FNDA:1,alpha",
      "FNF:1",
      "FNH:1",
      "DA:1,1",
      "LF:1",
      "LH:1",
      "end_of_record",
    ].join("\n");
    await writeCoverageGateInput(workspace, validProfile);
    const valid = await runCoverageGate(workspace);
    expect(valid.exitCode).toBe(0);
    expect(valid.stdout).toContain("Branches | 100% (0/0)");

    const missingLineSummary = [
      `SF:${apiSource}`,
      "FN:1,alpha",
      "FNDA:1,alpha",
      "FNF:1",
      "FNH:1",
      "DA:1,1",
      "LH:1",
      "BRF:0",
      "BRH:0",
      "end_of_record",
    ].join("\n");
    await writeCoverageGateInput(workspace, missingLineSummary);
    const absentLines = await runCoverageGate(workspace);
    expect(absentLines.exitCode).not.toBe(0);
    expect(absentLines.stderr).toContain("LCOV LF summary is missing");

    const missingFunctionSummary = [
      `SF:${apiSource}`,
      "DA:1,1",
      "LF:1",
      "LH:1",
      "BRF:0",
      "BRH:0",
      "end_of_record",
    ].join("\n");
    await writeCoverageGateInput(workspace, missingFunctionSummary);
    const absentFunctions = await runCoverageGate(workspace);
    expect(absentFunctions.exitCode).not.toBe(0);
    expect(absentFunctions.stderr).toContain("LCOV FNF summary is missing");

    const untakenBranchProfile = validProfile.replace(
      "LH:1\nend_of_record",
      "LH:1\nBRDA:1,0,0,-\nBRF:1\nBRH:0\nend_of_record",
    );
    await writeCoverageGateInput(workspace, untakenBranchProfile);
    const untakenBranch = await runCoverageGate(workspace);
    expect(untakenBranch.exitCode).not.toBe(0);
    expect(untakenBranch.stderr).not.toContain("Invalid LCOV");
    expect(untakenBranch.stdout).toContain("Branches | 0.0% (0/1)");

    const noApiFunctions = [
      `SF:${apiSource}`,
      "DA:1,1",
      "LF:1",
      "LH:1",
      "FNF:0",
      "FNH:0",
      "BRF:0",
      "BRH:0",
      "end_of_record",
    ].join("\n");
    await writeCoverageGateInput(workspace, noApiFunctions);
    const missingFunctions = await runCoverageGate(workspace);
    expect(missingFunctions.exitCode).not.toBe(0);
    expect(missingFunctions.stderr).toContain(
      "API function coverage denominator is missing or zero",
    );

    const noApiLines = [
      `SF:${apiSource}`,
      "FNF:1",
      "FNH:1",
      "FN:1,alpha",
      "FNDA:1,alpha",
      "LF:0",
      "LH:0",
      "BRF:0",
      "BRH:0",
      "end_of_record",
    ].join("\n");
    await writeCoverageGateInput(workspace, noApiLines);
    const missingLines = await runCoverageGate(workspace);
    expect(missingLines.exitCode).not.toBe(0);
    expect(missingLines.stderr).toContain(
      "API line coverage denominator is missing or zero",
    );
  });
});
