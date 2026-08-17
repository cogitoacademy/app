# Task C2 Report: Fix dead payment rate-limit path

## Status: DONE

## What was wrong

`apps/server/src/routes.ts:176` matched `path === "/rpc/payment.createIntent"`, but the
ORPC procedure registered in `packages/api/src/modules/payment/payment.router.ts:7` is
`createPurchase` (route path `/payment/purchase`), producing the RPC path
`/rpc/payment.createPurchase`. The 5/min `paymentRateLimit` therefore never fired for
the actual purchase request.

Verified before changing:

- `routes.ts:176` had `"/rpc/payment.createIntent"` (confirmed bug).
- `payment.router.ts:7` registers `createPurchase`.
- `paymentRateLimit` (5 req / 60s, `keyPrefix: "payment"`) is defined at `routes.ts:35-40`
  and was already imported/in-scope.

## Changes made

1. `apps/server/src/routes.ts:176` — changed match to `/rpc/payment.createPurchase`.
   Single occurrence; grep confirms no `createIntent` remains in `apps/server/src`.
2. `apps/server/src/rate-limit.test.ts` — new test. Used the deterministic `readFileSync`
   approach from the brief (Step 2) rather than a full `createServer()` integration test;
   it is simple, has no env/Redis dependencies, and directly asserts the constant matches
   the registered procedure name.

## Verification (all run)

- `bun test --env-file apps/server/.env apps/server/src/rate-limit.test.ts`
  → 1 pass, 0 fail (`rate limiter targets payment.createPurchase`, 2 expect calls).
- `bun run check-types`
  → turbo: 3 successful, 2 cached (server: `tsc -b` cache miss, executed clean).
- Pre-commit lefthook hooks (format + lint) passed on commit.

## Commit

`41483f8` — `fix(server): point payment rate limiter at payment.createPurchase`
(2 files changed, +14 / -1)

## Concerns

None. Frontend, packages/api, and the payment router were untouched.
