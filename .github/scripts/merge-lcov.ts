#!/usr/bin/env bun
import { resolve } from "node:path";

type FunctionCoverage = { line: number; name: string; hits: number };
type Coverage = {
  source: string;
  lines: Map<number, number>;
  functions: Map<string, FunctionCoverage>;
  branches: Map<string, number | null>;
};

type RawRecord = Omit<Coverage, "functions"> & {
  lineDefinitions: number;
  functionDefinitions: number;
  branchDefinitions: number;
  functionNames: Array<{ line: number; name: string }>;
  functionHits: Map<string, number>;
};

function addMax<K>(map: Map<K, number>, key: K, value: number) {
  map.set(key, Math.max(map.get(key) ?? 0, value));
}

function mergeBranch(
  map: Map<string, number | null>,
  key: string,
  hits: number | null,
) {
  const previous = map.get(key);
  map.set(
    key,
    hits === null ? (previous ?? null) : Math.max(previous ?? 0, hits),
  );
}

function mergeFile(records: RawRecord[], files: Map<string, Coverage>) {
  for (const record of records) {
    if (record.lineDefinitions > 0 && record.lines.size === 0) {
      throw new Error(`LCOV line details missing for ${record.source}`);
    }
    if (record.functionDefinitions > 0 && record.functionNames.length === 0) {
      throw new Error(`LCOV function details missing for ${record.source}`);
    }
    if (record.branchDefinitions > 0 && record.branches.size === 0) {
      throw new Error(`LCOV branch details missing for ${record.source}`);
    }

    const file = files.get(record.source) ?? {
      source: record.source,
      lines: new Map<number, number>(),
      functions: new Map<string, FunctionCoverage>(),
      branches: new Map<string, number | null>(),
    };
    for (const [line, hits] of record.lines) addMax(file.lines, line, hits);
    for (const fn of record.functionNames) {
      const key = `${fn.line}\0${fn.name}`;
      const previous = file.functions.get(key);
      file.functions.set(key, {
        ...fn,
        hits: Math.max(
          previous?.hits ?? 0,
          record.functionHits.get(fn.name) ?? 0,
        ),
      });
    }
    for (const [key, hits] of record.branches) {
      mergeBranch(file.branches, key, hits);
    }
    files.set(record.source, file);
  }
}

function parseLcov(content: string) {
  const records: RawRecord[] = [];
  let record: RawRecord | undefined;
  const finish = () => {
    if (record) records.push(record);
    record = undefined;
  };

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      finish();
      const path = line.slice(3);
      record = {
        source: resolve(path),
        lines: new Map(),
        branches: new Map(),
        lineDefinitions: 0,
        functionDefinitions: 0,
        branchDefinitions: 0,
        functionNames: [],
        functionHits: new Map(),
      };
    } else if (line.startsWith("FN:") && record) {
      const [lineNumber, ...nameParts] = line.slice(3).split(",");
      const fnLine = Number(lineNumber);
      if (Number.isFinite(fnLine) && nameParts.length > 0) {
        record.functionNames.push({ line: fnLine, name: nameParts.join(",") });
      }
    } else if (line.startsWith("FNDA:") && record) {
      const [count, ...nameParts] = line.slice(5).split(",");
      const hits = Number(count);
      if (Number.isFinite(hits) && nameParts.length > 0) {
        const name = nameParts.join(",");
        addMax(record.functionHits, name, hits);
      }
    } else if (line.startsWith("DA:") && record) {
      const [lineNumber, count] = line.slice(3).split(",");
      const number = Number(lineNumber);
      const hits = Number(count);
      if (Number.isFinite(number) && Number.isFinite(hits)) {
        addMax(record.lines, number, hits);
      }
    } else if (line.startsWith("BRDA:") && record) {
      const [lineNumber, block, branch, taken] = line.slice(5).split(",");
      const hits = taken === "-" ? null : Number(taken);
      if (
        taken === "-" ||
        (typeof hits === "number" && Number.isFinite(hits))
      ) {
        mergeBranch(record.branches, `${lineNumber},${block},${branch}`, hits);
      }
    } else if (line.startsWith("LF:") && record) {
      record.lineDefinitions = Number(line.slice(3)) || 0;
    } else if (line.startsWith("FNF:") && record) {
      record.functionDefinitions = Number(line.slice(4)) || 0;
    } else if (line.startsWith("BRF:") && record) {
      record.branchDefinitions = Number(line.slice(4)) || 0;
    } else if (line === "end_of_record") {
      finish();
    }
  }
  finish();
  return records;
}

function renderLcov(files: Map<string, Coverage>) {
  return [...files.values()]
    .toSorted((a, b) => a.source.localeCompare(b.source))
    .map((file) => {
      const functions = [...file.functions.values()].toSorted(
        (a, b) => a.line - b.line || a.name.localeCompare(b.name),
      );
      const lines = [...file.lines].toSorted((a, b) => a[0] - b[0]);
      const branches = [...file.branches].toSorted((a, b) =>
        a[0].localeCompare(b[0]),
      );
      return [
        `SF:${file.source}`,
        ...functions.flatMap((fn) => [
          `FN:${fn.line},${fn.name}`,
          `FNDA:${fn.hits},${fn.name}`,
        ]),
        `FNF:${functions.length}`,
        `FNH:${functions.filter((fn) => fn.hits > 0).length}`,
        ...lines.map(([line, hits]) => `DA:${line},${hits}`),
        `LF:${lines.length}`,
        `LH:${lines.filter(([, hits]) => hits > 0).length}`,
        ...branches.map(([key, hits]) => `BRDA:${key},${hits ?? "-"}`),
        `BRF:${branches.length}`,
        `BRH:${branches.filter(([, hits]) => hits !== null && hits > 0).length}`,
        "end_of_record",
      ].join("\n");
    })
    .join("\n")
    .concat("\n");
}

async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) throw new Error("Pass LCOV files to merge.");

  const files = new Map<string, Coverage>();
  for (const path of inputs) {
    const input = Bun.file(path);
    if (!(await input.exists()))
      throw new Error(`Coverage file missing: ${path}`);
    const content = await input.text();
    if (!content.trim()) throw new Error(`Coverage file is empty: ${path}`);
    const records = parseLcov(content);
    if (records.length === 0) {
      throw new Error(`No LCOV records were found in: ${path}`);
    }
    mergeFile(records, files);
  }
  if (files.size === 0) throw new Error("No LCOV records were found.");

  await Bun.write("coverage/lcov.info", renderLcov(files));
  console.log(`Merged LCOV coverage for ${files.size} source files.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
