import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Keep manifests/configuration and every unknown path in the fingerprint.
export function isCoverageInput(path) {
  return ![
    "apps/web/src/",
    "apps/web/public/",
    "packages/ui/components/",
    "packages/ui/src/",
    "docs/",
  ].some((prefix) => path.startsWith(prefix));
}

export function fingerprintTree(tree) {
  const entries = tree.split("\0").filter(Boolean);
  const inputs = entries.filter((entry) => {
    const separator = entry.indexOf("\t");
    if (separator < 0) throw new Error("Invalid Git tree entry");
    return isCoverageInput(entry.slice(separator + 1));
  });
  if (!inputs.length) throw new Error("No coverage inputs found");
  return createHash("sha256")
    .update("coverage-reuse-v1\0")
    .update(inputs.toSorted().join("\0"))
    .digest("hex");
}

export async function findSuccessfulRun(api, { name, pr, headRepoId, runId }) {
  // A bounded lookup may miss old results; a miss simply runs the suite again.
  const { artifacts } = await api(
    `/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`,
  );
  for (const artifact of artifacts) {
    if (
      artifact.name !== name ||
      artifact.expired ||
      !artifact.workflow_run ||
      String(artifact.workflow_run.id) === String(runId) ||
      artifact.workflow_run.head_repository_id !== headRepoId
    )
      continue;
    // eslint-disable-next-line no-await-in-loop -- Stop at the first validated result.
    const run = await api(`/actions/runs/${artifact.workflow_run.id}`);
    if (
      run.status === "completed" &&
      run.conclusion === "success" &&
      run.event === "pull_request" &&
      run.path === ".github/workflows/ci.yml" &&
      run.head_repository?.id === headRepoId &&
      run.pull_requests?.some((candidate) => candidate.number === pr)
    ) {
      // Check the producing job too: a skipped suite is not evidence.
      // eslint-disable-next-line no-await-in-loop -- Validate this candidate before proceeding.
      const { jobs } = await api(`/actions/runs/${run.id}/jobs?per_page=100`);
      if (
        jobs.some(
          (job) =>
            job.name === "Backend tests + coverage" &&
            job.status === "completed" &&
            job.conclusion === "success",
        )
      )
        return run.id;
    }
  }
  return null;
}

async function actionsApi(path) {
  const response = await fetch(
    `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}${path}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error(`Actions API returned ${response.status}`);
  return response.json();
}

async function main() {
  const fingerprint = fingerprintTree(
    execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request?.number;
  const name = `coverage-success-pr-${pr ?? "manual"}-${fingerprint}`;
  let sourceRun = null;
  if (process.env.GITHUB_EVENT_NAME === "pull_request" && pr) {
    try {
      sourceRun = await findSuccessfulRun(actionsApi, {
        name,
        pr,
        headRepoId: event.pull_request.head.repo.id,
        runId: process.env.GITHUB_RUN_ID,
      });
    } catch (error) {
      console.log(
        `Reuse lookup unavailable; running full suite: ${error.message}`,
      );
    }
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `fingerprint=${fingerprint}\nartifact=${name}\nreused=${sourceRun !== null}\nsource_run=${sourceRun ?? ""}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
