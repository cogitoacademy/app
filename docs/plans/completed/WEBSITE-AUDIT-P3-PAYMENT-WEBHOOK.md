# Website Audit P3 Payment Webhook

Status: Completed  
Date: 2026-08-29  
Branch: `f/website-audit-hardening`

## Finding

Xendit's 2024-11-11 webhook payload identifies a payment or payment request,
not every lifecycle delivery. Using that identifier alone as the Redis claim
key could make an earlier state suppress a later state for the same payment.
When an event id was absent but a provider reference existed, all such events
also shared the same `no-event-id` key.

## Delivered

- Compose the claim key from provider, verified event/payment id (or provider-reference fallback), and normalized lifecycle status.
- Preserve deduplication for an identical retry while allowing a later state for the same payment to be processed.
- Keep the provider event id itself unchanged for database matching and stale-generation protection.
- Add regression coverage for distinct statuses and the missing-event-id fallback.

## Verification

- Focused webhook/provider tests cover lifecycle keys, the 120-second claim window, Xendit parsing, permanent failures, and retryable failures.
