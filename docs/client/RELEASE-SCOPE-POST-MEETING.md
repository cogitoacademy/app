# Cogito Platform Release: Updated Scope and Client Questions

Date: October 18, 2026 | Status: Confirmed scope updated; new content/design dependencies listed separately

This revision incorporates FINAL SCOPE - Cogito Academy v3, received on October 12, and client follow-up answers received on October 13. It replaces earlier proposed prices and unresolved rules with v3 decisions. Activities now follows the confirmed Masterclasses/Cohorts/Other structure and app-style cards. Earlier follow-up questions are resolved. October 16 additions cover targeted landing-page improvements and branded report PDFs; remaining content/design dependencies are listed separately. All v3 numeric settings are admin-editable defaults unless stated otherwise.

**Payment boundary:** incoming student Marks purchases (packages and exact top-ups) remain through Midtrans, with gateway-confirmed crediting. KlikBCA Bisnis refers only to outgoing tutor/KOL payments made by admin outside the app. Admin records the actual transferred amount, date/reference and paid/settled status. No admin-verified direct-transfer top-up route, outgoing Midtrans payments, automated bank payouts or cash refunds are included.

## 1. Current application and release scope

| Area               | Existing application                                                              | Changes in this iteration                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On-demand classes  | Private/group bookings and 2-4-session series; existing payment/cancellation flow | Keep these class types and charging/cancellation rules. Replace pricing/tutor-fee calculations with the v3 rate card.                                                                                                                                                |
| Economy and wallet | Packages, wallet/ledger and available/held balance foundation                     | New packages, exact top-up, admin economy page and cohort/masterclass holds with per-session deductions. Existing Marks remain untouched; all Marks never expire.                                                                                                    |
| Big classes        | No public cohort/masterclass seat enrollment                                      | One shared model for cohorts and masterclasses; Classes page, curriculum, tutor assignment, seats, payment plans and returns.                                                                                                                                        |
| Reports            | Three-field session completion reports                                            | Extend to all class types; 600 characters per field; reminders for incomplete reports; three-month student PDF export. No new attendance sheet or per-student notes.                                                                                                 |
| Tutor payouts      | Manual payment records/history/CSV; non-BCA transfer fee                          | Tax profiles/settings/override, session-linked payout history, immutable snapshots, void-with-note and monthly tax CSV. Bank transfers stay external.                                                                                                                |
| Referrals          | No referral campaigns/rewards identified in the reviewed baseline                 | Registration-only friend/KOL codes, welcome/reward ledger, semester caps, campaign settings, history and external settlement records.                                                                                                                                |
| Website/CMS        | Sanity content sources and existing Activities/tutor pages                        | Merge Activities; migrate its source to app DB/API. Fix calendar agenda duplicates, remove landing Activities and Start Learning. Knowledge Bank/Calendar migration comes last. Website tutor lists read app profiles immediately, including an initial empty state. |

Existing-state findings are from the previously reviewed source (cogito-app commit 14dc4486 and local cogito-acad checkout), not production verification.

## 2. Prices, exact top-up and admin economy

### Marks packages

| Package  | Marks | Rate per Mark | Price       |
| -------- | ----- | ------------- | ----------- |
| Starter  | 50    | Rp7.000       | Rp350.000   |
| Learner  | 150   | Rp6.500       | Rp975.000   |
| Explorer | 250   | Rp6.000       | Rp1.500.000 |
| Pioneer  | 500   | Rp5.500       | Rp2.750.000 |

Existing wallet balances are unchanged. Purchased and bonus Marks share the same balance and spending rules; neither expires. IDR figures use Indonesian formatting.

### Exact top-up: included

Non-package amounts use the applicable package-tier rate plus Rp250/Mark: 1-149 = Rp7.250; 150-249 = Rp6.750; 250-499 = Rp6.250; 500+ = Rp5.750. Exact amounts 50/150/250/500 use package prices instead. If an exact top-up costs at least the next larger package, offer that package instead. Example: 140 Marks would cost Rp1.015.000, so offer 150 for Rp975.000. Other examples: 31 = Rp224.750; 176 = Rp1.188.000; 320 = Rp2.000.000; 600 = Rp3.450.000.

