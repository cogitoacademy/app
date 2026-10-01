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

## Open follow-ups (not in this wave)

1. **Reconcile retry double-counts integrity events.** The same 2 PENDING rows
   (Sep-26 explorer Rp1,070,000; Sep-30 pioneer Rp2,000,000) fail every 15m and
   inflate the counter. Consider recording integrity once per payment (dedupe
   key) or skipping known-mismatched rows after N failures with a
   `reconciliation_failed` audit + admin queue entry.
2. **Investigate the actual amount mismatches.** Why does Midtrans
   `gross_amount` differ from the stored `amount_idr` for these two rows?
   (Stale test payments against changed package prices is the leading theory —
   pioneer Rp2,000,000 matches the current catalog, explorer Rp1,070,000 needs
   checking against `mark_package` history.)
3. **Persist the counter or alert on DB state.** In-memory counter loss on
   restart is a silent false-resolve; long-term the alert should latch on
   unreconciled DB rows, not a transient `increase()`.
