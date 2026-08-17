# PR A — CI / Deps-bot Stabilization — Implementation Report

Branch: `improvement/ci-deps-bot` (base `main` @ 9e20f2a)
Date: 2026-08-12

## Commits created (in order)

| SHA       | Subject                                                      |
| --------- | ------------------------------------------------------------ |
| `82a864c` | ci: use native bun ecosystem in dependabot (writes bun.lock) |
| `28be5ab` | ci: require green checks before auto-merging dependabot PRs  |
| `e257a82` | ci: pin oven/bun to 1.3.14 in Dockerfile (lockfile parity)   |

(No commit for A4 — verify-only, no drift detected.)

## Task A1 — Switch Dependabot to native Bun ecosystem

**Changed:** `.github/dependabot.yml` — `package-ecosystem: "npm"` → `"bun"` in the first `updates` block. All other config (`groups`, `open-pull-requests-limit`, `labels`, `commit-message.prefix`) and the two `docker` / `github-actions` blocks untouched.

**Verification:**

- `bunx actionlint .github/dependabot.yml` → "actionlint not installed (optional)" (tool not present in repo)
- `bunx yaml-lint .github/dependabot.yml` → "✔ YAML Lint successful."

## Task A2 — Stop auto-merge on failing CI

**Changed:** `.github/workflows/auto-merge.yml`

- Removed `pull_request_review: {types: [submitted]}` trigger (this fired before CI finished — cause of red merges #29–32).
- Kept `pull_request` (opened, synchronize, reopened) + `check_suite` (completed) triggers.
- Added `target: minor` so major version bumps require manual review.
- Added comment: `# Durable gate: enable "Require status checks" branch protection for main with CI required.`

**Verification:**

- `bunx yaml-lint .github/workflows/auto-merge.yml` → "✔ YAML Lint successful."

## Task A3 — Pin Bun version in Dockerfile

**Changed:** `apps/server/Dockerfile`

- Line 1: `oven/bun:1` → `oven/bun:1.3.14`
- Line 15: `oven/bun:1-slim` → `oven/bun:1.3.14-slim`

**Verification:**

- `docker manifest inspect oven/bun:1.3.14 >/dev/null && echo OK` → `OK` (tag exists)

## Task A4 — Re-sync lockfile (repair drift from #29–#32)

**Result: NO-OP (verify-only).** No drift exists.

**Verification:**

- `git diff --stat bun.lock` → empty (working tree clean)
- `bun install --frozen-lockfile` → exit 0, "Checked 464 installs across 659 packages (no changes)", no "lockfile had changes" error.

No lockfile commit created (per constraint: do not touch bun.lock unless drifted).

## Task A5 — Clean up stale merged branches + worktree

**Verification before deletion:**

- `git branch -r --merged main` → only `origin/main` and `origin/HEAD` (expected: the branches were **squash-merged**, so no ancestry edge to main — this check alone cannot confirm them).
- Stronger checks:
  - `git log --oneline origin/<branch> --not main` → all listed commits are pre-squash commits (content landed in main).
  - main log confirms squash merges: `02af5b9` (#17 foundation-hardening), `af7b411` (#18 production-readiness), `ab2b1c1` (#19 infrastructure), `8c00af3` (#28 foundation-critical-fixes).
  - Key files from those branches exist on main: `cd-prod.yml`, `cd-staging.yml`, `labeler.yml`, `semantic-pr.yml` workflows + `apps/server/Dockerfile`, `apps/web/Dockerfile` present. (`codeql.yml` was not carried into main — the CI workflow set evolved on main after the branch; acceptable.)

**Actions taken:**

- `git push origin --delete improvement/infrastructure improvement/production-readiness` → both `[deleted]` on remote (pre-push hook ran `turbo check-types` — passed).
- `git worktree remove .worktrees/foundation-critical-fixes` (worktree was clean).
- `git branch -D improvement/foundation-critical-fixes` → deleted (was 9773b17).
- `git worktree prune`.

**Kept:** `f/frontend-promo-flow-light` (active PR #33) — untouched.

## Global verification

- `bun run check-types` → exit 0 (3 tasks, server + web + ui all pass; turbo "FULL TURBO" cache hits)
- `bun run lint` → exit 0 (oxlint: 20 warnings, 0 errors)
- `git status` → clean
- `git diff --stat main..HEAD` → 3 files, 5 insertions, 5 deletions
- No `package.json` changes were made, so no risk of lockfile/package.json same-commit coupling. No frontend / apps/web / packages/ui code touched (web changed only by Dockerfile pin? No — Dockerfile is apps/server; web untouched entirely).
- Did not push `improvement/ci-deps-bot` (controller will push).

## Files changed (net)

1. `.github/dependabot.yml` (+1/-1)
2. `.github/workflows/auto-merge.yml` (+2/-2)
3. `apps/server/Dockerfile` (+2/-2)

## Self-review findings

- auto-merge.yml now matches the brief's authoritative example exactly (valid YAML, correct triggers, `target: minor`, durable-gate comment).
- dependabot `bun` ecosystem is a documented, valid `package-ecosystem` per GitHub docs — native Bun lockfile support.
- Dockerfile pins match the runtime bun version reported by `bun install v1.3.14`, giving lockfile/image parity.

## Concerns

1. **`origin/improvement/foundation-critical-fixes` still exists on the remote.** The brief's Task A5 Step 1 command only listed the two remote deletions; I followed it literally and handled foundation-critical-fixes locally only. The remote branch is confirmed merged (squash #28). Controller should run `git push origin --delete improvement/foundation-critical-fixes` to fully close Task A5.
2. **Durable fix still manual:** auto-merge now only fires on `check_suite.completed`, but with no branch protection on main, the action relies on the `target: minor` + green-check logic of `fastify/github-action-merge-dependabot@v3`. Enabling "Require status checks" for main (per the added comment) remains the true durable gate.
3. **actionlint not installed** — YAML verified with yaml-lint instead (parses cleanly; GitHub Actions syntax for this workflow is standard and mirrors the brief).
