# Cogito Platform Release: Post-Meeting Scope

Date: October 11, 2026 | Status: Draft for client confirmation

This document compares the current application with planned changes. The latest referral system.md supersedes the meeting notes and original PRD for referral rules; meeting notes remain the reference for other areas. Original PRD figures not reconfirmed remain proposals. Findings use cogito-app commit 14dc4486 and the local cogito-acad website checkout, not a live production audit.

## 1. Current state and planned changes

| Area                     | Current state                                                                                                                           | Planned scope                                                                                                                                                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing and tutor fees   | Tutor profiles hold Marks prices and base fees; some economic settings are global.                                                      | Admin sets fees; tutors view them. Original PRD proposes central competition rates, additional fees per student and group pricing. Final figures need confirmation.                                                                                                                                                        |
| Payouts and tax          | Admin records payouts, reviews history and exports CSV. Non-BCA transfers cost Rp2.500 once per payout. No tax withholding implemented. | Handling depends on NPWP/tax-profile completeness; Cogito handles tax when data is missing. Show gross, deductions, net and notifications. Finance must confirm required data and 2.5%/3% rate mapping.                                                                                                                    |
| Marks                    | Wallet, ledger and packages exist; exact top-up does not.                                                                               | Recalibrate packages/conversion with VAT absorbed by Cogito. Exact top-up remains under research. Display clear prices and payment totals.                                                                                                                                                                                 |
| Cohort / regular classes | Private/group bookings and 2-4-session series exist; public seat-based cohorts do not.                                                  | Admin creates curriculum, schedules, capacity and tutor assignments. Students reserve/enroll and buy discounted full plans or configurable installments. November 1, 2026 target requires readiness confirmation.                                                                                                          |
| Cohort payments          | Enrollment/installments do not exist.                                                                                                   | Configure installment count, covered sessions, amounts and due dates; no automatic half split. Payment before session 7 of 12 is only an example. Later prices are explicit, not necessarily full price minus first payment.                                                                                               |
| Tutors and reports       | Availability, Meet, completion reports and completed-session fees exist.                                                                | Admin assigns tutors after external coordination, potentially per session or on the day. Proposed cohort reports: attendance, material covered, shared notes and optional individual notes.                                                                                                                                |
| Friend referrals         | No code/reward system found.                                                                                                            | Registration-only codes. Referred user: 15 Marks after verification; referrer: 15 after first eligible class completion; cap 75/semester. Latest document defaults.                                                                                                                                                        |
| KOL / influencers        | No code campaign management.                                                                                                            | Admin creates codes; influencers need no accounts. Signup deadlines and attribution windows apply; daily limits need confirmation. First successful IDR top-up triggers commission; partner rates/settlement differ from friend rewards.                                                                                   |
| CMS and website          | App reads Calendar/Knowledge Bank from Sanity. Website has an agenda view and Start Learning button.                                    | Merge Cogito 101, Townhall and Simulation Days into one Activities page on cogitoacademy.id. Migrate Activities, Knowledge Bank and Calendar to app database/API. Fix duplicate agenda entries. Update tutors after new app profiles are ready. Remove Start Learning; landing-page Activities removal needs confirmation. |
| Email registration       | OTP follows signup.                                                                                                                     | OTP inside registration form: input/send button in one row; create account after verification.                                                                                                                                                                                                                             |
| Google sign-in           | Integration exists.                                                                                                                     | Investigate “unverified” message/status. Distinguish Google consent warnings from account email status; cause unconfirmed.                                                                                                                                                                                                 |

## 2. Edge cases and rules to confirm

These are proposed safeguards, not additional meeting decisions.

- **Price changes:** confirmed transactions retain original price/fee snapshots. Do unpaid reservations lock prices, and for how long?
- **Tax:** completeness determines handling, not an optional tax-free mode. Cogito handles missing data; finance confirms validation, rates, deductions and VAT assumptions.
- **Last seat:** expiring reservations and atomic allocation. Late payments/repeated webhooks must not duplicate seats, credits or charges. Confirm payment after expiry.
- **Unpaid installments:** reminders, overdue status and restricted session access. Confirm grace periods, seat release and rejoining; disclose any automatic charges at checkout.
- **Cancellation/withdrawal:** distinguish Cogito cancellation, student withdrawal, absence and tutor no-show. Proposed refunds use Marks; plan-specific formulas and cash exceptions require agreement.
- **Same-day tutor changes:** check conflicts, notify parties and update access/schedules. Earlier fees stay with the previous tutor; agree replacement fees before recording. Confirm rescheduling/cancellation without a replacement.
- **Friend referrals:** welcome 15 after verification; referrer 15 after first completed private/masterclass. Cap 75/semester applies only to referrers. Credit once; prevent self-referral. Semester dates, expiry and reversal rules remain open.
- **KOL:** confirm any daily redemption/conversion limits, timezone, deadlines, compensation and settlement reporting. Attribution does not imply automated payouts.
- **Content:** inventory records, files, languages, URLs and relationships. Confirm editor roles, preview/publish, backup and rollback. Stop Sanity reads after verification. Multi-day events on different dates are not necessarily duplicates.
- **Google:** test new/existing accounts, consent, callbacks and email status; fix the confirmed cause.

