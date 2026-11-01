# Cogito V3 - user stories and app coverage walkthrough

Date: 1 November 2026.

Scope: Release V3 PRD, three application roles: student, tutor, admin.
Website visitor, finance approver, and client UAT are outside this walkthrough.
Evidence environment: running local app at `http://localhost:3000`, API at
`http://localhost:3001`, development database `localhost:6767/cogito-app`.

The initial walkthrough was read-only. A follow-up pass on the same day created
and completed development fixtures for the previously unverified cohort,
masterclass, booking, report, Knowledge Bank, and calendar paths. Session and
booking timestamps were moved into the past with direct SQL only to make report
completion possible. No production data or provider payment was touched.

Coverage legend:

- **Covered**: the role can reach the story surface, the main controls are
  present, and the expected read path or safe interaction was observed.
- **Partial**: the surface exists, but a required condition, provider, fixture,
  or transaction could not be verified in this walkthrough.
- **Missing**: the role cannot complete the story through the app.

Coverage is not client UAT acceptance. It records product presence and
navigable behavior as of this date. The full command-level test record with
Mermaid diagrams is in [V3-UAT-AUTOMATED-EVIDENCE.md](V3-UAT-AUTOMATED-EVIDENCE.md).

## Executive result

| Role    | Stories | Covered | Partial | Missing |
| ------- | ------: | ------: | ------: | ------: |
| Student |      20 |      15 |       5 |       0 |
| Tutor   |      15 |      13 |       2 |       0 |
| Admin   |      21 |      18 |       3 |       0 |
| Total   |      56 |      46 |      10 |       0 |

Result: all 56 stories now have a reachable app path. 46 stories passed the
surface-level checks used here. 10 stories remain partial because of provider
boundaries, unexecuted finance edges, or data-specific defects. No story is
blocked by navigation.

The most important defect is the tutor **Classes** menu item. It is shown in
the tutor sidebar, but both `/classes` and `/classes/$classId` reject tutors and
redirect to `/dashboard`. Tutor class work is still reachable through
**Bookings** and **Session Reports**, so the underlying assignment data is not
lost, but the menu entry is misleading.

## Route walkthrough

Student routes visited:

`/dashboard`, `/balance`, `/tutors`, `/tutors/:tutorId/book`, `/classes`,
`/classes/:classId`, `/bookings`, `/bookings/:bookingId`, `/class-reports`,
`/referrals`, `/achievements`, `/profile`, `/notifications`, `/guide`,
`/calendar`, `/knowledge-bank`, `/faq`.

Tutor routes visited:

`/dashboard`, `/bookings`, `/bookings/:bookingId`, `/class-reports`,
`/availability`, `/profile`, `/notifications`, `/guide`, `/calendar`,
`/knowledge-bank`, `/faq`, `/classes`, `/classes/:classId`.

Admin routes visited:

`/admin`, `/admin-operations` (booking queue, wallet lookup, room approvals),
`/bookings`, `/classes/:classId`, `/admin-classes`, `/class-reports`,
`/admin-tutors`, `/admin-tutors/:profileId`, `/admin-tutor-payouts`,
`/admin-referrals` (activity, campaigns, commissions), `/admin-economy`,
`/admin-competitions`, `/admin-achievements`, `/admin-knowledge-bank`, `/faq`,
`/activities`, `/notifications`, `/guide`, `/calendar`, `/knowledge-bank`.

Observed development data at the start: 5 bookings, 2 academy classes, 2 recorded
tutor payouts, 2 activity articles, 4 landing FAQs, 0 knowledge-bank resources,
0 calendar events, 0 achievements, 0 KOL commission decisions, and 0 referral
usage rows. The follow-up created class 137, class 138, booking 22, one Knowledge
Bank resource, and one calendar event.

## Student stories

### S-01 Account creation with verified email and referral choice

**Story.** As a prospective student, I want to create an account with a
verified email and optionally apply a friend or KOL code, so that my account is
valid and my welcome attribution is correct.

**Acceptance checks.**

- Signup collects name, email, six-digit OTP, password, and optional referral
  code; the OTP field starts empty and has a Send code action.
- Account creation requires OTP proof; invalid, expired, or limited attempts
  show inline feedback; resend invalidates the old code.
- Changing the email clears the entered OTP and proof state; changing the
  referral code does not.
- A new Google account receives the referral step; the saved choice cannot be
  changed later; an existing matching email is reused without a new reward.

**App surface.** `/login` sign-up tab, `/verify-email`, `/referral-choice`,
`/api/auth/*`.

**Evidence.** The sign-up form showed Name, Referral code, Email, Email
verification code, Send code, Password, and Sign Up. The Google referral route
and policy exist in source and prior synthetic acceptance records.

**Result. Partial.** UI and contracts are present; no account was created and no
OTP or Google consent was delivered. Requirements: REQ-AUTH-01, REQ-AUTH-02,
REQ-FRIEND-01.

### S-02 Sign in, email verification, and password reset

**Story.** As a registered student, I want to sign in securely, verify my email
when required, and reset a forgotten password, so that I can recover access
without admin help.

**Acceptance checks.**

- Valid email/password signs in and routes to the role dashboard.
- Invalid credentials keep the form usable and show an error.
- Unverified accounts route to `/verify-email` and resume the original
  destination after verification.
- Forgot-password and reset-password pages accept an email or token and show
  safe success/error states.

**App surface.** `/login`, `/verify-email`, `/forgot-password`,
`/reset-password`.

**Evidence.** Student, tutor, and admin password sign-in all reached
`/dashboard`. The verification and reset routes are present. No OTP mail or
reset token was sent.

**Result. Covered.** Requirements: REQ-AUTH-01, REQ-ACCESS-01.

### S-03 Dashboard with next lesson and learning pulse

**Story.** As a student, I want a dashboard that shows my next lesson, wallet
summary, learning activity, and recommended tutors, so that I know what needs
attention next.

**Acceptance checks.**

- Dashboard shows available, held, and total Marks.
- Upcoming lesson shows date, time, tutor, booking title, mode, and status.
- Learning pulse separates needs action, upcoming, completed, and problem
  outcomes.
- Recommended tutors and the competition calendar entry are reachable.

**App surface.** `/dashboard`.

**Evidence.** Dashboard showed 473 available, 101 held, 574 total; next lesson
on 9 November 2026 at 15:00-16:30 WIB with Diego by Cogito; learning pulse
counts; recommended tutors; competition calendar card.

**Result. Covered.** Requirements: REQ-WALLET-01.

### S-04 Wallet balance and ledger

**Story.** As a student, I want to see available and held Marks and the ledger
of holds, deductions, releases, and top-ups, so that every balance change is
explainable.

**Acceptance checks.**

- Available, held, and total balances are shown separately.
- Ledger lists type, description, date, signed amount, and resulting balance.
- Holds are not described as spending before completion.
- Values remain nonnegative and total equals available plus held.

**App surface.** `/balance`.

**Evidence.** Balance page showed 473 available, 101 held, 574 total, and
history entries for "Marks reserved", "Session payment", "Marks added", and
"Marks reserved".

**Result. Covered.** Requirements: REQ-WALLET-01.

### S-05 Top up Marks with package or exact amount

**Story.** As a student, I want to buy Marks with a package or an exact custom
amount, compare the recommended package, and complete payment, so that I can
fund a booking or enrollment.

**Acceptance checks.**

- Package cards show Marks, IDR price, and approximate rate per Mark.
- Exact amount accepts a custom Mark value and shows the IDR price.
- When a custom amount is at or above a package price, both the custom choice
  and the better-value package recommendation remain visible.
- Checkout uses Midtrans; only authoritative success credits Marks once; the
  browser return alone does not credit the wallet.

**App surface.** `/balance`, payment checkout, Midtrans webhook and return.

**Evidence.** Page showed Starter 50/Rp350,000, Learner 150/Rp975,000, Explorer
250/Rp1,500,000, Pioneer 500/Rp2,750,000, plus a custom Marks field with live
IDR price. Checkout was not started. Provider acceptance is separately recorded
in the readiness plan.

**Result. Partial.** UI and pricing are present; the browser-to-provider
checkout and return refresh were not executed. Requirements: REQ-ECON-01,
REQ-ECON-02, REQ-PAY-01, REQ-PAY-02.

### S-06 Discover and filter tutors

**Story.** As a student, I want to search and filter tutors by competition,
specialization, and online/offline mode, then open a profile with pricing,
availability, and teaching details, so that I can choose the right tutor.

**Acceptance checks.**

