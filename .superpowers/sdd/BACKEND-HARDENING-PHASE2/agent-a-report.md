# Agent A — BACKEND-HARDENING-PHASE2 Implementation Report

Date: 2026-08-14 · Branch: `fix/backend-hardening-phase2` (never pushed)
Base: `291921a` · Head: `4cf0fb5`

## Summary

Implemented all assigned tasks (PR 1 Security Hardening Tasks 1.1–1.4, Task 5.6 env part, Task 4.1 env vars + `/uploads/*` route, Task 5.8 routes.ts parts). All my files typecheck, lint clean, and 27 targeted tests pass. Final full-suite: **1566 pass / 1 skip / 1 fail** — the single failure is an in-flight test added by the concurrent Agent B (booking money), NOT in my owned files.

## Per-Task Status

### Task 1.1 — Stub checkout gate — DONE

- Added `STUB_WEBHOOK_ALLOWED: z.coerce.boolean().default(false)` to `packages/env/src/server.ts`.
- Added pure `stubCheckoutEnabled(nodeEnv, provider, allowed)` to `apps/server/src/webhooks/payments.ts` and replaced the old `NODE_ENV/PROVIDER` guard in the `/webhooks/payments/stub/checkout` handler.
- New `apps/server/src/webhooks/stub-checkout.test.ts` (2 tests).
- Commit `3732169 fix(webhooks): require STUB_WEBHOOK_ALLOWED flag for stub checkout route`.

### Task 1.2 — Atomic webhook idempotency — DONE

