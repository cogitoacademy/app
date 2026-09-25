# Midtrans (Snap) Migration Guide

Operator runbook for the **Midtrans Snap** payment provider. The active runtime
supports `stub` and `midtrans`; `PAYMENT_PROVIDER` selects the active one.
Historical Xendit payment rows remain readable for audit and reconciliation,
but no Xendit runtime or rollback path remains.

- **Code:** `packages/api/src/modules/payment/midtrans-payment.provider.ts`
- **Webhook route:** `POST /webhooks/payments/midtrans`
- **Status:** implementation merged; Midtrans is the production provider

---

## 1. What changed (summary)

| Area         | Midtrans                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Intent API   | `POST /snap/v1/transactions`                                                                                                              |
| Checkout     | Snap `redirect_url` (hosted payment page)                                                                                                 |
| Webhook auth | `signature_key` **inside the body** — `SHA512(order_id + status_code + gross_amount + signatureKey)`                                      |
| Webhook URL  | `https://api.cogitoacademy.id/webhooks/payments/midtrans`                                                                                 |
| Test mode    | Midtrans **Sandbox**; use sandbox test cards on the Snap page                                                                             |
| Status map   | `capture`→PAID, `settlement`→SETTLED, `pending`→PENDING, `deny/cancel/failure`→FAILED, `expire`→EXPIRED, `refund/partial_refund`→REFUNDED |
| order_id     | **payment UUID** (Snap `order_id` max 50 chars, `[A-Za-z0-9._~-]`)                                                                        |

The `PaymentProvider` port contract is unchanged: `createIntent` still returns
`{ checkoutUrl, paymentRequestId? }`, `confirmFromWebhook`/`getPurchase`/
`reconcilePurchase`/`refund` keep their public behavior, while the shared
payment service/repository now add amount/provider integrity checks, repeatable
attempt history, and status reconciliation. Webhook idempotency and DLQ
behavior remain compatible with existing deliveries.

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

- **Midtrans:** `simulationEnabled=false` — no simulation button. Sandbox test
  payments are made with Midtrans' sandbox test cards on the Snap page
  (card `4811 1111 1111 1114`, CVV `123`, OTP `112233`).

The internal provider mode is `providerMode`; it is not exposed as a payment
provider-specific API field.

---

## 2. Midtrans dashboard setup

1. **Create the Midtrans account** at <https://dashboard.midtrans.com> (MAP).
   Complete the merchant profile; Snap is available on the default plan.
2. **Retrieve API keys** — Settings → Access Keys:
   - **Sandbox** keys (prefix `SB-Mid-server-…` / `SB-Mid-client-…`) for test.
   - **Production** keys (prefix `Mid-server-…` / `Mid-client-…`) for live.
   - The **Server Key** selects the environment (Sandbox vs Production).
     `MIDTRANS_MODE` is our explicit deployment assertion and must match the
     key.
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
| `PAYMENT_TEST_ALLOWED_EMAILS`    | `uat-a@…,uat-b@…` | yes (in test mode)  |

`PAYMENT_TEST_ALLOWED_EMAILS` is the test-mode UAT list. In
`MIDTRANS_MODE=test` on a production/staging domain it gates
`payment.createPurchase` to approved verified student emails.

The env schema fails boot when `PAYMENT_PROVIDER=midtrans` is missing any of
the required `MIDTRANS_*` values — a half-swapped config cannot silently run
the stub.

---

## 4. Coolify env sync

1. Open the server resource in Coolify → Environment Variables.
2. Add the `MIDTRANS_*` keys from §3 (and flip `PAYMENT_PROVIDER` when ready).
3. Remove retired provider variables from the API resource; only keys listed
   in `infra/ansible/coolify-resources.yml` are applied.
4. `WEBHOOK_ALLOWED_IPS` still applies to the Midtrans webhook route (it is
   provider-agnostic). Midtrans publishes its notification egress IPs at
   <https://docs.midtrans.com/docs/ip-address>; add them if you want the
   defense-in-depth allowlist. An empty allowlist = signature-only gating.
5. Redeploy. Verify the boot log shows
   `action=payment_provider_configured provider=midtrans midtransMode=test`
   (the secret must never appear in logs) — also visible on the Important
   Logs board payment panels
   (`infra/grafana/provisioning/dashboards/important-logs.json`).

---

## 5. Cutover sequence

### 5.1 Sandbox E2E (production domain, `MIDTRANS_MODE=test`)

1. In Coolify set `PAYMENT_PROVIDER=midtrans`, `MIDTRANS_MODE=test`, the
   **Sandbox** Server/Client keys and merchant id. Keep
   `STUB_WEBHOOK_ALLOWED=false`.
2. In the Midtrans dashboard (Sandbox), confirm the Payment Notification URL
   is `https://api.cogitoacademy.id/webhooks/payments/midtrans`.
3. Sign in with a verified student account and create a purchase. The Balance
   page receives `checkoutUrl` = the Snap `redirect_url`; the frontend detects
   the `https://` URL via `isRedirectCheckoutUrl` (`apps/web/src/lib/checkout.ts`)
   and opens the Snap hosted page in a new tab instead of rendering a QR code
   (QRIS payloads remain inline QR).
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
3. **Live smoke:** run one real small purchase (Pioneer 400 / Rp2,000,000 or
   the smallest approved package) end-to-end: create purchase → Snap page →
   pay → webhook → wallet credit once. Verify the redirect return and the
   balance page.
4. Record the switch timestamp and transaction reference in the ops log.

---

## 6. Rollback

Rollback means redeploying the last known-good application image and matching
Midtrans configuration. For an emergency payment stop, set
`PAYMENT_PROVIDER=stub` only after confirming no real checkout can be created.
Do not re-enable the retired provider. In-flight Midtrans payments require
Midtrans status reconciliation before or after the rollback.

---

## 7. Refund path

`adminRefund` is **in-app Marks credits only** (N1, PRD §677) — it never calls
the provider. Midtrans implements the `refund()` port
(`POST /v2/{order_id}/refund`) for a future payment-error-only cash-refund
flow, but it is not wired into `adminRefund`.

---

## 8. Reference

- Midtrans Snap integration guide: <https://docs.midtrans.com/docs/snap-integration-guide>
- Webhook notification + signature verification: <https://docs.midtrans.com/docs/https-notification-webhooks>
- Transaction status cycle: <https://docs.midtrans.com/docs/transaction-status-cycle>
- Sandbox test cards: <https://docs.midtrans.com/docs/testing-payment-on-sandbox>
- Notification egress IPs: <https://docs.midtrans.com/docs/ip-address>
