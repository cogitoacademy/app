import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const scriptPath = resolve(import.meta.dir, "merge-lcov.ts");

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
