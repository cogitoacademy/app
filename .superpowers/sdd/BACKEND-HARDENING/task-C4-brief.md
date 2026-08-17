### Task C4: JSDoc on public functions (DEFERRED-OPS 1.7)

**Files:**

- Modify: all `packages/api/src/modules/*/{service,repo,handler,router}.ts` public functions; `apps/server/src/{routes,scheduler}.ts` exported functions.

**Interfaces:**

- Produces: `@param`, `@returns`, `@throws` on all exported functions.

- [ ] **Step 1:** Enumerate public functions (exported from each module index + routers). For each, add JSDoc. Example for `pricing.service.ts` (use the CURRENT 2-arg `computeSplit` signature as it exists at C4 execution time; the signature changes to 3-arg in Task C7 — update this JSDoc again if you write it before C7):

```ts
/**
 * Validates tutor-set prices against the Cogito floor for each group size.
 *
 * @param prices - map of group size (as string) to price in Marks
 * @param modality - online/offline/both (both takes the max floor)
 * @returns an error message string, or null when all prices are valid
 * @throws {never} - returns a string instead of throwing
 */
```

Priority order: `wallet.service.ts`, `booking.service.ts`, `payment.service.ts`, `pricing.service.ts`, `notification.service.ts`, `tutor.service.ts`, `admin-booking.service.ts`, then all `*.repo.ts` public methods.

- [ ] **Step 2:** Verify types + lint.

Run: `bun run check-types`
Run: `bunx oxlint --format=github`
Expected: PASS (JSDoc-only changes).

- [ ] **Step 3: Commit** (one commit per module, or a single docs commit if reviewers prefer)

```bash
git add packages/api/src
git commit -m "docs(api): add JSDoc to public service and repo functions (DEFERRED-OPS 1.7)"
```

### Task C5: Webhook IP allowlisting (DEFERRED-OPS 1.5)