### On-demand rate card

| Competition                                  | Online solo price | Online one-student tutor fee |
| -------------------------------------------- | ----------------- | ---------------------------- |
| Model UN / World Scholar's Cup               | 50 Marks          | Rp200.000                    |
| Debate / Olympiad                            | 44 Marks          | Rp180.000                    |
| Essay & Writing / Business / Public Speaking | 38 Marks          | Rp160.000                    |

For N = 1-6 students:

- **Online:** class total = solo price + 12 × (N - 1) Marks. Each student pays total/N rounded up. Tutor fee = one-student fee + Rp30.000 × (N - 1).
- **Offline:** class total = solo price + 22 + 20 × (N - 1) Marks. Each student pays total/N rounded up. Tutor fee = online one-student fee + Rp75.000 + Rp50.000 × (N - 1).
- **Example:** online MUN with three students charges 25 Marks each (75 collected after rounding), tutor fee Rp260.000. Offline charges 38 each, tutor fee Rp375.000.

The confirmed booking student count determines fees, not attendance. Admin edits package amounts/prices, surcharge, competition solo prices/fees, online increments and four offline increments; preview 1-6 tables before saving. Changes affect new bookings only; existing bookings retain their price/fee snapshots. Tutors view but cannot edit fee tables.

## 3. Cohorts, masterclasses and held Marks

### Shared class model and listing

| Item          | Cohort                                      | Masterclass     |
| ------------- | ------------------------------------------- | --------------- |
| Sessions      | Admin-defined series, e.g. 16               | One             |
| Enrollment    | Full, half plan or single session           | One seat        |
| Default price | 20/session full; 22/session half; 25 single | 5 Marks         |
| Tutor fee     | Rp400.000/session, flat                     | Rp300.000, flat |
| Tutor         | One per session; may differ by session      | One             |

Admin chooses type/competition, adjusts defaults, uploads a Cogito-supplied cover and enters title/description/capacity/dates. Cohort sessions require titles and curriculum descriptions. Assign tutors after external coordination; no acceptance step. Changes notify affected tutors/students. Publishing creates a Meet per session via the existing integration.

The app's Classes page has (1) Cohorts cards with cover/title/session count/start/tutor/price-from and full curriculum, and (2) Upcoming classes listing masterclasses and available individual cohort sessions by date. A cohort-session tag links to its parent. Website Activities uses these class records and app-style cards alongside admin-entered Other activities.

### Enrollment and completion flow

<!-- diagram: holds -->

For 16 sessions: full holds 320 Marks and deducts 20 per completed session; half holds 176 for eight sessions, then another 176, deducting 22 each; a single session holds/deducts 25. First half rounds up for odd session counts. Masterclass holds 5 and deducts on completion.

- Second-half reminders: email/in-app with Pay button seven days and one day before the second half starts. Payment holds its Marks. Unpaid students are removed from remaining-session rosters at the first second-half session's start.
- Rejoining while seats remain: pay only future sessions at the half-plan rate; missed sessions are not charged.
- Late joining while seats remain: pay all remaining sessions at full rate, or first half of remaining sessions at half rate with the rest due later.
- Checkout locks price and seat for 15 minutes. Late gateway payment still credits the wallet; joining then depends on available seats.
- Every hold, deduction, release and withdrawal fee is ledger-linked to its class/session. Prevent duplicate credits/completions and seat overselling.

### Enrollment checks and tutor absence

Admin may configure cohort minimum/check date, then continue, postpone once or cancel. Notify enrolled students/tutor by email and in-app without an acceptance step. Students may leave within three days of postponement notice without the withdrawal deduction.

Tutor reports absence from the session page; less than 24 hours' notice logs a late cancellation and admin sees per-tutor counts. Admin finds a replacement or reschedules. No session deduction until delivery/completion. Tutor reassignment must not rewrite already-earned session fees.

