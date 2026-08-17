# Task C7 Report — G19: Pricing extra-take rule (PRD FR-05, FR-19, DL-22, TC-06)

Branch: `improvement/backend-correctness` · Commit: `fix(pricing): implement PRD extra-take split rule (G19)`

## Summary

Replaced the flat `COGITO_TAKE_RATE` (20% of total) split in `computeSplit` with the PRD baseline-table + `floor(extraTotal / 5)` extra-take rule. Verified against `docs/prd.tex:768-829` (tables and extra-take examples) before implementation; all numbers match the brief.

## Changes per step

### Step 1 — constants.ts

Added `ONLINE_BASELINE_SPLIT` and `OFFLINE_BASELINE_SPLIT` (tutor/cogito per group size 1–6), transcribed from the brief / PRD tables exactly. Verified against `docs/prd.tex:768-804`:

| Modality | Sizes | PRD matches brief?                                |
| -------- | ----- | ------------------------------------------------- |
| online   | 1–6   | yes (30/12, 54/16, 64/20, 74/22, 81/24, 88/26)    |
| offline  | 1–6   | yes (35/15, 70/20, 95/25, 115/25, 120/30, 127/35) |

### Step 2 — pricing.service.ts

- Rewrote `computeSplit` to `(modality, tutorPricePerStudent, confirmedHeadcount)` per the brief.
- `PriceSnapshot` extended to 9 fields (perStudent, baseline, tutorShare, cogitoTake, baselineCogitoTake, baselineTutorShare, extraTotal, cogitoExtraTake, tutorExtraShare). `baseline` now = **baseline total** (floor tutor + floor cogito).
- `PricingPort` updated to the 3-arg signature.
- Removed `COGITO_TAKE_RATE` from the import (no longer used by `computeSplit`). Constant stays in `constants.ts` for G16/payout. `MODALITY` import kept (used by `getFloorPrices`/`getBaselineSplit`).
- `validatePrices` untouched per global constraint.

### Step 3 — ports

- `booking/index.ts:32` `BookingPricingPort.computeSplit` → 3-arg signature (imported `Modality`).
- `tutor/index.ts:21` `TutorPricingPort.computeSplit` → 3-arg signature.

### Step 4 — booking.service.ts call sites + hold/originalMarks

- Solo (was line 305): `pricing.computeSplit(modality, prices["1"] ?? DEFAULT_SOLO_PRICE, 1)`; `totalMarks = priceSnapshot.perStudent * 1` (headcount 1).
- Group (was line 735): `pricing.computeSplit(input.modality, pricePerStudent, size)`; `totalMarks = priceSnapshot.perStudent * size`.
- Series (was line 1110): `pricing.computeSplit(input.modality, pricePerStudent, 1)`; `perSession = priceSnapshot.perStudent`; `totalMarks = perSession * sessions.length`.
- Note: `createGroup`/`createSeries` have no local `modality` var (they use `input.modality` throughout), so I passed `input.modality` there; `createSolo` already had `const modality = input.modality`.
- `originalMarks`/`holdAmount`/proposer `heldAmount` were already `totalMarks`, so once `totalMarks` equals the actual charge (`perStudent × headcount`) all of them follow the design decision automatically. No further edit needed at the old "lines 327/748/1125/1147" (those are now the `insertBooking` calls; verified each sets `originalMarks: totalMarks`, `holdAmount: totalMarks`; series per-session `holdAmount: perSession = perStudent`).

### Step 5 — DB schema

Extended `priceSnapshot` jsonb `$type` to 9 fields in `packages/db/src/schema/booking.ts` (booking `:68`, bookingSession `:258`). Also extended the inline `priceSnapshot` param type in `booking.repo.ts` `insertBookingSession` (compiler-required, since `insertBooking` uses `$inferInsert` and picks up the schema automatically).

`bun run db:generate` → **"No schema changes, nothing to migrate"**. No new migration produced (jsonb schemaless). Confirmed via `git status` — no migration files.

### Step 6 — pricing.service.test.ts

