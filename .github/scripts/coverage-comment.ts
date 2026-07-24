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

function parseLcov(content: string): LcovRecord[] {
  const records: LcovRecord[] = [];
  let current: Partial<LcovRecord> = {};

  for (const line of content.split("\n")) {
    if (line.startsWith("SF:")) {
      current = {
        file: line.slice(3),
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
        branchesFound: 0,
        branchesHit: 0,
      };
    } else if (line.startsWith("LF:")) {
      current.linesFound = parseInt(line.slice(3), 10);
    } else if (line.startsWith("LH:")) {
      current.linesHit = parseInt(line.slice(3), 10);
    } else if (line.startsWith("FNF:")) {
      current.functionsFound = parseInt(line.slice(4), 10);
    } else if (line.startsWith("FNH:")) {
      current.functionsHit = parseInt(line.slice(4), 10);
    } else if (line.startsWith("BRF:")) {
      current.branchesFound = parseInt(line.slice(4), 10);
    } else if (line.startsWith("BRH:")) {
      current.branchesHit = parseInt(line.slice(4), 10);
    } else if (line === "end_of_record" && current.file) {
      records.push(current as LcovRecord);
      current = {};
    }
  }

  return records;
}

function pct(hit: number, found: number): string {
  if (found === 0) return "100%";
  return `${((hit / found) * 100).toFixed(1)}%`;
}

function pctNum(hit: number, found: number): number {
  if (found === 0) return 100;
  return (hit / found) * 100;
}

function isApiFile(f: string): boolean {
  const normalized = f.replace(process.cwd() + "/", "");
  return (
    normalized.startsWith("packages/api/src/") && !normalized.includes("/tests/")
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
  const content = await file.text();

  if (!content.trim()) {
    console.log("No coverage data found.");
    return;
  }

  const records = parseLcov(content);

  if (records.length === 0) {
    console.log("No coverage records parsed.");
    return;
  }

  const apiRecords = records.filter((r) => isApiFile(r.file));

  const apiLines = sumLines(apiRecords);
  const overallLines = sumLines(records);

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
  // Thresholds configurable via env; defaults match docs/plans/FOUNDATION-HARDENING.md.
  const apiThreshold = Number(process.env.COVERAGE_API_THRESHOLD ?? 90);
  const overallThreshold = Number(process.env.COVERAGE_OVERALL_THRESHOLD ?? 80);

  const apiPct = pctNum(apiLines.linesHit, apiLines.linesFound);
  const overallPct = pctNum(overallLines.linesHit, overallLines.linesFound);

  const gateFailures: string[] = [];
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

  const header = `## 📊 Coverage Report`;
  const gateLine =
    gateFailures.length === 0
      ? `> ✅ Coverage gate passed (api ≥ ${apiThreshold}%, overall ≥ ${overallThreshold}%)`
      : `> ❌ Coverage gate FAILED: ${gateFailures.join("; ")}`;
  const summaryTable = [
    `| Metric | Coverage |`,
    `|--------|----------|`,
    `| packages/api lines | ${pct(apiLines.linesHit, apiLines.linesFound)} (${apiLines.linesHit}/${apiLines.linesFound}) — gate ${apiThreshold}% |`,
    `| Overall lines | ${pct(overallLines.linesHit, overallLines.linesFound)} (${overallLines.linesHit}/${overallLines.linesFound}) — gate ${overallThreshold}% |`,
    `| Functions | ${functionsPct} (${totals.functionsHit}/${totals.functionsFound}) |`,
    `| Branches | ${branchesPct} (${totals.branchesHit}/${totals.branchesFound}) |`,
  ].join("\n");

  const perFileRows = records
    .filter((r) => r.linesFound > 0)
    .toSorted((a, b) => a.linesHit / a.linesFound - b.linesHit / b.linesFound)
    .slice(0, 15)
    .map((r) => {
      const shortPath = r.file
        .replace(process.cwd() + "/", "")
        .replace(/^\/home\/runner\/work\/[^/]+\/[^/]+\//, "");
      return `| ${shortPath} | ${pct(r.linesHit, r.linesFound)} | ${pct(r.functionsHit, r.functionsFound)} |`;
    });

  const perFileTable =
    perFileRows.length > 0
      ? [
          `\n### Lowest Coverage Files\n`,
          `| File | Lines | Functions |`,
          `|------|-------|-----------|`,
          ...perFileRows,
        ].join("\n")
      : "";

  const comment = [header, gateLine, summaryTable, perFileTable].join("\n");

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
