### Task C5: Webhook IP allowlisting (DEFERRED-OPS 1.5)

**Files:**

- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/src/webhooks/payments.ts`

**Interfaces:**

- Consumes: new env var `WEBHOOK_ALLOWED_IPS` (optional string, comma-separated IPs).
- Produces: non-production requests to `/webhooks/payments/:provider` from disallowed IPs → 403. Allowlist off by default (empty → allow all; signature verification remains the primary control).

- [ ] **Step 1:** Add env var. Edit `packages/env/src/server.ts`:

```ts
WEBHOOK_ALLOWED_IPS: z.string().optional(),
```

- [ ] **Step 2:** Add helper in `apps/server/src/webhooks/payments.ts`:

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

Wire it at the top of the webhook handler (before idempotency check):

```ts
const allowlist = (env.WEBHOOK_ALLOWED_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!ipAllowed(request, allowlist)) {
  set.status = 403;
  return { error: "Forbidden" };
}
```

Export `ipAllowed` for testing.

- [ ] **Step 3:** Add tests for the helper in `packages/api/src/tests/unit/webhook-idempotency.test.ts` (or a new `webhook-allowlist.test.ts`): empty allowlist → true; listed IP → true; unlisted IP → false.

- [ ] **Step 4:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/env/src/server.ts apps/server/src/webhooks/payments.ts
git commit -m "fix(webhooks): add optional IP allowlist for payment webhooks (DEFERRED-OPS 1.5)"
```

### Task C6: Remove dead code