Rewrote the `computeSplit` describe block to the PRD TC-06 cases (brief's cases verbatim except one correction, see Concerns) plus one extra test asserting `perStudent` flooring and `baseline` = floor total.

### Step 7 — mock stubs

- `booking.service.test.ts` `makePricing().computeSplit` → 3-arg mock returning the full 9-field snapshot. Updated the 5 `priceSnapshot` fixtures (makeBooking + confirmInvite ×4) to the 9-field shape.
- `tutor.service.test.ts` `mockPricingPort.computeSplit` → 3-arg mock returning the full snapshot (typed as `PricingPort`, so the extended shape is required).
- `booking.repo.test.ts` 2 fixtures updated to the 9-field shape.

## Test results

| Command                                                                                                                                        | Result                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test --env-file apps/server/.env packages/api/src/tests/unit/pricing.service.test.ts packages/api/src/tests/unit/booking.service.test.ts` | **120 pass, 0 fail**                                                                                                                                                                                                                      |
| touched unit files (pricing + booking.service + tutor.service + booking.repo)                                                                  | **179 pass, 0 fail, 374 expect() calls**                                                                                                                                                                                                  |
| `bun run check-types`                                                                                                                          | **PASS** (3 tasks, 0 errors)                                                                                                                                                                                                              |
| `bun run test:coverage`                                                                                                                        | suite passes the 13 pre-existing failures aside (see below); touched-file coverage: pricing.service 100% statements/branches, booking.service 100% stmts/97.5% branches, booking.repo 92.1% stmts/92.7% branches — all above the 90% gate |

PRD TC-06 assertions verified:

- online class 1 @ 50 → extraTotal 8, cogitoExtraTake 1, tutorExtraShare 7, tutorShare 37, cogitoTake 13 (matches prd.tex:827)
- online class 3 @ 32 → extraTotal 12, cogitoExtraTake 2, tutorShare 74, cogitoTake 22 (matches prd.tex:829)
- floor cases (online 1 @42, online 3 @28, offline 2 @45) → zero extra, baseline shares
- extra 4 → cogitoExtra 0, all to tutor; extra 5 → cogitoExtra 1, 4 to tutor

## Files changed

```
packages/api/src/shared/constants.ts
packages/api/src/modules/pricing/pricing.service.ts
packages/api/src/modules/booking/index.ts
packages/api/src/modules/tutor/index.ts
packages/api/src/modules/booking/booking.service.ts
packages/api/src/modules/booking/booking.repo.ts
packages/db/src/schema/booking.ts
packages/api/src/tests/unit/pricing.service.test.ts
packages/api/src/tests/unit/booking.service.test.ts
packages/api/src/tests/unit/booking.repo.test.ts
packages/api/src/tests/unit/tutor.service.test.ts
```

## db:generate outcome

`bun run db:generate` → **"No schema changes, nothing to migrate"**. No new migration file was created (jsonb `$type` change is a type-only, no-SQL diff). Verified via `git status` (only the 11 intended files modified, no `drizzle/` additions).

## Self-review findings

- Verified PRD tables and extra-take examples against `docs/prd.tex` before transcribing — all consistent.
- Confirmed no other consumers of `PriceSnapshot`/`computeSplit` remain on the old signature (`grep computeSplit`, `.baseline`, `.perStudent`, etc. across packages).
- `COGITO_TAKE_RATE` now referenced only in `constants.ts` (kept for G16/payout), removed from pricing.service import.
- Formatting: ran `oxfmt --write` on the 4 files oxfmt flagged; re-ran tests + types after formatting (green).
- Lint: 20 warnings / 0 errors, all pre-existing (frontend + `no-await-in-loop` at booking.service.ts:209 in `releaseAllParticipantHolds`, untouched by this diff).
- Full-suite `test:coverage`: **13 pre-existing failures** (Admin Override, setRole audit, Booking cancel/decline/group/series/solo flows, Knowledge Bank, Notification list, PaymentService, Tutor availability, Tutor discovery, Wallet ledger). Verified identical on the clean tree (`git stash` → same 13 fail on `ad03a80`). Not introduced by this task.

## Concerns

1. **Brief test-value correction (the one deviation):** The brief's test "extra total of 5 → Cogito extra 1, 4 to tutor" asserted `tutorShare === 36`. For online size 1 the baseline tutor share is 30 (prd.tex:772), so with extra 5 → Cogito extra 1, tutor extra 4 → tutorShare = 34. `36` is arithmetically impossible (would make Cogito take 11 and total ≠ 47). PRD text (prd.tex:821) and the test's own title both say "4 to tutor". I changed the assertion to **34**. Flagging so the plan owner can confirm this was a typo in the brief.
2. **`modality = "both"`** in `computeSplit` falls back to the online table (brief's code does this). No booking flow passes `both` (schema CHECK constrains booking.modality to online/offline), so this is theoretical only.
3. **Below-floor input** to `computeSplit` (not reachable — `validatePrices` rejects below-floor at publish, and both are gated) would produce a negative `tutorExtraShare`. Guard `extraTotal > 0` on cogitoExtraTake already prevents negative Cogito take; behavior matches the brief's code verbatim.