- Added `IdempotencyStore.claim()` (atomic SET NX+EX; falls back to in-memory) and `release()` in `packages/api/src/lib/idempotency.ts`. Per `RedisClient.set` semantics (`Promise<string|null>`, NX+EX as two args), the success check is `ok === "OK"` (the plan's `ok === true` branch type-errors on `string | null`).
- Rewired `apps/server/src/webhooks/payments.ts`: idempotency claim now happens AFTER signature verification + timestamp validation, keyed on the VERIFIED payload's `providerEventId` (`${provider}:${payload.providerEventId || "no-event-id"}`). Removed the old `x-event-id` key and the pre-signature `isProcessed` pre-check. On processing error the claim is released.
- New `packages/api/src/tests/unit/idempotency-claim.test.ts` (2 tests, incl. InMemoryRedis round-trip).
- Verified `packages/api/src/tests/integration/payment-flow.test.ts` stays green (10/10) — duplicate webhook still idempotent.
- Commit `2c24ed9 fix(webhooks): atomic idempotency claim keyed on verified payload event id`.

### Task 1.3 — Trusted-proxy rate-limit keys + invite/booking limits — DONE

- Added `TRUST_PROXY: z.coerce.boolean().default(false)` to env.
- Moved `getClientIp(request, trustProxy)` into `packages/api/src/lib/request-id.ts` (the plan's preferred lib location) and wired `const ip = getClientIp(request, env.TRUST_PROXY)` in `apps/server/src/routes.ts`.
- Added `inviteRateLimit` (10/min, prefix `invite`) and `bookingRateLimit` (30/min, prefix `booking`) and checks for `path.startsWith("/rpc/invite.verify")` and `path.startsWith("/rpc/booking.")`.
- Tests: new `apps/server/src/rate-limit-ip.test.ts` (3 tests) + extended `apps/server/src/rate-limit.test.ts` (invite/booking wiring assertions).
- Commit `1b27431 fix(server): trusted-proxy rate-limit keys; throttle invite and booking creation`.
- Deviation: tests import `getClientIp` from `@cogito-app/api/lib/request-id`, NOT from `apps/server/src/routes`. See Concern C1 below (evlog + bun test hang).

### Task 1.4 — Seed prod guard — DONE

- Added pure `seedAllowed(nodeEnv, allowFlag)` and `seedAdminPassword(value)` (min 12 chars, null otherwise) to `apps/server/src/seed.ts`; wired them at the top of `seed()` (production refuses unless `SEED_ALLOWED_IN_PROD=true`; admin password from `SEED_ADMIN_PASSWORD`).
- Replaced the hardcoded `"admin123"` with the env-provided admin password.
- Guarded the module's top-level `seed()` invocation behind `import.meta.main` so the pure helpers are testable without running the DB seed.
- `seed-packages.ts` creates no users (packages only) and is already `import.meta.main`-guarded — no change needed (per plan note).
- New `apps/server/src/seed.test.ts` (2 tests).
- Commit `e9b81a7 fix(seed): refuse production seeding without explicit flag and strong admin password`.

### Task 5.6 — Conditional Xendit env validation (env part only) — DONE

- Refactored `packages/env/src/server.ts` to export a `serverEnvSchema` (`z.object(serverShape).superRefine(...)`) used via `createEnv({ server: serverShape, createFinalSchema: () => serverEnvSchema, ... })`. superRefine requires `XENDIT_SECRET_KEY` + `XENDIT_WEBHOOK_TOKEN` when `PAYMENT_PROVIDER === "xendit"`.
- New `apps/server/src/env-xendit.test.ts` (2 tests).
- Commit `c96483d fix(env): require Xendit credentials when PAYMENT_PROVIDER=xendit`.
- NOT DONE here (out of my file ownership): removal of the silent stub fallback in `packages/api/src/modules/payment/index.ts` (owned by Agent C / wave 2). The env gate makes the fallback unreachable at startup when provider=xendit, but the plan's `payment/index.ts` assertion change is left to the owning agent.

### Task 4.1 — env vars + `/uploads/*` route (only my parts) — DONE

- Added `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (`z.string().optional()`), `R2_PUBLIC_URL` (`z.url().optional()`), `UPLOAD_DIR` (`z.string().default("./uploads")`) to `packages/env/src/server.ts`.
- Added `GET /uploads/*` in `apps/server/src/routes.ts`: active only when `R2_PUBLIC_URL` is unset; serves `Bun.file(\`${UPLOAD_DIR}/${key}\`)` with 404 on missing file; rejects traversal keys (`..`or leading`/`) via `isValidUploadKey`.
- Added `isValidUploadKey` to `packages/api/src/lib/request-id.ts`.
- Tests: `apps/server/src/uploads.test.ts` (pure guard, 2 tests) and `apps/server/src/uploads-route.test.ts` (server-level serve/missing via `createServer().handle()`, 1 test).
- Commits `a44a896 feat(upload): serve local /uploads/* with path-traversal guard (R2_PUBLIC_URL fallback)` and `5040ef7 style: apply oxfmt formatting to request-id helpers and uploads route`.
- Storage lib + upload module + routers/services wiring owned by Agent D (wave 2).

### Task 5.8 — routes.ts parts (L1 read-time body size + L3 OpenAPI auth) — DONE

- Added `readBodyWithLimit(request, limit)` (streams the body, rejects past limit → `{ tooLarge: true }`) and `openApiAccessDenied(nodeEnv, hasSession)` to `packages/api/src/lib/request-id.ts`.
- RPC: the `/rpc*` handler now reads the body with the limit (covers chunked bodies that bypass Content-Length) and returns 413 when over; reconstructs the request for `rpcHandler.handle`. The cheap Content-Length header check is kept as an early filter.
- Webhook: `apps/server/src/webhooks/payments.ts` switched from `{ parse: "text" }` to `{ parse: "none" }` and reads the body via `readBodyWithLimit` (256 KiB), returning 413 when over.
- OpenAPI: `/openapi.json`, `/api-reference`, and the `/api-reference*` OpenAPI handler now require an authenticated session outside production (401 when anon); production still returns 404.
- Tests: `apps/server/src/body-limit.test.ts` (3 tests, incl. chunked over-limit) + updated `apps/server/src/openapi.test.ts` to test `openApiAccessDenied` (production 404, non-prod 401/200).
- L2 (`cancellationReason` bound in `booking.router.ts`) is NOT mine — handled in Task 5.7 (Agent B).
- Commit `4cf0fb5 fix(server): read-time body-size enforcement and auth-gated OpenAPI endpoints`.

## Tests Run (pass counts)

- Baseline full suite (at `291921a`, before my work): 1562 tests / 0 fail (via `.env.test`).
- All my targeted tests (`apps/server/src/` + `idempotency-claim.test.ts`): **27 pass / 0 fail**.
- `packages/api/src/tests/integration/payment-flow.test.ts`: **10 pass / 0 fail** (duplicate-webhook idempotency intact).
- `bun run check-types`: **pass** (all 3 turbo tasks).
- `bun run lint`: 0 errors (46 pre-existing warnings, same as baseline).
- Final full suite (`REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env.test packages/api/src/tests/ apps/server/src/openapi.test.ts`): **1566 pass / 1 skip / 1 fail**.

## Deviations & Concerns

- **C1 (env for tests):** The task-specified command `--env-file apps/server/.env` points `DATABASE_URL` at `cogito-app` (dev DB), which the test helper blocks (`resetDatabase()` requires a `*test*` DB + `NODE_ENV=test`). The correct test env is `apps/server/.env.test` (matches CI and the plan's 1562-test baseline). I ran all suites with `.env.test`. Flagging so the orchestrator uses the right env file for the gate.
- **C2 (pre-existing red test from concurrent Agent B):** The full suite has ONE failure — `booking-g4.test.ts` → "group of 4: proposer is charged only perStudent once all invitees confirm" (assertion `proposerWallet.totalBalance === 200 - 28` at `booking-g4.test.ts:200`). This test was added by Agent B's commit `a492fbe` and contradicts this codebase's wallet invariant (holds move available→held; `totalBalance` stays constant; `total = held + available` per the DB CHECK). It is in Agent B's file and is their in-flight Task 2.1 work — I did not touch it.
- **C3 (evlog + bun test hang):** Any `bun test` file that imports `apps/server/src/routes.ts` (which imports `evlog/elysia`) can hang (test bodies complete but bun reports "timed out after 5000ms"). Root cause is the `evlog` package (AsyncLocalStorage/async-hooks interplay with bun's test runner) — pre-existing, reproducible with a scratch file importing only `evlog/elysia`, NOT caused by my changes. Workaround: my pure-helper tests import from the lightweight `packages/api/src/lib/request-id.ts` (no evlog). The one server-level test (`uploads-route.test.ts`, uses `createServer()`) passed consistently in batches but can hang standalone; it is not part of the full-suite gate.
- **C4 (5.6 payment/index.ts fallback):** The plan's "remove silent stub fallback" in `packages/api/src/modules/payment/index.ts` + `services.ts` wiring is outside my owned files (wave 2 / Agent C). The env superRefine (my part) fails loudly at startup when provider=xendit without credentials.
- **C5 (oxfmt reformatting of my commits):** Agent B ran `oxfmt --write` repo-wide, reformatting two of my commits (`routes.ts` import wrap, `server.ts` superRefine). I re-ran `oxfmt --write` on my files and committed the formatting (`5040ef7`) so `oxfmt --check` stays clean.

## Commit Range (base..head)

`291921a..4cf0fb5` — 11 commits total: 8 mine (`3732169`, `2c24ed9`, `1b27431`, `e9b81a7`, `c96483d`, `a44a896`, `5040ef7`, `4cf0fb5`) + 3 from Agent B (`a492fbe`, `7ab20bb`, `fc3be8f`). Not pushed.