### Cancellations and returns

Returns are held Marks released to available balance, never cash. Display this clearly on Marks purchase, checkout and website FAQ; Cogito supplies legally reviewed wording.

| Case                                                      | Marks treatment                                                 | Tutor treatment                           |
| --------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| Cogito cancels before start                               | Release all held Marks                                          | No fee                                    |
| Cogito cancels running cohort                             | Release all remaining held Marks                                | Pay delivered sessions                    |
| Student withdraws from full cohort                        | Release remaining held Marks less 20%                           | Existing earned fees unaffected           |
| Student withdraws from half plan                          | Release current-half remainder less 20%; never charge next half | Existing earned fees unaffected           |
| Cancel single cohort/masterclass seat at least 24h before | Release session Marks less 20%                                  | No fee                                    |
| Later cancellation or no-show                             | Deduct session as normal                                        | Tutor paid on report/completion           |
| Tutor no-show                                             | Full session release or free reschedule                         | No fee for undelivered session            |
| Technical failure                                         | Free reschedule                                                 | Fee when rescheduled session is delivered |

Round withdrawal fee to the nearest Mark. Example: 220 held → 44 fee + 176 released. The same cancellation rule applies to full/half-plan buyers cancelling one session: use that enrollment's per-session rate, release the remainder after the rounded 20% charge, and leave other sessions/enrollment intact. Example: full rate 20 → charge 4, release 16; half rate 22 → charge 4, release 18. Cancellation is available at least 24 hours before the session. Display before confirmation: “Can't attend this session? Cancel at least 24 hours before it starts to receive your session Marks back, minus a 20% cancellation charge.” Show the exact charge/return and deadline before confirming; later cancellation/absence remains charged normally.

## 4. Reports and tutor payouts

### One report per session

**Existing vs new:** three-field tutor completion reports and in-app viewing already exist in the reviewed repository. The downloadable student report PDF is a new feature in this release, not an existing export being restyled.

All class types use the existing report: (1) what the session focused on, (2) what went well, (3) what to improve. Each field allows short points on separate lines, capped at 600 characters. No attendance sheet or individual notes added. Submission completes the session and makes its fee eligible once.

Tutors receive repeated reminders until completion/report submission. Without completion, the tutor does not earn a payable session fee; held Marks remain pending. Reminder cadence is an implementation setting. Admin may resolve permanently missing reports using the audited override described below.

Student Download reports generates one PDF for reported sessions where the student held a seat in the last three months, newest first, one session per page. Header: student, competition, class type/online-offline, tutor, date/time. Topic: cohort name/session number/curriculum title or masterclass title. Body: three headings with bullet points. Footer: Cogito Academy, page number and generation date. Students can read reports on screen; admin can export the same PDF for any student.

### Report PDF template: supplied visual reference

Use the supplied student-report screenshot as the approximate layout reference, not as a background containing example student data. Render live report data into the template:

- **Header:** full-width decorative Cogito Academy banner/logo, followed by the orange STUDENT REPORT label aligned right.
- **Metadata:** two columns. Left: Student, Competition, Mode. Right: Tutor, Session Date, Class Topic. Render mode as online or in-person from the session setting. Include class type, session time and cohort/session identity required by v3 alongside this metadata/topic without obscuring the reference layout.
- **Feedback:** orange TUTOR FEEDBACK heading; three labeled rows: Session focus, Positive observations, Points of improvement. Each value is a bulleted list mapped to the existing discussion, strengths and improvements fields respectively. No additional tutor input fields are introduced.
- **Footer:** Generated [date] by Cogito Academy near the bottom; retain page numbering required for multi-session exports.
- **Export:** one session per page, newest first, for the last three months. Repeat the branded header/metadata/footer per session, use the requesting student's name, and keep each report within its page using the agreed field limits and verified wrapping.

Yellow highlighting in the sample is treated as an example-data marker, not final report styling. Use clean live values without the screenshot's example names, dates, cursor or highlights. Original header/banner artwork and logo assets are still needed for a sharp PDF; the screenshot defines the layout but is not a production-quality replacement for those assets. This is a fixed report template, not a template-upload/editor feature.

