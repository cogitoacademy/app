# Windows TypeScript-Go memory reliability

## Status

Implementation and focused workspace verification are complete; review and
merge remain open.

## Plan

- [x] Limit every TypeScript-Go package check to one checker.
- [x] Serialize root Turbo typecheck tasks.
- [x] Run the existing pre-push typecheck and lint baseline sequentially.
- [x] Record the Windows workaround in the runbook and codebase context.
- [x] Run the full workspace typecheck once after the change.

## Verification

`bun run check-types` passed in this worktree: 4/4 uncached tasks, 12.832
seconds. The parent measured the web check at 6.51 seconds with one checker;
the default four-checker invocation exhausted memory.

This is a compiler-memory guard only. It does not claim browser, database,
provider, or release acceptance.
