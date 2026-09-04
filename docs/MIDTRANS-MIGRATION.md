# Midtrans (Snap) Migration Guide

Operator runbook for switching the payment provider from **Xendit** to
**Midtrans Snap**, and back. The application supports both providers behind the
same `PaymentProvider` port; `PAYMENT_PROVIDER` selects the active one and the
Xendit path stays fully wired for rollback.

- **Code:** `packages/api/src/modules/payment/midtrans-payment.provider.ts`
- **Webhook route:** `POST /webhooks/payments/midtrans`
- **Status:** implementation merged; operator cutover pending (this guide)

---

## 1. What changed (summary)

| Area           | Xendit (unchanged, rollback path)                       | Midtrans (new)                                                                                                                            |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Intent API     | `POST /v3/payment_requests` (2024-11-11)                | `POST /snap/v1/transactions`                                                                                                              |
| Checkout       | QRIS dynamic QR / e-wallet redirect                     | Snap `redirect_url` (hosted payment page)                                                                                                 |
| Webhook auth   | `x-callback-token` header                               | `signature_key` **inside the body** — `SHA512(order_id + status_code + gross_amount + signatureKey)`                                      |
| Webhook URL    | `https://api.cogitoacademy.id/webhooks/payments/xendit` | `https://api.cogitoacademy.id/webhooks/payments/midtrans`                                                                                 |
| Test mode      | Xendit Test Mode + simulation endpoint                  | Midtrans **Sandbox** (no simulation endpoint; use sandbox test cards on the Snap page)                                                    |
| Status mapping | `SUCCEEDED`/`ACCEPTING_PAYMENTS`/…                      | `capture`→PAID, `settlement`→SETTLED, `pending`→PENDING, `deny/cancel/failure`→FAILED, `expire`→EXPIRED, `refund/partial_refund`→REFUNDED |
| order_id       | provider reference (`xendit:user:code[:uuid]`)          | **payment UUID** (Snap `order_id` max 50 chars, `[A-Za-z0-9._~-]`; the provider reference contains colons and can exceed 50 chars)        |

The `PaymentProvider` port contract is unchanged: `createIntent` still returns
`{ checkoutUrl, paymentRequestId? }`, `confirmFromWebhook`/`getPurchase`/
`reconcilePurchase`/`refund` behave identically, and `payment.service.ts` /
`payment.repo.ts` / the webhook idempotency + DLQ logic are untouched.

### Repurchase safety (#188)

Each terminal attempt creates a new payment row with a fresh provider
reference. Midtrans `order_id` is the **payment UUID**, which is unique per
attempt, so a re-purchase always mints a distinct Snap transaction. Webhooks and
status lookups carry the `order_id`; the provider resolves it back to the
stored `providerReference` through a DB lookup (`resolvePayment`), so the
service matches the correct attempt row.

### Test Mode label

The frontend "Test Mode" affordances (`canSimulate`, `simulatePurchase`) are
driven by the handler config:

