#!/usr/bin/env bun
import { resolve } from "node:path";

type FunctionCoverage = { line: number; name: string; hits: number };
type Coverage = {
  source: string;
  lines: Map<number, number>;
  functions: Map<string, FunctionCoverage>;
  branches: Map<string, number | null>;
  functionDefinitions: number;
  functionHits: number;
};

type RawRecord = {
  source: string;
  lines: Map<number, number>;
  branches: Map<string, number | null>;
  lineDefinitions?: number;
  lineHitsSummary?: number;
  functionDefinitions?: number;
  functionHitsSummary?: number;
  branchDefinitions?: number;
  branchHitsSummary?: number;
  functionNames: Array<{ line: number; name: string }>;
  functionHits: Map<string, number>;
};

type FunctionIdentityManifest = {
  version: 1;
  identityIncompleteSources: string[];
  unresolvedUncoveredSources: string[];
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

function parseCount(value: string, field: string, source: string) {
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(count)) {
    throw new Error(`Invalid LCOV ${field} for ${source}: ${value}`);
  }
  return count;
}

function parseSummaryCount(value: string, field: string, source: string) {
  return parseCount(value, `${field} summary`, source);
}

function parseCoordinate(
  value: string,
  field: string,
  source: string,
  minimum: number,
) {
  const coordinate = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(coordinate) ||
    coordinate < minimum
  ) {
    throw new Error(`Invalid LCOV ${field} for ${source}: ${value}`);
  }
  return coordinate;
}

function summarizeFunctions(record: RawRecord) {
  const named = new Map<string, { line: number; name: string }>();
  for (const fn of record.functionNames) {
    named.set(`${fn.line}\0${fn.name}`, fn);
  }
  const namedHits = [...named.values()].filter(
    (fn) => (record.functionHits.get(fn.name) ?? 0) > 0,
  ).length;

  if (
    record.functionHitsSummary !== undefined &&
    record.functionDefinitions === undefined
  ) {
    throw new Error(`LCOV FNH summary is missing FNF for ${record.source}`);
  }
  if (
    record.functionDefinitions !== undefined &&
    record.functionDefinitions < named.size
  ) {
    throw new Error(
      `LCOV FNF is smaller than named functions for ${record.source}`,
    );
  }
  if (
    record.functionHitsSummary !== undefined &&
    record.functionHitsSummary < namedHits
  ) {
    throw new Error(`LCOV FNH is smaller than named hits for ${record.source}`);
  }
  if (
    record.functionDefinitions !== undefined &&
    record.functionHitsSummary !== undefined &&
    record.functionHitsSummary > record.functionDefinitions
  ) {
    throw new Error(`LCOV FNH exceeds FNF for ${record.source}`);
  }

  const definitions = Math.max(
    record.functionDefinitions ?? named.size,
    named.size,
  );
  const hits = Math.max(record.functionHitsSummary ?? namedHits, namedHits);
  const unnamedDefinitions = definitions - named.size;
  if (hits > namedHits + unnamedDefinitions) {
    throw new Error(
      `LCOV function summary conflicts with named hits for ${record.source}`,
    );
  }

  return {
    definitions,
    hits,
  };
}

