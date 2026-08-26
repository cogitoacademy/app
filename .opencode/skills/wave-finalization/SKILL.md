---
name: wave-finalization
description: Use when finishing a herd wave — after all worker branches are merged or rejected — to close worker panes, remove worker worktrees and branches, sync the plans/docs (move completed plans, update indexes), and leave the repo in a clean mergeable state. Also use before starting a new wave to verify no stale workers or worktrees remain.
compatibility: opencode
metadata:
  audience: ai-coding-agent
  workflow: finalization
---

# Wave Finalization

Finalize a herd wave: clean up workers, sync docs, verify the repo state. Run this AFTER every wave's PRs are merged (or rejected) and BEFORE starting a new wave.

## When to Use

- All worker PRs from the wave are merged (or closed) and you're about to start new work.
- You're asked to "remove and complete the workers that are not used" or "sync the docs".
- You suspect stale workers/worktrees from a previous wave are still around.

## 1. Verify all workers finished first

Never clean up a worker that is still working. Check each agent's state:

```bash
herdr agent list | python3 -c "import json,sys; [print(a['agent'], a['agent_status'], a['pane_id']) for a in json.load(sys.stdin)['result']['agents']]"
```

- `working` → the worker is still active; do NOT close its pane. Wait for `idle`/`done` or interrupt deliberately.
- `idle` / `done` → finished; safe to close.
- `blocked` → resolve (approve or answer) before closing.

## 2. Close finished worker panes

Only close workspaces you created for this wave (from `herd-spawn-worker`). Never close the lead's own pane (the one with `opencode` in the list and your session's cwd) or panes you didn't create.

```bash
herdr workspace close <workspace-id>   # e.g. wY — parse IDs from herdr agent list output
```

Verify after closing: `herdr agent list` should show only the lead agent (plus any panes the user owns).

## 3. Remove worker worktrees + branches

```bash
git worktree list          # identify the wave's worktrees
git worktree remove --force <path>   # --force when WORKER-REPORT.md etc. are untracked
git worktree prune
git branch -d <worker-branch>        # -D if not fully merged (content already squash-merged)
git fetch origin --prune
```

Rules:

- Worker branches are never merged directly; their content lands via the lead's clean PR (squash). So `-d` may refuse → `-D` is fine.
- Do NOT remove worktrees/branches that predate your session (the user's own checkouts) — ask first.
- Do not delete remote branches that never existed; only prune.

## 4. Sync the docs (AGENTS.md rule 11 — docs follow code)

For every merged PR this wave:

1. Move the plan from `docs/plans/active/` → `docs/plans/completed/` (if it's a one-shot plan): `git mv`.
2. Update the plan's status header: `Status: Active` → `Status: Completed (merged #<PR>, <date>)`; correct the branch column.
3. Update `docs/plans/README.md`:
   - Remove the plan from the Active table.
   - Add it to the Completed table with branch + PR + one-line summary.
4. Update `docs/CONTEXT.md`:
   - The Plans table row for the plan.
   - The Execution Order list (append `N. <plan> → merged #<PR>`).
   - The Known Bugs / audit-findings section: mark findings `Fixed (merged #<PR>)`, move `docs/plans/active/...` references to `completed/`.
5. Commit: `docs(plans): mark <plan> completed (merged #<PR>)`.

Push: `git push origin main`. If the pre-push hook fails (lefthook typecheck), run `bun install` first (merged PRs may have changed the lockfile) and re-push.

## 5. Verify the wave is done

```bash
git status -sb                 # clean except pre-existing local modifications
git worktree list              # only pre-existing worktrees remain
gh pr list --state open        # no unmerged wave PRs left
gh run list --limit 5          # no red runs on the wave's branches
```

## Common Mistakes

| Mistake                                                          | Fix                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Closing a `working` worker's pane                                | Check `agent list` first; only close `idle`/`done`             |
| Closing the lead's own pane                                      | The lead pane is `opencode` with your cwd — never close it     |
| Removing user-owned worktrees                                    | Ask before touching worktrees that predate the session         |
| Docs still reference `docs/plans/active/<plan>` after completion | Grep for the plan name in CONTEXT + README and update all rows |
| Pre-push hook fails after merge                                  | `bun install` (lockfile drift) then push again                 |

## Real-World Impact

Wave finalization for the Cogito backend waves (PR #106, #107): 7 worker panes closed, 7 worktrees removed, 3 plans moved to `completed/`, indexes and CONTEXT updated — the repo was left clean and mergeable for the deployment wave.
