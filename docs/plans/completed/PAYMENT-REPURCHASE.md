# Repeatable Mark Package Purchases

**Status:** Completed 2026-09-03

## Objective

Allow a student to purchase the same Mark package repeatedly. A previous
successful, settled, failed, expired, or refunded payment must remain available
for audit and webhook reconciliation without acting as a package-level lock.

## Behavior

- The latest `PENDING` attempt is reused so a refresh does not create a second
  checkout.
- Every terminal attempt creates a new `payment_record` and unique provider
  reference on the next purchase.
- Webhooks for separate attempts resolve to separate records and separate
  `purchase.{paymentId}` wallet-credit idempotency keys.
- Legacy rows using the original provider reference remain discoverable through
  the fallback lookup.

## Verification

- Payment service unit tests cover repurchase after `PAID`, `FAILED`, and
  `EXPIRED` outcomes.
- Payment-flow integration tests cover both failed and successful repurchases
  against Postgres, including separate rows and wallet credits.
- Payment repository unit tests cover selecting the latest user/package/provider
  attempt.