### Admin resolution of missing reports

Tutor reminders continue until resolution. Admin may complete/correct a report on the tutor's behalf after confirming delivery, with all three fields and a required reason. Record actor/time, original status and resulting report; notify the tutor. Completion deducts each student's held session share and makes the tutor fee payable exactly once. If the session was not delivered, admin must reschedule or cancel/release Marks under the applicable rule rather than falsely complete it. Report edits do not duplicate wallet deductions, referrals or tutor fees. Correcting an already-completed financial outcome uses explicit ledger/payout adjustments with audit history, not silent status edits.

### Tax and payout records

Legal name and 16-digit NIK required when completing a tutor profile; NPWP optional. Admin rates: NIK+NPWP 2.5%, NIK only 3%, Missing 3%; per-tutor override permitted. Rates support two decimals. Rafsi confirms defaults with a tax adviser; changes require settings only.

**Calculate tax when preparing payout**, using current tax-profile status/override. Once recorded, preserve the actual rate and data snapshot; later profile changes never recalculate that payout.

Admin reviews eligible sessions, gross, rate, withholding rounded to whole rupiah, single Rp2.500 non-BCA transfer fee, and net. Admin transfers via KlikBCA Bisnis, then records the actual transferred amount, payment date and optional reference/proof before marking paid. Record session coverage and bank/tax snapshots. A mistaken payout can be voided with a required note; included sessions return to unpaid. Retain operator/time/reason audit history and prevent duplicate payment allocation.

Tutor dashboard/email shows gross, tax amount/rate, transfer fee, net and covered sessions. Monthly tax CSV: name, NIK, NPWP, tax status, gross paid, rate(s), withholding, net and monthly withholding total. Sum recorded non-void payouts rather than recalculating from current profiles. If multiple rates were used, show them explicitly with payout detail; this reporting representation does not change payout-time tax calculation.

## 5. Registration, friend referrals and KOL

### Registration and email verification

<!-- diagram: registration -->

Email form: initially empty OTP input and Send code on one row. Resend after 60-second cooldown invalidates old codes. Email changes reset verification; referral corrections do not. Validate server-side proof atomically, consume only upon successful account creation, and allow retry while valid. Check status after an uncertain network result; do not duplicate accounts/bonuses. Handle invalid/expired codes, send failures and attempt limits inline.

New Google users need no extra OTP; they must apply a code or choose No referral code. Interrupted registration resumes at this choice until saved; saved choices cannot be repeated. Existing matching-email accounts are reused without new reward/attribution. Copy: “You can only enter a referral code during this step. If you do not have one, select No referral code.” Investigate Google's “unverified” message separately.

### Friend referrals

Defaults: valid-code welcome 15 Marks; referrer reward 15; semester cap 75. Without a code, no welcome. Eligible first completed class must cost Marks: private, group, cohort session or masterclass. Free classes do not count.

Semester dates: January 1-June 30 and July 1-December 31. Completion determines which semester receives the reward. Credit remaining cap if smaller than the reward: 10 remaining → credit 10. No daily limit. Bonus Marks never expire and use the same spending balance/rules as purchased Marks. Already-credited rewards are not reversed.

**Project clarification:** lock welcome/reward amounts at referred-user signup; apply the cap setting effective at completion. Example: Budi signs up at reward 15; admin changes to 20; Budi later completes → 15 before cap. New signups use 20. A changed semester cap is evaluated at completion, not separately snapshotted per friend.

Referral screen shows code, earned Marks this semester, cap remaining and semester end date. Display reward copy using the applicable setting. Generate unique codes, prevent self-referral, grant welcome at most once and deduplicate completion rewards.

### KOL campaign and settlement records

Per-campaign settings: signup validity default 30 days, attribution default 90 days, first successful IDR top-up trigger, flat amount/percentage or both (either may be zero). These settings can live in Referral Codes alongside usage history; v3 calls for configuration, not history only.

