---
name: feature-workflow
description: "Use when implementing features, bug fixes, or refactors in a deterministic workflow: inspect, plan, code, test, format/lint, type-check, detect duplication, commit with Conventional Commits, create a PR, and wait for CI before declaring completion."
compatibility: opencode
metadata:
  audience: ai-coding-agent
  workflow: feature-development
---

# Feature Workflow

Use this workflow for feature work, bug fixes, refactors, and non-trivial changes.

## 0. Load Context Before Coding

Before editing:

1. Read repository instructions.
2. Inspect relevant architecture.
3. Find existing implementations.
4. Identify tests and CI commands.
5. Identify the expected acceptance criteria.
6. Determine whether the task is local or cross-cutting.
7. Identify risks and failure modes.

If the task is ambiguous in a way that affects correctness or architecture, ask before coding.

## 1. Plan

Create a concise internal implementation plan.

Include:
- files/components likely affected;
- behavior to change;
- tests required;
- migrations/config changes;
- observability implications;
- security implications;
- rollback/compatibility considerations.

Do not over-plan trivial changes.

## 2. Code

Implement the smallest complete solution.

Rules:
- follow existing project conventions;
- do not invent dependencies unnecessarily;
- preserve backward compatibility unless explicitly changing it;
- validate boundaries;
- make errors observable;
- handle failure paths;
- keep functions/modules cohesive;
- avoid unrelated changes.

If you discover an architectural improvement outside the task, do not silently expand scope. Ask before a large refactor.

## 3. Test

Run the most targeted tests first, then the broader suite.

At minimum:
- new/changed behavior has tests;
- regression cases are covered;
- failure paths are covered where relevant.

If tests cannot be run, determine why and report it. Do not claim success without evidence.

## 4. Lint and Format

Run the repository's configured formatter and linter.

Prefer project scripts over manually invented commands.

If formatting modifies files, inspect the diff.

Lint errors must be fixed unless explicitly justified.

## 5. Type Check / Compile

Run the project's type checker or compiler.

Examples:
- TypeScript: project typecheck command / `tsc --noEmit`
- Go: `go test`, `go vet`, or project-specific checks as appropriate
- Rust: `cargo check`
- Python: configured type checker where the project uses one
- C/C++: project build and static analysis

Use the project's actual tooling first.

## 6. Duplication Review

Before committing:

- search for duplicate implementations;
- search for existing helpers/utilities;
- compare similar code paths;
- determine whether a shared abstraction is warranted.

Do not over-abstract merely to eliminate textual similarity.

## 7. Review the Diff

Inspect:

- `git diff`;
- changed files;
- accidental debug code;
- secrets;
- generated files;
- unrelated modifications;
- migrations;
- API compatibility;
- error paths;
- logs;
- tests.

The diff is the artifact being reviewed, not your memory of what you changed.

## 8. Final Local Verification

Run the complete relevant verification suite:

1. tests;
2. lint;
3. format/check;
4. type check/build;
5. relevant security/static analysis;
6. project-specific checks.

Do not skip a check merely because an earlier targeted check passed.

## 9. Commit

Use Conventional Commits.

Format:

`type(scope): imperative description`

Examples:

- `feat(auth): add refresh token rotation`
- `fix(payment): prevent duplicate charge retries`
- `refactor(repo): isolate transaction handling`
- `test(order): cover expired reservation`
- `docs(api): document pagination contract`
- `chore(ci): cache dependency downloads`

The scope should identify the affected subsystem/package/domain.

Commit message requirements:
- concise;
- descriptive;
- explains intent, not implementation trivia;
- imperative mood;
- no vague messages such as `update`, `fix stuff`, `changes`, or `wip`.

Do not commit unrelated changes.

## 10. Pull Request

Create a PR after local verification and commit.

PR must include:
- summary;
- why the change is needed;
- implementation overview;
- tests performed;
- risks/tradeoffs;
- migration/configuration notes;
- rollback considerations when relevant.

## 11. CI Gate

After opening the PR:

1. Wait for CI.
2. Inspect all required checks.
3. If CI fails, diagnose the failure.
4. Fix it.
5. Re-run local checks.
6. Commit the fix.
7. Push.
8. Wait for CI again.

Do not declare completion while required CI checks are failing or unknown.

Do not bypass required checks merely to merge.

## 12. Completion

Only declare the task complete when:

- implementation is complete;
- tests pass;
- lint/format passes;
- type check/build passes;
- duplication review is complete;
- diff is clean;
- Conventional Commit exists;
- PR exists when requested/appropriate;
- required CI is green.

If external approval is required after CI is green, stop there and report the state.
