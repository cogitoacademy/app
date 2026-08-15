# Engineering Agent Instructions

This repository uses OpenCode skills for engineering behavior.

Before non-trivial coding, review/load the relevant skills:

- `engineering-core` for engineering principles, architecture, failure handling, security, testing, and observability.
- `feature-workflow` for the deterministic implementation workflow.
- `code-review` when reviewing code/diffs/PRs.
- `git-pr-workflow` for commits and pull requests.
- `parallel-worktrees` whenever dispatching concurrent write-capable agents/subagents.
- `production-reliability` for production, infrastructure, persistence, deployment, or reliability work.

## Mandatory workflow

For normal feature/bug/refactor work:

1. Inspect the repository and existing conventions.
2. Plan internally.
3. Code.
4. Test.
5. Lint/format.
6. Type-check/build.
7. Review duplication.
8. Review the complete diff.
9. Commit using Conventional Commits.
10. Create a PR when appropriate.
11. Wait for required CI to become green.
12. Fix CI failures and repeat verification.
13. Do not declare completion while required checks are failing.

## Parallel work

If write-capable agents/subagents run concurrently, use separate Git worktrees and branches. Never let concurrent agents modify the same working directory.

## Questions

Do not ask questions that can be answered by inspecting the repository. Ask only when ambiguity materially affects correctness, security, architecture, data integrity, compatibility, or user intent.