- Search, category filter, modality filter, and clear action work.
- Tutor cards show name, modality, affiliation, bio, specializations, and
  starting price.
- Tutor drawer shows pricing table, education, achievements, experiences, and
  availability, with a Book a session action.
- Only published profiles appear; public data excludes NIK, NPWP, bank, and
  internal finance fields.

**App surface.** `/tutors`, tutor drawer, `/tutors/:tutorId/book`.

**Evidence.** Diego by Cogito appeared as Online & Offline with Academic Essay
and British Parliamentary, affiliation, bio, pricing table from 17 Marks,
education, achievements, experiences, and Book a session.

**Result. Covered.** Requirements: REQ-COMP-06, REQ-CONTENT-02,
REQ-ACCESS-01.

### S-07 Create solo, group, or series booking

**Story.** As a student, I want to choose a specialization, describe my goal,
pick one or more session times, invite participants for a group, and review the
exact Mark hold before sending the request, so that the booking matches my
needs and budget.

**Acceptance checks.**

- Specialization is required and comes from the active competition catalog.
- Notes, participants up to five, and one to four session starts are supported.
- Solo, group, series, and group-series types are derived from participants and
  session count.
- Summary shows tutor, subject, participants, sessions, format, schedule,
  session price, reserved now, balance after reserve, and the send action.
- Server creates holds atomically and rejects invalid or conflicting slots.

**App surface.** `/tutors/:tutorId/book`, booking creation RPCs.

**Evidence.** Booking page showed specialization selector, notes, participant
search, online/offline tabs, seven-day availability, 90-minute starts, and a
summary. Selecting Academic Essay produced session price 38, reserved now 38,
and balance after reserve 435. A solo Academic Essay booking was then created
through the authenticated browser console for 9 November 2026: booking 22, hold
38, state awaiting tutor review, tutor honorarium Rp160,000. The server rejected
a conflicting 15:00 slot with "Booking time conflict"; the 16:30 slot succeeded.

**Result. Covered.** Requirements: REQ-ECON-02, REQ-ECON-03, REQ-ECON-04,
REQ-WALLET-01, REQ-ENROLL-02.

### S-08 Manage a booking and participant responses

**Story.** As a student, I want to see booking status, respond to invitations,
reconfirm a group, propose a new time, and cancel with an exact fee and return
preview, so that schedule changes stay predictable.

**Acceptance checks.**

- Booking detail shows participants and each response state.
- Group proposer can request reconfirmation and see the final headcount.
- Reschedule action is available where policy allows.
- Cancellation opens a reason and preview flow before confirmation.
- Fee and return use the applicable session allocation, not the original
  package IDR price.

**App surface.** `/bookings`, `/bookings/:bookingId`,
`booking/reschedule` and cancellation dialogs.

**Evidence.** Group booking detail showed 2 of 3 confirmed, one declined,
history from invite to tutor approval, original price 63, currently held 50,
refunded 0, per participant 25, plus Propose new time and Cancel booking.

**Result. Covered.** Requirements: REQ-CANCEL-01, REQ-CANCEL-02,
REQ-CANCEL-03.

### S-09 Join an online session or see access details

**Story.** As a student, I want to open the confirmed session and reach the
online meeting or offline room details, so that I can attend on time.

**Acceptance checks.**

- Online bookings show a meeting status and a usable meeting link when ready.
- Offline bookings show the assigned room and location.
- Provider failure shows a clear pending or failed state and a support path.
- Joining does not depend on a browser return from payment.

**App surface.** `/bookings/:bookingId`, meeting status popover, class detail.

**Evidence.** The class detail now queries protected session access, and the API
returns meeting data only for sessions with a funded allocation for the signed-in
student. Andre, enrolled in the full plan, saw "Join meeting" with
`https://meet.google.com/mwo-vwyg-avm` on session 2. Athena, whose single seat was
cancelled, saw "Enroll to see meeting details" and no Join link. The class
report workspace still lists only past sessions because it does not pass the
unreported flag.

**Result. Covered.** Enrollment-guarded meeting access is verified. In-person
room display and joining the live Meet were not exercised. Requirements:
REQ-CLASS-02, REQ-CLASS-05.

### S-10 Enroll in a cohort with full, half, or single plan

**Story.** As a student, I want to choose full, half, or single sessions for a
cohort, select the sessions I will attend, and review holds and installment
terms, so that I can commit at the right level.

**Acceptance checks.**

- Full plan holds all sessions at the full rate and deducts on completion.
- Half plan splits sessions into two installments; the first half is funded
  now and the second half has a deadline and Pay action.
- Single plan holds and deducts one session at the single rate.
- The whole plan succeeds atomically or leaves no partial holds.
- Overlapping or duplicate entitlement to the same session is rejected.

**App surface.** `/classes`, `/classes/:classId`, enrollment panel.

