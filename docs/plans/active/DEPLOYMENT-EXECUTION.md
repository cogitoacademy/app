# Deployment Execution — Task-Level Plan (handoff for Lead/workers)

> Parent plan: `docs/plans/active/DEPLOYMENT-PLAN.md` (rev.2, decisions locked).
> This file is the task-level execution plan. A Lead agent (or the herd) executes
> these tasks in order; every task ends in a PR, CI green, squash-merge. **Never
> commit directly to main.**

**Status:** Active — Phase 0/1 repo tasks.
**Branch convention:** `deploy/<task>` per task; worker worktrees under `~/cogito/wt-*`.

## Global constraints

- All repo changes via PR + CI green (`gh pr checks <n> --watch`) + squash-merge.
- Docs follow code (AGENTS.md rule 11): CONTEXT/MODULE-REFERENCE/API-REFERENCE/RUNBOOK/DEPLOYMENT.md updated in the same PR.
- Worker isolation: one worktree per write-capable worker (`parallel-worktrees` skill).
- Secrets: never in git. Operator fills SOPS via `herd attach`.
- Test commands: `bun scripts/run-test-suite.mjs api` (root), `bun test --env-file apps/server/.env.test.example apps/server/src/`, `bun run check-types`, `bun run lint`.

---

## Task D1: CD pipeline — webhook guard + sha-verified health poll + migration step (code)

**Files:**

- Modify: `.github/workflows/cd-prod.yml`, `.github/workflows/cd-staging.yml` (staging is deferred — only cd-prod now)
- Modify: `apps/server/src/routes.ts` (add `version` to `/health` response)
- Create: `scripts/migrate-and-deploy.sh` (backup → migrate → trigger deploy → poll sha)
- Test: `apps/server/src/` health tests + `packages/api/src/tests/unit/db-health.test.ts` (version field)
- Docs: `docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`, `docs/CONTEXT.md`

**Steps (test-first for the version field):**

1. Write failing test: `/health` response includes `version` (from `process.env` or a build-time constant — recommend `GIT_SHA` env injected by the Dockerfile; fall back to `"dev"`).
2. Implement: add `version` to the health response; Dockerfile `ARG GIT_SHA` + `ENV GIT_SHA`.
3. Fix S7: guard the Coolify webhook steps in cd-prod.yml — if the secret is empty, fail with a clear message (currently curl exit 6 "Could not resolve host").
4. Create `scripts/migrate-and-deploy.sh`: pg_dump snapshot → R2 (`pre-migrate-<sha>`) → `bun run db:migrate` → curl webhook → poll `/health` until `version == <sha>` (bounded, ~5 min).
5. Wire the script into cd-prod.yml (replacing the raw curl steps).
6. Run full suite + typecheck + lint; commit; PR; CI; merge.

- Commit: `fix(ci): guard webhook secrets, sha-verify health poll, migrate before deploy`

## Task D2: Backups — nightly pg_dump → R2 (script + docs)

**Files:**

- Create: `infra/backup.sh` (pg_dump via Coolify Postgres container → gzip → R2 `backups/$(date +%F).sql.gz` → prune 30 days)
- Docs: `docs/RUNBOOK.md` (backup + restore drill section), `docs/DEPLOYMENT.md`
- Wire: `infra/ansible/backup-cron.yml` (Ansible cron, nightly 02:00 WIB) — separate playbook

**Steps:**

1. Write `infra/backup.sh` (bash, set -euo pipefail; reads R2 creds + DB URL from env; uses `aws` CLI or `s3cmd` against the R2 S3 endpoint).
2. `bash -n infra/backup.sh` + shellcheck if available.
3. Add `infra/ansible/backup-cron.yml` (idempotent cron task).
4. RUNBOOK: backup restore drill (pg_restore into scratch DB, verify counts).
5. Commit; PR; CI (shell syntax check only — no secrets); merge.

- Commit: `feat(ops): nightly postgres backup to R2 with retention`

## Task D3: Uptime Kuma — Ansible-declared Coolify service (infra)

**Files:**

- Create: `infra/ansible/uptime-kuma.yml` (Coolify API → deploy `louislam/uptime-kuma:1`, port 3002 host/3001 container, volume, domain `status.cogitoacademy.id` — DNS record added in Terraform)
- Docs: `infra/monitoring.md` (live topology + Telegram alerts + monitor list)

**Steps:**

1. Playbook drives the Coolify API (follow `coolify-resources.yml` pattern once it exists; else document the manual UI steps + drift-check note).
2. monitoring.md: monitors (api/health 60s, app. 60s, cert expiry), Telegram notify.
3. Commit; PR; merge.

- Commit: `feat(ops): uptime kuma via ansible + monitoring docs`

## Task D4: Docs sweep (post-infra)

**Files:** `docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`, `docs/CONTEXT.md`, `docs/plans/README.md`

- DEPLOYMENT.md: new pipeline (backup→migrate→deploy→rollback), Tailscale control plane, Ansible layout, drills.
- RUNBOOK: incident sections (crash, DB failure, disk, cert, dependency, rollback, restore) + component inventory.
- CONTEXT: topology + live env state; plans table row.
- Commit: `docs(deploy): deployment runbook, incidents, component inventory`

---

## Execution order & worker roster (herd)

| Wave         | Worker                             | Tasks              | Branch(es)           |
| ------------ | ---------------------------------- | ------------------ | -------------------- |
| A (parallel) | worker-feature (wt-deploy-cd)      | D1                 | `deploy/cd-pipeline` |
| A (parallel) | worker-feature (wt-deploy-backups) | D2                 | `deploy/backups`     |
| B (after A)  | worker-feature                     | D3                 | `deploy/uptime-kuma` |
| B (after A)  | lead                               | D4 (docs, no code) | `deploy/docs`        |

Overlap check: D1 touches `.github/workflows/cd-prod.yml`, `apps/server/src/routes.ts`, `scripts/`; D2 touches `infra/backup.sh`, `infra/ansible/backup-cron.yml`, `docs/RUNBOOK.md` — no file overlap. D3 touches `infra/ansible/uptime-kuma.yml`, `infra/monitoring.md` — no overlap with D1/D2.

## Exit gates (per task)

- PR + CI green + squash-merge.
- Full suite green where code changed.
- Docs updated in the same PR.
