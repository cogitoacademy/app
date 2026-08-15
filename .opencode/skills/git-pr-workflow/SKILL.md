---
name: git-pr-workflow
description: Git and pull-request discipline for AI coding agents. Enforces clean diffs, Conventional Commits, safe branch handling, descriptive PRs, and waiting for required CI checks before completion.
compatibility: opencode
metadata:
  audience: ai-coding-agent
  workflow: git
---

# Git and PR Workflow

## Branch Safety

Before changing files:

- inspect current branch;
- inspect working tree;
- inspect existing uncommitted changes;
- never overwrite unrelated user work.

Do not reset, checkout, clean, stash, or otherwise destroy user changes unless explicitly authorized.

Prefer creating a feature/fix branch when the repository workflow requires it.

## Diff Discipline

A commit must contain only related changes.

Before commit:

- inspect `git status`;
- inspect staged diff;
- inspect unstaged diff;
- remove accidental changes;
- verify generated files are intentional;
- verify no secrets are included.

Never commit:

- `.env` secrets;
- private keys;
- credentials;
- tokens;
- unrelated local files.

## Conventional Commits

Use:

`type(scope): description`

Allowed common types:

- `feat`
- `fix`
- `refactor`
- `test`
- `docs`
- `perf`
- `build`
- `ci`
- `chore`
- `revert`

Examples:

`feat(auth): add refresh token rotation`

`fix(worker): prevent duplicate job execution`

`refactor(db): isolate transaction boundary`

Scope should identify the domain/package/subsystem.

Use a body when the reason or migration consequence is non-obvious.

## Commit Strategy

Prefer coherent commits.

Do not create dozens of meaningless commits.

Do not amend/rewrite history that the user may already have pushed unless explicitly requested.

## Pull Requests

PR title should follow the project's convention; otherwise use a concise Conventional Commit-style title.

PR body:

### Summary

What changed.

### Why

Problem and motivation.

### Implementation

Important technical decisions.

### Testing

Exact checks/tests performed.

### Risks

Known risks and tradeoffs.

### Rollback

How to revert or recover, especially for migrations/infrastructure.

### Notes

Operational/configuration/deployment considerations.

## CI

After PR creation:

- wait for required checks;
- inspect failures rather than guessing;
- reproduce locally when practical;
- fix failures;
- rerun local verification;
- push;
- wait again.

A PR with red required CI is not complete.

Never weaken or bypass tests merely to make CI green.

## Merge

Do not merge unless explicitly authorized by the user's workflow.

If the repository requires human approval, stop after CI is green and report that approval is pending.