Pause/expiry stops new signups only; existing attribution remains eligible within its window. Lock commission flat/percentage and attribution-window terms when the student signs up. Later campaign changes apply only to new attribution. Example: signup at 10%/90 days, later changed to 15%/30 days, then Rp350.000 top-up on day 45 → Rp35.000 commission under the saved terms.

Admin pays KOL via KlikBCA Bisnis and records actual amount, date/reference and settled status. Monthly CSV shows attributed users, qualifying first top-ups and calculated/transferred/outstanding commission. Do not count repeat payment events twice.

Admin may correct commission calculation/attribution and actual transfer records with a required reason and before/after history. Keep calculated commission separate from actual money transferred; recording a transfer does not rewrite agreed commission terms. System recalculates the outstanding difference. Partial payment remains partly settled; only a fully reconciled amount is settled. Excess payment is visible as an overpayment for finance resolution; no automatic recovery, outgoing transfer or future offset is assumed.

**Delegated reversal rule:** if a qualifying payment is genuinely reversed/invalidated, void unpaid KOL commission with an audit reason. If already paid externally, retain the transfer history and record an adjustment/overpayment for finance to resolve manually. This does not revoke friend rewards, which v3 explicitly makes non-reversible. This rule does not add a customer cash-refund feature.

## 6. cogitoacademy.id website

### Activities and content migration

<!-- diagram: migration -->

**Confirmed Activities:** one page with Masterclasses, Cohorts and Other. Masterclasses/Cohorts read app class records; Other is admin-entered and can include former Cogito 101, Simulation Days and Monthly Townhall activities. These names no longer require dedicated sections/titles. Use cards as presented in the app interface, not the legacy website card structure. One app database/API source of truth; migrate/re-enter relevant Sanity content with schedules, descriptions, media references and relationships, preserving links or redirecting where needed.

Remove landing-page Activities and Start Learning. Fix repeated agenda entries for the same event/date without hiding distinct events or legitimate multi-day appearances.

Knowledge Bank and Competition Calendar move to app DB/API last. Admin saves go live; no editorial roles or preview/publish workflow. Manual content re-entry is permitted when cheaper than automated migration. Preserve content access/files/URLs as applicable; verify counts/relationships/links before stopping Sanity reads and retain rollback.

Switch public tutor data directly to the app database/API; do not retain or fall back to legacy website tutor records. An initially empty list is acceptable: show a clear empty state without placeholder tutor profiles. Cogito will ask tutors to fill their app profiles. Public API fields must be limited to public tutor information; exclude NIK, NPWP, bank details and internal financial data. Only approved tutors are shown, following the app's existing public tutor-list behavior; apply the same eligibility filter rather than introducing a separate website rule.

### Targeted landing-page improvements

This is an addition/modification of selected sections, not a full website redesign. Keep the existing overall site structure while improving the requested areas:

- **School logos:** allow manual horizontal navigation/dragging, including touch on mobile.
- **Section animation:** refine motion in selected sections, especially Why Cogito Academy, while preserving readable static content and reduced-motion access.
- **Section spacing:** add breathing room between small section labels/icons and large headings, including Why Cogito Academy / Behind Every Medal.
- **Testimonials:** advance automatically and retain manual previous/next arrows. Pause on interaction/focus and respect reduced-motion preferences; timing can be selected during implementation.
- **App feature showcase:** add a motion/mini-video section explaining app features. Developer production is a provisional assumption, pending confirmation of responsibility, featured flows and source material. Do not treat video production details as finalized.
- **FAQ:** show selected active questions on the landing page with a link to a dedicated full FAQ page. Use naturally expanding answers without nested scrolling inside cards. Manage content and landing selection through the app admin dashboard as specified below; final wording is supplied or approved by Cogito.

Client visual references: 1609sat.com for the app-feature showcase and borderless.so for visual direction. References guide selected improvements, not a wholesale copy or a commitment to rebuild the entire landing page.

### FAQ management in the admin dashboard

