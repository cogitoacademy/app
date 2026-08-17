### Task C6: Remove dead code

**Files:**

- Delete: `apps/server/src/middleware.ts`
- Delete: `packages/api/src/modules/scheduler/index.ts` facade (only if `createSchedulerModule`/`SchedulerModule` have zero consumers — verified)
- Delete: `packages/api/src/lib/db-errors.ts` (zero imports; `admin-tutor.service.ts` has its own private `isUniqueViolation` copy)
- Modify: `packages/env/src/server.ts` — remove `KNOWLEDGE_BANK_URL`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT` (no consumers)
- Modify: `packages/api/src/modules/wallet/wallet.service.ts:367` — remove `reconcile()` if no caller (only tests call it)
- Modify: `packages/api/src/modules/notification/notification.service.ts:231` — remove `dispatchStatus()` if not exposed (no router)

**Interfaces:**

- Produces: no orphaned files/exports. All deletions must be confirmed grep-empty first.

- [ ] **Step 1:** For each candidate, confirm zero references:

```bash
grep -rn "middleware" apps/server/src --include="*.ts" | grep -v "middleware.ts"
grep -rn "createSchedulerModule\|SchedulerModule" --include="*.ts" . --exclude-dir=node_modules --exclude-dir=dist
grep -rn "db-errors\|isUniqueViolation\|classifyDbError" packages/api/src --include="*.ts"
grep -rn "KNOWLEDGE_BANK_URL\|SENTRY_DSN\|SENTRY_ENVIRONMENT" --include="*.ts" . --exclude-dir=node_modules
grep -rn "\.reconcile(\|reconcile(" packages/api/src --include="*.ts" | grep -v "test"
grep -rn "dispatchStatus" packages/api/src --include="*.ts" | grep -v "test"
```

Expected: matches only in the files being deleted/modified (or test files, which are updated/deleted alongside).

- [ ] **Step 2:** Delete/modify accordingly. If a test only exercises the deleted function (e.g., `reconcile` in `wallet.service.test.ts`), remove that test block.

- [ ] **Step 3:** Verify.

Run: `bun run check-types`
Run: `bun test --env-file apps/server/.env packages/api/src/tests/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove dead code (middleware, scheduler facade, db-errors, unused env, orphan exports)"
```

### Task C7: G19 — Pricing extra-take rule (PRD FR-05, FR-19, DL-22, TC-06)
