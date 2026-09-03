# LOG-CONSOLIDATION-PAYMENT-UX

**Status:** Active (2026-09-03)

## Goal

Two operator-visible fixes from the 2026-09-03 deployment review:

1. **Log consolidation** — one structured JSON log line per HTTP request
   (method, path, status, requestId, durationMs, userId) instead of the
   current scattered evlog + app-logger + rpc_error lines that cannot be
   correlated in Coolify.
2. **Payment error UX** — purchase failures surface a human-readable toast,
   and Explorer/Pioneer packages are labeled in Xendit Test Mode (their
   amounts exceed the Test Mode cap of ~IDR 1,000,000; all packages work in
   Live Mode).

## Background / evidence

### Scattered logs (confirmed 2026-09-03, production)

`apps/server/src/routes.ts` emits three separate lines per request:

| Line | Source | Has | Missing |
| --- | --- | --- | --- |
| `{method, path, status, environment}` | evlog Elysia plugin (`.use(evlog())`, line 163) | method/path/status | correlatable requestId (uuid, different format) |
| `{action:"request_complete", requestId, durationMs}` | `.onAfterHandle` (line 170) | `req_…` requestId | method/path/status |
| `{action:"rpc_error", error:{code,message}}` | `logRpcError` (line 105) | code/message | requestId, path, userId |

The `rpc_error` line cannot be joined to its request, so a `CONFLICT`/warn
cannot be traced to the user or endpoint. The user's desired shape: one line
with path, statusCode, description, requestId, requestClient (userId).

### Payment error UX (confirmed 2026-09-03)

- `balance-page.tsx` purchase mutation has `onSuccess` but **no `onError`** —
  failures are silent.
- Xendit Test Mode rejects payment requests above ~IDR 1,000,000:
  - Starter Rp 312,500 ✅ · Learner Rp 690,000 ✅
  - Explorer Rp 1,070,000 ❌ `SERVICE_UNAVAILABLE` · Pioneer Rp 2,000,000 ❌
  - QRIS channel limit is 1–10,000,000 IDR (Xendit docs), so this is a
    **Test Mode cap**, not a channel limit. Live Mode accepts all four.
- Decision (operator, 2026-09-03): **label** Explorer/Pioneer in Test Mode
  rather than hide them.

## Tasks

### Task 1 — Log consolidation (worker: log-worker, branch `wave/log-consolidation`)

- One consolidated `request_complete` line: method, path, status, requestId,
  durationMs, userId (when available).
- `rpc_error` lines carry the same requestId + path.
- Suppress/merge evlog's per-request line while keeping `identifyUser`
  enrichment (evlog options in `apps/server/node_modules/evlog/dist/elysia/`).
- Keep structured JSON-per-line format (Coolify renders these).
- Tests: `packages/api/src/tests/unit/logger.test.ts` + server tests; 100%
  coverage gate on packages/api.

### Task 2 — Payment error UX (worker: payment-ux-worker, branch `wave/payment-error-ux`)

- `onError` toast on the purchase mutation via `toastManager` +
  `getUserFacingError`.
- Test Mode label on Explorer/Pioneer cards, driven by a client-visible mode
  signal (minimal server change if none exists — e.g. `xenditMode` in the
  packages list response), with tests.

### Task 3 — Docs sync (lead)

- New plan `docs/plans/active/LOG-CONSOLIDATION-PAYMENT-UX.md` (this file).
- Fix stale docs (see below).
- Update `docs/plans/README.md` + `docs/CONTEXT.md` statuses.

## Stale docs found (2026-09-03)

| Doc | Stale content | Reality |
| --- | --- | --- |
| `docs/plans/README.md` → INFRA-AUTOMATION row | "Wave 2 … awaiting operator: SOPS_AGE_KEY secret + runner-prep.sh" | **Wave 1 + Wave 2 LIVE (2026-09-02)** — infra-apply green end-to-end (run 33613824234) |
| `docs/plans/README.md` → LINT-DEPRECATION-HYGIENE row | "oxlint pin stays 1.78/0.63" | **1.80.0** — `package.json` pins 1.80.0; `.github/lint/check-baseline.sh`/`.ts` use `oxlint@1.80.0`; CI-SANITY F13 documents 1.80.0/0.65.0 |
| `docs/CONTEXT.md` plans table | WAVE-6-REVIEW-FIXES / PRD-GAPS-PHASE3 / CONTACT-SHARING rows link `docs/plans/active/` | Files live in `docs/plans/completed/` |
| `docs/plans/active/DEPLOYMENT-PLAN.md` | "Remaining: Uptime Kuma + Discord … operator console bits pending" | MONITORING-ALERTING **DONE (2026-09-02)** — Kuma wired (4 monitors + Discord + status page) |

## Verification

- `bun run test` (full suite) + coverage gate (100% packages/api lines).
- `bun run check-types`, `bun run check` (oxlint + oxfmt).
- PR → CI green → squash-merge → auto-deploy; `/health` version == merged sha.

## Status log

- 2026-09-03: Created. Workers spawned (log-worker, payment-ux-worker) in
  herdr worktrees. Repurchase (#188) and sanitized provider errors (#185)
  already merged — out of scope.
