---
name: parallel-worktrees
description: Safe parallel-agent workflow using isolated Git worktrees. Use whenever multiple agents/subagents are dispatched to independent tasks that modify the same repository or could otherwise collide.
compatibility: opencode
metadata:
  audience: ai-coding-agent
  workflow: parallel-development
---

# Parallel Worktrees

When multiple agents/subagents are working concurrently on the same repository, isolate each write-capable task in its own Git worktree.

## Core Rule

If two agents can modify files concurrently, they MUST NOT share the same working directory.

Use:

`git worktree add <path> -b <branch> <base>`

Each agent receives:
- its own worktree;
- its own branch;
- a clearly scoped task;
- only the files/components it owns when practical.

## Before Dispatch

1. Inspect repository status.
2. Establish a clean or deliberately preserved base.
3. Split work by ownership boundaries.
4. Identify dependencies between tasks.
5. Create one worktree per write-capable parallel task.
6. Give each subagent its worktree path and branch.

Do not parallelize tightly coupled edits merely for speed.

## Branch Naming

Use descriptive names such as:

- `agent/feature-auth`
- `agent/fix-payment-timeout`
- `agent/refactor-repository`
- `agent/test-order-flow`

Avoid ambiguous names.

## Isolation

Each agent must:
- operate only in its assigned worktree;
- commit its changes independently;
- not reset or clean another worktree;
- not modify another agent's branch;
- report its commit SHA and summary.

## Integration

After agents finish:

1. Review each branch.
2. Run tests for each contribution.
3. Integrate in dependency order.
4. Resolve conflicts deliberately.
5. Run the full verification suite after integration.
6. Create the final PR from the integrated branch.

Do not blindly cherry-pick conflicting changes.

If changes are independent and the repository workflow supports multiple PRs, prefer separate PRs.

## Shared Resources

Worktrees isolate files, not external resources.

Avoid parallel agents simultaneously modifying:
- the same database;
- the same generated artifacts;
- shared deployment environments;
- shared cloud resources;
- the same lockfile unless coordinated.

For integration tests requiring mutable external resources, use isolated resources or serialize the tests.

## Cleanup

After integration and when no longer needed:

`git worktree remove <path>`

Then prune stale metadata when appropriate:

`git worktree prune`

Do not remove a worktree containing unmerged work.

## Failure

If an agent becomes stuck:
- preserve its branch/worktree;
- inspect its changes;
- do not destroy its work to unblock another agent;
- reassign only after determining what can safely be reused.

The goal is deterministic parallelism, not maximum concurrency.