Store FAQ content in the app database and serve the main website through the app API as one source of truth. Admin can add/edit questions and answers, set display order, activate/deactivate entries, and toggle Show on landing for selected questions. No separate CMS, editor roles or preview/publish workflow is needed; a successful save goes live.

The dedicated FAQ page shows all active entries in the configured order. Landing shows only entries that are both active and marked Show on landing, in that same order, plus a link to the full FAQ. Deactivation hides an entry from both pages even if its landing flag remains set. Require a non-empty question/answer, preserve readable paragraph/list formatting, and safely render content. Only admin may change FAQ data; public endpoints expose active content only. Initial questions/answers are populated from content supplied or approved by Cogito.

## 7. Remaining questions and required materials

Earlier payment, Activities, tutor visibility, referral, payout and report-override decisions remain resolved. The following concern only the latest additions.

### 1. Original report branding assets

The approximate report layout has been supplied and is no longer an open design question. Please supply the original full-width header/banner and logo artwork (or the editable report file) for sharp PDF output. The three feedback fields remain unchanged; extra class/session metadata and page numbering from v3 are retained. Yellow sample highlights are omitted unless Cogito explicitly requests otherwise.

### 2. Feature video production

Working assumption: the developer produces the app-feature motion/mini-video. Please confirm ownership, which app flows to show, whether one video or several short clips are expected, and who supplies/approves the script, final UI captures and brand assets. Agree the production brief before treating video quantity/duration as committed scope.

### 3. FAQ content

The structure and management are confirmed: app database/API, admin editing/order/active state/Show on landing, selected landing questions and a separate full FAQ page, with no nested answer scrolling. Cogito supplies/approves initial wording; admin controls subsequent edits and landing selection. Only the initial content remains a dependency, not the CMS behavior or page layout.

No full landing-page redesign is included. Detailed animation timing and spacing are implementation choices and do not require reopening the scope. Tax-adviser confirmation and legally reviewed Marks-only wording remain Cogito operational follow-ups from v3.

## 8. Delivery order, exclusions and follow-up

V3 suggested order: (1) prices/top-up/rate card/admin economy, (2) tax/payout/tax sheet, (3) cohorts/masterclasses/held Marks/Classes/returns, (4) reports/PDF, (5) registration/referrals, (6) website including the targeted landing improvements; Knowledge Bank/Calendar migration last. Report-template layout follows the supplied visual; final branding depends on original assets; feature-video production follows an agreed brief. Target launch is November week 1 or week 2, subject to the timeline and readiness criteria below.

Not included: waitlists, school/private cohorts, automated tutor/KOL bank transfers, parent accounts, WhatsApp notifications or cash refunds. No new attendance/individual-report notes. Incoming purchases remain through Midtrans; outgoing tutor/KOL transfers are made through KlikBCA Bisnis and recorded by admin.

Cogito follow-up: tax-adviser confirmation of editable defaults and legally reviewed Marks-only copy. These operational follow-ups do not change the confirmed incoming/outgoing payment boundary.

### Target timeline

Planning target as of October 18, 2026. Dates are targets, not a fixed release commitment; November week definitions are shown below the chart.

<!-- diagram: timeline -->

The earliest launch window overlaps testing: launch only after payment/wallet, enrollment/cancellation, payouts/referrals and access checks pass, release-blocking issues are resolved and the client accepts the release. Original report-branding assets, FAQ content and the agreed feature-video brief/materials should arrive during development; late materials or unresolved video scope may shift the affected deliverable or launch date. Review progress at the end of development to confirm the launch week.

## References and review limits

Primary source: FINAL SCOPE - Cogito Academy v3, October 12, 2026. Prior reference: October 11 Post-Meeting Scope and referral system.md. This revision incorporates October 13 client answers, project clarification on the friend cap, explicitly delegated implementation choices, and October 16 landing/report additions. The three-field report/in-app view exist in the reviewed repository; report PDF export remains planned. Production prices/live integrations have not been re-audited. This document does not change application behavior.
