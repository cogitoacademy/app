# Cogito Project Conventions (lead agent + workers)

Project-specific conventions for the Cogito monorepo. Read at session start.
General engineering behavior lives in `.opencode/skills/AGENTS.md` and the
global lead agent config (skill trigger map).

## Repo layout & UI

- Monorepo: Turborepo + Bun workspaces. `apps/server` (Elysia, :3001),
  `apps/web` (Vite + React 19 + TanStack Router), `packages/{api,auth,config,
db,env,ui}`.
- UI: always import from `@cogito-app/ui/components/selia/*` — never shadcn
  or elsewhere. Compose existing Selia components before creating new ones.
  OKLCH design tokens only, never hardcoded colors. `use client` on all
  component files. See `AGENTS.md` (Selia Design Rules) for the full list.
- RPC facts: HTTP paths are the oRPC procedure keys with slashes
  (`/rpc/auth/getProfile`), NOT dotted names; request bodies wrapped in
  `{"json": <input>}`; responses come back as `{"json": <data>, "meta": [...]}`.

## Git & branches

- **Worktrees live in `~/cogito/wt-*`** (e.g. `~/cogito/wt-deploy-cd`), never
  in /tmp or the temp dir. Worker branches are cut from `origin/main` AFTER
  `git fetch`; never from a stale base (`git rev-list --count
origin/main..HEAD` must be 0 before pushing a PR).
- **PRs only, squash-merge.** Worker branches are never merged directly into
  main. The lead rebuilds the wave as a clean feature branch from
  `origin/main` with Conventional Commits, opens a PR with a full body
  (Summary/Why/Implementation/Testing/Risks/Rollback), waits for CI
  (`gh pr checks --watch`), then squash-merges. No direct-to-main commits.
- Conventional Commits: `type(scope): description` + body with why/what.
- If a PR's `gh pr view <n> --json files` shows files you did not intend to
  change, the base is stale — close, re-cut, re-push.

## Workers (herd)

- Workers are spawned via `herd-spawn-worker <name> worker-feature
<worktree-path>` in herdr panes, each in its own worktree + branch
  (parallel-worktrees skill). Workers never share a working directory.
- Overlap check before dispatch: two workers must not touch the same file.
- Worker briefs are self-contained (goal, scope, do-not-touch list,
  acceptance criteria, WORKER-REPORT.md output contract, escalation rule).
- Escalation: route every worker `blocked` state to the user first; never
  resolve approvals autonomously. Secrets are typed by the user via
  `herd attach` directly in the worker pane — the lead never sees or types
  them. Secrets go in SOPS (encrypted in git) / GitHub secrets.

## Docs (AGENTS.md rule 11 — docs follow code)

- Every PR that changes behavior updates the affected docs in the same PR:
  `docs/CONTEXT.md` (architecture, modules, known bugs, plans table),
  `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md`, `docs/RUNBOOK.md`, and
  the relevant plan in `docs/plans/` (move completed plans to `completed/`,
  keep statuses accurate). A PR whose docs are stale is not done.
- Planning-first: any concern/finding/open question discovered during a wave
  goes into `docs/plans/active/` as part of the wave's PR.
- Wave finalization (wave-finalization skill): after all wave PRs merge,
  close worker panes, remove worker worktrees + branches, sync plans/docs
  (move completed plans, update indexes), verify the repo is clean.

## CI quirks (learned the hard way)

- Coverage gate: 100% lines for `packages/api` and 100% overall (enforced by
  `.github/scripts/coverage-comment.ts`).
- The CI Lint job auto-commits `style: apply automated lint and format
fixes`. If the Lint job fails on the auto-commit step with "local changes
  would be overwritten by checkout", the branch base is stale — rebase on
  the latest `origin/main` and re-push. The bot's auto-fix push can also
  trigger the `action_required` approval gate (S8, `ACTIONS_BOT_PAT` unset);
  fold the bot's changes into a human-authored commit to move the head.
- Bun coverage quirk: inserting a class method can misattribute lcov lines
  (neighboring method lines report 0). Prefer class-field arrow functions
  (`llen = async () => 0`) for trivial methods to keep the 100% gate green.
- Test DB: `docker exec cogito-app-postgres psql -U postgres -d cogito-test`
  (port 6767, dev postgres). Run migrations with
  `DATABASE_URL=postgresql://postgres:password@localhost:6767/cogito-test
bun run db:migrate` from `packages/db` if tables are missing.
