#!/usr/bin/env bun
/**
 * Parses lcov.info and posts a coverage summary as a PR comment.
 * Designed for GitHub Actions — uses GITHUB_TOKEN to post comments.
 *
 * Usage in workflow:
 *   - run: bun .github/scripts/coverage-comment.ts
 *     env:
 *       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
 *       LCOV_FILE: ./coverage/lcov.info
 *       PR_NUMBER: ${{ github.event.pull_request.number }}
 *       COVERAGE_API_THRESHOLD: 100
 *       COVERAGE_OVERALL_THRESHOLD: 100
 *       COVERAGE_FUNCTIONS_THRESHOLD: 100
 *       COVERAGE_BRANCHES_THRESHOLD: 100
 *
 * If PR_NUMBER is not set (push to main), prints coverage to stdout only.
 */

interface LcovRecord {
  file: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
  branchesFound: number;
  branchesHit: number;
}

type ParsedLcovRecord = {
  file: string;
  linesFound?: number;
  linesHit?: number;
  functionsFound?: number;
  functionsHit?: number;
  branchesFound?: number;
  branchesHit?: number;
  lines: Map<number, number>;
  functions: Array<{ line: number; name: string }>;
  functionHits: Map<string, number>;
  branches: Map<string, number | null>;
};

interface FunctionIdentityManifest {
  version: 1;
  identityIncompleteSources: string[];
  unresolvedUncoveredSources: string[];
}