- **Xendit:** `simulationEnabled=true` — approved UAT accounts get the
  "Simulate successful payment" button (Xendit's test-only simulation API).
- **Midtrans:** `simulationEnabled=false` — no simulation button. Sandbox test
  payments are made with Midtrans' sandbox test cards on the Snap page
  (card `4811 1111 1111 1114`, CVV `123`, OTP `112233`).

The `xenditMode` handler option was renamed to `providerMode` (internal only —
no API contract change).

---

## 2. Midtrans dashboard setup

1. **Create the Midtrans account** at <https://dashboard.midtrans.com> (MAP).
   Complete the merchant profile; Snap is available on the default plan.
2. **Retrieve API keys** — Settings → Access Keys:
   - **Sandbox** keys (prefix `SB-Mid-server-…` / `SB-Mid-client-…`) for test.
   - **Production** keys (prefix `Mid-server-…` / `Mid-client-…`) for live.
   - The **Server Key** selects the environment (Sandbox vs Production) — the
     same rule as Xendit's API key. `MIDTRANS_MODE` is our explicit
     deployment assertion and must match the key.
3. **Enable Snap** — Settings → Snap Preference. Confirm the payment methods
   you want (QRIS, GoPay, bank transfer, etc.) are active.
4. **Configure the Payment Notification URL** — Settings → Configuration →
   **Payment Notification URL**:
   `https://api.cogitoacademy.id/webhooks/payments/midtrans`
   (Sandbox and Production have separate settings — configure both.)
5. **Configure redirect URLs** (optional but recommended) — Settings →
   Configuration → Finish / Unfinish / Error Redirect URLs, e.g.
   `https://app.cogitoacademy.id/balance`. These are dashboard-level; the app
   does not pass per-request redirect URLs to Snap.
6. **Signature key:** Midtrans has **no separate webhook signature key** — the
   notification `signature_key` is `SHA512(order_id + status_code +
gross_amount + ServerKey)`. The app verifies with
   `MIDTRANS_WEBHOOK_SIGNATURE_KEY` when set, otherwise the Server Key. You
   only need `MIDTRANS_WEBHOOK_SIGNATURE_KEY` if you want to rotate the
   verification secret independently of the Server Key (not required). As
   defense-in-depth, the app also rejects signed notifications whose
   `merchant_id` does not match `MIDTRANS_MERCHANT_ID`.

---

## 3. SOPS vault changes

Add the following keys to the SOPS-encrypted environment (both the sandbox
values and, later, the production values — keep them as separate named
entries so rollback is a flip, not a re-encrypt):

| Key                              | Example (sandbox) | Required            |
| -------------------------------- | ----------------- | ------------------- |
| `PAYMENT_PROVIDER`               | `midtrans`        | yes (when cut over) |
| `MIDTRANS_MODE`                  | `test`            | yes                 |
| `MIDTRANS_SERVER_KEY`            | `SB-Mid-server-…` | yes                 |
| `MIDTRANS_CLIENT_KEY`            | `SB-Mid-client-…` | yes                 |
| `MIDTRANS_MERCHANT_ID`           | `G…`              | yes                 |
| `MIDTRANS_WEBHOOK_SIGNATURE_KEY` | (optional)        | no                  |

The env schema fails boot when `PAYMENT_PROVIDER=midtrans` is missing any of
the required `MIDTRANS_*` values — a half-swapped config cannot silently run
the stub.

---

## 4. Coolify env sync

1. Open the server resource in Coolify → Environment Variables.
2. Add the `MIDTRANS_*` keys from §3 (and flip `PAYMENT_PROVIDER` when ready).
3. Keep the existing `XENDIT_*` variables in place — they are the rollback
   path and are ignored while `PAYMENT_PROVIDER != xendit`.
4. `WEBHOOK_ALLOWED_IPS` still applies to the midtrans webhook route (it is
   provider-agnostic). Midtrans publishes its notification egress IPs at
   <https://docs.midtrans.com/docs/ip-address>; add them if you want the
   defense-in-depth allowlist. An empty allowlist = signature-only gating.
5. Redeploy. Verify the boot log shows
   `action=payment_provider_configured provider=midtrans midtransMode=test`
   (the secret must never appear in logs).

---

## 5. Cutover sequence

### 5.1 Sandbox E2E (production domain, `MIDTRANS_MODE=test`)

1. In Coolify set `PAYMENT_PROVIDER=midtrans`, `MIDTRANS_MODE=test`, the
   **Sandbox** Server/Client keys and merchant id. Keep
   `STUB_WEBHOOK_ALLOWED=false`.
2. In the Midtrans dashboard (Sandbox), confirm the Payment Notification URL
   is `https://api.cogitoacademy.id/webhooks/payments/midtrans`.
3. Sign in with a verified student account and create a purchase. The Balance
   page receives `checkoutUrl` = the Snap `redirect_url`; the frontend opens
   the Snap hosted page (no frontend change required — the checkout URL
   contract is unchanged).
4. Pay with the sandbox test card (`4811 1111 1111 1114`, CVV `123`, any
   future expiry, OTP `112233`) or a sandbox e-wallet/QRIS method.
5. Confirm the webhook arrives at `/webhooks/payments/midtrans` with a valid
   `signature_key`; the payment becomes `SETTLED` and Marks are credited
   **once**. Check the boot log for `midtransMode=test`.
6. Negative tests:
   - Deliver a webhook with a wrong `signature_key` → **401**.
   - Deliver a duplicate `settlement` notification → idempotent (single
     credit).
   - Deliver `expire` / `deny` notifications → payment becomes
     `EXPIRED`/`FAILED`, no credit.
7. **No simulation button** is expected in Midtrans mode (`canSimulate=false`).

### 5.2 Live switch

1. In the Midtrans dashboard (Production), set the Payment Notification URL to
   `https://api.cogitoacademy.id/webhooks/payments/midtrans` and confirm the
   production payment methods are active.
2. In Coolify: replace the Sandbox keys with the **Production** Server/Client
   keys and set `MIDTRANS_MODE=live`. Keep `PAYMENT_PROVIDER=midtrans`.
3. **Live smoke:** run one real small purchase (Pioneer 400 / Rp 2,000,000 or
   the smallest approved package) end-to-end: create purchase → Snap page →
   pay → webhook → wallet credit once. Verify the redirect return and the
   balance page.
4. Record the switch timestamp and transaction reference in the ops log.

---

## 6. Rollback (back to Xendit)

The Xendit provider, env vars, and webhook route remain fully intact.

1. In Coolify set `PAYMENT_PROVIDER=xendit` (and restore `XENDIT_MODE` +
   Test/Live `XENDIT_SECRET_KEY`/`XENDIT_WEBHOOK_TOKEN` + redirect URLs if they
   were removed — they should still be present).
2. In the Xendit dashboard, confirm the webhook URL is
   `https://api.cogitoacademy.id/webhooks/payments/xendit` (it was never
   removed).
3. Redeploy and verify the boot log shows `provider=xendit`.
4. Midtrans webhooks that arrive after the flip are rejected by signature
   verification (the midtrans provider is no longer active) — Midtrans will
   retry; once the dashboard notification URL is pointed back at Xendit (or
   the midtrans route is re-enabled) processing resumes. In-flight Midtrans
   payments created before the flip are reconciled by the normal
   `reconcilePurchase` status lookup only while the midtrans provider is
   active; if a rollback is needed mid-flight, prefer completing the cutover
   checklist first or reconcile the stragglers manually via the Midtrans
   dashboard.

---

## 7. Refund path

`adminRefund` is **in-app Marks credits only** (N1, PRD §677) — it never calls
the provider. The Midtrans provider implements the `refund()` port
(`POST /v2/{order_id}/refund`) for a future payment-error-only cash-refund
flow, but it is not wired into `adminRefund`, exactly like Xendit.

---

## 8. Reference

- Midtrans Snap integration guide: <https://docs.midtrans.com/docs/snap-integration-guide>
- Webhook notification + signature verification: <https://docs.midtrans.com/docs/https-notification-webhooks>
- Transaction status cycle: <https://docs.midtrans.com/docs/transaction-status-cycle>
- Sandbox test cards: <https://docs.midtrans.com/docs/testing-payment-on-sandbox>
- Notification egress IPs: <https://docs.midtrans.com/docs/ip-address>
