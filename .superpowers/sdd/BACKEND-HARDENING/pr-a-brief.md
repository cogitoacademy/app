## PR A — CI / Deps-bot Stabilization

### Task A1: Switch Dependabot to native Bun ecosystem

**Files:**

- Modify: `.github/dependabot.yml`

**Interfaces:**

- Produces: Dependabot writes `bun.lock` correctly on version bumps (the `npm` ecosystem can't).

- [ ] **Step 1:** Edit `.github/dependabot.yml`. In the first `updates` block change `package-ecosystem: "npm"` → `package-ecosystem: "bun"`. Keep `groups` (dev-dependencies/dependencies), `open-pull-requests-limit`, `labels`, `commit-message.prefix: deps` unchanged. The two `docker` and `github-actions` blocks stay as-is.

- [ ] **Step 2:** Verify config parses.

Run: `bunx actionlint .github/dependabot.yml 2>/dev/null || echo "actionlint not installed (optional)"`
Expected: no syntax errors; `bun` is a valid `package-ecosystem` (confirmed in GitHub docs).

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: use native bun ecosystem in dependabot (writes bun.lock)"
```

### Task A2: Stop auto-merge on failing CI

**Files:**

- Modify: `.github/workflows/auto-merge.yml`

**Interfaces:**

- Produces: Dependabot PRs only merge when CI is green.

- [ ] **Step 1:** Edit `.github/workflows/auto-merge.yml`. Main has **no branch protection** (API returns 404), so add an explicit guard. Remove the `pull_request_review` trigger (it caused merges before CI finished — PRs #29–32 merged red). Set `target: minor` so major bumps need manual review:

```yaml
name: Auto-merge Dependabot
on:
  pull_request:
    types: [opened, synchronize, reopened]
  check_suite:
    types: [completed]

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    permissions:
      pull-requests: write
      contents: write
    steps:
      - uses: fastify/github-action-merge-dependabot@v3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          merge-method: squash
          target: minor
```

- [ ] **Step 2:** Add a comment noting the durable fix: `# Durable gate: enable "Require status checks" branch protection for main with CI required.`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/auto-merge.yml
git commit -m "ci: require green checks before auto-merging dependabot PRs"
```

### Task A3: Pin Bun version in Dockerfile

**Files:**

- Modify: `apps/server/Dockerfile`

**Interfaces:**

- Produces: reproducible `bun install --frozen-lockfile` inside Docker (floating `oven/bun:1` was resolving differently than lockfile).

- [ ] **Step 1:** Edit `apps/server/Dockerfile` lines 1 and 15: `oven/bun:1` → `oven/bun:1.3.14` and `oven/bun:1-slim` → `oven/bun:1.3.14-slim`.

- [ ] **Step 2:** Verify the image tag exists.

Run: `docker manifest inspect oven/bun:1.3.14 >/dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/Dockerfile
git commit -m "ci: pin oven/bun to 1.3.14 in Dockerfile (lockfile parity)"
```

### Task A4: Re-sync lockfile (repair drift from #29–#32)

**Files:**

- Modify: `bun.lock` (regenerated, only if drifted)

**Interfaces:**

- Produces: `bun install --frozen-lockfile` passes in CI and Docker; `Deploy Production` stops failing.

- [ ] **Step 1:** Confirm current drift then regenerate.

Run: `git diff --stat bun.lock`
Expected: empty (main already re-synced by `8c00af3`). If drifted, run `bun install` (no `--frozen-lockfile`) and commit `bun.lock` **separately** from any `package.json` change.

- [ ] **Step 2:** Verify frozen install passes.

Run: `bun install --frozen-lockfile`
Expected: exit 0, no "lockfile had changes" error.

- [ ] **Step 3:** (Only if drift existed) commit the lockfile alone:

```bash
git add bun.lock
git commit -m "chore: sync bun.lock"
```

### Task A5: Clean up stale merged branches + worktree

**Files:** git only.

- [ ] **Step 1:** Verify the three branches are merged into main, then delete.

Run: `git branch -r --merged main`
Confirm `improvement/infrastructure`, `improvement/production-readiness`, `improvement/foundation-critical-fixes` appear. (The foundation-critical-fixes extra commits are formatting-only and were squash-merged as #28.)

Run:

```bash
git push origin --delete improvement/infrastructure improvement/production-readiness
git worktree remove .worktrees/foundation-critical-fixes
git branch -D improvement/foundation-critical-fixes
```

- [ ] **Step 2:** Keep `f/frontend-promo-flow-light` (active PR #33).

---

## PR B — Local Dev / Test Parity
