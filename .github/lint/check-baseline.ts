#!/usr/bin/env bun

type Diagnostic = {
  filename: string;
  severity: string;
  code?: string;
  message?: string;
  labels?: Array<{ span?: { line?: number; column?: number } }>;
};

const baselineUrl = new URL("./baseline.txt", import.meta.url);
const baseline = (await Bun.file(baselineUrl).text())
  .split(/\r?\n/)
  .filter(Boolean)
  .toSorted();

const lint = Bun.spawn(["bunx", "oxlint@1.80.0", "--format=json"], {
  stdout: "pipe",
  stderr: "ignore",
});
const output = await new Response(lint.stdout).text();
await lint.exited;

const report = JSON.parse(output) as { diagnostics?: Diagnostic[] };
const current = (report.diagnostics ?? [])
  .filter((diagnostic) => diagnostic.severity === "error")
  .map((diagnostic) => {
    const span = diagnostic.labels?.[0]?.span;
    const rule = diagnostic.code ?? diagnostic.message ?? "unknown";
    return `${diagnostic.filename.replaceAll("\\", "/")}:${span?.line ?? 0}:${span?.column ?? 0}:${rule}`;
  })
  .filter((entry, index, entries) => entries.indexOf(entry) === index)
  .toSorted();

if (current.length === 0) {
  console.log("No lint errors found.");
  process.exit(0);
}

const baselineSet = new Set(baseline);
const currentSet = new Set(current);
const newErrors = current.filter((entry) => !baselineSet.has(entry));
const fixedErrors = baseline.filter((entry) => !currentSet.has(entry));

if (newErrors.length > 0) {
  console.error(
    `${newErrors.length} lint error(s) are not in .github/lint/baseline.txt — CI-SANITY F13 requires fixing them or documenting the descope:`,
  );
  console.error(newErrors.join("\n"));
  process.exit(1);
}

if (fixedErrors.length > 0) {
  console.warn(
    `${fixedErrors.length} baseline entr(ies) no longer occur — remove them from .github/lint/baseline.txt in this PR (the baseline may only shrink).`,
  );
}

console.log(
  `All ${current.length} errors are documented baseline findings (CI-SANITY F13).`,
);
