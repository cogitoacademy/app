# Final Scope v3 review against the app

Date: 2 November 2026.

Source: `FINAL SCOPE - Cogito Academy v3.pdf` (client document dated 12 October 2026).
Compared against the current app, the website reference checkout, and the
automated evidence in [V3-UAT-AUTOMATED-EVIDENCE.md](V3-UAT-AUTOMATED-EVIDENCE.md).

This review answers two questions:

1. Which final-scope items are already implemented?
2. Which items are missing, different, or only partially verified?

It is not a claim of client acceptance.

## Summary

| Category                                    | Count |
| ------------------------------------------- | ----: |
| Core scope items already present            |    21 |
| Missing items that need build or a decision |     8 |
| Behavior mismatches                         |     4 |
| Items present but not fully verified        |     9 |

The biggest product gaps are:

1. The second Classes list, **Upcoming classes**, does not exist.
2. Class cover images upload but are never displayed.
3. Website Activities is one Classes section plus Other, not explicit
   Masterclasses, Cohorts, and Other sections.
4. Exact top-up still offers both custom and recommended package; the final
   scope says offer the package only when it is at least as cheap.
5. Admin referral settings and KOL pause lack UI.
6. A bank-transfer top-up credited by an admin is not supported, so the matching
   KOL trigger cannot occur.
7. Legal name and NIK are optional on tutor profile submission, while the final
   scope says they are required when the profile is completed.

## Already present

| Area         | Final-scope item                                          | Evidence                                             |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------- |
| Prices       | Four package prices and rates                             | Balance page and economy settings                    |
| Prices       | Exact top-up tiers and surcharge                          | Custom top-up preview                                |
| Prices       | Online/offline per-student formulas                       | Booking quote and offline group quote                |
| Prices       | Admin-editable package, rate, increments, offline figures | `/admin-economy`                                     |
| Prices       | Tutor fee table visible to tutor                          | Tutor drawer and profile                             |
| Classes      | Cohort and masterclass object                             | Class 137 and 138                                    |
| Classes      | Per-session tutor, title, curriculum, capacity, mode      | Class editor and detail                              |
| Classes      | Publish creates one Meet per online session               | 5 Meet URLs created                                  |
| Classes      | Three plans for cohort; one for masterclass               | Enrollment panel                                     |
| Classes      | Held Marks and per-session deduction                      | Full/half/single/masterclass runs                    |
| Classes      | Half-plan second installment                              | Argya paid 22                                        |
| Classes      | Late joining and price lock                               | Half join after session 1; 15-minute checkout expiry |
| Returns      | Marks-only returns and 20% seat fee                       | Athena fee 5 / return 20; Argya fee 4 / return 18    |
| Reports      | One report per session, three fields, 600 chars           | Cohort, masterclass, private reports                 |
| Reports      | Student and admin PDF export                              | PDF 200 with `%PDF-`; admin export                   |
| Payouts      | Tax status, rate defaults, preview, record, void          | Rp1,260,000 gross / Rp37,800 tax / Rp1,222,200 net   |
| Referrals    | Friend reward, semester cap, KOL campaign terms           | Referral and campaign screens                        |
| Auth         | OTP in registration form; Google referral step            | Source and synthetic checks                          |
| Classes page | Cohort cards and masterclass cards                        | `/classes`                                           |
| Calendar     | App-backed calendar with distinct same-title events       | Two events displayed separately                      |
| KB           | App-backed KB with private PDF                            | File 200 authenticated / 401 anonymous               |

## Missing items

| ID  | Item                                                   | Status                                                                                                                                     |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| M01 | Upcoming classes list with cohort-session parent badge | **Done.** App classes page lists future sessions sorted by date, with a parent badge.                                                      |
| M02 | Class cover display                                    | **Removed by decision.** Cover storage, upload, schema column, and API field are gone.                                                     |
| M03 | Website Activities split into three sections           | **Kept as-is by decision.** Single Classes section plus Other.                                                                             |
| M04 | Individual cohort sessions on website Activities       | **Done.** Upcoming cohort sessions list with parent badge and app handoff.                                                                 |
| M05 | Admin referral settings UI                             | **Done.** Edit dialog with welcome Marks, friend reward, semester cap, reason, and version check.                                          |
| M06 | KOL campaign pause                                     | **Done.** Pause/resume action stores `pausedAt`; new signups stop, existing choices keep their window.                                     |
| M07 | Manual bank-transfer top-up credited by admin          | **Open decision.** PDF says the admin-credited top-up counts for KOL commission. Tutor and KOL payout recording already exists separately. |
| M08 | Legal name/NIK required at profile completion          | **Kept as-is by decision.** Tax fields stay optional until payout preparation.                                                             |

