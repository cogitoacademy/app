# WORKER-REPORT — docs-ops Important Logs (w/docs-ops-important-logs)

Branch: `w/docs-ops-important-logs` (from `origin/main`, worktree
`/Users/miapalovaara/cogito/app/.worktrees/w/docs-ops-important-logs`).
Skill: `production-reliability` loaded and followed (stateless board/alert
files; no prod/Coolify/SOPS touch; observability = Loki boot/gate panels +
Prometheus app_info stat + existing Discord-ops alerts).

## What changed

1. **Rewrote the stale UAT-GATE plan to Important Logs**
   (`docs/plans/active/MIDTRANS-UAT-GATE.md`): 7-panel board + separate
   Payment Logs dashboard framing replaced with 10-panel Important Logs
   framing; T3 (`ProdOnStub` uid `prod-on-stub`, `TestModeRestrictedSpike`
   uid `test-mode-restricted-spike`, zero-safe `or vector(0)`,
   `noDataState: OK`) and T4 (env uniqueness guard
   `Fail loud on duplicate Coolify env rows`) recorded as merged evidence,
   not rebuilds; `KeepLast` banned everywhere (latch root cause);
   `schemaVersion: 39`, Loki uid `loki`, `allowUiUpdates: false` locked.
2. **Added the 3 missing payment panels to the Important Logs board**
   (`infra/grafana/provisioning/dashboards/important-logs.json`, 7 → 10
   panels): id 8 boot-line `payment_provider_configured` logs, id 9
   `PAYMENT_TEST_MODE_RESTRICTED|FORBIDDEN` stream (regex `|~` matching
   board convention), id 10 `app_info` stat
   (`{{provider}}/{{provider_mode}} {{version}}`, NoData-safe
   `no app_info yet — backend dependency`). Restored exprs/legends from the
   deleted `payment-logs.json` (git `0a23d860^`); gridPos continues at
   y=64/72/80; description updated.
3. **Surgical docs (AGENTS.md rule 11):** `docs/plans/README.md` Active entry
   added; `docs/RUNBOOK.md` Important Logs section 7 → 10 panels, stale
   "payment panels are gone" replaced with panels 8–10 truth (+ panel-list
   enumeration touch-up); `docs/CONTEXT.md` top section panel list updated;
   `docs/MIDTRANS-MIGRATION.md` §4 + `docs/API-REFERENCE.md` Midtrans block
   point at the Important Logs payment panels. No `packages/api`,
   `packages/db`, `apps/server` changes (sibling worker owns the backend
   `app_info` metric contract).

## Files (scope = 7 files, nothing else)

- `docs/plans/active/MIDTRANS-UAT-GATE.md` (rewrite)
- `infra/grafana/provisioning/dashboards/important-logs.json` (modify, +3 panels)
- `docs/plans/README.md` (Active entry)
- `docs/MIDTRANS-MIGRATION.md` (1 pointer)
- `docs/API-REFERENCE.md` (1 pointer)
- `docs/RUNBOOK.md` (Important Logs section + enumeration)
- `docs/CONTEXT.md` (panel list)

## Commits

- `4965fbc8` docs(obs): restore payment panels on Important Logs board + rewrite UAT-GATE plan (pushed to `origin/w/docs-ops-important-logs`)

## Verification evidence

- `python3 -m json.tool
  infra/grafana/provisioning/dashboards/important-logs.json` → OK (10
  panels ids 1–10, `schemaVersion` 39, Loki uid `loki` on logs panels).
- `bun run lint` → 0 errors, 121 warnings (all pre-existing in untouched
  code; touched docs/json are lint-silent → zero NEW issues).
- Stale-claim scan: no touched section creates/points at a Payment Logs
  board; remaining "Payment Logs" strings are historical/qualified
  (replaces/stays-deleted/completed-plan records). No `payment-logs.json`
  creation refs; one accurate historical ref in RUNBOOK.
- `KeepLast` scan: plan mentions are ban statements only; board json has
  none. `rules.yaml` / `env.yml` untouched (evidence-only per brief).
- `git status --short` shows only the 7 scope files.

## Remains / blocked questions

- None blocked. Operator live-verify (next session, not this worker):
  Grafana Cogito folder shows Important Logs with 10 panels; boot line
  renders `provider=midtrans midtransMode=test`; `app_info` stat shows live
  provider/mode (until sibling worker ships the metric, stat shows the
  NoData-safe text — expected); both payment alerts evaluate OK; dupe env
  row fails loud per RUNBOOK dedupe procedure.