function validateRecord(record: RawRecord) {
  summarizeFunctions(record);
  if (
    [...record.functionHits.keys()].some(
      (name) => !record.functionNames.some((fn) => fn.name === name),
    )
  ) {
    throw new Error(`LCOV FNDA has no matching FN entry for ${record.source}`);
  }

  const hasCoverageData =
    record.lines.size > 0 ||
    record.branches.size > 0 ||
    record.functionNames.length > 0 ||
    record.functionHits.size > 0 ||
    record.lineDefinitions !== undefined ||
    record.lineHitsSummary !== undefined ||
    record.functionDefinitions !== undefined ||
    record.functionHitsSummary !== undefined ||
    record.branchDefinitions !== undefined ||
    record.branchHitsSummary !== undefined;
  if (!hasCoverageData) {
    throw new Error(`LCOV record has no coverage data for ${record.source}`);
  }

  if (record.lineDefinitions === undefined) {
    throw new Error(`LCOV LF summary is missing for ${record.source}`);
  }
  if (record.lineDefinitions > 0 && record.lines.size === 0) {
    throw new Error(`LCOV line details missing for ${record.source}`);
  }
  if (record.lineDefinitions !== record.lines.size) {
    throw new Error(
      `LCOV LF summary does not match DA details for ${record.source}`,
    );
  }
  if (record.lineHitsSummary !== undefined) {
    if (record.lineDefinitions === undefined) {
      throw new Error(`LCOV LH summary is missing LF for ${record.source}`);
    }
    const hits = [...record.lines.values()].filter((count) => count > 0).length;
    if (record.lineHitsSummary !== hits) {
      throw new Error(
        `LCOV LH summary does not match DA details for ${record.source}`,
      );
    }
  }

  if (record.branchDefinitions !== undefined) {
    if (record.branchDefinitions > 0 && record.branches.size === 0) {
      throw new Error(`LCOV branch details missing for ${record.source}`);
    }
    if (record.branchDefinitions !== record.branches.size) {
      throw new Error(
        `LCOV BRF summary does not match BRDA details for ${record.source}`,
      );
    }
  }
  if (record.branchHitsSummary !== undefined) {
    if (record.branchDefinitions === undefined) {
      throw new Error(`LCOV BRH summary is missing BRF for ${record.source}`);
    }
    const hits = [...record.branches.values()].filter(
      (count) => count !== null && count > 0,
    ).length;
    if (record.branchHitsSummary !== hits) {
      throw new Error(
        `LCOV BRH summary does not match BRDA details for ${record.source}`,
      );
    }
  }
  if (
    record.functionDefinitions === undefined &&
    record.functionNames.length === 0
  ) {
    throw new Error(`LCOV FNF summary is missing for ${record.source}`);
  }
}

function summarizeMergedFunctions(file: Coverage) {
  const functions = [...file.functions.values()];
  const definitions = Math.max(file.functionDefinitions, functions.length);
  const namedHits = functions.filter((fn) => fn.hits > 0).length;
  const hits = Math.max(file.functionHits, namedHits);
  const identityIncomplete = definitions > functions.length || hits > namedHits;

  return {
    definitions,
    hits,
    identityIncomplete,
    unresolvedUncovered: identityIncomplete && hits < definitions,
  };
}

