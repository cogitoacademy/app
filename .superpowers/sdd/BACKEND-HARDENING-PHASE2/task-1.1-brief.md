### Task 1.1: Gate the stub payment checkout behind an explicit flag

> **Status (verified 2026-08-14, HEAD `9b7df5e`):** NOT IMPLEMENTED — `STUB_WEBHOOK_ALLOWED` / `stubCheckoutEnabled` absent from `apps/server/src/webhooks/payments.ts` and `packages/env/src/server.ts`.

**Files:**

- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/src/webhooks/payments.ts:129-151`
- Create: `apps/server/src/webhooks/stub-checkout.test.ts`

**Interfaces:**

- Consumes: `env.PAYMENT_PROVIDER`, `env.NODE_ENV` (existing).
- Produces: env `STUB_WEBHOOK_ALLOWED` (boolean, default `false`); exported `stubCheckoutEnabled(): boolean`; the stub checkout route returns 404 unless the flag is set AND `PAYMENT_PROVIDER === "stub"` AND `NODE_ENV !== "production"`.

- [ ] **Step 1: Add the env flag**

Edit `packages/env/src/server.ts`, in the `optional` block near `PAYMENT_PROVIDER`:

```ts
STUB_WEBHOOK_ALLOWED: z.coerce.boolean().default(false),
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/webhooks/stub-checkout.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { stubCheckoutEnabled } from "./payments";

describe("stubCheckoutEnabled", () => {
  test("false when not production-only guarded and flag unset", () => {
    // The helper reads env; to keep it pure, give it explicit args instead:
    expect(stubCheckoutEnabled("development", "stub", false)).toBe(false);
  });
  test("true only when all three conditions hold", () => {
    expect(stubCheckoutEnabled("development", "stub", true)).toBe(true);
    expect(stubCheckoutEnabled("production", "stub", true)).toBe(false);
    expect(stubCheckoutEnabled("development", "xendit", true)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test --env-file apps/server/.env apps/server/src/webhooks/stub-checkout.test.ts`
Expected: FAIL (`stubCheckoutEnabled is not a function`).

- [ ] **Step 4: Implement the guard**

Edit `apps/server/src/webhooks/payments.ts`. Prefer an explicit-args helper (testable without env mocks):

```ts
export function stubCheckoutEnabled(
  nodeEnv: string,
  provider: string,
  allowed: boolean,
): boolean {
  return nodeEnv !== "production" && provider === "stub" && allowed === true;
}
```

Replace the existing guard in the stub checkout handler:

```ts
if (
  !stubCheckoutEnabled(
    env.NODE_ENV,
    env.PAYMENT_PROVIDER,
    env.STUB_WEBHOOK_ALLOWED,
  )
) {
  set.status = 404;
  return { error: "Not found" };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test --env-file apps/server/.env apps/server/src/webhooks/`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/env/src/server.ts apps/server/src/webhooks/payments.ts apps/server/src/webhooks/stub-checkout.test.ts
git commit -m "fix(webhooks): require STUB_WEBHOOK_ALLOWED flag for stub checkout route"
```