## 3. Pricing, tutor fees and rewards

**Figure status:** “Current” means repository seed/default values, not verified production prices. “Proposed” comes from the original PRD unless stated otherwise. Meeting notes request VAT recalibration but give no replacement prices. Approve figures before applying them. VAT is absorbed in displayed prices, not automatically added at checkout. IDR amounts retain Indonesian number formatting.

### Marks packages: current vs proposed

| Package  | Current repository seed | Original PRD proposal   | Package change         |
| -------- | ----------------------- | ----------------------- | ---------------------- |
| Starter  | 50 Marks · Rp312.500    | 50 Marks · Rp337.500    | +Rp25.000; same Marks  |
| Learner  | 120 Marks · Rp690.000   | 150 Marks · Rp937.500   | +Rp247.500; +30 Marks  |
| Explorer | 200 Marks · Rp1.070.000 | 250 Marks · Rp1.462.500 | +Rp392.500; +50 Marks  |
| Pioneer  | 400 Marks · Rp2.000.000 | 500 Marks · Rp2.750.000 | +Rp750.000; +100 Marks |

Cost per Mark changes from Rp6.250/Rp5.750/Rp5.350/Rp5.000 to Rp6.750/Rp6.250/Rp5.850/Rp5.500. Larger increases also buy more Marks, so these are not equal-quantity comparisons. Existing balances are not automatically reduced by package price changes.

### Booking prices and tutor fees: proposed rate card

Current rates use tutor profiles/global settings; no single previous competition rate exists. Default extra fee per student: Rp30.000 online/Rp40.000 offline. Internal Marks value Rp5.000 is not every package's purchase rate.

Proposed rates for a 90-minute online session:

| Competition                                  | Solo price | Tutor fee: one student | Extra fee per student |
| -------------------------------------------- | ---------- | ---------------------- | --------------------- |
| Model UN / World Scholar's Cup               | 50 Marks   | Rp200.000              | Rp25.000              |
| Debate / Olympiad                            | 44 Marks   | Rp175.000              | Rp25.000              |
| Essay & Writing / Business / Public Speaking | 38 Marks   | Rp150.000              | Rp20.000              |

Per-student group price for 1-6 students = solo price × 1.00/0.80/0.64/0.52/0.46/0.42, rounded to the nearest Mark. MUN: 50/40/32/26/23/21 Marks each. Offline adds 20 Marks per student; offline tutor uplift is undecided. Fees use confirmed student count, not attendance. Admin controls rates; Rp20.000/Rp25.000/Rp30.000 extra fees need confirmation.

### Exact top-up: under research

Buy only the missing balance. Original curve: below 50 Marks, Rp7.000/Mark capped at Rp337.500 total; 50-149, Rp6.750 minus Rp5 per Mark above 50; 150-249, Rp6.250 minus Rp4 per Mark above 150; 250-499, Rp5.850 minus Rp1,40 per Mark above 250; 500+, Rp5.500/Mark. Total = Marks × rate, rounded to whole rupiah. Examples: 25 = Rp175.000; 49 = Rp337.500. Not confirmed for this release.

### Cohort prices, payouts and bonuses

| Item                     | Proposed figures / change                                                                  | Status                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| One cohort session       | 25 Marks; Rp175.000 top-up from zero                                                       | Original PRD; confirm                                   |
| Full 12-session cohort   | 240 Marks; Rp1.413.600 top-up from zero                                                    | Original PRD; cheaper per session                       |
| Two installments         | 132 + 132 Marks; Rp836.880 each if topping up from zero each time                          | Original reference; flexible installments requested     |
| Cohort tutor fee         | Rp400.000/session regardless of student count                                              | Original PRD; confirm                                   |
| Masterclass              | 5 Marks; tutor fee Rp300.000                                                               | Provisional original PRD                                |
| Tax withholding          | 2.5% or 3% of gross, then transfer fee                                                     | Meeting follow-up; conditions unconfirmed               |
| Rp400.000 gross, non-BCA | No withholding: Rp397.500; 2.5%: Rp387.500; 3%: Rp385.500                                  | Calculation examples, not approval of tax-free handling |
| Friend referral          | Recipient 15 after verification; referrer 15 after first class completion; cap 75/semester | Latest defaults; admin configurable                     |
| Referral welcome         | 15 after verification; one bonus, not an extra old 25-Marks welcome                        | Latest referral document                                |
| KOL compensation         | No agreed amount                                                                           | Set per campaign                                        |

