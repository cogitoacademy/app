# WORKER-REPORT — f/dlq-age-health

**Worker:** worker-feature (glm-5.3-flash) · **Branch:** `f/dlq-age-health` (base `15d1c5d`) · **Commit:** `6f9d762` · **Date:** 2026-08-31

## What changed

Scope item 3 of `docs/plans/active/MONITORING-ALERTING.md` (folded into `CI-SANITY.md` fix 6): `/health` `dlqDepth` now reports **fresh failures only** (default 24h window), so the stale 2026-08-25 ledger no longer trips the alert forever. Alert hygiene, not data loss — the full ledger stays in Redis.

| File | Change |
| --- | --- |
| `packages/api/src/lib/db-health.ts` | `checkDlqHealth` now computes fresh depth atomically in Lua (LRANGE bounded to 100 + `cjson.decode` + `failedAt > cutoff`). New exports: `DLQ_FRESH_WINDOW_MS` (24h default) and env override `DLQ_FRESH_WINDOW_HOURS` (plain `parseInt`; blank/invalid/`<=0`/>1-year values fall back to 24h; resolved at call time). `InMemoryRedis` instances short-circuit to 0 (fallback store keeps no lists; its `eval` throws — kept before the eval path so `healthCheck`'s degraded-mode check stays `"ok"`, matching the old `llen` behavior). Redis errors still → `-1`. |
| `packages/api/src/modules/scheduler/scheduler.service.ts` | DLQ push payload now includes `failedAt: Date.now()` (epoch ms) stamped at push time, spread **before** `...job.data` so a pre-existing payload field wins (override-guard). `DLQ_LIST_KEY` exported for future consumers. `DLQ_PUSH_LUA` (LPUSH+LTRIM) unchanged. |
| `packages/api/src/tests/unit/db-health.test.ts` | 33 tests: fresh counted (default + custom key), 100-stale-ledger → 0, missing/`null failedAt` excluded, empty list → 0, boundary (exactly 24h old = **stale**, strict `>`; documented), env override widens window, invalid env values (`not-a-number`/`-4`/`0`/`99999`) fall back to 24h, blank env → default, Lua path (script/argv capture: `LRANGE`, `cogito:dlq`, bound `100`, cutoff ≤ now−24h), eval-throw → `-1`, no-redis → 0, InMemoryRedis → 0, `healthCheck` wiring unchanged (dlq alert-only). |
| `packages/api/src/tests/unit/scheduler.service.test.ts` | DLQ-worker push test now asserts the entry JSON carries numeric `failedAt ≥` push time plus payload passthrough; new test pins the spread-order guard (payload-supplied `failedAt` is preserved). |
| Docs (rule 11) | `API-REFERENCE.md` — added missing `GET /health` section with the fresh-depth contract; `RUNBOOK.md` Redis/DLQ section — fresh-depth semantics, boundary rule, env override, `ops.sh dlq`/`dlq-clear` unaffected; `CONTEXT.md` — health line updated; `MONITORING-ALERTING.md` — item 3 marked **DONE** + status log; `CI-SANITY.md` — fix 6 marked done; `plans/README.md` — MONITORING-ALERTING row updated (branch `f/dlq-age-health`). |

## Data-flow notes (verified before changing)

- **Push path:** `worker.on("failed")` (attempts exhausted) → `dlqQueue.add(name, {originalJobId, attemptsMade, failedReason, data})` → DLQ worker → `cogitoDlqPush` (LPUSH + LTRIM 0..99) on `cogito:dlq`, payload = `JSON.stringify(job.data)`. **The payload had NO timestamp** — `failedAt` added at push time per task 3, backward-compat rule implemented (missing `failedAt` = stale) and documented in code comments + tests + docs.
- **Read path:** `checkDlqHealth` → `healthCheck` (`checks.dlq` + `dlqDepth`, excluded from overall status) → `apps/server/src/routes.ts` `/health` spreads the result. **No route change needed** — `dlqDepth` stays a `number` (semantics-only change); `-1` (unknown) keeps the existing `error` mapping.
- **Env:** `DLQ_FRESH_WINDOW_HOURS` is read via `process.env` inside the health module (plain `parseInt`) — no `packages/env` schema change, per task allowance.
- **Rolling-deploy safety (escalation criterion considered, NOT triggered):** during a rolling deploy, old-version workers push entries **without** `failedAt`. Those are treated as stale, so a genuine ongoing failure stream on an old pod would **not** raise `dlqDepth` until all instances run the new image. Accepted per task instruction (missing-`failedAt` must never count); noted here so the lead can schedule the normal CD rollout right after merge. Redis-server-side mixed entries coexist safely (the Lua filter is per-entry).
- `llen` is now unused by `checkDlqHealth` but remains on the `RedisClient` interface (other consumers/tests use it) — no interface change.

## Verification outputs

| Check | Result |
| --- | --- |
| `bun run check-types` | ✅ clean (turbo: 3 successful) |
| `bun test .../unit/db-health.test.ts + scheduler.service.test.ts` | ✅ **53 pass, 0 fail** (111 expects) |
| Full unit suite `bun test packages/api/src/tests/unit/` | ✅ 1954 pass / 1 fail — the 1 failure is `verification-gate.test.ts` ("NOT_FOUND tutor"), **pre-existing on the clean base commit** (verified via `git stash` re-run) and requires the seeded test Postgres; unrelated to this change. CI runs with its Postgres service and a db-preparing flow. |
| `bun run lint` (oxlint) | ✅ 0 findings in all changed files (remaining warnings pre-exist in `apps/web/public/tweaks-bar.js`) |
| `oxfmt --write` on all changed files | ✅ applied; lefthook lint+format hooks passed at commit |
| Coverage gate | New lines are fully exercised (happy paths, error paths, all env branches, both redis/fallback paths); full 100%-gate run happens in CI per workflow. |

## BLOCKED-QUESTIONs

None. One decision made within given constraints (documented above and in code): **window boundary** — an entry exactly 24h old counts as **stale** (strict `failedAt > cutoff`); the +1ms-fresh / exactly-at-edge / −1ms-stale triad is pinned by test.

## Remaining (out of my scope, already tracked)

- MONITORING-ALERTING items 1–2 (Uptime Kuma + Discord webhook) — deferred as planned; the `dlqDepth` monitor can now alert on real failures as soon as Kuma lands.
- CI-SANITY F-fixes 1–5, 7 (`.github/` etc. — not touched per file-ownership rules).