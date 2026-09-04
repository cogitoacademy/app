# Backend + Infra Tidy — Plan

| Field      | Value |
| ---------- | ----- |
| Status     | **Active (2026-09-04)** — one behavior-preserving refactor PR: server route split, typed webhook errors, booking service split, package/infra READMEs, docs sync |
| Created    | 2026-09-04 |
| Branch     | `refactor/backend-infra-tidy` |
| Depends on | #190 (CI dependabot fix) + #193 (semantic-pr docker type) merged; main `908bad1` |

## Why

`apps/server/src` has no README and `routes.ts` is 589 lines mixing 9 inline
rate-limiters, middleware, and 14 handlers; `booking.service.ts` is 4,728
lines; `lib/storage.test.ts` mixes tests with sources; `tutor-subjects` is a
1-file module; no package has a README; `infra/` scripts repeat boilerplate;
several docs are stale (Caddy wording, CI-SANITY statuses, plans table,
vault example missing Midtrans, FAILURES.md missing Midtrans, deployment
skill claims the Age key never enters CI). Zero behavior change; exports
unchanged; 100% line-coverage gate enforced by the existing suites.

## Scope

### A. `apps/server/src` restructure (git mv + import updates)

```
routes/
  create-server.ts   # buildServer(): middleware chain + route plugin registration (~60 lines)
  middlewares.ts     # security headers, body limit, request-id/consolidated-log context, CORS
  rate-limits.ts     # 9 limiters from a config table + onRequest limiter wiring
  auth-routes.ts     # /api/auth/* (password policy + bounded request rebuild)
  rpc-routes.ts      # /rpc + /api-reference* (shared session/createContext/requestUserId)
  upload-routes.ts   # GET/POST /uploads/* (local-mode sink)
  content-routes.ts  # knowledge-bank file proxy
  openapi-routes.ts  # /openapi.json + /api-reference (shared session guard)
  health-metrics.ts  # /health + /metrics
seed/                # seed.ts, seed-invite.ts, seed-packages.ts, reset-seed-student.ts, seed.test.ts
README.md            # the story: bootstrap → middleware → routes → webhooks → seed → tests
```

`index.ts` slims to bootstrap-only (logger, crash handlers, waitForDb, admin
bootstrap, the two `await import()`s — **Bun segfault import-order comment
preserved verbatim** — email senders, listen, scheduler, probe, shutdown).

### B. Typed webhook errors (webhooks/payments.ts)

- `WebhookSignatureError` / `WebhookTimestampError` / `UnknownPaymentStatusError`
  (DomainError subclasses with `code` discriminants) replace the 3
  message-sniffed branches (`includes("signature")`, `includes("timestamp")`,
  `includes("unknown payment status")`).
- Providers (`xendit`/`midtrans`) throw the typed errors; `isPermanentWebhookError`
  becomes `instanceof` checks. Existing webhook tests (m5-l1, timestamp,
  midtrans-webhook) stay green = proof.

### C. `packages/api` tidy

- Split `booking.service.ts` (4,728 lines) into cohesive clusters; exports
  re-exported from `index.ts`; the 8,658-line test file splits with it.
- Move `lib/storage.test.ts` → `tests/unit/`.
- Fold `tutor-subjects/subject-selection.ts` → `tutor-discovery/`.
- `README.md`: module map, port pattern, test layout.

### D. Package READMEs (env/auth/db/config/ui) + infra READMEs + `infra/lib/common.sh`

### E. Docs sync (rule 11)

- `LOG-CONSOLIDATION-PAYMENT-UX.md` → `completed/` (merged #189); plans
  README + CONTEXT rows updated; execution-order tail.
- CI-SANITY status log (F9 regression + fix, F10 ruleset discovery).
- DEPLOYMENT.md Caddy wording fix.
- FAILURES.md Midtrans stub section.
- `infra/secrets/prod.env.example` Midtrans placeholder block.
- `.opencode/skills/cogito-deployment/SKILL.md` Age-key-in-CI exception note.
- CONTEXT.md server layout + CHANGELOG entry.

## Verification gate

`bun run check` · `bun run check-types` · `bun run test:coverage` (100% gate)
· `bun run build` · diff review (moves only) · CI green (lint, typecheck,
build, test+coverage, semantic-pr, label).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| 100% coverage gate trips | test:coverage locally before push; tests split with sources |
| Bun 1.3.14 segfault import order | comment + dynamic imports move verbatim; boot-simulated locally |
| booking split behavioral drift | mechanical extraction only; existing suite is the contract |
| ops shell dedupe breaks | `bash -n` + dry-run; lib extraction only, no logic changes |