Original cohort: 12 × 90 minutes, capacity 12, minimum 4. Meeting example 100/50/65 is not a final rate card; admin sets full/installment prices separately. IDR equivalents depend on balance and purchase method.

Masterclass, recap PDF, waitlist and private cohorts were not reconfirmed at the meeting. Treat as follow-up scope pending confirmation, not automatically included in the November 1 target.

## 4. Referral, registration and operational details

Latest referral system.md replaces earlier referral rules. Defaults: recipient 15 after verification, referrer 15 after first eligible class completion, cap 75/semester. KOL uses first successful IDR payment. Registration-only codes and in-form OTP are agreed; questions cover unresolved details.

### Registration and email verification

<!-- diagram: registration -->

**OTP rules:** initially empty; send to the entered email after format validation. Resend has a 60-second countdown and invalidates old codes. Email changes reset verification; referral corrections do not. Handle invalid/expired codes, failed sends, attempt limits and existing emails in the form. Expiry/rate limits follow server settings.

**Failed signup:** email-bound verification proof is validated atomically and consumed only after successful account creation. Retry while valid. If network failure leaves the result unknown, check status before retrying to avoid duplicate accounts/bonuses. Do not store passwords before signup. Existing Google accounts go straight to the app without new attribution.

### Referral flows and IDR equivalents

<!-- diagram: rewards -->

- **Registration only:** Google-step copy: “You can only enter a referral code during this step. If you do not have one, select No referral code.” Correct/remove invalid or inactive codes. Saved choices cannot be repeated; no code input at checkout/in the app. Refresh/callback retries do not duplicate welcome credits.
- **Friends:** automatically generate a unique alphanumeric code, e.g. first name + 3 characters. Diagram figures are configurable defaults. Cap 75 permits five 15-Marks rewards. At cap, new recipients still get welcome; referrer gets no extra credit. Never exceed remaining cap; partial/no reward, semester dates and cohort eligibility require confirmation.
- **Marks equivalents:** at Rp5.500-Rp7.000/Mark, 15 ≈ Rp82.500-Rp105.000; 30 across a completed referral ≈ Rp165.000-Rp210.000; 75 ≈ Rp412.500-Rp525.000. Indicative service value, not cash-out, top-up invoice or Cogito cash cost. Welcome without a code and expiry are unresolved.
- **KOL:** admin creates codes; influencer account optional. Welcome default 15. Signup validity: 30 days from creation/activation; attribution: 90 from student signup. Expiry blocks new signups without deleting prior attribution. States: active/paused/expired; pause effects on prior attribution require a decision.
- **KOL exclusions:** class completion/free-Marks classes do not trigger commission. Day-95 first purchases exceed the 90-day window. Manual transfers need a separate decision.
- **IDR commission:** flat + (first top-up value × percentage); support either or both. Proposed defaults: 10%, flat Rp0; campaign configurable. Starter Rp337.500: 10% = Rp33.750; flat Rp50.000; combined Rp83.750. Pioneer Rp2.750.000: 10% = Rp275.000. Round to rupiah. Proposed basis: paid top-up price excluding separate gateway fees. Gross commission; KOL tax/settlement costs differ from tutor payouts.

### Admin controls, records and exceptions

Admin configures bonuses/caps; campaigns configure codes, welcome Marks, flat IDR, percentage, signup deadline, attribution days and status. Monthly reports/CSV filter period/code/partner and show signups, qualifying first purchases, IDR totals, flat + percentage totals, and pending/settled amounts. Student history shows rewards/remaining cap. Old daily limits are not mandatory under the latest document; confirm separately. KOL payouts remain separate.

Reuse accounts, wallet, payments and completion reports. Keep auditable, deduplicated reward/attribution/commission/settlement records. Decide signup snapshots vs conditions-at-trigger settings. Record verification, completion and payment separately.

