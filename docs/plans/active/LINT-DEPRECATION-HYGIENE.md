# Deployment-Hardening & Warning-Clearing Wave — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **SCOPE CHANGE (2026-08-31, user decision):** **web is out of scope.** Tasks 1 and 2 (frontend lint fixes: tutor-drawer refs, Date.now purity, setState-in-effect) are **DESCOOPED** — the 62 web `react(*)` errors are documented, not fixed, and the toolchain re-bump (Task 4) is **cancelled** (1.80 would fail CI on the web errors). The pin stays at 1.78/0.63. What remains: **backend/infra only** — Task 3 (test-file non-null guards), Task 6 (CI deprecations + ansible group), Task 7 docs sync. The backend test-file cleanup (~20 no-non-null-asserted-optional-chain) is still in scope as it touches `packages/api`.

**Goal:** Drive CI from "green-but-noisy" to "green-and-silent": zero unsurfaced lint warnings, zero deprecation notices, and live monitoring wired — prioritizing correctness and security over premature optimization.

**Architecture:** Three overlap-safe waves executed through the herd (lead integrates via PRs, squash-merge). Wave A is the lint/deprecation hygiene wave (frontend-heavy, test-only backend touches); Wave B is the already-planned Uptime Kuma + Discord monitoring wave (MONITORING-ALERTING.md); Wave C is CI-deprecation + inventory hygiene (actions bumps, ansible warning). Each worker runs the `worker-feature` role (`ollama-cloud/glm-5.3-flash`) in its own worktree per the parallel-worktrees skill.

**Tech Stack:** oxlint/oxfmt (pinned 1.78/0.63, deliberate re-bump to 1.80/0.65 at the end), Bun 1.3.14, GitHub Actions, Ansible (community.general), Uptime Kuma 1, Discord webhooks, oRPC/Better Auth (no changes).

## Global Constraints

- Every PR updates docs in the same PR (AGENTS.md rule 11): `docs/CONTEXT.md`, `docs/RUNBOOK.md`, `docs/plans/README.md`, and the touched plan(s) in `docs/plans/active/`.
- Conventional Commits; worker branches cut from `origin/main` AFTER `git fetch`; PRs only, squash-merge; lead integrates (CONVENTIONS.md).
- Coverage gate: 100% lines for `packages/api` and overall — any test-file change must keep the gate green (CI quirks: prefer class-field arrow functions for trivial methods).
- UI work: Selia components only (`@cogito-app/ui/components/selia/*`), OKLCH tokens, `use client` on component files.
- No premature optimization: clear *obvious* warnings/deprecations only; leave `no-await-in-loop` (53 hits, intentional sequential money/db semantics) and `consistent-function-scoping` (35, mostly tests) unless a 1-line fix is obviously correct — document anything intentionally disabled (config-level disable with a comment, never inline `# eslint-disable` churn).
- Priority order per user: correctness & security first, deprecations cleared (not prematurely optimized), warnings must end at 0 or be explicitly documented.

---

## Evidence base (verified 2026-08-31)

| # | Finding | Count | Where |
| --- | --- | --- | --- |
| E1 | oxlint 1.80 **errors** blocking the re-bump | 81 | 45 `tutor-drawer.tsx` react(refs); 20 test `no-non-null-asserted-optional-chain`; 8 `react(purity)` Date.now-in-render; 8 `react(set-state-in-effect)`; 1 misc |
| E2 | oxlint 1.78 **warnings** (visible in CI today) | 123 | 53 `no-await-in-loop`, 35 `consistent-function-scoping`, 13 `no-underscore-dangle`, 11 `prefer-add-event-listener`, rest misc |
| E3 | GitHub Actions **Node 20 deprecation** warnings | every CI job | `oven-sh/setup-bun@v2` + `actions/checkout@v4` (checkout v6+ runs Node 24) |
| E4 | Ansible **"Invalid characters in group names"** warning | every ansible run | `infra/ansible/inventory.ini` group name `[cogito-vps]` contains a hyphen |
| E5 | Terraform `endpoint` **deprecated parameter** (backend s3) | terraform init | `infra/terraform/backend.tf` — already fixed to `endpoints.s3` by the user's commit `6c5d092` (merged); verified no warning in latest run — DO NOT touch |
| E6 | AWS CLI on VPS at `/opt/cogito-actions-tools/bin/aws`; noble dropped apt `awscli` | handled | #137 merged |
| E7 | Dependabot alerts (open) | 0 | clean |
| E8 | 100%-coverage gate still green; `console.warn` audit: only logger + tests | — | no stray runtime warnings on the server |

## Files per task

Task-by-task file map is inline in each task (Create/Modify/Test lines). No task touches another task's files except:
- Task 4 (re-bump) owns `package.json` + `bun.lock`; Task 1–3 own source tests/components.
- Task 5 (docs sync) touches only `docs/`.
- Worker file sets are disjoint (worker A: web components; worker B: api tests + workflows; worker C: ansible + monitoring).

