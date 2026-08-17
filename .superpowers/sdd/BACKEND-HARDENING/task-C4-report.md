# Task C4 Report: JSDoc on public functions (DEFERRED-OPS 1.7)

**Status:** DONE
**Branch:** `improvement/backend-correctness`

## Summary

Added JSDoc (`@param`, `@returns`, `@throws`) to all public service methods, all `*.repo.ts` public methods, and the exported functions in `apps/server/src/{routes,scheduler}.ts`. Doc-only; no behavior/signature/logic changes.

## Files Changed (24)

### Services (7)

| File                                                              | Functions documented                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api/src/modules/wallet/wallet.service.ts`               | `createWalletService`, `getOrCreate`, `hold`, `release`, `deduct`, `credit`, `compensate`, `listLedger`, `knowledgeBankEligible`, `listActivePackages`, `reconcile` _(prior implementer, kept)_ |
| `packages/api/src/modules/booking/booking.service.ts`             | `createBookingService`, `getById`, `listMine`, `createSolo`, `cancel` _(prior implementer, kept)_                                                                                               |
| `packages/api/src/modules/pricing/pricing.service.ts`             | `validatePrices`, `computeSplit` (2-arg signature, kept for C7), `createPricingService` _(prior implementer, kept)_                                                                             |
| `packages/api/src/modules/payment/payment.service.ts`             | `createPaymentService`, `createIntent`, `confirmFromWebhook`, `getPurchase`                                                                                                                     |
| `packages/api/src/modules/notification/notification.service.ts`   | `createNotificationService`, `write`, `writeBestEffort`, `list`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, `dispatchStatus`                                                              |
| `packages/api/src/modules/tutor/tutor.service.ts`                 | `validateUpdateInput`, `validateSubmitForReview`, `createTutorService`, `getMyProfile`, `updateMyProfile`, `submitForReview`, `listAvailability`, `upsertAvailability`, `deleteAvailability`    |
| `packages/api/src/modules/admin-booking/admin-booking.service.ts` | `createAdminBookingService`, `applyOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`                                                                                           |

### Repos (15)

All `*.repo.ts` files, documenting every public method exposed via the factory `create*Repo` and/or direct `export async function`:
achievement, admin-booking, admin-tutor, admin, audit, auth, booking, invite, notification, payment, refund, room, tutor-discovery, tutor, wallet.

### Server entrypoints (2)

| File                           | Functions documented                 |
| ------------------------------ | ------------------------------------ |
| `apps/server/src/routes.ts`    | `createServer`                       |
| `apps/server/src/scheduler.ts` | `initScheduler`, `shutdownScheduler` |

## Style

Followed the brief's example JSDoc style (summary + `@param name - description` + `@returns` + `@throws {ErrorType}` where relevant). Throws documented only for services that actually throw (e.g. `BookingNotFoundError`, `InsufficientBalanceError`, `TutorProfileNotFoundError`). Repos generally do not throw domain errors and are documented with `@param conn`, `@param ...`, `@returns`. Added JSDoc blocks at the same indentation as their target function (0-indent for top-level repo/service functions, 2-indent for functions nested inside factory closures).

## Notes / Decisions

- `computeSplit` kept at its CURRENT 2-arg signature `(totalMarks, groupSize)` as instructed; Task C7 will change the signature later in the PR.
- Did NOT document private non-exported helpers (e.g. `writeInternal` in notification.service.ts) since they are not part of the public surface.
- Handlers/routers/index.ts were out of scope per the dispatch instruction (only services, repos, and routes/scheduler entrypoints were listed); no changes made to them.
- One unintended indentation corruption in `achievement.repo.ts` (top-level functions shifted to 2-space indent) was introduced and fully corrected — the file diff is now purely JSDoc additions.

## Verification

```
bun run check-types  →  Tasks: 3 successful, 3 total (web build ran as part of check)
bunx oxlint --format=github  →  0 errors, 20 warnings (all pre-existing, none in JSDoc-added lines)
```

## Commit

`docs(api): add JSDoc to public service and repo functions (DEFERRED-OPS 1.7)` — single commit including both the prior uncommitted partial work (wallet/booking/pricing services) and the new additions.

## Concerns

- None blocking. JSDoc `@throws` entries reflect the code as written at C4 time; if C7 changes `computeSplit` or other signatures, the affected JSDoc should be revisited in that task.
- Lint warnings (no-await-in-loop, no-shadow, etc.) are pre-existing and unrelated to this doc-only change.
