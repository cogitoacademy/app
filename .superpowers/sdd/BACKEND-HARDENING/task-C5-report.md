# Task C5 Report: Webhook IP allowlisting (DEFERRED-OPS 1.5)

**Status:** DONE

## Commit

- `7d6c81b` `fix(webhooks): add optional IP allowlist for payment webhooks (DEFERRED-OPS 1.5)`

## Changes

### `packages/env/src/server.ts`

Added the optional env var:

```ts
WEBHOOK_ALLOWED_IPS: z.string().optional(),
```

Comma-separated IP string; absent by default → allowlist off (allow all). Signature verification remains the primary control.

### `apps/server/src/webhooks/payments.ts`

- Added exported helper:

```ts
export function ipAllowed(request: Request, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "";
  return allowlist.some((entry) => entry === ip);
}
```

- Wired it at the top of the `POST /webhooks/payments/:provider` handler — before the idempotency check and before any logging/processing — returning `403 { error: "Forbidden" }` when the client IP is not allowlisted.

### `apps/server/src/webhooks/allowlist.test.ts` (new)

Test location chosen in `apps/server/` because `ipAllowed` lives in `apps/server/src/webhooks/payments.ts`; a test under `packages/api` importing across package boundaries was awkward. Tests cover:

- empty allowlist → `true` (allow all)
- listed IP via `x-forwarded-for` (first value, trimmed) → `true`
- listed IP via `x-real-ip` when `x-forwarded-for` absent → `true`
- unlisted IP → `false`
- no IP headers present → `false`

## Verification

- `bun test --env-file apps/server/.env apps/server/src/webhooks/` → 5 pass, 0 fail
- `bun test --env-file apps/server/.env packages/api/src/tests/unit/` → 1213 pass, 0 fail (no regressions)
- `bun run check-types` → all 3 tasks successful
- Pre-commit hooks (format + lint via lefthook) passed

## Notes

- `WEBHOOK_ALLOWED_IPS` parses using `env.WEBHOOK_ALLOWED_IPS ?? ""` → split on comma, trim, filter empty entries, consistent with brief.
- No frontend touched. Production behavior: since the var is optional and defaults off, existing deployments are unaffected until they set it.