function parseLcov(content: string): LcovRecord[] {
  const records: LcovRecord[] = [];
  let current: ParsedLcovRecord | undefined;
  const finish = () => {
    if (!current) return;

    const namedFunctions = new Map<string, { line: number; name: string }>();
    for (const fn of current.functions) {
      namedFunctions.set(`${fn.line}\0${fn.name}`, fn);
    }
    const namedFunctionHits = [...namedFunctions.values()].filter(
      (fn) => (current!.functionHits.get(fn.name) ?? 0) > 0,
    ).length;
    if (
      [...current.functionHits.keys()].some(
        (name) => !current!.functions.some((fn) => fn.name === name),
      )
    ) {
      throw new Error(`LCOV FNDA has no matching FN entry for ${current.file}`);
    }
    const namedFunctionsFound = namedFunctions.size;
    if (current.linesFound === undefined) {
      throw new Error(`LCOV LF summary is missing for ${current.file}`);
    }
    if (
      current.functionsHit !== undefined &&
      current.functionsFound === undefined
    ) {
      throw new Error(`LCOV FNH summary is missing FNF for ${current.file}`);
    }
    if (
      current.functionsFound !== undefined &&
      current.functionsFound < namedFunctionsFound
    ) {
      throw new Error(
        `LCOV FNF is smaller than named functions for ${current.file}`,
      );
    }
    if (
      current.functionsHit !== undefined &&
      current.functionsHit < namedFunctionHits
    ) {
      throw new Error(
        `LCOV FNH is smaller than named hits for ${current.file}`,
      );
    }
    if (
      current.functionsFound !== undefined &&
      current.functionsHit !== undefined &&
      current.functionsHit > current.functionsFound
    ) {
      throw new Error(`LCOV FNH exceeds FNF for ${current.file}`);
    }

    const lineHits = [...current.lines.values()].filter(
      (hits) => hits > 0,
    ).length;
    if (
      current.linesFound !== undefined &&
      current.linesFound !== current.lines.size
    ) {
      throw new Error(
        `LCOV LF summary does not match DA details for ${current.file}`,
      );
    }
    if (current.linesHit !== undefined) {
      if (current.linesFound === undefined) {
        throw new Error(`LCOV LH summary is missing LF for ${current.file}`);
      }
      if (current.linesHit !== lineHits) {
        throw new Error(
          `LCOV LH summary does not match DA details for ${current.file}`,
        );
      }
    }
    if (current.functionsFound === undefined && namedFunctionsFound === 0) {
      throw new Error(`LCOV FNF summary is missing for ${current.file}`);
    }

    const branchHits = [...current.branches.values()].filter(
      (hits) => hits !== null && hits > 0,
    ).length;
    if (
      current.branchesFound !== undefined &&
      current.branchesFound !== current.branches.size
    ) {
      throw new Error(
        `LCOV BRF summary does not match BRDA details for ${current.file}`,
      );
    }
    if (current.branchesHit !== undefined) {
      if (current.branchesFound === undefined) {
        throw new Error(`LCOV BRH summary is missing BRF for ${current.file}`);
      }
      if (current.branchesHit !== branchHits) {
        throw new Error(
          `LCOV BRH summary does not match BRDA details for ${current.file}`,
        );
      }
    }
    const hasCoverageData =
      current.lines.size > 0 ||
      current.functions.length > 0 ||
      current.functionHits.size > 0 ||
      current.branches.size > 0 ||
      current.linesFound !== undefined ||
      current.linesHit !== undefined ||
      current.functionsFound !== undefined ||
      current.functionsHit !== undefined ||
      current.branchesFound !== undefined ||
      current.branchesHit !== undefined;
    if (!hasCoverageData) {
      throw new Error(`LCOV record has no coverage data for ${current.file}`);
    }

    records.push({
      file: current.file,
      linesFound: current.linesFound ?? current.lines.size,
      linesHit: current.linesHit ?? lineHits,
      functionsFound: current.functionsFound ?? namedFunctionsFound,
      functionsHit: current.functionsHit ?? namedFunctionHits,
      branchesFound: current.branchesFound ?? current.branches.size,
      branchesHit: current.branchesHit ?? branchHits,
    });
    current = undefined;
  };

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      finish();
      const file = line.slice(3);
      if (!file) throw new Error("Invalid LCOV SF entry: source path is empty");
      current = {
        file,
        lines: new Map(),
        functions: [],
        functionHits: new Map(),
        branches: new Map(),
      };
    } else if (line.startsWith("FN:") && current) {
      const [lineNumber, ...nameParts] = line.slice(3).split(",");
      const name = nameParts.join(",");
      if (!name) throw new Error(`Invalid LCOV FN entry for ${current.file}`);
      current.functions.push({
        line: parseCoordinate(lineNumber, "FN line", current.file, 1),
        name,
      });
    } else if (line.startsWith("FNDA:") && current) {
      const [count, ...nameParts] = line.slice(5).split(",");
      const name = nameParts.join(",");
      if (!name) throw new Error(`Invalid LCOV FNDA entry for ${current.file}`);
      current.functionHits.set(
        name,
        Math.max(
          current.functionHits.get(name) ?? 0,
          parseCount(count, "FNDA count", current.file),
        ),
      );
    } else if (line.startsWith("DA:") && current) {
      const fields = line.slice(3).split(",");
      if (
        fields.length < 2 ||
        fields.length > 3 ||
        (fields.length === 3 && !fields[2])
      ) {
        throw new Error(`Invalid LCOV DA entry for ${current.file}`);
      }
      const lineNumber = parseCoordinate(fields[0], "DA line", current.file, 1);
      if (current.lines.has(lineNumber)) {
        throw new Error(
          `Duplicate LCOV DA line for ${current.file}: ${lineNumber}`,
        );
      }
      current.lines.set(
        lineNumber,
        parseCount(fields[1], "DA count", current.file),
      );
    } else if (line.startsWith("BRDA:") && current) {
      const fields = line.slice(5).split(",");
      if (fields.length !== 4) {
        throw new Error(`Invalid LCOV BRDA entry for ${current.file}`);
      }
      const lineNumber = parseCoordinate(
        fields[0],
        "BRDA line",
        current.file,
        1,
      );
      const block = parseCoordinate(fields[1], "BRDA block", current.file, 0);
      const branch = parseCoordinate(fields[2], "BRDA branch", current.file, 0);
      const key = `${lineNumber},${block},${branch}`;
      if (current.branches.has(key)) {
        throw new Error(
          `Duplicate LCOV BRDA branch for ${current.file}: ${key}`,
        );
      }
      current.branches.set(
        key,
        fields[3] === "-"
          ? null
          : parseCount(fields[3], "BRDA count", current.file),
      );
    } else if (line.startsWith("LF:") && current) {
      if (current.linesFound !== undefined)
        throw new Error(`Duplicate LCOV LF summary for ${current.file}`);
      current.linesFound = parseCount(
        line.slice(3),
        "LF summary",
        current.file,
      );
    } else if (line.startsWith("LH:") && current) {
      if (current.linesHit !== undefined)
        throw new Error(`Duplicate LCOV LH summary for ${current.file}`);
      current.linesHit = parseCount(line.slice(3), "LH summary", current.file);
    } else if (line.startsWith("FNF:") && current) {
      if (current.functionsFound !== undefined)
        throw new Error(`Duplicate LCOV FNF summary for ${current.file}`);
      current.functionsFound = parseCount(
        line.slice(4),
        "FNF summary",
        current.file,
      );
    } else if (line.startsWith("FNH:") && current) {
      if (current.functionsHit !== undefined)
        throw new Error(`Duplicate LCOV FNH summary for ${current.file}`);
      current.functionsHit = parseCount(
        line.slice(4),
        "FNH summary",
        current.file,
      );
    } else if (line.startsWith("BRF:") && current) {
      if (current.branchesFound !== undefined)
        throw new Error(`Duplicate LCOV BRF summary for ${current.file}`);
      current.branchesFound = parseCount(
        line.slice(4),
        "BRF summary",
        current.file,
      );
    } else if (line.startsWith("BRH:") && current) {
      if (current.branchesHit !== undefined)
        throw new Error(`Duplicate LCOV BRH summary for ${current.file}`);
      current.branchesHit = parseCount(
        line.slice(4),
        "BRH summary",
        current.file,
      );
    } else if (line === "end_of_record") {
      finish();
    }
  }

  finish();
  return records;
}