Retries/webhooks must not duplicate rewards; cap checks are atomic. Failed/pending payments do not earn commission; PAID then SETTLED is not two purchases. Refund/reversal adjustments, including spent rewards, require agreement. Confirm pause effects, semester boundaries and expiry.

### Tutor payouts and history

- **Current:** unpaid fees, paid history, date/status filters and CSV. Records: gross, transfer fee, net, bank account, date and paying admin. Only paid status exists; tax, proof, processing/failed states and fixed per-batch session lists are missing.
- **Planned:** manage tutor payouts in-app; KOL disbursement remains external. Bank-transfer integration is a separate decision. Admin reviews fees/missing reports and bank/tax data, then records payment. Tutors see their own balances/history; admin sees all tutors.
- **History fields:** payout ID/period; included booking or regular/cohort sessions; date; competition; per-session gross; report status; total gross; tax-data completeness; tax basis/rate/withholding; one transfer fee; net; destination-account snapshot; status; payment date; operator; reference/proof; notes. Open details from the list. Show paid/unpaid subtotals, period/status filters and admin export. Tutor notification/statement follows recorded payment.
- **Corrections:** profile changes cannot rewrite old payouts. Processing/failed states, validation sequence, corrections, retries and moving sessions to later batches need decisions. Audit who/when/why and before/after values; retain history.

### Reports: on-demand vs regular classes

- **Existing:** private/group and 2-4-session series completion reports cover discussion, strengths and improvement areas; tied to completion/fee processing. These series are not regular cohorts.
- **New regular/cohort:** admin schedule/curriculum and seat enrollment. One report per meeting: attendance, editable material covered, shared notes and optional individual notes. Students see their sessions and own individual notes; admin sees all. Shorter masterclass version if approved.
- **Gaps:** regular reports, enrollment-linked attendance/rosters, multi-tutor fees, missing-report reminders/queues and cohort recaps. Confirm permissions, completion/fee timing and undelivered-session handling. Recap PDF is follow-up scope.

### cogitoacademy.id: content consolidation and migration

<!-- diagram: migration -->

- **Activities: one page, one source of truth.** Merge Cogito 101, Townhall and Simulation Days. Migrate content, activity categories, schedules, descriptions, images/files and relationships to app DB. Website reads app API; edits use the same source without copies. Preserve activity grouping. Redirect old Activities URLs; preserve details/links or provide appropriate redirects.
- **Knowledge Bank:** migrate records, categories, metadata, relationships and file references to app DB/API. Preserve current access/download links and verify documents open. Physical file storage/editorial workflow require confirmation.
- **Calendar and agenda:** migrate competition records, dates/schedules, categories and relationships to app DB/API. Prevent repeated instances of the same event on the same date from duplicate queries/merging. Test single/multi-day events, distinct events on the same date, schedule changes and date/timezone boundaries. Do not hide distinct events.
- **Tutor website tech debt:** retain current list until new app profiles are available/populated; then use app profiles via API. Track as dependent follow-up work; visibility/publishing rules need confirmation.
- **Verification/cutover:** compare counts by type, categories/languages, schedules, relationships, images/files, access and old URLs. Test app-source edits on the website. Stop Sanity reads after verification; prepare rollback for missing content/broken links. Storage, editor roles and publishing remain client questions.

## 5. Client questions and proposed delivery

### Questions to Client

Latest referral rules apply. These are unresolved details; recommendations are not final rules. Answer cases individually.

### 1. Pricing and tutor fees

- Approve section 3 package/solo/group prices or provide replacements?
- Additional per-student fees: Rp20.000, Rp25.000 or Rp30.000 by competition? Offline tutor uplift?
- Cohort/masterclass full, installment, single-session and tutor prices? Two tutors: split one fee or pay each separately?
- Exact top-up in this release or packages first?

### 2. Cohorts, schedules and installments

- Minimum enrollment not reached: minimum/check deadline? Postpone once, cancel or admin choice?
- Same-day tutor absence: who finds a replacement and by when? Reschedule/cancel without one?
- Installment count, covered sessions, amounts and due dates? Automatic Marks deduction or student clicks Pay?
- Insufficient balance: grace period, access/seat removal and reminder count?
- Payment after removal: rejoin if a seat remains? Pay for missed sessions?
- Late joining allowed? How to price remaining sessions?
- November 1 still the target? Mandatory features vs initially manual handling?

### 3. Refunds, prices and reservations: individual cases