## Behavior mismatches

| ID  | Final-scope rule                                                                                    | Current app                                                           |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D01 | If exact top-up costs at least the next package, checkout offers the package **and not** the top-up | Balance page keeps both custom amount and recommended package visible |
| D02 | Class creation includes a supplied cover image                                                      | **Removed by decision.** No cover field or asset.                     |
| D03 | Website Activities has three named sections                                                         | **Kept as-is by decision.** One Classes section plus Other.           |
| D04 | Admin economy page shows the 1-to-6 table for each competition before saving                        | Preview selects one competition at a time                             |

D01 and D04 still need an explicit product decision before changing behavior,
because the earlier PRD kept both custom and recommended choices and a
single-competition preview. The newer final scope should win if it is the
approved baseline.

## Partially verified

| ID  | Item                                                         | Current state                                              |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| P01 | Minimum-enrollment check: continue, postpone once, cancel    | UI/API present; not executed end-to-end                    |
| P02 | Three-day penalty-free exit after postponement               | Code path present; not executed                            |
| P03 | Second-half H-7 and H-1 reminders                            | Scheduler present; not observed                            |
| P04 | Removed student rejoins future sessions at current half rate | UI copy and quote path present; not executed               |
| P05 | Full cohort withdrawal (half-plan withdrawal tested)         | Half withdrawal tested; full not                           |
| P06 | Same-time tutor replacement                                  | UI/API present; not executed                               |
| P07 | KOL commission, transfer, refund, monthly CSV                | Source/API and prior DB tests; live commission not created |
| P08 | Tax CSV after the new recorded/voided batch                  | Earlier CSV verified; new batch not exported               |
| P09 | PDF continuation for overflowing text                        | Max tested text fit one page; continuation not exercised   |

## Provider or external gates

Not automatable in this local run without a decision:

- Midtrans browser checkout, signed webhook, provider return, duplicate events.
- OTP email delivery and real Google OAuth consent.
- Real bank transfers for tutor payout or KOL settlement.
- Joining a live Google Meet.
- Client UAT, Q14 named approver, OPS01, production cutover.

## Offline room audit

Room flow tested against the real dev API:

| Case                                                    | Result                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Create small room capacity 1 and large room capacity 10 | Pass                                                             |
| Solo offline booking requests small room                | `roomRequested=true`                                             |
| Tutor accepts offline booking                           | `awaiting_admin_room_approval`                                   |
| Admin assigns small room                                | `scheduled`                                                      |
| Admin relocates to large room                           | Old row `relocated`; new row `confirmed`                         |
| Availability of occupied large room                     | `false`                                                          |
| Group of 2 requests capacity-1 room                     | `roomRequested=false`, `roomConflict=true`, no room row          |
| Class session capacity 5 in capacity-1 room             | 400 room-capacity error                                          |
| Assign capacity-1 room to group of 2                    | Rejected by service test                                         |
| All rooms occupied at same time                         | Not fully exercised; needs a second tutor to avoid tutor overlap |

Code changed:

- `room.service.ts` checks room capacity on request, assignment, and relocation.
- `room.repo.ts` reads booking target group size.
- `room.errors.ts` returns `ROOM_CAPACITY_EXCEEDED`.
- `booking.service.ts` marks capacity failure as `roomConflict`.
- Requested room rows are marked relocated when an admin assigns a confirmed room.

Tests:

- `room.service.test.ts`: 48 pass.
- Root typecheck: 4/4 pass.

## Recommended order

1. Add **Upcoming classes** and the cohort-session parent tag. This is the largest
   visible scope gap.
2. Render class covers in app and website cards/details.
3. Split website Activities into Masterclasses, Cohorts, and Other sections.
4. Decide exact-top-up behavior and align the balance page.
5. Add admin referral settings and KOL pause.
6. Decide whether manual bank-transfer top-ups are in or out of scope.
7. Enforce legal name/NIK at tutor profile completion if the final scope is
   literal.
8. Run remaining time-bound class lifecycle checks: minimum check, postponement,
   second-half reminders, rejoin.
