# Bun 1.3.14 partitioned coverage limitation

## CI collector replacement (PR #332)

The native Bun issue below remains reproducible. CI collects source-bound Istanbul counters through an explicit Bun preload and merges those before generating LCOV, instead of trying to reconstruct missing native function identities. The original strict LCOV validator and 100% gates remain. Fixed source inventory includes unloaded/mocked production modules at zero, excludes test directories and test support files, hashes source content and retains real branch counters. Collector regressions prove complementary partitions reach 100%, while missing execution, stale profiles and invalid counters fail closed. Hosted run 40650577439 still fails the gate at API/overall lines 92.9%, functions 95.5%, and branches 83.1%; these are measured uncovered counters from the current collector, not the historical native report below. See RUNBOOK for commands and reset safety.

Observed on Linux, 28 October 2026, with Bun 1.3.14 (`0d9b296a`). This is a coverage-reporting blocker, not a waiver of the unchanged 100% release gate.

## Reproduction

Use this `handler.ts` in a disposable directory:

```ts
type Context = { actor: string };
async function run<T>(operation: () => T): Promise<T> {
  return operation();
}
export function createHandler() {
  return {
    create: ({ input, context }: { input: string; context: Context }) =>
      run(() => `${context.actor}:${input}`),
    remove: ({ input, context }: { input: string; context: Context }) =>
      run(() => `${context.actor}:${input}`),
  };
}
```

Use this `handler.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createHandler } from "./handler";
test("executes selected partition", async () => {
  const methods =
    process.env.REPRO_METHOD === "both"
      ? (["create", "remove"] as const)
      : ([
          process.env.REPRO_METHOD === "remove" ? "remove" : "create",
        ] as const);
  for (const method of methods) {
    expect(
      await createHandler()[method]({
        input: "guide",
        context: { actor: "admin" },
      }),
    ).toBe("admin:guide");
  }
});
```

Run `bun test --coverage --coverage-reporter=lcov` separately with `REPRO_METHOD=create` and `REPRO_METHOD=remove`, snapshotting each `coverage/lcov.info`. Merge those snapshots with `.github/scripts/merge-lcov.ts`. For the control, run the same test once with `REPRO_METHOD=both`. Use an isolated config without collection thresholds for the individual reproduction partitions; do not change repository release thresholds.

| Measurement                 | Lines | Functions       |
| --------------------------- | ----- | --------------- |
| Each separate partition     | 9/16  | 4/5             |
| Merged separate partitions  | 12/20 | lower-bound 4/5 |
| Both actions in one process | 12/12 | 5/5             |

The separate profiles contain zero-hit records for type-annotation lines 8-11 and 16-19. Those lines disappear from the profile when the corresponding action executes. Bun also emits function summaries without named function identities, so taking the maximum FNH cannot establish the union of the two exercised actions. The merger conservatively retains these unknowns; neither deleting zero-hit records nor summing function hits would be a trustworthy fix.

The same pattern was observed in `content-admin.handler.ts`: the main partition omits type lines 22-25 after exercising create, while fixture/payout profiles retain zero-hit records for those lines. Some real untested behavior remains too; this reproduction does not establish that every reported gap is artificial.

## Release evidence and next gate

### Current PR #332 run (28 October 2026)

Hosted run 40671516167 on `d7f70efb` completes all three API coverage partitions and the separate server unit suite, then fails the unchanged 100% thresholds at API lines 9931/10515 (94.4%), overall lines 10270/10877 (94.4%), functions 2672/2766 (96.6%) and branches 7431/8757 (84.9%). The collector artifacts contain complete partitions and function identities; this is a genuine remaining-coverage result, not a failed collection. Focused FAQ rich-text and payment-handler tests bring each of those source files to 100% lines/functions/branches under the counter preload, but the merged gate remains open. Build, lint, type-check and CodeQL pass on this head; E2E is excluded from the requested gate.

The local Linux run from `ae6b258b` plus the focused Redis/content/storage/referral test changes passes 3,116 resettable cases (8,464 assertions), 88 reset-free fixture cases (774 assertions), 11 payout cases (105 assertions), and 156 server cases (409 assertions). The T05-only server case is separately proven on its guarded target: 1 case / 7 assertions, with rollback. All four typecheck tasks and the lint baseline pass. Web/server build passes with real Node 24.22.1, Bun 1.3.14, serial Turbo, a 3 GiB Node heap and a 5 GiB container limit; one build task is cached. Initial Bun-node-fallback and undersized-heap build attempts failed and are not counted as passes.

The merged report still fails: API lines 39,109/44,655 (87.6%), overall lines 40,489/46,096 (87.8%), function lower bounds 3,195/3,370 (94.8%), and 45 sources with unidentified uncovered functions. The branch reporter emitted 0/0; this is not proof of branch coverage. Gate thresholds and strict LCOV validation remain unchanged.

Local evidence is retained under ignored `tmp/`: `v3-linux-coverage-final.log`, `v3-linux-coverage-gate-final.log`, `v3-linux-coverage-final/`, `v3-linux-server-final.log`, `v3-linux-typecheck-final.log`, `v3-linux-build-node-final.log`, `v3-referral-usage-live.log`, and `v3-bun-coverage-repro/` (raw separate/control/merged profiles). The first concurrent build/coverage attempt interrupted Docker Desktop and is invalid; successful tests were rerun serially with memory limits.

Before declaring this gate complete, select and validate a collector/runtime that preserves stable executable-line denominators and function identities across partitions, then address the remaining genuine uncovered behavior. Do not relax the 100% policy, rewrite domain code merely to change coverage spans, or treat synthetic storage-adapter tests as real private-R2 acceptance. Hosted CI on the final integrated head, provider delivery/reconciliation, production restore/cutover and named client UAT remain separate gates.