- Cogito cancels before first session: all Marks back or deduction?
- Cogito cancels after several sessions: refund undelivered sessions only? Purchased-plan per-session price or another formula?
- Full-plan withdrawal before start: full refund or deadline/deduction?
- Full-plan withdrawal after sessions: discounted-plan or single-session refund rate?
- Withdrawal mid-installment: refund unused sessions or forfeit? Stop future installments?
- Single-session cancellation: refund deadline? Forfeit Marks for absence?
- Tutor no-show/technical failure: free reschedule or refund? Tutor still paid?
- Price changes during unpaid checkout: reservation or new price? Seat reservation duration?
- Late successful payment after expiry/full class: wallet credit, alternative class or refund?
- Marks-only refunds or IDR exceptions? Who processes cash refunds and removes related Marks?

### 4. Tax and tutor payouts

- Required NPWP/tax data, validator and 2.5%/3% mapping?
- Cogito handles incomplete profiles: proceed or hold until minimum data? Who bears withholding?
- Data changed after session completion but before payout: session snapshot or payout-time data?
- Failed transfer/account change: who corrects/retries? Transfer fee charged again? Mandatory proof/reference?
- Agreed handling order for missing reports, incomplete bank/tax data, failures, corrections and sessions moved to the next batch?
- Finance confirmed tax figures and VAT absorption?

### 5. Semester referral cap

- Cap 75 allows five 15-Marks rewards; later recipients still get welcome. Semester = January-June/July-December or academic calendar?
- Budi signs up in semester 1, completes first class in semester 2: which cap applies?
- Remaining cap 10, reward 15: credit 10 or no reward?

### 6. Welcome and referral rewards

- No-code signup: welcome 15 or valid-code users only?
- Private/masterclass eligible; cohort too? Free classes count or paid only?
- Bonus expiry? How many days? Spend bonus before purchased Marks?
- Completed class later refunded/cancelled: keep or reverse reward? Bonus already spent?
- Missing/corrected regular reports: who handles, when completed and fee enters payout? Multiple tutors: submit/correct permissions? Keep existing private/group/series reports?

### 7. KOL commission settlement

- Defaults: 30-day signup, 90-day attribution, first IDR top-up. Flat/percentage per partner?
- Pause after signup: prior attribution earns commission or freezes?
- Admin-confirmed manual transfer eligible or gateway only?
- First purchase refunded: reverse commission? Already paid: next-settlement deduction or manual?
- External KOL disbursement: CSV sufficient or mark settled manually in-app? Required proof/reference/date? No automatic KOL transfers included.
- Old daily limits still needed? Signups or conversions; what happens at the limit?

### 8. Reward changes and account recovery

- Budi signs up with your code on day 1: reward 15. Admin changes it to 20 on day 3. First class completed day 5. Receive 15 (signup rule) or 20 (completion rule)? Recommendation: 15 for Budi; 20 for signups after the change.
- Existing email/password user chooses Google with same email: link existing account without another welcome/referral?

### 9. CMS, website and release scope

- Agreed: migrate all three sources, merge Activities, fix agenda and defer tutor update. Also remove landing-page Activities section?
- Saves go live immediately or preview/publish? Who creates, edits, publishes and deletes?
- Preserve Knowledge Bank access? File storage? Preserve old links/categories/languages/file access?
- Tutor list: approved/active only or all profiles? Who confirms readiness/source switch?
- Priorities across cohorts, referral/KOL, CMS, masterclass, recap PDF, waitlist and private cohorts?

### Proposed delivery sequence

1. **Confirm decisions:** prices/fees/packages, tax, cohort installments/refunds, unresolved referrals, CMS workflow and November priorities.
2. **Economy/payouts:** admin fees, consistent historical transactions and auditable deductions/history.
3. **Cohorts:** publish curriculum/schedules/tutors; prevent overselling; agreed payments, access, changes, reports and refunds.
4. **Registration/referrals:** in-form OTP before creation; reset on email change; Google referral choice. Welcome 15 after verification; referrer 15 after first private/masterclass completion; cap 75/semester. Credit once.
5. **Referral/KOL and CMS:** deduplicated credits, working campaign limits and app-managed content without lost files/links.

Website fixes/Google investigation can proceed separately. Implementation: schema/API/UI extensions, class ledgers, financial snapshots, installment/notification scheduling, payment/reward idempotency, access controls and audit logs. Reuse wallet, gateway, Meet and notifications. Estimate schedule after scope decisions.

## References and review limits

Cogito Academy Meeting Notes; original Central Economy and Cohort Classes PRD; app commit 14dc4486; local main website checkout. Latest referral source: referral system.md. Production prices/live integrations have not been tested. This document does not change application behavior.