function parseCount(value: string, field: string, file: string): number {
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(count)) {
    throw new Error(`Invalid LCOV ${field} for ${file}: ${value}`);
  }
  return count;
}

function parseCoordinate(
  value: string,
  field: string,
  file: string,
  minimum: number,
): number {
  const coordinate = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(coordinate) ||
    coordinate < minimum
  ) {
    throw new Error(`Invalid LCOV ${field} for ${file}: ${value}`);
  }
  return coordinate;
}

function pct(hit: number, found: number): string {
  if (found === 0) return "100%";
  return `${((hit / found) * 100).toFixed(1)}%`;
}

function pctNum(hit: number, found: number): number {
  if (found === 0) return 100;
  return (hit / found) * 100;
}

function relativePath(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const cwd = process.cwd().replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.startsWith(`${cwd}/`)
    ? normalized.slice(cwd.length + 1)
    : normalized;
}

function isApiFile(f: string): boolean {
  const normalized = relativePath(f);
  return (
    normalized.startsWith("packages/api/src/") &&
    !normalized.includes("/tests/")
  );
}

function sumLines(recs: LcovRecord[]) {
  return recs.reduce(
    (acc, r) => ({
      linesFound: acc.linesFound + r.linesFound,
      linesHit: acc.linesHit + r.linesHit,
    }),
    { linesFound: 0, linesHit: 0 },
  );
}

