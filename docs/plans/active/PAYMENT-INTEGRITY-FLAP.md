# PaymentIntegrityEvent flap — diagnosis + alert fix (2026-10-01)

## Symptom

`PaymentIntegrityEvent` (critical) flapping: `Firing B=1.11 C=1` →
`Resolved B=0 C=0` over and over.

## Firing type (verified live 2026-10-01 via Prometheus API)

- `payment_integrity_events_total{provider="midtrans",type="amount_mismatch"} = 15`
- `sum by(type) (increase(...[1h]))` → `amount_mismatch ≈ 4.0`
- `sum by(type) (increase(...[30m]))` → `amount_mismatch ≈ 2.0`
- No `provider_mismatch` / `currency_mismatch` / `partial_refund` series present.
- DB: 4 `payment_record` rows (2 PENDING, 2 EXPIRED), 0 `refund_record` rows,
  no refund/mismatch audit rows in 7d.
- Logs: `reconcile-payments` every 15m → `Checked 4, reconciled 2, failed 2`,
  steady for hours.

## Root cause

`reconcilePendingPayments` → `confirmFromWebhook` records
`amount_mismatch` **before throwing** on each failed retry, and the 15m
scheduler retries the same 2 failing PENDING rows indefinitely. Each retry
re-increments the counter, opening a fresh ~5m `increase()[5m] > 0` firing
window that then slides to 0 and resolves — hence flap. `B=1.11` is the
`increase()` extrapolation artifact for a single increment.

Contributing alert-design flaws (rule added in #271 with `for: 0m`, the only
critical without a hold):

1. `for: 0m` — no absorption of 30s-scrape / 1m-eval jitter (all other
   criticals use `for: 5m`).
2. `[5m]` window self-resolves without human reconciliation; resolve ≠ done.
3. Counter is in-memory only (lost on restart; `or vector(0)` masks as healthy).

## Fix in this wave (alert stability, no app behavior change)

- `for: 0m` → `5m`; window `[5m]` → `[30m]` (= 2× reconcile interval, so
  recurring failures hold steady firing instead of flapping).
- Verified new expr live: `sum(increase(...[30m])) or vector(0)` → `2.03`.
- RUNBOOK alert table + rule count updated; resolve-means-quiet note added.

## Wave 2 (branch `fix/payment-integrity-root-cause`, in progress 2026-10-01)

Live Midtrans read-only probe (authorized, 2 GET `/v2/{order}/status`, live mode):

- `fe5b0e7f` (pioneer Rp2,000,000 PENDING): Midtrans `expire`, gross `2004440.00`
  echannel — the +4440 channel fee is the entire `amount_mismatch`. Stored
  amounts match the catalog, so the app-side comparison was wrong, not the data.
- `df500c27` (explorer Rp1,070,000 PENDING): `"Transaction doesn't exist"` —
  dead checkout, provider error every cycle (no integrity increment).
- Preconditions verified: zero ledger refs, held balances 0 → safe to expire.
- New finding: `MIDTRANS_MODE` vault line is `live\r` (whole prod.env is
  CRLF, 96/96 lines). App boots fine so consumption tolerates it; left alone
  (vault re-encrypt risk) — audit consumption-side `tr -d '\r'` as follow-up.
- New finding: `cogito-api-internal` scrape came UP, so `sum()` double-counts
  every event → alert expr `sum→max` (single replica).

Code changes: amount/currency checks gated on PAID/SETTLED input (provider
check stays unconditional); mismatch errors carry expected/received details;
`reconcilePendingPayments` skips attempts older than 7d
(`RECONCILE_ATTEMPT_LOOKBACK_MS`); alert `max()`; RUNBOOK/MODULE-REFERENCE/docs.

Sequencing note: manual EXPIRED disposition alone cannot stop the counter —
EXPIRED rows are still reconcile-selected — so the code fix must deploy
first (#1 then auto-expires via reconcile; #2 gets manual EXPIRED after).

## Wave 2 completion record (2026-10-01 ~13:10 WIB)

- PR #287 merged (`611c141b`), CI fully green (incl. coverage + E2E);
  Deploy Production + Infra Apply (auto) both success on the merge sha.
- Deploy live (`/health.version = 611c141b`); Grafana live expr is `max(...)`.
- `fe5b0e7f` **auto-expired via reconcile** at 12:50:49 with the fixed code
  (amount check no longer blocks) — the root fix works in production.
- `df500c27` manually expired (guarded `UPDATE ... WHERE status='PENDING'`
  - `payment_admin_expired` audit row; pre-verified zero ledger refs, zero
    holds). Tearful lessons: ops.sh `db` quoting breaks on `"` (use
    single-quotes + `jsonb_build_object`); `audit_log.id` has no default
    (pass `gen_random_uuid()`).
- Post-deploy `payment_integrity_events_total` instant query is **empty**
  (in-memory counter reset by the deploy, zero new increments) — growth stopped.
- Expected: alert resolves after 30m quiet (last increment ~12:50).
  Confirm with `max(increase(payment_integrity_events_total[30m]))` → 0,
  or wait for the Resolved notification (no flap-follow).

## Open follow-ups (not in this wave)

1. ~~Reconcile retry double-counts integrity events~~ — fixed in wave 2
   (money-gated checks + 7d lookback + manual disposition of the 2 rows).
2. ~~Investigate the actual amount mismatches~~ — resolved 2026-10-01
   (echannel fee +4440; dead explorer checkout).
3. **Persist the counter or alert on DB state.** In-memory counter loss on
   restart is a silent false-resolve; long-term the alert should latch on
   unreconciled DB rows, not a transient `increase()`.
4. **Vault CRLF hygiene.** Entire `infra/secrets/prod.env` is CRLF (96/96).
   App healthy today, but audit the Coolify-apply consumption path for a
   `tr -d '\r'` guard (same pattern as `backup-cron.yml`/`disk-watchdog.yml`).
5. **Reconcile-failure visibility.** The `catch {}` in
   `reconcilePendingPayments` counts only; attach the failure reason to the
   `reconcile_payments_complete` log so the next stuck row is diagnosable
   from Loki without provider credentials.