---

## Task 1 — `tutor-drawer.tsx` refs-during-render refactor (45 hits → 0)

**Files:**
- Modify: `apps/web/src/components/tutor/tutor-drawer.tsx`
- Test: `bun run check-types` + vite build stays clean; manual smoke of the drawer.

**Interfaces:**
- Consumes: existing Selia components; the drawer's props/state as-is.
- Produces: same rendered output; refs only touched in handlers/effects (`useEffect` pre-commit hooks or `requestAnimationFrame` where needed).

- [ ] **Step 1: Inventory each of the 45 `react(refs)` sites**

Run: `bunx oxlint@1.80.0 apps/web/src/components/tutor/tutor-drawer.tsx`
Classify: (a) ref read inside JSX event-handler closure → OK once moved into event handler; (b) ref read during render for layout/scroll → move to `useEffect`; (c) ref used as a value in render output → convert to state.

- [ ] **Step 2: Fix per classification, run typecheck after each batch**

Run: `bun run check-types && bunx oxlint@1.80.0 apps/web/src/components/tutor/tutor-drawer.tsx`
Expected: errors count drops to 0 without behavior change.

- [ ] **Step 3: Verify the drawer still renders/functions (manual smoke)**

Run: `bun run dev:web`, open a tutor drawer, toggle sections, confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/tutor/tutor-drawer.tsx
git commit -m "fix(web): stop accessing refs during render in tutor-drawer"
```

## Task 2: Small react correctness fixes (purity / setState-in-effect, ~14 sites across 9 files)

**Files:**
- Modify: `apps/web/src/components/tutor/tutor-achievements.tsx` (2× refs), `availability-page.tsx` (2 purity + 1 setState-in-effect), `apps/web/src/components/booking/booking-detail-page.tsx` (2× purity), `booking-reschedule-action.tsx` (1), `booking-lifecycle-actions.tsx` (1), `manual-meeting-link-dialog.tsx` (1), `dashboard/student-dashboard-page.tsx` (1), `dashboard/pages/bookings-page.tsx` (1), `dashboard/pages/profile-page.tsx` (1), `dashboard/achievement-banner.tsx` (1), `content/calendar-month-view.tsx` (1), `admin/economy-settings-page.tsx` (1), `guide/guide-page.tsx` (1)

**Interfaces:** none change — internal-only refactors (Date.now in render → `useEffect`+state or the existing shared 30s clock; setState-in-effect → derive during render or initialize state).

- [ ] **Step 1: Fix `Date.now` in render** — hoist into a `useState(Date.now)` + shared 30s interval (the codebase already has a shared client clock for booking cards — reuse that pattern; find it via `rg "setInterval" apps/web/src/components/booking`
- [ ] **Step 2: Fix setState-in-effect** — one at a time: `bun run check-types`; if the effect mirrors props→state, derive during render; if it syncs an external system, keep in effect but move setState into the async path.
- [ ] **Step 3: Verify per file:** `bunx oxlint@1.80.0 <file>` → 0 errors; `bun run check-types` clean.
- [ ] **Step 4: Commit per logical group** (tutor / booking / dashboard / admin+guide).

## Task 3: Test-file non-null assertion cleanup (20 hits across 9 test files) — DONE 2026-08-31 (19 sites fixed; final wave PR)

**Files:** `packages/api/src/tests/integration/booking-{group-series,invite-withdraw,g4,g5,g6,g7,no-show-group}.test.ts`, `room-g14.test.ts`

- [x] **Step 1: Replace `x?.y!` with explicit guards that fail loudly** (DONE: 19 sites fixed, commit 2654e30)

```ts
// before
const booking = rows.at(-1)!.state;
// after (fail-loud, keeps the 100% gate green)
const booking = rows[rows.length - 1];
if (!booking) throw new Error("expected a booking row");
```

- [x] **Step 2: Targeted re-run per file** — suite green (local env-schema failure is pre-existing/environmental, verified on the base commit; CI is the authority).
- [x] **Step 3: Commit** — done (`2654e30 test(api): ... fail-loud guards`)

## Task 4: Deliberate toolchain re-bump (oxlint 1.78.0 → 1.80.0, oxfmt 0.63.0 → 0.65.0)

**Files:** `package.json`, `bun.lock`, plus any formatting fallout (`oxfmt --write`).

- [ ] **Step 1:** After Tasks 1–3 are merged to main: bump both deps, `bun install`, run `bunx oxlint` (expect **0 errors, warnings only**) and `bunx oxfmt --check` → fix formatting fallout with `oxfmt --write`.
- [ ] **Step 2: Commit**

```bash
git add package.json bun.lock . && git commit -m "chore(repo): re-bump oxlint to 1.80 / oxfmt to 0.65 after fixing all findings"
```

## Task 5: Warning-hygiene triage (E2 categories — config-level, lead-owned)

Decision (user principle: *correct & secure, no premature churn*), per category:
- `no-await-in-loop` (53): **intentional** — sequential money/DB writes; do NOT parallelize (money correctness). Add a category-wide comment in CI lint step docs, or demote in CI via `--config` if it can be scoped to tests; otherwise leave as warnings and document in CI-SANITY.
- `consistent-function-scoping` (35): triage only where the scoped function touches closures incorrectly; otherwise documented as style. No churn.
- `no-underscore-dangle` (13): leave (convention for `_`-prefixed internals).
- `prefer-add-event-listener` (11): fix `apps/web/public/tweaks-bar.js` mechanically (`el.onX = fn` → `addEventListener`). Low-risk, do it.
- `no-useless-constructor` (4), `no-shadow` (2), singletons (1 each): fix opportunistically in the same PR as tasks above.

- [ ] **Step 1:** Fix `tweaks-bar.js` addEventListener (11 warnings) + the 4 useless constructors + 2 shadows in the same worker PR as Task 2/3.
- [ ] **Step 2:** Document the *intentional* warning classes in `docs/plans/active/CI-SANITY.md` (F-list) so they never read as unsurfaced errors.
- [ ] **Step 3:** Commit + docs.

## Task 6: CI/Actions deprecation + hygiene (E3, E4)

**Files:** `.github/workflows/*.yml` (checkout v4→v7 where compatible), `infra/ansible/inventory.ini`.

- [ ] **Step 1: Bump `actions/checkout` v4 → v6** (v6 runs Node 24 by default, kills the Node-20 deprecation warning; v7 is out — adopt if the diff surface is safe; test on a docs-only PR first). Bump `oven-sh/setup-bun` → v2.2.0 tag. `fastify/github-action-merge-dependabot` → v3.15.0 (stays on v3 major).
- [ ] **Step 2: Fix the Ansible inventory group-name warning** — `[cogito-vps]` group name conflicts because ansible treats `-` in group names as invalid-in-older-versions; rename the group to `cogito_vps` (underscore) and update `playbook.yml`/`group_vars` references (`hosts: cogito-vps` → `cogito_vps`) OR silence with a documented inventory plugin setting. Prefer the rename — it's honest.
- [ ] **Step 3: Verify**: push a docs-only PR; CI run logs must contain **zero** "Node 20 is being deprecated" and zero "[WARNING]: Invalid characters".
- [ ] **Step 4: Commit + docs** (RUNBOOK/DEPLOYMENT workflow notes).

## Task 7: Docs sync (AGENTS.md rule 11)

Update in the same PRs as the code (workers do this per task): CONTEXT.md (lint-wave row in plans table, toolchain version), plans/README.md, CI-SANITY.md statuses, RUNBOOK (workflow versions). The lead verifies no doc references stale pin "1.78.0/0.63.0" after Task 4.

---

## Execution order & workers

| Order | Worker | Branch | Tasks | Files (overlap-safe) |
| --- | --- | --- | --- | --- |
| 1 | W1 `lint-drawer` | `f/lint-drawer` | Task 1 | `tutor-drawer.tsx` only |
| 2 | W2 `lint-web-misc` | `f/lint-web-misc` | Task 2 + Task 5 Step 1 (tweaks-bar, small fixes) | all other `apps/web/**` listed + `packages/api/src/tests/**` |
| 3 | W3 `ci-hygiene` | `ops/ci-deprecation` | Task 6 + Task 5 Step 2 docs | `.github/workflows/**`, `infra/ansible/inventory.ini`, docs |
| 4 | lead | `ops/lint-rebump` | Task 4 (after 1–2 merge) + final docs sync | `package.json`, `bun.lock`, plan docs |

Merge order: W1 → W2 → W3 → lead re-bump (each gated by CI green; the pin holds until Task 4 so every intermediate PR stays green).

## Exit gates

- `bunx oxlint@1.80.0` → 0 errors; warnings only from documented-intentional classes.
- `bunx oxlint` (1.78) → 123 → **< 40 warnings** (await-in-loop + scoping documented).
- CI run logs: **zero** "Node 20 is being deprecated"; **zero** "[WARNING]: Invalid characters".
- `bun run check-types` + full test suite + coverage gate green on every PR.
- Docs synced in the same PRs.

## Risks

- `tutor-drawer` refactor touches 45 sites — highest regression risk; mitigated by classification + typecheck after each batch + manual smoke.
- `Date.now`-in-render fixes can change timer behavior if the shared 30s clock pattern isn't reused correctly — verify countdown copy still ticks.
- Re-bump may surface NEW 1.80 rules not in today's inventory — triage them at Task 4 time (fix if trivial, else document + keep pin partial).
- Ansible group rename touches inventory + playbooks + group_vars in one atomic change (no partial states).