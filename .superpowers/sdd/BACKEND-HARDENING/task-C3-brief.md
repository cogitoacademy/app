### Task C3: Booking repo explicit column lists (DEFERRED-OPS 1.4)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.repo.ts`
- Modify: `packages/api/src/tests/unit/booking.repo.test.ts`

**Interfaces:**

- Consumes: `getTableColumns` from `drizzle-orm` (already used in `achievement.repo.ts`).
- Produces: all `.select()` calls on `booking`/`bookingParticipant` use explicit columns.

- [ ] **Step 1:** Add `getTableColumns` to the `drizzle-orm` import in `booking.repo.ts`. (`getTableColumns` is exported from `drizzle-orm` 0.45.2 — verified in `packages/api/node_modules/drizzle-orm/index.js:13` via `export * from "./utils.js"`. Note: the `achievement.repo.ts` usage exists only on PR #33, not main — do not copy from there.)

- [ ] **Step 2:** Replace `.select()` with explicit columns at lines 34, 84, 112, 119, 251, 295. Pattern:

```ts
.select({ ...getTableColumns(booking) })
```

For `bookingParticipant` queries (lines 84, 112, 119, 251) use `...getTableColumns(bookingParticipant)`; for `findBookingById` (line 34) use `...getTableColumns(booking)`.

> Do **not** use `select()` without a projection anywhere in this file after this task.

- [ ] **Step 3:** Update affected repo tests to assert the returned object has expected column keys (the fake chain returns canned rows; ensure projection includes `id`, `currentState`, `priceSnapshot`, etc. as needed).

- [ ] **Step 4:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/booking.repo.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.repo.ts packages/api/src/tests/unit/booking.repo.test.ts
git commit -m "refactor(booking): explicit column lists in booking repo (DEFERRED-OPS 1.4)"
```

### Task C4: JSDoc on public functions (DEFERRED-OPS 1.7)
