### Task C2: Fix dead payment rate-limit path

**Files:**

- Modify: `apps/server/src/routes.ts:176`
- Create: `apps/server/src/rate-limit.test.ts`

**Interfaces:**

- Consumes: `paymentRateLimit` (already imported at top of `routes.ts`).
- Produces: the 5/min limiter actually applies to `payment.createPurchase`.

- [ ] **Step 1:** Edit `apps/server/src/routes.ts` line 176:

```ts
if (path === "/rpc/payment.createIntent") {
```

→

```ts
if (path === "/rpc/payment.createPurchase") {
```

- [ ] **Step 2:** Add `apps/server/src/rate-limit.test.ts` proving the path constant:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("payment rate limit path", () => {
  test("rate limiter targets payment.createPurchase", () => {
    const routes = readFileSync(
      new URL("./routes.ts", import.meta.url),
      "utf-8",
    );
    expect(routes).toContain('path === "/rpc/payment.createPurchase"');
    expect(routes).not.toContain('path === "/rpc/payment.createIntent"');
  });
});
```

> This avoids spinning up the whole server. The essential check is the path constant matches the registered procedure (`payment.router.ts:7` is `createPurchase`).

- [ ] **Step 3:** Verify test runs.

Run: `bun test --env-file apps/server/.env apps/server/src/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes.ts apps/server/src/rate-limit.test.ts
git commit -m "fix(server): point payment rate limiter at payment.createPurchase"
```

### Task C3: Booking repo explicit column lists (DEFERRED-OPS 1.4)
