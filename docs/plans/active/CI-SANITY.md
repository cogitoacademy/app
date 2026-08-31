# CI Sanity & False-Positive Elimination — Plan

| Field      | Value                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Status     | Active — planned 2026-08-31; verified against live CI evidence; dispatch-ready                                                    |
| Created    | 2026-08-31                                                                                                                        |
| Depends on | #126 merged (ops.sh + APPLY-RUNBOOK + this plan's trigger); main `85841b0`                                                        |
| Scope      | CI workflow fixes (fail-loud infra-plan, web-deploy verification, auto-rollback, dedupe, staging decision) + DLQ age-aware health |

## Why

During the 2026-08-31 ops wave, several CI failure modes were discovered that
produce **false confidence**: jobs render green while the thing they were
meant to verify never ran. Evidence was gathered live (run logs, secret
lists, workflow sources) — not assumed.

## Verified findings (evidence-based)

| ID  | Finding (verified)                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `infra-plan.yml` references `R2_STATE_ACCESS_KEY_ID`/`R2_STATE_SECRET_ACCESS_KEY` GitHub secrets that **do not exist**. The credentials exist as `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (per user, 2026-08-31). Result: plan step **silently skips** ("tokens not configured") and the job shows green.                       | `gh secret list` (no `R2_STATE_*` entries); run 33358884750 step "Terraform plan (read-only): skipped"; infra-plan.yml lines 75–78 |
| F2  | First push of #126 proved the skip mechanism hides real breakage: with partially-set R2 state creds, `terraform init` hit the state bucket and failed `403 Forbidden` on `terraform.tfstate` — a real error, later replaced by an unconditional skip.                                                                            | failed run 33358781690 log                                                                                                         |
| F3  | Web deploy is **unverified**: `cd-prod.yml` POSTs the web resource webhook and stops. No health poll, no version check. A broken web image deploys silently.                                                                                                                                                                     | cd-prod.yml "Trigger Coolify web deploy"; scripts/migrate-and-deploy.sh verifies only the API `/health` version                    |
| F4  | Rollback is a **printed hint**, not an action. On health-poll timeout the script tells a human to repoint Coolify at `v<prev-sha>`. No `if: failure()` auto-rollback step.                                                                                                                                                       | migrate-and-deploy.sh `die "…ROLLBACK: point the Coolify server resource…"`                                                        |
| F5  | CI **double-runs every merge**: `ci.yml` triggers on both `pull_request` and `push: [main, staging]` — every squash-merge re-runs the full 4-job suite on the merge commit.                                                                                                                                                      | ci.yml `on:` block                                                                                                                 |
| F6  | Dependabot bun-1.4 PRs (#98–#101) failed in **2–4 seconds** including jobs that never touch bun (`label`, `auto-merge`) → stale-base/infrastructure shape, not "bun 1.4 breaks the build" (unproven either way). Logs expired (404); bases predate the 08-27 CI churn. `recreate` issued 2026-08-31; verdict pending fresh runs. | `gh pr checks 98..101` (2s failures); `mergeable: UNKNOWN` all four; log API 404                                                   |
| F7  | `cd-staging.yml` exists with staging webhook secrets pointing at the **same public host as prod** (`cl.cogitoacademy.id`) and no staging infrastructure exists. If anyone sets those secrets, staging deploys would hit the prod Coolify instance.                                                                               | cd-staging.yml lines 46–50; no staging host in Terraform/DNS                                                                       |
| F8  | No e2e in CI — `packages/e2e` (10 specs) ran only in the 2026-08-26 local session.                                                                                                                                                                                                                                               | .github/workflows/ci.yml (no e2e job)                                                                                              |
| F9  | S8 approval gate: the lint auto-commit bot (git-auto-commit-action, now v7 after #73) triggers `action_required` on every PR it touches while `ACTIONS_BOT_PAT` is unset — re-verified live on #126 (run 33358781690 → gate).                                                                                                    | #126 run history 04:56:52Z; `gh secret list` (no `ACTIONS_BOT_PAT`)                                                                |
| F10 | No branch protection on `main` (API 404) — nothing requires the latest run of the merge commit to be green; stale-base merges are structurally possible. **Operator console action, not a PR.**                                                                                                                                  | `gh api repos/.../branches/main/protection` → 404                                                                                  |

## Fixes (this plan)

1. **F1/F2 — fail-loud infra-plan with correct secret names** (`.github/workflows/infra-plan.yml`):
   - Read R2 state creds from `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (the names that actually exist) + keep `R2_STATE_ENDPOINT`.
   - Replace skip-with-notice by **fail with a precise message** when the PR is not from a fork and creds are missing. Fork PRs (no secret access) keep the skip.
   - The `403` class (wrong-permission token) must surface as a job failure, never a skip.
2. **F3 — web deploy verification**: after the web webhook POST, poll `https://app.cogitoacademy.id` (HTTP 200, bounded attempts, same script style as the API poll). Web nginx image gains a tiny `GIT_SHA`-bearing health page or the poll accepts 200 + content marker — decide during implementation, document choice.
3. **F4 — auto-rollback action**: add an `if: failure()` CD step that calls the Coolify API (via `COOLIFY_API_TOKEN`) to repoint the failing resource at `v<prev-sha>`; keep the printed hint as fallback copy. Never auto-restore DB snapshots (locked decision).
4. **F5 — CI dedupe**: drop the `push: [main, staging]` trigger from `ci.yml` (PR runs already gate every merge) or use `paths-filter`/concurrency dedup — pick and document.
5. **F7 — staging decision**: default = **delete `cd-staging.yml`** (locked: "prod first, no staging"). If user wants staging later, it returns with its own host.
6. **DLQ age-aware health** (folded from MONITORING-ALERTING): `checkDlqHealth` counts only entries younger than N hours; `/health` `dlqDepth` returns 0 for the currently-stale-100 ledger. Files: `packages/api/src/lib/db-health.ts` + tests (100% line gate applies).
7. **F8 — e2e in CI**: out of scope here (needs runner + seeded DB wiring); tracked under MONITORING-ALERTING follow-ups.

## Operator console actions (user, not code)

- [ ] Branch protection on `main`: require status checks (`lint`, `Type Check`, `Build`, `Test + Coverage`, `Terraform validate + plan`, `Semantic PR`, `Labeler`) + **require branches up to date** (kills stale-base merges).
- [ ] Optional: `ACTIONS_BOT_PAT` (fine-grained, contents:write) to kill the S8 gate class; else accept per-PR approvals.
- [ ] After the cl-domain rename merges: recreate `COOLIFY_PROD_SERVER_WEBHOOK` + `COOLIFY_PROD_WEBHOOK` with `https://cl.cogitoacademy.id/api/v1/deploy?uuid=...`.

## Exit gates

- infra-plan job fails loudly (with exact remediation message) when creds are absent on non-fork PRs; runs a real `terraform plan` when they exist.
- A merged commit where the web image is broken makes CD red (and auto-rolls back), not silent.
- No duplicated CI suite on merge commits; dependabot PRs either merged green or closed with a documented reason.
- All docs synced (README plans table, CONTEXT, RUNBOOK) in the wave PR.

## Status log

- 2026-08-31: plan created after live verification; #126/#73 merged; dependabot `recreate` posted on #98/#99/#100/#101/#71.