async function main() {
  const lcovPath = process.env.LCOV_FILE || "./coverage/lcov.info";
  const prNumber = process.env.PR_NUMBER;
  const githubToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  const file = Bun.file(lcovPath);

  // C9: a missing/empty lcov file must fail the job — otherwise the gate
  // silently passes when the coverage run produced nothing.
  if (!(await file.exists())) {
    console.error(
      `❌ Coverage file missing: ${lcovPath} — cannot verify the coverage gate.`,
    );
    process.exit(1);
  }

  const content = await file.text();

  if (!content.trim()) {
    console.error(
      "❌ Coverage file is empty — cannot verify the coverage gate.",
    );
    process.exit(1);
  }

  const records = parseLcov(content);

  if (records.length === 0) {
    console.error(
      "❌ No coverage records parsed — cannot verify the coverage gate.",
    );
    process.exit(1);
  }

  const identityManifestPath = process.env.LCOV_FUNCTION_IDENTITY_MANIFEST;
  let identityManifest: FunctionIdentityManifest | undefined;
  if (identityManifestPath) {
    const manifestFile = Bun.file(identityManifestPath);
    if (!(await manifestFile.exists())) {
      throw new Error(
        `Function identity manifest missing: ${identityManifestPath}`,
      );
    }
    const manifestText = await manifestFile.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestText);
    } catch {
      throw new Error("Function identity manifest is invalid JSON.");
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("identityIncompleteSources" in parsed) ||
      !Array.isArray(parsed.identityIncompleteSources) ||
      !parsed.identityIncompleteSources.every(
        (source): source is string => typeof source === "string",
      ) ||
      !("unresolvedUncoveredSources" in parsed) ||
      !Array.isArray(parsed.unresolvedUncoveredSources) ||
      !parsed.unresolvedUncoveredSources.every(
        (source): source is string => typeof source === "string",
      )
    ) {
      throw new Error("Function identity manifest has an invalid shape.");
    }
    identityManifest = parsed as FunctionIdentityManifest;
    const incomplete = new Set(identityManifest.identityIncompleteSources);
    if (
      identityManifest.unresolvedUncoveredSources.some(
        (source) => !incomplete.has(source),
      )
    ) {
      throw new Error(
        "Function identity manifest marks a source unresolved without missing identities.",
      );
    }
    const sources = new Set(records.map((record) => record.file));
    if (
      identityManifest.identityIncompleteSources.some(
        (source) => !sources.has(source),
      )
    ) {
      throw new Error(
        "Function identity manifest references a source missing from LCOV.",
      );
    }
  }

  const apiRecords = records.filter((r) => isApiFile(r.file));

  const apiLines = sumLines(apiRecords);
  const overallLines = sumLines(records);
  const apiFunctionsFound = apiRecords.reduce(
    (sum, record) => sum + record.functionsFound,
    0,
  );
  if (apiLines.linesFound === 0) {
    throw new Error("API line coverage denominator is missing or zero.");
  }
  if (apiFunctionsFound === 0) {
    throw new Error("API function coverage denominator is missing or zero.");
  }

  const totals = records.reduce(
    (acc, r) => ({
      linesFound: acc.linesFound + r.linesFound,
      linesHit: acc.linesHit + r.linesHit,
      functionsFound: acc.functionsFound + r.functionsFound,
      functionsHit: acc.functionsHit + r.functionsHit,
      branchesFound: acc.branchesFound + r.branchesFound,
      branchesHit: acc.branchesHit + r.branchesHit,
    }),
    {
      linesFound: 0,
      linesHit: 0,
      functionsFound: 0,
      functionsHit: 0,
      branchesFound: 0,
      branchesHit: 0,
    },
  );

  const functionsPct = pct(totals.functionsHit, totals.functionsFound);
  const branchesPct = pct(totals.branchesHit, totals.branchesFound);

  // --- Coverage gate (enforced) ---
  // Thresholds are configurable for local diagnostics, but the CI workflow
  // sets every metric to 100% so a green job cannot hide untested functions or
  // branches behind a line-only result.
  const apiThreshold = Number(process.env.COVERAGE_API_THRESHOLD ?? 100);
  const overallThreshold = Number(
    process.env.COVERAGE_OVERALL_THRESHOLD ?? 100,
  );
  const functionsThreshold = Number(
    process.env.COVERAGE_FUNCTIONS_THRESHOLD ?? 100,
  );
  const branchesThreshold = Number(
    process.env.COVERAGE_BRANCHES_THRESHOLD ?? 100,
  );

  const apiPct = pctNum(apiLines.linesHit, apiLines.linesFound);
  const overallPct = pctNum(overallLines.linesHit, overallLines.linesFound);
  const functionsPctNum = pctNum(totals.functionsHit, totals.functionsFound);
  const branchesPctNum = pctNum(totals.branchesHit, totals.branchesFound);

  const gateFailures: string[] = [];
  const identityIncompleteSources = new Set(
    identityManifest?.identityIncompleteSources ?? [],
  );
  const unresolvedUncoveredSources =
    identityManifest?.unresolvedUncoveredSources ?? [];
  if (unresolvedUncoveredSources.length > 0) {
    gateFailures.push(
      `function union is unverified for ${unresolvedUncoveredSources.length} source(s) with unidentified uncovered functions`,
    );
  }
  if (apiPct < apiThreshold) {
    gateFailures.push(
      `packages/api lines ${apiPct.toFixed(1)}% < ${apiThreshold}% threshold`,
    );
  }
  if (overallPct < overallThreshold) {
    gateFailures.push(
      `overall lines ${overallPct.toFixed(1)}% < ${overallThreshold}% threshold`,
    );
  }
  if (functionsPctNum < functionsThreshold) {
    gateFailures.push(
      `overall functions ${functionsPctNum.toFixed(1)}% < ${functionsThreshold}% threshold`,
    );
  }
  if (branchesPctNum < branchesThreshold) {
    gateFailures.push(
      `overall branches ${branchesPctNum.toFixed(1)}% < ${branchesThreshold}% threshold`,
    );
  }

  const header = `## 📊 Coverage Report`;
  const gateLine =
    gateFailures.length === 0
      ? `> ✅ Coverage gate passed (api lines ≥ ${apiThreshold}%, overall lines ≥ ${overallThreshold}%, functions ≥ ${functionsThreshold}%, branches ≥ ${branchesThreshold}%)`
      : `> ❌ Coverage gate FAILED: ${gateFailures.join("; ")}`;
  const summaryTable = [
    `| Metric | Coverage |`,
    `|--------|----------|`,
    `| packages/api lines | ${pct(apiLines.linesHit, apiLines.linesFound)} (${apiLines.linesHit}/${apiLines.linesFound}) — gate ${apiThreshold}% |`,
    `| Overall lines | ${pct(overallLines.linesHit, overallLines.linesFound)} (${overallLines.linesHit}/${overallLines.linesFound}) — gate ${overallThreshold}% |`,
    `| Functions | ${identityIncompleteSources.size > 0 ? `lower-bound counts ≥${totals.functionsHit}/≥${totals.functionsFound}; identities missing in ${identityIncompleteSources.size} source(s)` : `${functionsPct} (${totals.functionsHit}/${totals.functionsFound})`} — gate ${functionsThreshold}% |`,
    `| Branches | ${branchesPct} (${totals.branchesHit}/${totals.branchesFound}) — gate ${branchesThreshold}% |`,
  ].join("\n");

  const perFileRows = records
    .filter((r) => r.linesFound > 0)
    .toSorted((a, b) => a.linesHit / a.linesFound - b.linesHit / b.linesFound)
    .slice(0, 15)
    .map((r) => {
      const shortPath = relativePath(r.file).replace(
        /^\/home\/runner\/work\/[^/]+\/[^/]+\//,
        "",
      );
      const functionCell = identityIncompleteSources.has(r.file)
        ? `lower-bound counts ≥${r.functionsHit}/≥${r.functionsFound}; identity incomplete`
        : pct(r.functionsHit, r.functionsFound);
      return `| ${shortPath} | ${pct(r.linesHit, r.linesFound)} | ${functionCell} |`;
    });

  const perFileTable =
    perFileRows.length > 0
      ? [
          `### Lowest Coverage Files`,
          ``,
          `| File | Lines | Functions |`,
          `|------|-------|-----------|`,
          ...perFileRows,
        ].join("\n")
      : "";

  // GitHub needs a blank line between a blockquote and a table (and between
  // other block-level sections), otherwise it renders the table as plain text.
  const comment = [header, gateLine, summaryTable, perFileTable]
    .filter(Boolean)
    .join("\n\n");

  console.log(comment);

  if (prNumber && githubToken && repo) {
    const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ body: comment }),
    });

    if (res.ok) {
      console.log("\n✅ Coverage comment posted to PR #" + prNumber);
    } else {
      console.error(
        `\n❌ Failed to post comment: ${res.status} ${await res.text()}`,
      );
    }
  } else {
    console.log("\nℹ️  No PR_NUMBER set — printed to stdout only.");
  }

  if (gateFailures.length > 0) {
    console.error(
      `\n❌ Coverage gate failed — see above. Failing the job to block merge.`,
    );
    process.exit(1);
  }
}

main();
