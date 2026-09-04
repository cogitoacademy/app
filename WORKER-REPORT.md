# WORKER-REPORT — docs sync (REFACTOR-PR wave)

Branch: `worker/docs` (base `refactor/backend-infra-tidy` @ 70d0d09). Docs-only task; zero code changes.

## Changes (file-by-file)

1. **`docs/plans/active/LOG-CONSOLIDATION-PAYMENT-UX.md` → `docs/plans/completed/LOG-CONSOLIDATION-PAYMENT-UX.md`** (`git mv`)
   - Status header updated to `**Completed (merged #189, 2026-09-04)**`.
   - Branch column already read `release/2026-09-03-log-midtrans-booking` (no change needed).

2. **`docs/plans/README.md`**
   - Removed LOG-CONSOLIDATION-PAYMENT-UX from the Active table.
   - Added it to the Completed table (branch `release/2026-09-03-log-midtrans-booking`, merged #189, one-line summary).
   - MIDTRANS-MIGRATION row: branch corrected `wave/midtrans-migration` → `release/2026-09-03-log-midtrans-booking`, status → **Merged #189 (2026-09-04)**.
   - MONITORING-ALERTING and INFRA-AUTOMATION rows: appended "Remaining items are operator-console bits tracked in RUNBOOK (kept in Active — lead decision)" notes. Not moved.

3. **`docs/CONTEXT.md`**
   - Plans table: LOG-CONSOLIDATION-PAYMENT-UX row → `docs/plans/completed/`, **Completed (merged #189, 2026-09-04)**.
   - Execution Order: appended entries 16–20 (#165 CI perf, #179 ops visibility, #189 log consolidation + Midtrans + booking date fix + payment UX, #190 CI dependabot fix, #193 semantic-pr docker type).
   - Architecture: added "Server layout (2026-09-04, REFACTOR-PR)" note describing `apps/server/src/routes/` plugin-per-area layout (create-server.ts composition root, middlewares, rate-limits, auth/rpc/upload/content/openapi/health-metrics route plugins, webhooks/, seed/) and the typed webhook errors in `packages/api/src/modules/payment/payment.errors.ts` (WebhookSignatureError/WebhookTimestampError/UnknownPaymentStatusError).

4. **`docs/plans/active/CI-SANITY.md`** — status log entry 2026-09-04 (docs sync): F10 ruleset discovery (branch protection EXISTS as rulesets main-1/main-2; main-2 requires Lint/Type Check/Build/Test + Coverage + Coverage/label/semantic-pr with strict policy; `lint` context renamed to `semantic-pr` and ruleset updated by the operator), #145 closed as genuinely broken (oRPC version mismatch), #142/#144 merged, #71 closed stale, #193 docker type added, F9 remains optional operator decision.

5. **`docs/DEPLOYMENT.md`** — line ~171: dropped the redundant "— not Caddy" parenthetical; now "Coolify's bundled proxy (Traefik v3.6, verified 2026-08-28) then provisions HTTPS…". The other Caddy occurrence (line ~285) is the already-corrected "not Caddy" phrasing — left intact.

6. **`docs/FAILURES.md`**
   - §1.5b "Webhook failures (Midtrans)": route `/webhooks/payments/midtrans`, body `signature_key` SHA512 verification (401 on bad signature, `WebhookSignatureError`), merchant_id defense-in-depth, idempotency key `midtrans:{transaction_id ?? order_id}:{status}`, timestamp check skipped for midtrans, recovery steps.
   - §3.4b "Midtrans down": Snap page unreachable → checkout fails; circuit breaker; rollback to Xendit per `docs/MIDTRANS-MIGRATION.md` §6; mode-scoped breaker keys `cogito:cb:midtrans-test`/`-live`.
   - Existing Xendit content untouched.

7. **`infra/secrets/prod.env.example`** — commented Midtrans placeholder block after the Xendit block (`MIDTRANS_MODE`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID`, optional `MIDTRANS_WEBHOOK_SIGNATURE_KEY` + note that Xendit keys stay as the rollback path). `infra/secrets/prod.env` (encrypted vault) NOT touched.

8. **`.opencode/skills/cogito-deployment/SKILL.md`** — amended "The Age private key NEVER enters CI or the VPS" with the documented exception: `SOPS_AGE_KEY` is deliberately a GitHub Actions secret for the `infra-apply` workflow (INFRA-AUTOMATION wave, 2026-09-02), used only on manual dispatch / vault-path PRs, written to a 0600 temp file, deleted in a `finally` step, never used by the normal CI/CD path.

## Verification

- `grep -rn "wave/midtrans-migration" docs/` → no matches (exit 1).
- `grep -n "Caddy" docs/DEPLOYMENT.md` → only the corrected "not Caddy" phrasing (line 285).
- `grep -n "LOG-CONSOLIDATION-PAYMENT-UX" docs/plans/README.md docs/CONTEXT.md` → completed/#189 status in both.
- FAILURES.md has §1.5b (Midtrans webhook) + §3.4b (Midtrans down).
- prod.env.example has the Midtrans placeholder block.
- Skill file has the SOPS_AGE_KEY exception note.
- `git status` shows only the 8 intended doc files (1 rename + 7 modifications).

## Code-fact verification (no guessing)

All doc claims cross-checked against the code before writing:
- `apps/server/src/routes/` layout confirmed (create-server.ts, middlewares.ts, rate-limits.ts, auth-routes.ts, rpc-routes.ts, upload-routes.ts, content-routes.ts, openapi-routes.ts, health-metrics.ts, webhooks/, seed/).
- `WebhookSignatureError`/`WebhookTimestampError`/`UnknownPaymentStatusError` confirmed in `packages/api/src/modules/payment/payment.errors.ts` (lines 90/102/114).
- Midtrans webhook: `signature_key` SHA512 verification in `midtrans-payment.provider.ts` (`verifySignatureKey`, lines 137–159), merchant_id check (line 352), `providerEventId: body.transaction_id ?? orderId` (line 365), idempotency key shape `paymentWebhookIdempotencyKey` in `apps/server/src/webhooks/payments.ts:18-29`, timestamp check skipped for midtrans (`payments.ts:85`, `timestamp.test.ts:78`).
- Midtrans breaker name `midtrans-${opts.mode}` (`midtrans-payment.provider.ts:194`) → keys `cogito:cb:midtrans-test`/`-live` per the `cogito:cb` namespace pattern.
- Env var names confirmed in `packages/env/src/server.ts` (lines 82–89).
- `SOPS_AGE_KEY` GitHub secret confirmed in `.github/workflows/infra-apply.yml` (lines 177–186, 256: 0600 temp file + `finally` cleanup).

## Notes / could not do

- Nothing blocked. The brief's CI-SANITY facts (rulesets main-1/main-2, #145 oRPC mismatch, #142/#144 merged, #71 stale, #193 docker type) are operator/PR-history facts I could not independently verify from the repo (no ruleset API access, PRs merged on main); they were recorded as given. `git log` confirms #189/#190/#193 merged on main.
- The DEPLOYMENT.md line-171 fix: the sentence already said "not Caddy"; per the brief's example I removed the redundant parenthetical so the wording is consistent with the "not Caddy" phrasing retained at line 285.
