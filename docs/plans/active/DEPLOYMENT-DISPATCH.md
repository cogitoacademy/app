# Deployment Dispatch — Worker Briefs & Execution Plan

> Handoff document for the deployment wave. Dispatch each worker brief below
> to a FRESH worker in its own worktree (`~/cogito/wt-*`) via
> `herd-spawn-worker <name> worker-feature <worktree-path>`.
>
> **Current repo state (verified 2026-08-27):**
> - `origin/main` = `87edba3` (PR #102 merged: Terraform + DEPLOYMENT.md)
> - `origin/deploy/infra-scaffold` = the declarative infra scaffold (Tailscale ACL, Terraform R2/DNS, Ansible playbooks, SOPS scaffold) — **needs PR review + merge, then CI**
> - `origin/recover/dlq-health` = DLQ health surface (redis `llen` + `/health` `dlqDepth`) — 3 files, tested 18/18, needs re-cut PR from main
> - No workers, no worktrees, no open PRs for this wave. Main is clean at the last legit merge.

## Branch hygiene rules (learned the hard way — follow strictly)

1. **Never branch from a stale base.** Every new branch is cut from
   `origin/main` AFTER a `git fetch` — check `git rev-parse origin/main` is the
   tip you expect, and `git rev-list --count origin/main..HEAD` is 0 before
   pushing a PR.
2. **PRs only.** Workers commit on their branch; the lead reviews, opens the PR
   against `main`, waits for CI, squash-merges. No direct-to-main commits.
3. **No duplicate diffs.** If a PR's `gh pr view <n> --json files` shows files
   you did not intend to change, the base is stale — close, re-cut, re-push.
4. **Overlap check before dispatch:** two workers must not touch the same file.

---

## PR A — infra scaffold (ready to open, needs review)

**Branch:** `origin/deploy/infra-scaffold` (2 commits, base `87edba3`)
**Files:** `infra/tailscale/acl.hujson`, `infra/terraform/{backend,main,variables,outputs}.tf`, `infra/terraform/terraform.tfvars.example`, `infra/ansible/{host-hardening,tailscale}.yml`, `infra/ansible/inventory.ini`, `.sops.yaml`, `infra/secrets/prod.env.example`, `.gitignore`

**Action for the lead:** open the PR from `deploy/infra-scaffold` → `main`, review (Terraform `validate` + `fmt -check` pass — verified), CI (docs+infra only, no code), squash-merge.

**One open question for the user (do NOT block the merge on it):** the `.sops.yaml` has a placeholder `CHANGE_ME_OPERATOR_AGE_PUBLIC_KEY` — the operator generates the Age keypair and updates it. Merge order: infra-scaffold first, then the DLQ PR.

---

## PR B — DLQ health surface (needs re-cut, then review)

**Source:** `origin/recover/dlq-health` (commit `8330ec1`, 3 files: `packages/api/src/lib/db-health.ts`, `packages/api/src/lib/redis.ts`, `packages/api/src/tests/unit/db-health.test.ts` — 18/18 tests pass)

**Re-cut (fresh worker or lead):**
1. `git fetch origin && git checkout -b feat/dlq-alerting origin/main` (base = current main, NOT the recover branch)
2. Cherry-pick `8330ec1` (only that one commit — verify `git show --stat` shows exactly the 3 files)
3. `bun test --env-file apps/server/.env.test.example packages/api/src/tests/unit/db-health.test.ts` → 18 pass
4. `bun run check-types` + `bun run lint` → green
5. Push, open PR vs `main`, wait CI, squash-merge.

**Design notes (from the review):** the DLQ is a **ledger, not a retry queue** — repeatable BullMQ jobs re-fire on their cadence, so auto-replay would double-run money paths. `dlqDepth` is excluded from `/health` overall status so a non-zero depth alerts (Uptime Kuma) without tripping the Coolify probe into a restart loop. Tests include a prototype-method mock fix (`Object.create(InMemoryRedis.prototype)` — spread drops class methods).

---

## Worker Brief W1 — CD pipeline (Task D1)

**Goal:** Make the production CD pipeline safe: guard unset webhook secrets, verify the deployed image sha, add backup→migrate→deploy→health→rollback.

**Worktree:** create `~/cogito/wt-deploy-cd` from `origin/main`, branch `deploy/cd-pipeline`. Worker: `worker-feature`.

**Scope (files you own):**
- `.github/workflows/cd-prod.yml`
- `apps/server/src/routes.ts` (add `version` to `/health`)
- `apps/server/Dockerfile` (ARG/ENV `GIT_SHA`)
- `scripts/migrate-and-deploy.sh` (new)
- Tests: `packages/api/src/tests/unit/db-health.test.ts` (+ server tests if that's where /health is tested)
- Docs: `docs/RUNBOOK.md`, `docs/DEPLOYMENT.md`, `docs/CONTEXT.md` (CI/CD section)

**Do NOT touch:** `apps/web`, `packages/ui`, `packages/db/src/schema`, `infra/` (another worker owns backups), `.github/workflows/cd-staging.yml`, `docs/plans/`.

**Tasks (test-first, one commit each):**
1. **`version` in /health** — failing test first: `healthCheck` includes `version` = `process.env.GIT_SHA` when set else `"dev"`. Implement in `routes.ts` /health handler; Dockerfile `ARG GIT_SHA` + `ENV GIT_SHA`; docs. Commit: `feat(ops): surface deployed image sha in /health`
2. **S7 webhook guard** — in `cd-prod.yml`, before the curl: if `${{ secrets.COOLIFY_PROD_SERVER_WEBHOOK }}` is empty, `echo` a clear message ("COOLIFY_PROD_SERVER_WEBHOOK is unset — configure the Coolify resource webhook and add it as a GitHub secret") and `exit 1`. Keep `--fail --max-time 30`. Commit: `fix(ci): fail loudly when Coolify deploy webhook secret is unset`
3. **`scripts/migrate-and-deploy.sh`** — bash `set -euo pipefail`; env inputs: `COOLIFY_WEBHOOK`, `PROD_DATABASE_URL`, `R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET`, `GIT_SHA`, `HEALTH_URL`. Steps: pg_dump snapshot → gzip → R2 `pre-migrate-<GIT_SHA>.sql.gz` (aws CLI `--endpoint-url https://<account>.r2.cloudflarestorage.com`) → `bun run db:migrate` → curl webhook → poll HEALTH_URL until `version == GIT_SHA` (bounded 20×15s) → clear rollback hint (previous `v<prev-sha>`) on failure. `bash -n` passes; `--dry-run` prints steps without executing. Commit: `feat(ci): backup, migrate, deploy, sha-verified health poll script`
4. **Wire into cd-prod.yml** — replace raw curl+poll steps with the script; pass `GITHUB_SHA` + new secrets (documented placeholders, operator adds them). Commit: `ci(prod): use migrate-and-deploy pipeline with sha verification`

**Constraints:** full api suite + server tests + `check-types` + `lint` green before final commit; docs in same commit (AGENTS.md rule 11); coverage gate 100% for packages/api. Never push / open PRs / touch main — commit on your branch, write `WORKER-REPORT.md`, end with DONE. If a step is impossible as specified, note the assumption in the report.

**Verification:** `bash -n scripts/migrate-and-deploy.sh`; full suite; `check-types`; `lint`.

---

## Worker Brief W2 — Backups (Task D2)

**Goal:** Nightly PostgreSQL backup to R2 (30-day retention) + restore drill doc.

**Worktree:** create `~/cogito/wt-deploy-backups` from `origin/main`, branch `deploy/backups`. Worker: `worker-feature`.

**Scope (files you own):**
- `infra/backup.sh` (new)
- `infra/ansible/backup-cron.yml` (new)
- Docs: `docs/RUNBOOK.md` (Backup & restore section), `docs/DEPLOYMENT.md` (nightly backup line)

**Do NOT touch:** `apps/` (code), `packages/`, `.github/` (CD is W1), `infra/terraform/`, `infra/tailscale/`, `infra/ansible/host-hardening.yml`, `infra/ansible/tailscale.yml`, `infra/ansible/inventory.ini`, `docs/plans/`.

**Tasks (one commit each):**
1. **`infra/backup.sh`** — bash `set -euo pipefail`; env: `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (default `cogito-backups`), `RETENTION_DAYS` (default 30). Steps: `pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip > backups-$(date +%F).sql.gz` → upload to R2 `backups/$(date +%F).sql.gz` via `aws` CLI with the R2 endpoint (or `s3cmd` — pick one, document) → list keys older than RETENTION_DAYS and delete. `bash -n` passes; `--dry-run` prints the exact commands without executing. Commit: `feat(ops): nightly postgres backup to R2 with 30-day retention`
2. **`infra/ansible/backup-cron.yml`** — idempotent; cron nightly 02:00 (+07:00); runs backup.sh as root or a `backup` user (document the choice); env sourced from the SOPS-decrypted file. Commit: `feat(ops): ansible backup cron playbook`
3. **Docs** — RUNBOOK "Backup & restore": how nightly backup works, restore drill (`pg_restore` latest `backups/*.sql.gz` into scratch DB → verify counts → promote), 30-day retention, "never restore over live traffic without a maintenance window" warning. DEPLOYMENT.md: one-line nightly backup note. Commit: `docs(ops): backup restore drill and nightly backup documentation`

**Constraints:** no new deps; standard CLI tools only; you CANNOT test the real R2 upload (no creds) — `bash -n` + `--dry-run` inspection is the verification (note it in the report). Never push / open PRs / touch main. Write `WORKER-REPORT.md`, end with DONE.

**Verification:** `bash -n infra/backup.sh`; `--dry-run` output correct; docs written.

---

## Dispatch order & overlap

| Order | Worker | Branch | Files |
| ----- | ------ | ------ | ----- |
| 1 | lead | PR A (infra-scaffold) + PR B (DLQ) | review/merge — no worker needed |
| 2 (parallel) | W1 `deploy-cd` | `deploy/cd-pipeline` | `.github/workflows/cd-prod.yml`, `apps/server/src/routes.ts`, `apps/server/Dockerfile`, `scripts/migrate-and-deploy.sh`, `packages/api/src/tests/unit/db-health.test.ts`, docs |
| 2 (parallel) | W2 `deploy-backups` | `deploy/backups` | `infra/backup.sh`, `infra/ansible/backup-cron.yml`, `docs/RUNBOOK.md`, `docs/DEPLOYMENT.md` |

**Overlap:** W1 touches `apps/server/src/routes.ts`; the DLQ PR (B) touches `packages/api/src/lib/db-health.ts` — DIFFERENT files, no conflict. W1 and W2 share `docs/RUNBOOK.md`/`docs/DEPLOYMENT.md` — **resolve doc overlap deliberately**: W2 owns the "Backup & restore" section, W1 owns the "CD pipeline" + health-version sections. Instruct each worker to touch ONLY its section (they edit different parts of the same file, committed separately — the lead merges W2 first, then W1, or vice versa with `git checkout <branch> -- docs/...` reconciliation). **Simplest: merge W2 first, then W1 rebases and resolves the docs trivially.**

## Exit gates

- PR A + B merged; CI green on each.
- W1: 4 commits, full suite green, PR merged.
- W2: 3 commits, `bash -n` + dry-run verified, PR merged.
- Docs in every PR (AGENTS.md rule 11).