**Evidence.** A four-session cohort (class 137, "V3 Acceptance Cohort - Multi
Session") was created and published with four online sessions and four Google
Meet links. Student Andre enrolled with the full plan: 80 Marks held, then 20
deducted after the first report. Student Argya enrolled with the half plan after
session 1: 3 remaining sessions, 44 Marks first payment plus 22 Marks second
payment, total 66. Argya paid the second installment from the class detail. Student
Athena enrolled with the single plan for session 2: 25 Marks held.

**Result. Covered.** All three plan types, the late-join split, and second-installment
payment were exercised. Negative race and duplicate-entitlement cases remain part
of the concurrency acceptance boundary. Requirements: REQ-ENROLL-01,
REQ-ENROLL-02, REQ-ENROLL-03, REQ-ENROLL-04.

### S-11 Enroll in a masterclass

**Story.** As a student, I want to enroll in a one-session masterclass at a
fixed Mark price, so that I can attend without a multi-session plan.

**Acceptance checks.**

- Masterclass detail shows class type, competition, date, tutor, mode, price,
  and one session.
- Summary shows plan, tutor, competition, session count, format, schedule,
  session price, reserve amount, total, and available balance.
- One confirmation creates the hold and seat.
- One report completion deducts the masterclass share.

**App surface.** `/classes/:classId`, `/classes`.

**Evidence.** Masterclass 138, "V3 Acceptance Masterclass", showed one session,
6 November 2026 10:00 WIB, Diego by Cogito, online, 5 Marks, with a 5-Mark
reserve. Andre enrolled, the session was completed through the tutor report, and
the wallet deducted exactly 5 Marks while one Rp300,000 tutor fee was created.

**Result. Covered.** Requirements: REQ-ENROLL-01, REQ-CLASS-01.

### S-12 Manage an enrollment

**Story.** As a student, I want to pay a second installment, cancel a changed
session inside the allowed window, or withdraw from a cohort with the exact
return, so that I do not lose Marks unfairly.

**Acceptance checks.**

- Second installment shows due date, amount, and Pay action; paying it creates
  or extends the future holds.
- Nonpayment at the deadline releases future unpaid reservations.
- Postponement window allows penalty-free exit for the stated period.
- Ordinary schedule change allows cancellation of only the affected undelivered
  session before the earlier of notice plus 24 hours and the new start.
- Withdrawal returns remaining held Marks less the rounded 20 percent fee and
  does not charge the next half.

**App surface.** `/classes/:classId`, enrollment and cancellation panels.

**Evidence.** Argya's half enrollment showed "Pay second installment · 22" with a
due date before session 3. Paying it removed the action and made all three
reserved seats cancelable. Athena's single seat showed "Fee: 5 Marks · Return: 20
Marks"; confirming released 25 held Marks, charged 5, returned 20, and left
Athena with 195 available, 0 held, 195 total. Argya then opened "Review
withdrawal": "Fee: 4 Marks · Return: 18 Marks" for the remaining future seat.
Confirming marked the enrollment cancelled, returned 18 Marks, charged 4, and
left Argya with 127 available, 47 held, 174 total. The two in-progress session
holds remained. A time-boundary check moved one funded seat to 24h + 5s before
start and returned fee 4/return 16; at 23h 59m 55s the quote rejected cancellation
and kept the hold. Postponement exit and changed-session cancellation were not
executed.

**Result. Partial.** Installment payment, single-seat cancellation, and half-plan
withdrawal are verified. Postponement and ordinary schedule-change refunds
remain UI/source evidence only. Requirements: REQ-ENROLL-03, REQ-ENROLL-04,
REQ-CLASS-04, REQ-CANCEL-01, REQ-CANCEL-02.
REQ-CANCEL-02.

### S-13 View and download session reports

**Story.** As a student, I want to review feedback for eligible sessions and
download one branded PDF for selected reports, so that I can keep a record of my
progress.

**Acceptance checks.**

- Report list shows session, reference, date, type, status, and View action.
- Report detail shows competition, mode, tutor, date, time, class type, topic,
  cohort or private booking, session, and the three feedback fields.
- Selection allows up to 100 eligible reports from the last three calendar
  months, newest first.
- One PDF contains one current-format report per page, student name, live data,
  Cogito banner, title, metadata, feedback, generation date, and page number.

**App surface.** `/class-reports`, report view dialog, PDF export.

**Evidence.** The student list held six eligible reports after the follow-up:
cohort CLS-137-S1 and CLS-137-S4, masterclass CLS-138-S1, private BKG-22,
and two older private reports. View showed all metadata and the three feedback
fields. Selecting one and downloading produced
`student-reports-2026-11-01.pdf`, 35,745 bytes, starting with `%PDF-`.

**Result. Covered.** Requirements: REQ-REPORT-03, REQ-REPORT-04.

### S-14 Referral code and semester rewards

**Story.** As a student, I want to share my referral code, see invited friends,
and track semester earnings and remaining cap, so that I know what reward is
available.

**Acceptance checks.**

- Page shows the student's unique code, copy message, and invite message.
- Explains friend welcome reward, referrer reward, and semester cap.
- Shows earned, remaining allowance, semester end date, and invited count.
- Referred friends appear after signup; first eligible completion credits the
  reward once.

**App surface.** `/referrals`.

**Evidence.** Page showed code AND708, 0 of 75 Marks earned, 75 remaining,
31 December 2026 semester end, 0 invited, and the three-step explanation.

**Result. Covered.** Requirements: REQ-FRIEND-01, REQ-FRIEND-02,
REQ-FRIEND-03.

### S-15 Submit achievements

**Story.** As a student, I want to submit competition results with proof, so
that approved achievements can appear on the public website.

**Acceptance checks.**

- Form collects event or competition, category, award, proof link, level, date,
  location, description, and skills.
- Proof link is required and explained.
- Submission enters moderation; student sees empty or submitted state.
- Admin approval is required before publication.

**App surface.** `/achievements`, achievement form, admin moderation.

**Evidence.** Empty state and Add Achievement form showed every required field,
including the Google Drive proof instruction and submit action.

**Result. Covered.** No direct PRD requirement ID; app feature.

### S-16 Knowledge Bank browsing and access

**Story.** As a student, I want to browse learning resources by category and
download files when eligible, so that I can prepare between sessions.

**Acceptance checks.**

- Page shows the 35-Mark unlock threshold and current balance when ineligible.
- Eligible students see resources by category and can open a resource.
- Private files require an eligible session and are not public URLs.
- Temporary admin grants bypass the Marks gate until expiry.

**App surface.** `/knowledge-bank`, resource viewer, private file route.

**Evidence.** A private PDF resource, "V3 Acceptance Resource", was uploaded
through the admin content API and appeared for the eligible student with a PDF
label and View action. The card, filter, and viewer now show "Essay & Writing"
from `categoryName`; the raw category ID is no longer displayed. View opened a
resource dialog with an embedded PDF; the file responded 200 with
`application/pdf` and `%PDF-`, while an anonymous request returned 401. The
35-Mark ineligible state and temporary grants were not exercised.

**Result. Partial.** Browsing, readable category, private PDF access, and
anonymous denial are verified; access-grant behavior remains open.
Requirements: REQ-CONTENT-03.

### S-17 Competition calendar

**Story.** As a student, I want to view competition events by month or agenda,
filter by competition type, and open event details, so that I can plan entries
and deadlines.

**Acceptance checks.**

- Month and agenda views show the same events.
- A repeated event and date appears once; distinct events with the same title
  remain separate.
- Filters reset and empty states are clear.
- Event detail shows dates, location, organizer, registration deadline, and
  links where provided.

**App surface.** `/calendar`.

**Evidence.** A calendar event, "V3 Acceptance Competition", was created through
the admin content API for 20-21 November 2026 and appeared in the November month
grid. A second distinct event with the same title and dates was then created; both
appeared in the public list and month page, and the second was removed. Agenda
view, filters, repeated-date dedupe, and detail drawer were not exercised.

**Result. Partial.** Event creation, month visibility, and distinct same-title
events are verified; repeated-date dedupe and detail behavior remain open.
Requirements: REQ-CALENDAR-01, REQ-CONTENT-03.

### S-18 FAQ and guide

**Story.** As a student, I want to read the full FAQ and the role-specific guide,
so that I understand pricing, cancellation, bookings, and platform behavior.

**Acceptance checks.**

- FAQ lists all active entries in order and supports paragraph and list
  formatting.
- Guide explains the student journey from finding a tutor to finishing a
  session.
- Links to terms, privacy, and support are reachable.

**App surface.** `/faq`, `/guide`, WhatsApp support.

**Evidence.** FAQ showed four active answers; guide showed the student journey,
session length, Marks, and four chapters.

**Result. Covered.** Requirements: REQ-FAQ-01, REQ-LANDING-01.

### S-19 Notifications

**Story.** As a student, I want to read booking, payment, schedule, and report
notifications and mark them read, so that I do not miss an action.

**Acceptance checks.**

- Unread count appears in the top bar and on the notifications page.
- Notifications are grouped and timestamped.
- Mark all as read and per-row read management work.
- Booking-related items link to the relevant detail where applicable.

**App surface.** `/notifications`, notification bell.

**Evidence.** Page showed 14 unread items covering booking accepted, session
completed, payment received, session flagged for review, and report reminders.

**Result. Covered.** No direct PRD requirement ID; app feature.

### S-20 Student profile and contact details

**Story.** As a student, I want to maintain my photo, phone, school, grade,
parent contact, and contact privacy, so that tutors can prepare and reach me
safely.

**Acceptance checks.**

- Account identity and learning profile are separate.
- Profile completion count reflects required fields.
- Contact privacy can allow or block new contact requests.
- A student with no profile row sees an empty form, not an error.

**App surface.** `/profile`.

**Evidence.** Profile page showed 0 of 6 details, account identity, learning
profile, school, parent or guardian, and contact privacy. The expected
`auth/getProfile` 404 for a missing row was handled as an empty state.

**Result. Covered.** No direct PRD requirement ID; app feature.

## Tutor stories

### T-01 Claim an invitation and create a tutor profile

**Story.** As an invited tutor, I want to claim my invitation with the matching
account email and create a tutor profile, so that I can start onboarding.

**Acceptance checks.**

- Invitation is single-use, expires, and is bound to the invited email.
- Claim requires an authenticated account with the same normalized email.
- Claim consumes the invitation and creates the profile transactionally.
- Admin accounts cannot be silently demoted; email/password and Google share the
  same claim path.

**App surface.** `/invite?token=...`, `/profile`.

**Evidence.** The invite claim page and service contract exist; the development
database has one accepted invitation and no pending token for this walkthrough.

**Result. Partial.** No pending invitation token was available. Requirements:
REQ-AUTH-02, tutor onboarding.

### T-02 Edit the public tutor profile

**Story.** As a tutor, I want to edit my photo, bio, affiliation,
specializations, education, achievements, and experiences, so that students can
judge my fit.

**Acceptance checks.**

- Photo upload and crop are available.
- Bio, affiliation, and up to seven specializations are required where marked.
- Education allows two entries; achievements and experiences allow five each.
- Changes are previewed before submission and remain private until admin
  approval.
- Published changes and pending changes are visually distinct.

**App surface.** `/profile`.

**Evidence.** Tutor profile showed Published status, photo controls, name, bio
word count, affiliation, two selected specializations, education, achievements,
experiences, proof links, and a changes preview.

**Result. Covered.** Requirements: REQ-COMP-06, REQ-TAX-01.

### T-03 Submit profile changes for review

**Story.** As a tutor, I want to save a draft or submit changes for admin review,
so that my public profile stays accurate without exposing unfinished edits.

**Acceptance checks.**

- Save profile changes keeps a draft.
- Submit changes for review validates required fields and terms agreement.
- Review status and previous history are visible.
- Admin approval publishes the edited version; rejection returns actionable
  status.

**App surface.** `/profile`, profile history, `/admin-tutors/:profileId`.

**Evidence.** Published badge, Save profile changes, Submit changes for review,
Tutor Terms of Service agreement, and "Changes preview: no new changes" were
present.

**Result. Covered.** Tutor profile review workflow.

### T-04 Set availability windows and date overrides

**Story.** As a tutor, I want to set weekly teaching hours and individual date
overrides, so that students can book valid 90-minute starts.

**Acceptance checks.**

- Weekly hours support Monday to Sunday, online/offline mode, add hours, and
  apply to weekdays.
- Date overrides support single or multiple dates and modes.
- Save validates start before end, overlap, and date range.
- Calendar preview reflects saved windows and overrides.

**App surface.** `/availability`.

**Evidence.** Page showed weekly rows, start and end dates, save weekly hours,
date override list, and a seven-day calendar preview. Existing data had five
active windows.

**Result. Covered.** Requirements: tutor availability policy, REQ-CLASS-05.

### T-05 Maintain payout account and tax identity

**Story.** As a tutor, I want to provide my bank account, legal name, NIK, and
optional NPWP, so that Cogito can prepare a compliant payout.

**Acceptance checks.**

- Bank, account number, holder name, opening city, ownership, and confirmation
  are required.
- Legal name and 16-digit NIK are required before a new payout is prepared;
  NPWP is optional.
- Tax identity stays private to the tutor and payout admins.
- Saved values are snapshotted into each payout and are not recalculated by
  later profile edits.

**App surface.** `/profile`, payout account and tax identity sections.

**Evidence.** Page showed bank BCA, account number, holder, opening city,
ownership, transfer confirmation, legal name, NIK, optional NPWP, and the tax
explanation. It also showed a 3.00 percent default NIK-only estimate.

**Result. Covered.** Requirements: REQ-TAX-01, REQ-PAYOUT-01.

### T-06 Tutor dashboard

**Story.** As a tutor, I want a dashboard that shows bookings needing action,
upcoming sessions, availability, earnings, and payout details, so that I can
start the day with the right tasks.

**Acceptance checks.**

- Needs action count links to the relevant bookings.
- Teaching pulse shows next deadline, upcoming, completed, and availability.
- Payout details show unpaid sessions, gross, tax rate, tax, transfer fee, net,
  and recent payout history.
- Next lesson shows the nearest scheduled session.

**App surface.** `/dashboard`.

**Evidence.** At the time of the dashboard check, after the class and booking
reports, the dashboard showed 2 bookings needing action, 3 completed sessions,
5 availability windows, 3 unpaid sessions, gross Rp860,000, 3.00 percent tax,
Rp25,800 withheld, Rp0 transfer fee, and estimated net Rp834,200, plus recent
payout history. A later idempotency fixture added one more cohort report.

**Result. Covered.** Requirements: REQ-PAYOUT-03, tutor finance.

### T-07 Accept or decline a booking request

**Story.** As a tutor, I want to review a pending booking and accept or decline
it with a reason, so that students get a clear decision.

**Acceptance checks.**

- Pending request shows student, topic, schedule, mode, participants, and
  agreed fee.
- Accept confirms the session and triggers meeting setup where online.
- Decline requires a reason and notifies the student.
- The decision is recorded in booking history.

**App surface.** `/bookings/:bookingId`, tutor actions.

**Evidence.** Booking #22 ("V3 acceptance booking") showed student, schedule,
online mode, one participant, notes, and Rp160,000 honorarium. Tutor accepted it
through the confirmation dialog. History recorded "Approve booking" and "Schedule
session"; the meeting was created automatically.

**Result. Covered.** Decline was not executed. No direct PRD requirement ID;
existing booking policy.

### T-08 View assigned bookings and session access

**Story.** As a tutor, I want to see my upcoming and historical bookings with
participants, access details, and honorarium, so that I can prepare and teach.

**Acceptance checks.**

- List separates needs action, upcoming, series, history, and all.
- Card shows date, time, mode, class title, booking title, participants, fee,
  status, and Details.
- Detail shows session overview, participants, student notes, history, and
  honorarium.
- Online meeting link or manual link action is available.

**App surface.** `/bookings`, `/bookings/:bookingId`.

**Evidence.** Tutor bookings showed 5 total, 2 needs action, 1 upcoming, and 2
history. Detail showed scheduled session, participants, notes, history,
Rp160,000 honorarium, Complete session, Propose new time, and Add meeting link.

**Result. Covered.** Requirements: REQ-CLASS-02, booking policy.

### T-09 Propose a new time or complete a session

**Story.** As a tutor, I want to propose a schedule change or mark a delivered
session complete, so that the booking moves to the correct state and fee.

**Acceptance checks.**

- Reschedule proposal carries a reason and goes to the student for a decision.
- Completing a session opens the reporting path; the fee is created only for a
  delivered, reported session.
- Completion cannot silently rewrite an existing earned fee.
- Repeated actions are idempotent.

**App surface.** `/bookings/:bookingId`, `/class-reports`.

**Evidence.** Tutor booking detail showed Propose new time and Complete session.
The private reporting workspace opened from Open Session Reporting.

**Result. Covered.** Requirements: REQ-REPORT-02, REQ-CLASS-05.

### T-10 Report tutor absence for a class session

**Story.** As a tutor, I want to report an absence from a class session before
or after the start, so that the admin can resolve coverage and the notice is
timed and visible.

**Acceptance checks.**

- Report button requires a reason and records the server timestamp.
- A notice strictly under 24 hours before start is marked late.
- Report is allowed after start while the session is not completed.
- Admin sees per-tutor absence history and can replace the tutor at the same
  time without rewriting fee ownership.

**App surface.** `/class-reports`, class session report editor,
`/classes/:classId` admin view.

**Evidence.** Class sessions for Diego now exist. The report dialog showed
"Report tutor absence", a reason field, the late-notice explanation, and the
server-timed notice controls. A late notice on CLS-137-S3 was recorded as "Tutor
absence notice recorded · Late notice" and appeared in the admin class detail as
"Tutor absence history (1)" with the reason and WIB timestamp. A pre-start notice
on CLS-137-S2 was then submitted from `/my-classes/$classId`; it recorded without
a late label and appeared in the same admin history. A fresh class then tested
the boundary: 24h + 5s before start stored `late=false`; 23h 59m 55s stored
`late=true`. Same-time tutor replacement was not executed.

**Result. Partial.** Pre-start and late absence plus admin history are verified;
same-time replacement remains open. Requirements: REQ-CLASS-05.

### T-11 Submit a three-field session report

**Story.** As a tutor, I want to submit discussion, strengths, and improvement
feedback for a delivered session, so that the session completes and my fee is
created.

**Acceptance checks.**

- Exactly three fields: session discussion, strengths observed, areas for
  improvement.
- Each field is nonempty, bullet or line based, and limited to 600 characters
  after normalization.
- Submit records completion, deducts the correct student allocation, and creates
  one tutor fee.
- Missing report keeps the hold pending and creates no payable fee.
- Repeated submission is idempotent.

**App surface.** `/class-reports`, report dialog.

**Evidence.** Cohort session CLS-137-S1, masterclass CLS-138-S1, and private
booking BKG-22 were reported through the three-field dialog. Each report marked
the session recorded, deducted the correct Marks (20, 5, 38), and created one
tutor fee (Rp400,000, Rp300,000, Rp160,000). The report dialog showed 600-character
counters and delivery confirmation; replay was not submitted twice.

**Result. Covered.** Requirements: REQ-REPORT-01, REQ-REPORT-02.

### T-12 View and correct reports

**Story.** As a tutor, I want to view my submitted reports and understand which
ones can be corrected, so that I can verify the record without changing finance.

**Acceptance checks.**

- List shows session, reference, date, type, report status, and action.
- View shows the three fields and session metadata.
- Editing a completed report changes text only, not deductions, referrals, or
  fees.
- Private report corrections are admin-only; financial corrections use audited
  adjustments.

**App surface.** `/class-reports`.

**Evidence.** Tutor list showed Pending and Recorded rows with Record report or
View report. Student report view displayed the three feedback fields.

**Result. Covered.** Requirements: REQ-REPORT-03.

### T-13 Earnings, deductions, and payout history

**Story.** As a tutor, I want to see my gross honorarium, tax and transfer
deductions, net payout, covered sessions, and payout history, so that I can
reconcile the external transfer.

**Acceptance checks.**

- Current unpaid sessions, gross, applicable tax rate, withholding, transfer
  fee, and net are shown.
- Payout detail lists covered sessions and preserved snapshots.
- Later profile or tax edits do not recalculate recorded payouts.
- Tutor receives the same breakdown by email where configured.

**App surface.** `/dashboard`, payout detail.

**Evidence.** Dashboard showed the payout summary and recent payout history.
Admin payout records showed two Rp160,000 sessions, 3.00 percent tax, Rp4,800
withholding, Rp0 transfer fee, Rp155,200 net, and Recorded transfer status.

**Result. Covered.** Requirements: REQ-PAYOUT-01, REQ-PAYOUT-03.

### T-14 Tutor resources and notifications

**Story.** As a tutor, I want role-specific guidance, FAQ, calendar, knowledge
bank, and notifications, so that I can operate without asking support for basic
answers.

**Acceptance checks.**

- Guide explains invitation, profile review, booking decisions, teaching, and
  payout.
- FAQ, calendar, and knowledge bank open for tutors.
- Notifications show class publication, cancellations, report reminders, and
  absence or schedule events.

**App surface.** `/guide`, `/faq`, `/calendar`, `/knowledge-bank`,
`/notifications`.

**Evidence.** Tutor guide showed three chapters and role-specific explanations.
Notifications showed 17 unread items including class published, class sessions
cancelled, report reminders, and session flagged for review.

**Result. Covered.** No direct PRD requirement ID; role support.

### T-15 Open the tutor Classes area

**Story.** As a tutor, I want to open the Classes area from my sidebar to see
the classes I teach, so that I can review class details and schedules.

**Acceptance checks.**

- Tutor sidebar Classes item opens a tutor-accessible class list.
- A class detail page opens for a class the tutor teaches.
- The page does not redirect to the dashboard.

**App surface.** `/my-classes`, `/my-classes/:classId`, tutor sidebar.

**Evidence.** The tutor sidebar **Classes** item opens `/my-classes`. The page
listed 7 assigned sessions with cohort/masterclass type, date and time in WIB,
online format, status, and View class or View report actions. Opening class 137
showed four assigned sessions. Expanding session 2 showed Curriculum, Format,
Meeting, and a **Join meeting** link to the stored Google Meet URL. The old
student route `/classes` still redirects a tutor to the dashboard, but the tutor
menu no longer points there.

**Result. Covered.** Related requirements: REQ-COMP-06, REQ-CLASS-03.

## Admin stories

### A-01 Admin dashboard and business insights

**Story.** As an admin, I want a dashboard that shows escalations, exceptions,
tutor reviews, achievement reviews, and business metrics, so that I can see
what needs attention and how the business is performing.

**Acceptance checks.**

- Escalated bookings, booking exceptions, tutor reviews, and achievement
  reviews are counted separately.
- Selected-period metrics cover bookings, completion rate, active proposers, and
  account activity.
- Business insights separate top-up receipts in IDR, delivered services in
  Marks and sessions, future commitments, and earned tutor costs.
- Missing private rates or payment dates show explicit notices, not guessed
  totals.

**App surface.** `/admin`.

**Evidence.** Dashboard showed zero escalations and exceptions, Payouts entry,
5 bookings, 100 percent completion rate, 1 active proposer, account activity,
and the Q15 business insights sections.

**Result. Covered.** Requirements: Q15 decision, admin analytics.

### A-02 Operations booking queue, wallet lookup, and room approvals

**Story.** As an admin, I want one operations workspace to find stalled
bookings, inspect a wallet, and approve offline rooms, so that I can resolve
exceptions without spreadsheets.

**Acceptance checks.**

- Booking queue filters by booking number, override category, urgency, and SLA.
- Rows show booking, schedule, status, override, affected state, SLA, held
  Marks, and detail or override actions.
- Wallet lookup searches users and shows the balance and ledger.
- Room approvals list active rooms and pending tutor-accepted offline bookings;
  admins can add a room.

**App surface.** `/admin-operations`.

**Evidence.** Queue showed booking #1, #21, #3, and #2 with schedule, status,
lateness, hold amounts, and View details or Override. Wallet lookup and Room
approvals tabs opened with search, Add room, and empty states. Two active rooms
were then created through the room API; room approval and assignment were
exercised from the booking flow.

**Result. Covered.** REQ-ACCESS-01, operations policy.

### A-03 Booking detail with override and financial context

**Story.** As an admin, I want the canonical booking detail with participants,
state history, financial context, room actions, and override controls, so that
I can resolve a case with evidence.

**Acceptance checks.**

- Same canonical route as other roles, with admin-only wrapper.
- Shows student, tutor, schedule, mode, status, participants, notes, history,
  hold and refund values, and honorarium.
- Override and room actions require a reason and are audited.
- Meeting retry and manual link are available only when applicable.

**App surface.** `/bookings/:bookingId`, `/admin-operations/bookings/:bookingId`
redirect.

**Evidence.** Admin bookings list opened the canonical detail route; the admin
wrapper includes override, room, financial context, and state history according
to the current context document. Meeting retry and manual link controls are
present. An offline solo booking requested a small room, tutor acceptance moved
it to awaiting room approval, admin assignment scheduled it, and relocation moved
it to the large room with old/new room history. A group of two requesting a
capacity-one room received `roomConflict` and no room row.

**Result. Covered.** REQ-AUDIT-01, REQ-ACCESS-01.

### A-04 Invite tutors

**Story.** As an admin, I want to invite a tutor by email and optional name,
see the invitation status, resend or copy the link, and know whether the email
is already registered, so that onboarding starts cleanly.

**Acceptance checks.**

- Invite form validates email, recipient name, and optional internal notes.
- Preflight shows the existing account role and linked auth methods.
- Invitations list shows status and last update.
- Resend creates a new single-use token and invalidates the old one; the
  plaintext link is available once if delivery fails.

**App surface.** `/admin-tutors`, invitation form and list.

**Evidence.** Page showed Email Address, Recipient name, Internal Notes, Send
Invitation, an accepted Diego invitation, status, last updated, and pagination.

**Result. Covered.** Tutor onboarding contract.

### A-05 Review tutor profiles

**Story.** As an admin, I want to review a tutor's profile, proofs, photo,
teaching setup, and payout account, then publish, unpublish, or suspend, so that
the public directory stays trustworthy.

**Acceptance checks.**

- Review page shows profile, teaching mode, specializations, credentials,
  education, achievements, experiences, proofs, photo, and payout account.
- Publish, unpublish, suspend, and rejection actions are role-protected.
- Edited photo upload or URL is applied only on approval.
- The action and actor are recorded.

**App surface.** `/admin-tutors/:profileId`.

**Evidence.** Page showed Published status, Unpublish, Suspend, profile,
teaching setup, credentials, empty proofs and photo, payout account, and the
review workspace.

**Result. Covered.** REQ-COMP-06, REQ-ACCESS-01.

### A-06 Class studio: create and edit cohorts and masterclasses

**Story.** As an admin, I want to create or edit a class with competition,
title, description, cover, capacity, dates, sessions, tutors, and agreed tutor
fee, so that I can publish a complete offering.

**Acceptance checks.**

- Cohort and masterclass types are supported; masterclass has exactly one
  session.
- Class title, description, competition, cover, tutor fee, minimum enrollment,
  rates, and session curriculum are editable.
- Each session has date, time, duration, capacity, mode, tutor, and online
  meeting or offline room settings.
- Publication requires a valid active competition, active rates, valid tutors,
  and matching session fees.
- Draft save and publish collect a reason and record an audit.

**App surface.** `/admin-classes`, class editor, `/classes/:classId` admin view.

**Evidence.** Class Studio showed published class list, drafts and editor,
cohort or masterclass fields, competition selector, date picker, session fields,
tutor selector, Add session, Save draft, and published class detail link. A
four-session cohort (class 137) and a one-session masterclass (class 138) were
created through the admin API from the browser session and published. The cohort
contains four scheduled sessions, four capacities, one tutor per session, and
curriculum text; the masterclass contains exactly one session and a 5-Mark rate.

**Result. Covered.** Requirements: REQ-CLASS-01, REQ-CLASS-02,
REQ-COMP-03, REQ-COMP-04.

### A-07 Publish a class and create meetings

**Story.** As an admin, I want publishing to create one meeting per online
session with retry and no duplicates, so that students and tutors get a working
join link.

**Acceptance checks.**

- Publishing queues one Google Meet per online session.
- Re-publish or retry does not create a duplicate active meeting.
- Failed meeting creation is visible and retryable.
- In-person sessions select an existing admin-managed room.
- Changes notify affected tutors and students without an acceptance step.

**App surface.** `/admin-classes`, class detail, meeting retry.

**Evidence.** Publishing class 137 created four Google Meet events for its four
online sessions; publishing class 138 created one Meet event. Readback showed
five `created` meetings with distinct `https://meet.google.com/...` URLs. The
four-session class showed four scheduled sessions and an admin detail page with
Open meeting. Duplicate retry was not executed in this run.

**Result. Covered.** Requirements: REQ-CLASS-02.

### A-08 Class lifecycle and session controls

**Story.** As an admin, I want to check minimum enrollment, continue, postpone
once, cancel, reschedule a session, replace a tutor, review absence history, and
cancel a session, so that classes stay correct when plans change.

**Acceptance checks.**

- Minimum check allows continue, postpone once, or cancel; notifications are
  sent.
- Postponement grants the three-day penalty-free withdrawal window.
- Ordinary reschedule allows only the affected undelivered session to be
  cancelled before the strict deadline.
- Same-time replacement preserves schedule, fee, and allocations, and grants no
  new exit right.
- Session cancellation returns unspent holds and never erases delivered fees.
- Every action requires a reason where policy requires one.

**App surface.** `/classes/:classId` admin view.

**Evidence.** Admin class detail showed Cancel class, Status, Tutor fee per
session, session accordion, Status and capacity, Format and access, Open
meeting, Date and time, Tutor, Cancel session, and icon actions "Change session
time for dasdsa" and "Change tutor for dasdsa."

**Result. Covered.** Requirements: REQ-CLASS-04, REQ-CLASS-05,
REQ-COMP-04.

### A-09 Competition catalog CRUD

**Story.** As an admin, I want to manage parent competitions and child
specializations, including names, descriptions, order, colors, status, and
safe deletion, so that the catalog drives every consumer.

**Acceptance checks.**

- List and search parents with their specializations and status.
- Create or edit parent and child with required English and optional Indonesian
  inputs; display the English label.
- Parent owns the online/offline rates; children inherit them.
- Four parent colors are configurable with light and dark previews; children
  inherit them.
- Archive hides new selection but preserves history and agreed prices.
- Delete only unused entries; referenced entries return a conflict.
- Every write requires a reason and uses optimistic version checks.

**App surface.** `/admin-competitions`, create/edit drawer.

**Evidence.** Catalog showed 7 parent groups and 34 children. Edit drawer for
Model United Nations showed name, Indonesian name, descriptions, order,
immutable slug, colors, reason, Archive, Save changes, and Discard draft.

**Result. Covered.** Requirements: REQ-COMP-01 through REQ-COMP-07.

### A-10 V3 economy settings

**Story.** As an admin, I want to edit package prices, exact surcharge,
competition Marks and tutor fees, and online/offline increments, preview one to
six students, and activate a saved revision with a reason, so that pricing is
controlled and auditable.

**Acceptance checks.**

- Active rate card is distinct from the latest saved revision and unsaved
  changes.
- Edit shows all package, surcharge, competition, and adjustment fields.
- Preview covers one to six students and both modes.
- Custom top-up example 140 recommends 150 while keeping both choices.
- Save draft does not activate; activation requires the latest saved revision,
  expected active revision, and a reason.
- Stale activation returns a conflict.

**App surface.** `/admin-economy`.

**Evidence.** Page showed active revision 1, Edit V3 draft, package and
competition tables, online and offline adjustments, preview for Model United
Nations with N1-6, and the 140-Mark custom example at Rp1,015,000 with the
150-Mark recommendation at Rp975,000.

**Result. Covered.** Requirements: REQ-ECON-01, REQ-ECON-02, REQ-ECON-04.

### A-11 Tutor payouts and tax CSV

**Story.** As an admin, I want to select unpaid session fees, preview gross,
tax, transfer fee, and net, record the external transfer with evidence, void
with history, and export the monthly tax CSV, so that tutor finance is
reconciled and auditable.

**Acceptance checks.**

- Default tax rates support two decimals for NIK plus NPWP, NIK only, missing,
  and tutor override.
- Selection prevents including one earned fee in two active payouts.
- Preview is a fixed snapshot of selected fees, tax, bank, transfer fee, and net.
- Recorded transfer requires actual amount, actual date, and optional reference
  or proof; amount must equal calculated net for full payment.
- Void retains history, returns sessions to unpaid, and requires reconciliation
  if money moved.
- CSV exports paid snapshots by actual payment date, not current profiles.

**App surface.** `/admin-tutor-payouts`.

**Evidence.** Page showed tax defaults, reason field, payout filters, status and
sort, quick date ranges, Download monthly CSV, and two recorded transfers:
Rp160,000 gross, 3.00 percent tax, Rp4,800 withholding, Rp0 fee, Rp155,200 net.
Selecting All statuses plus 90 days displayed the records. CSV downloaded as
`tutor-payouts-2026-08-04-to-2026-11-01.csv`, 2,010 bytes. A live payout batch
then selected four unpaid fees: gross Rp1,260,000, 3.00 percent NIK-only tax
Rp37,800, transfer fee Rp0, net Rp1,222,200. Preparing created an immutable
prepared batch; recording the exact net with reference `UAT-DEV-NO-BANK-TRANSFER`
marked it paid. Voiding it retained history and required reconciliation because a
transfer was recorded. Resolving reconciliation returned all four sources to
unpaid. A second prepare/void before any transfer also returned all sources.

**Result. Covered.** Requirements: REQ-TAX-01, REQ-PAYOUT-01,
REQ-PAYOUT-02, REQ-PAYOUT-03.

### A-12 Referral usage

**Story.** As an admin, I want to list saved signup choices and their reward
evidence, so that friend and KOL referrals can be audited.

**Acceptance checks.**

- Search by code, user or referrer name, email, or campaign.
- Rows show saved choice, attribution, email verification, welcome credit,
  friend completion decision, and KOL payment evidence.
- Totals reflect linked ledger credits, not current wallet balance.
- Rows and totals use one read snapshot.

**App surface.** `/admin-referrals?view=activity`.

**Evidence.** Page showed Activity, Campaigns, Commissions; summary cards for
choices, codes, welcome Marks, and friend Marks; search; and an explicit empty
state because no usage rows exist.

**Result. Covered.** Requirements: REQ-FRIEND-01 through REQ-FRIEND-03,
REQ-KOL-01.

### A-13 KOL campaigns

**Story.** As an admin, I want to create a KOL campaign with a registration-only
code, term dates, attribution window, and flat, percentage, or combined
commission, so that KOL terms lock at signup.

**Acceptance checks.**

- Code is unique, uppercase, and 4-32 letters or digits.
- Campaign requires a name, expiry, attribution window, and at least one
  nonzero commission type.
- Saved terms cannot be edited.
- Activation defaults to now and expiry is explicit.
- Wrong percent precision is rejected; fields remain after failure.

**App surface.** `/admin-referrals?view=campaigns`.

**Evidence.** Campaigns tab showed Create KOL campaign, Hide creation form,
campaign name, code, activation, expiry, attribution days, flat commission,
percent commission, and two saved campaigns with rendered terms.

**Result. Covered.** Requirement: REQ-KOL-01.

### A-14 KOL commission and settlement

**Story.** As an admin, I want to see the calculated commission for the first
qualifying purchase, record partial or overpaid external transfers, adjust the
obligation with a reason, and export a reconciliation CSV, so that finance sees
the true outstanding amount.

**Acceptance checks.**

- One qualifying first purchase creates one commission, even with repeated
  webhook events.
- Calculated, transferred, and outstanding amounts stay separate; overpayment
  remains visible.
- Transfer records bind to one decision and cannot be split across campaigns.
- Adjustments require a reason, expected obligation, and before/after audit.
- Full invalidation voids the effective obligation while preserving history;
  partial refunds are flagged for manual reconciliation, not prorated.
- Monthly CSV lists attributed users, qualifying purchases, calculated,
  transferred, and outstanding amounts.

**App surface.** `/admin-referrals?view=commissions`, settlement panel, CSV.

**Evidence.** Commissions tab showed Activity month, Export monthly CSV, summary
and detail explanation, and an explicit empty state because there are no
decisions. Settlement forms and policy are present in source.

**Result. Partial.** No commission decision or transfer was available; transfer
recording and CSV were not exercised. Requirements: REQ-KOL-02, REQ-KOL-03.

### A-15 Admin session reports

**Story.** As an admin, I want to search a student, review their eligible
reports, export a PDF, and complete or correct a report with an audit reason, so
that report quality and finance stay consistent.

**Acceptance checks.**

- Search by student name or email.
- Admin can export reports for any eligible student.
- Admin completion requires all three fields, delivery check, reason, actor and
  time, and notifies the tutor.
- Correction changes report text and version only; financial outcomes use an
  audited adjustment.
- History shows the recorded role and actor, not a synthetic one.

**App surface.** `/class-reports`.

**Evidence.** Admin searched "Andre", selected the student, and saw six eligible
reports. Selecting one and downloading produced
`student-reports-2026-11-01.pdf`, 36,598 bytes, starting with `%PDF-`. An admin
correction of report CLS-137-S4 changed it to version 2 with reason "UAT
correction and max-length PDF check". Revision history recorded version 1 as
tutor and version 2 as admin; the fee count and wallet balances were unchanged.
The corrected PDF rendered 36,402 bytes on one page.

**Result. Covered.** Search, export, correction, revision provenance, and
financial stability are verified. Requirements: REQ-REPORT-02, REQ-REPORT-03,
REQ-REPORT-04.

### A-16 FAQ authoring

**Story.** As an admin, I want to add or edit FAQ questions and answers with
English required, Indonesian optional, order, active state, and Show on landing,
so that public FAQ content stays current.

**Acceptance checks.**

- English question and answer are required and safe rich text; Indonesian is
  optional.
- Ordering, active, and Show on landing are editable.
- All active entries appear on the full page; landing shows active and landing
  flags in the same order, capped at six.
- Deactivation hides both pages even if the landing flag remains true.
- Save goes live after cache invalidation.

**App surface.** `/faq`.

**Evidence.** Page showed 4 landing FAQs, Add FAQ, English question and answer,
Add Indonesian version, Active, Show on landing, Cancel, and Save FAQ.

**Result. Covered.** Requirement: REQ-FAQ-01.

### A-17 Activities and Others articles

**Story.** As an admin, I want to write article-style Others content with cover,
title, description, rich body, WIB schedule, location, and publication state, so
that the website shows community activities without type labels.

**Acceptance checks.**

- One article list contains Simulation Days, Cogito 101, Monthly Townhall, and
  similar entries without exposing type labels.
- Fields include cover URL, English-required and Indonesian-optional title and
  description, rich body, start and end time in WIB, location, and draft or
  published state.
- Registration links live inside the body; no dedicated registration field.
- Upcoming or completed is derived from end time.
- Save goes live for the website with cache invalidation.

**App surface.** `/activities`.

**Evidence.** Page showed Activities · Others, Articles, New article, two saved
articles with published or draft status and edit or delete actions, and the
full editor with title, short description, cover URL, location, WIB date, body,
and Save article.

**Result. Covered.** Requirement: REQ-CONTENT-01.

### A-18 Knowledge Bank content and access grants

**Story.** As an admin, I want to add or edit knowledge-bank resources with a
private PDF, publish them, and grant temporary access to eligible students, so
that the library is controlled without a public file URL.

**Acceptance checks.**

- Resource has title, description, category, active state, version, and a
  private PDF.
- Save requires a reason and detects stale versions.
- Imported records can be archived but not hard-deleted.
- Student access requires 35 Marks or a temporary grant that expires
  automatically.
- Private files deny anonymous and ineligible access.

**App surface.** `/knowledge-bank` admin mode, `/admin-knowledge-bank`.

**Evidence.** Admin knowledge-bank mode showed Add resource, View resources,
search and pagination. A private PDF was uploaded and a resource record was
created through the admin API; the student library then showed "V3 Acceptance
Resource" with a PDF label and View action. The resource read returns
`categoryName` resolved from the parent competition, and the student card shows
"Essay & Writing". The file returned 200 with `application/pdf` to the eligible
student and 401 to an anonymous request. An Athena grant was created with expiry
and note, appeared in the list, and was removed. Ineligible-threshold and expiry
behavior were not exercised.

**Result. Partial.** Resource authoring, readable category, private file access,
anonymous denial, and grant CRUD are verified. Ineligible threshold and expiry
remain open. Requirements: REQ-CONTENT-03, admin content policy.

### A-19 Competition calendar content

**Story.** As an admin, I want to add or edit calendar events, categories, and
dates, so that the student and website calendars are backed by app data.

**Acceptance checks.**

- Event has title, description, category links, start and end date, location,
  organizer, registration deadline, and links.
- Save requires a reason and detects stale versions.
- Calendar dedupes by event and displayed date, while distinct events with the
  same title remain separate.
- Archived imported records stay readable and cannot be hard-deleted.

**App surface.** `/calendar` admin mode.

**Evidence.** Admin calendar mode showed Add event, View calendar, search, and
pagination. A November 20-21 event was created through the admin API and appeared
in the student month grid. A second distinct event with the same title and dates
also appeared, proving distinct identities are not collapsed by title; it was
then removed. Agenda view, detail drawer, filters, repeated-date dedupe, and
archived-record behavior were not exercised.

**Result. Partial.** Event authoring, month visibility, and duplicate-title
distinction are verified; repeated-date dedupe and detail behavior remain open.
Requirements: REQ-CALENDAR-01, REQ-CONTENT-03.

### A-20 Achievement moderation

**Story.** As an admin, I want to review student achievement evidence and
approve or reject submissions, so that only verified results reach the public
site.

**Acceptance checks.**

- Tabs show all, pending, approved, and rejected counts.
- Card shows student, event, category, award, level, date, location,
  description, skills, and proof link.
- Approve publishes; reject requires a reason and notifies the student.
- Decisions are audited.

**App surface.** `/admin-achievements`.

**Evidence.** Page showed All submissions, Pending 0, Approved 0, Rejected 0,
and an explicit empty state.

**Result. Covered.** No direct PRD requirement ID; app feature.

### A-21 Admin notifications and guide

**Story.** As an admin, I want an operations guide and notifications for
bookings, schedules, reports, and finance events, so that I can follow the
correct workflow and react to changes.

**Acceptance checks.**

- Admin guide covers tutors, payouts, bookings, quality checks, and content.
- Notifications show unread count, event category, timestamp, and read controls.
- Links open the relevant admin workspace.

**App surface.** `/guide`, `/notifications`.

**Evidence.** Admin guide showed five chapters and role-specific admin tasks.
Notifications showed 17 unread events, including tutor absence and schedule
events.

**Result. Covered.** No direct PRD requirement ID; role support.

## Acceptance fixtures created on 1 November 2026

The follow-up run created and exercised these development fixtures. They are
left in place for inspection. Session and booking timestamps were moved into the
past with direct SQL only where a completion report required it.

| Fixture                                            | Evidence                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cohort 137, "V3 Acceptance Cohort - Multi Session" | 4 online sessions, 2-5 November 2026; 4 Google Meet links; state published.                                                                                                                                           |
| Masterclass 138, "V3 Acceptance Masterclass"       | 1 online session; 1 Google Meet link; state completed.                                                                                                                                                                |
| Booking 22, solo Academic Essay                    | 9 November 2026 16:30 WIB; 38 Marks held; tutor accepted; meeting created; completed.                                                                                                                                 |
| Booking 23, solo Academic Essay                    | 4 November 2026 15:00 WIB; 38 held; tutor accepted; cancelled more than 24 hours before start; full 38 returned, total unchanged.                                                                                     |
| Booking 24, solo Academic Essay                    | 2 November 2026 15:00 WIB; 38 held; tutor accepted; cancelled under 24h; full 38 returned, total unchanged.                                                                                                           |
| KB grant                                           | Athena grant `4a0673d3-4ed2-4c49-b7d2-d93936734c34`, expiry/note present; created, listed, removed.                                                                                                                   |
| Calendar duplicate                                 | Same-title same-date event `a751c2b4-37eb-4037-a0ab-ecdba3915a82`; displayed as distinct, then removed.                                                                                                               |
| Cohort full enrollment                             | Andre, 4 sessions, 80 Marks held, 20 deducted on report.                                                                                                                                                              |
| Cohort half enrollment                             | Argya, 3 remaining sessions, 44 first installment + 22 second installment, both paid.                                                                                                                                 |
| Cohort single enrollment and cancellation          | Athena, session 2, 25 Marks held; cancellation preview 5 fee + 20 return; final 195 available, 0 held.                                                                                                                |
| Masterclass enrollment                             | Andre, 1 session, 5 Marks held and deducted.                                                                                                                                                                          |
| Reports                                            | CLS-137-S1, CLS-137-S4, CLS-138-S1, and BKG-22 recorded with three fields.                                                                                                                                            |
| Report correction                                  | CLS-137-S4 corrected to version 2 by admin with reason; fee count and wallet unchanged; PDF 36,402 bytes, one page.                                                                                                   |
| Tutor absence                                      | Pre-start notice on CLS-137-S2 and late notice on CLS-137-S3; admin class detail showed both history entries.                                                                                                         |
| Tutor fees                                         | Two cohort sessions at Rp400,000 each, one masterclass at Rp300,000, and one private booking at Rp160,000.                                                                                                            |
| Tutor payout                                       | Preview gross Rp1,260,000, tax Rp37,800, net Rp1,222,200; prepared, recorded `UAT-DEV-NO-BANK-TRANSFER`, voided; reconciliation resolved; prepared and voided again before transfer, returning all sources to unpaid. |
| Student wallet after completion                    | Andre: 350 available, 141 held, 491 total. Argya: 127 available, 47 held, 174 total. Athena: 195 available, 0 held, 195 total.                                                                                        |
| Knowledge Bank                                     | Private PDF resource "V3 Acceptance Resource", visible to the eligible student.                                                                                                                                       |
| Calendar                                           | "V3 Acceptance Competition", 20-21 November 2026, visible in the student month grid.                                                                                                                                  |

The PRD limits a masterclass to exactly one session, so the multi-session fixture
is the cohort. Publishing created five real Google Meet events in the
development calendar: four for cohort sessions and one for the masterclass.
Their event schedules still show the original future dates even where the local
session row was moved into the past for report completion. Cancel or clean up
those events separately if the fixtures should not remain.

## Negative and edge case audit — 1 November 2026

Method: authenticated browser calls to the RPC API against the development
database, plus direct SQL only to move session 4 into the past for report-replay
testing. Provider payments and OTP delivery were not called.

| Case                                                 | Expected                      | Observed                                                                                |
| ---------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| Anonymous wallet read                                | 401                           | 401 UNAUTHORIZED                                                                        |
| Student calls admin class list                       | 403                           | 403 FORBIDDEN                                                                           |
| Tutor calls admin class list                         | 403                           | 403 FORBIDDEN                                                                           |
| Student calls admin booking list                     | 403                           | 403 FORBIDDEN                                                                           |
| Student calls admin content update                   | 403                           | 403 FORBIDDEN                                                                           |
| Tutor calls student-only enrollment read             | 403                           | 403 FORBIDDEN                                                                           |
| Student calls tutor-only absence write               | 403                           | 403 FORBIDDEN                                                                           |
| Booking at an occupied time                          | 409                           | 409 "Booking time conflict"                                                             |
| Booking start in the past                            | 400                           | 400 validation failure                                                                  |
| Booking with unknown specialization                  | 400                           | 400 "A supported competition topic must be selected for V3 pricing"; no booking created |
| Duplicate full enrollment                            | conflict, no new hold         | 409 active enrollment; wallet unchanged at 511/161/350                                  |
| Single plan on a session already held by full plan   | conflict                      | 409 active enrollment                                                                   |
| Full plan on a masterclass                           | validation failure            | 400 "Choose the masterclass plan"                                                       |
| Class report before session end                      | validation failure            | 400 "only after the session ends"                                                       |
| Report with empty field                              | validation failure            | 400                                                                                     |
| Report field over 600 characters                     | validation failure            | 400                                                                                     |
| Student submits a class report                       | denied                        | 404 "Class enrollment not found"; no write                                              |
| Duplicate absence notice                             | conflict                      | 409 "notice already exists"                                                             |
| Publish with stale class version                     | conflict                      | 409 reload-and-review                                                                   |
| Masterclass with two sessions                        | validation failure            | 400                                                                                     |
| Update Knowledge Bank with stale version             | conflict                      | 409 reload-and-review                                                                   |
| Student marks another user's notification read       | not found                     | 404; victim notification stayed unread                                                  |
| Cancelled student requests unreported class sessions | empty                         | 200 `[]`, no meeting data                                                               |
| Anonymous Knowledge Bank file                        | 401                           | 401                                                                                     |
| Cancel a completed booking                           | conflict                      | 409 invalid state transition                                                            |
| Replay an identical class report                     | same report and no second fee | same report ID; fee count stayed 1; both wallets unchanged                              |

Report replay details: session 4 was completed with request key `K`. The first
call created report `17516888-78f3-4197-9f52-d873d47a819f`, one Rp400,000 fee,
and deducted 20 Marks from Andre and 22 from Argya. Replaying the same key
returned the same report ID, kept the fee count at 1, and left both wallets
unchanged.

Minor observations:

- An unknown specialization now returns 400 with "A supported competition topic
  must be selected for V3 pricing" after the fix.

## Findings and recommended fixes

### 1. Tutor Classes navigation is fixed

Status: resolved during the follow-up audit.

The tutor sidebar now points to `/my-classes`. The page lists assigned sessions,
opens `/my-classes/:classId`, shows schedule, curriculum, meeting status, and a
Join meeting link, and links to the report workspace. The old student-only
`/classes` route still redirects a tutor, but no tutor menu item points to it.
No further action is needed for the navigation finding.

### 2. Knowledge Bank category labels are fixed

Status: resolved during the follow-up audit.

Student resource metadata now includes `categoryName` resolved from the parent
competition. The card, filter option, and viewer description show "Essay &
Writing" instead of the raw category ID. The stable category ID remains in the
DTO for filtering.

### 3. Postponement and schedule-change cancellation still need execution

Severity: verification gap.

Second-installment payment, single-seat cancellation, and half-plan withdrawal
are verified. Argya's withdrawal preview showed 4 Marks fee and 18 Marks return,
and confirming left 127 available / 47 held / 174 total. The 72-hour
postponement exit and ordinary schedule-change cancellation/refund path were not
confirmed against real data.

### 4. Provider and remaining finance paths were not executed

Severity: expected walkthrough boundary.

The follow-up executed class creation, publishing, Meet creation, full/half/single
and masterclass enrollment, second-installment payment, single-seat cancellation,
half-plan withdrawal, booking acceptance and cancellation, private and class
session completion, report creation/correction/export/replay, pre-start and late
tutor absence, Knowledge Bank and calendar content creation, and the tutor payout
prepare/record/void/reconcile lifecycle. Still outside this run: Midtrans checkout
and return, OTP and email delivery, Google OAuth consent, joining a live Meet,
same-time replacement, KOL settlement, 72-hour postponement, and ordinary
schedule-change cancellation.

### 5. Non-admin Activities access now redirects

Status: resolved during the follow-up audit.

`/activities` now checks the session role before rendering and redirects
non-admins to `/dashboard`. A student direct visit lands on the dashboard instead
of the "Admin access required" shell.

### 6. Student online-session access now has an enrollment-guarded Join action

Status: resolved during the follow-up audit.

The class detail uses a protected session-access query. Meeting data is returned
only when the signed-in student has a funded allocation for that session. An
enrolled student sees **Join meeting** with the stored Google Meet URL; a
cancelled student sees "Enroll to see meeting details" and no link. The report
workspace remains restricted to past sessions. Joining the live call and the
in-person room display were not exercised.

### 7. Pre-start tutor absence now has an entry point

Status: resolved during the follow-up audit.

`/my-classes/$classId` now shows a **Report tutor absence** form for each
scheduled session that has no current notice. The server stores the reason,
timestamp, and late flag. A pre-start notice was recorded and appeared in the
admin class session history without a late label; a later after-start notice was
marked late. Same-time replacement remains outside this check.

## What is not a defect

- The student profile `auth/getProfile` 404 for a user without a profile row is
  handled as an empty profile, not an error.
- The admin payout page defaults to today's date, so older records are hidden
  until the date range is widened. Selecting 90 days and All statuses showed the
  recorded transfers.
- Empty achievement, KOL, and referral states are consistent with the current
  development data.
- Admin dashboard zeros are current data counts, not placeholder values.
- The tutor cannot reach student-only `/classes` by design; the defect is the
  visible tutor menu item, not the role guard itself.
- A student report submission returns 404 to avoid disclosing session/report
  existence. It is a safe denial and does not mutate data.

## Acceptance boundary

This walkthrough answers whether each role can find and reach the story in the
current app. It does not answer whether every acceptance criterion in the PRD is
proven for release. Still open for full release evidence:

- Provider delivery: Midtrans browser return, external webhook, Resend inbox
  delivery, real Google OAuth consent, and joining a live Meet.
- Email and in-app reminder timing, including second-half reminders and
  report-reminder catch-up.
- Concurrent last-seat, duplicate credit, duplicate fee, duplicate reward, and
  duplicate commission races.
- PDF rendering for maximum-length reports and legacy continuation pages.
- Client UAT, named launch approver Q14, and operational confirmation OPS01.