function mergeFile(records: RawRecord[], files: Map<string, Coverage>) {
  for (const record of records) {
    const functionSummary = summarizeFunctions(record);

    const file = files.get(record.source) ?? {
      source: record.source,
      lines: new Map<number, number>(),
      functions: new Map<string, FunctionCoverage>(),
      branches: new Map<string, number | null>(),
      functionDefinitions: 0,
      functionHits: 0,
    };
    file.functionDefinitions = Math.max(
      file.functionDefinitions,
      functionSummary.definitions,
    );
    file.functionHits = Math.max(file.functionHits, functionSummary.hits);
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
    if (record) {
      validateRecord(record);
      records.push(record);
    }
    record = undefined;
  };

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      finish();
      const path = line.slice(3);
      if (!path) throw new Error("Invalid LCOV SF entry: source path is empty");
      record = {
        source: resolve(path),
        lines: new Map(),
        branches: new Map(),
        functionNames: [],
        functionHits: new Map(),
      };
    } else if (line.startsWith("FN:") && record) {
      const [lineNumber, ...nameParts] = line.slice(3).split(",");
      const name = nameParts.join(",");
      if (!name) {
        throw new Error(`Invalid LCOV FN entry for ${record.source}: ${line}`);
      }
      const fnLine = parseCoordinate(lineNumber, "FN line", record.source, 1);
      record.functionNames.push({ line: fnLine, name });
    } else if (line.startsWith("FNDA:") && record) {
      const [count, ...nameParts] = line.slice(5).split(",");
      const name = nameParts.join(",");
      if (!name) {
        throw new Error(
          `Invalid LCOV FNDA entry for ${record.source}: ${line}`,
        );
      }
      const hits = parseCount(count, "FNDA count", record.source);
      addMax(record.functionHits, name, hits);
    } else if (line.startsWith("DA:") && record) {
      const fields = line.slice(3).split(",");
      if (
        fields.length < 2 ||
        fields.length > 3 ||
        (fields.length === 3 && !fields[2])
      ) {
        throw new Error(`Invalid LCOV DA entry for ${record.source}: ${line}`);
      }
      const number = parseCoordinate(fields[0], "DA line", record.source, 1);
      const hits = parseCount(fields[1], "DA count", record.source);
      if (record.lines.has(number)) {
        throw new Error(
          `Duplicate LCOV DA line for ${record.source}: ${number}`,
        );
      }
      record.lines.set(number, hits);
    } else if (line.startsWith("BRDA:") && record) {
      const fields = line.slice(5).split(",");
      if (fields.length !== 4) {
        throw new Error(
          `Invalid LCOV BRDA entry for ${record.source}: ${line}`,
        );
      }
      const lineNumber = parseCoordinate(
        fields[0],
        "BRDA line",
        record.source,
        1,
      );
      const block = parseCoordinate(fields[1], "BRDA block", record.source, 0);
      const branch = parseCoordinate(
        fields[2],
        "BRDA branch",
        record.source,
        0,
      );
      const taken = fields[3];
      const hits =
        taken === "-" ? null : parseCount(taken, "BRDA count", record.source);
      const key = `${lineNumber},${block},${branch}`;
      if (record.branches.has(key)) {
        throw new Error(
          `Duplicate LCOV BRDA branch for ${record.source}: ${key}`,
        );
      }
      record.branches.set(key, hits);
    } else if (line.startsWith("LF:") && record) {
      if (record.lineDefinitions !== undefined) {
        throw new Error(`Duplicate LCOV LF summary for ${record.source}`);
      }
      record.lineDefinitions = parseSummaryCount(
        line.slice(3),
        "LF",
        record.source,
      );
    } else if (line.startsWith("LH:") && record) {
      if (record.lineHitsSummary !== undefined) {
        throw new Error(`Duplicate LCOV LH summary for ${record.source}`);
      }
      record.lineHitsSummary = parseSummaryCount(
        line.slice(3),
        "LH",
        record.source,
      );
    } else if (line.startsWith("FNF:") && record) {
      if (record.functionDefinitions !== undefined) {
        throw new Error(`Duplicate LCOV FNF summary for ${record.source}`);
      }
      record.functionDefinitions = parseSummaryCount(
        line.slice(4),
        "FNF",
        record.source,
      );
    } else if (line.startsWith("FNH:") && record) {
      if (record.functionHitsSummary !== undefined) {
        throw new Error(`Duplicate LCOV FNH summary for ${record.source}`);
      }
      record.functionHitsSummary = parseSummaryCount(
        line.slice(4),
        "FNH",
        record.source,
      );
    } else if (line.startsWith("BRF:") && record) {
      if (record.branchDefinitions !== undefined) {
        throw new Error(`Duplicate LCOV BRF summary for ${record.source}`);
      }
      record.branchDefinitions = parseSummaryCount(
        line.slice(4),
        "BRF",
        record.source,
      );
    } else if (line.startsWith("BRH:") && record) {
      if (record.branchHitsSummary !== undefined) {
        throw new Error(`Duplicate LCOV BRH summary for ${record.source}`);
      }
      record.branchHitsSummary = parseSummaryCount(
        line.slice(4),
        "BRH",
        record.source,
      );
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
      const functionSummary = summarizeMergedFunctions(file);
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
        `FNF:${functionSummary.definitions}`,
        `FNH:${functionSummary.hits}`,
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

function functionIdentityManifest(
  files: Map<string, Coverage>,
): FunctionIdentityManifest {
  const records = [...files.values()].toSorted((a, b) =>
    a.source.localeCompare(b.source),
  );
  return {
    version: 1,
    identityIncompleteSources: records
      .filter((file) => summarizeMergedFunctions(file).identityIncomplete)
      .map((file) => file.source),
    unresolvedUncoveredSources: records
      .filter((file) => summarizeMergedFunctions(file).unresolvedUncovered)
      .map((file) => file.source),
  };
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

  await Bun.write("coverage/lcov.merged.info", renderLcov(files));
  await Bun.write(
    "coverage/lcov.function-identity.json",
    `${JSON.stringify(functionIdentityManifest(files), null, 2)}\n`,
  );
  console.log(`Merged LCOV coverage for ${files.size} source files.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
