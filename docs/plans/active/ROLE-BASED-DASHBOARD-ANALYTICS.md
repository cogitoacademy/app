# Role-Based Dashboard Analytics

Status: **Implementation in progress - dashboard read/widgets and semantic/ops slice landed locally (2026-09-25)**

## Objective

Make each dashboard answer role-specific decisions. Do not add charts unless a
user can take a clear next action from the result.

Keep the product split explicit:

- **Student:** learning and booking decisions.
- **Tutor:** teaching workload, request handling, and payout decisions.
- **Admin:** marketplace health, economics, and operational risk.

## Current State

- Student dashboard is operational: next lesson, wallet balance, competition
  calendar, and tutor recommendations. It has no dashboard analytics query.
- Tutor dashboard is operational: review queue, next lesson, profile, completed
  sessions, and unpaid honorarium. It has no trend or capacity analytics.
- Admin dashboard already has `admin.getDashboardAnalytics` with booking volume,
  resolved-booking completion rate, active learners, new accounts, Marks
  snapshot volume, live state mix, modality, and top categories.

## Local Implementation Status (2026-09-25)

Completed in current worktree:

- Shared `booking.listMine` facet counts now include `completed` and `problem`
  (`cancelled`, `late_cancelled`, `no_show`, `expired`) across the full
  role-visible relation.
- Student dashboard shows action, upcoming, completed, problem, and verified
  achievement signals, plus wallet-readiness routing without price estimates.
- Tutor dashboard shows action, upcoming, completed, availability-window, and
  nearest-deadline signals.
- Admin dashboard shows actionable queue counts for escalations, booking
  exceptions, tutor review, and achievement review.
- Admin labels distinguish locked booking snapshots, proposer-based active
  counts, and the live all-time state portfolio.
- Dashboard booking dates use `WIB` for `Asia/Jakarta`; the shared empty-state
  dashed-border experiment was reverted.

Still pending:

- Tutor period payout/capacity/request-outcome aggregates.
- Admin realized payment/payout, funnel, supply-demand, and SLA aggregates.
- Group-participant active-user definition, retention cohorts, and event-based
  conversion analytics.

## Metric Rules

Every proposed metric must document:

1. role pain point;
2. decision enabled;
3. exact formula;
4. time scope and timezone;
5. source tables/procedures;
6. empty and pending-state behavior;
7. action link from the UI.

All period metrics use WIB calendar days. Current workload metrics must not be
mixed with selected-period cohort metrics. Gross booked Marks, held Marks,
deducted Marks, refunded Marks, payment cash, and tutor payout must stay as
separate concepts.

## Student Pain Points

### S1 - "What needs my action now?"

Current next-lesson display does not summarize pending confirmations,
reconfirmations, invites, reschedule decisions, or overdue actions.

Plan:

- Add a compact **Needs action** count and the highest-priority action.
- Reuse server-side `booking.listMine` action semantics, not client-only state
  filtering.
- Link directly to `/bookings` with the correct action view.

Priority: **P0**. Data exists.

### S2 - "Am I attending and completing learning sessions?"

Students can see bookings, but dashboard gives no period summary of completed,
upcoming, cancelled, or no-show sessions.

Plan:

- Add session summary: completed, upcoming, and unresolved/problem sessions.
- Add a small status trend only if it remains actionable.
- Do not call this academic mastery or learning progress.

Priority: **P1**. Booking state and attendance data exist; aggregate read is
needed.

### S3 - "Can I book the next session?"

Balance widget shows available, held, and total Marks, but does not connect
balance state to the next booking/top-up decision.

Plan:

- Keep current balance widget as primary.
- Add a clear state: enough for current pending booking, Marks held, or top-up
  needed.
- Link to Balance or Bookings based on state.
- Do not estimate future affordability without a defined pricing basis.

Priority: **P0**. Wallet and booking data exist.

### S4 - "Is my learner record moving forward?"

Achievement counts exist on `/achievements`, but dashboard does not surface
pending/approved progress. Session feedback exists, but no normalized learning
outcome score or milestone model exists.

Plan:

- Add approved/pending achievement counts as a progress snapshot.
- Defer mastery, skill progress, and tutor-quality scores until product defines
  explicit milestones or assessments.

Priority: **P1** for achievement snapshot; **deferred** for learning outcomes.

### Student Dashboard Scope

Target first version:

- Needs action
- Next lesson
- Session summary
- Marks state and next action
- Achievement snapshot

Avoid:

- generic revenue/business charts;
- fake learning-progress percentages;
- tutor ratings, which product does not currently support;
- profile-view or recommendation-performance metrics without event tracking.

## Tutor Pain Points

### T1 - "Which requests or sessions can make me miss work?"

Review requests are visible, but completion actions and deadline risk need one
reliable workload summary.

Plan:

- Add action count covering booking review and ended scheduled sessions needing
  completion.
- Add upcoming session count and nearest deadline.
- Link to `/bookings` action/upcoming views.

Priority: **P0**. Existing booking list semantics can support this.

### T2 - "What work have I delivered, and what remains unpaid?"

Current payout card shows completed sessions and unpaid honorarium, but not a
period comparison or paid/unpaid progression.

Plan:

- Add completed sessions for selected period.
- Add gross honorarium, transfer fee, estimated net, and unpaid amount with
  explicit cutoff semantics.
- Add a short payout trend only if payout records expose reliable paid dates.
- Keep all tutor-facing financial values in IDR; never expose Marks economics.

Priority: **P0** for summary; **P1** for trend. Existing payout data covers
most summary fields.

### T3 - "Am I using my available teaching capacity?"

Tutors configure availability, but dashboard does not show whether published
windows produce booked sessions or whether supply is unused.

Plan:

- Add availability hours versus booked/confirmed/completed hours.
- Separate online and offline capacity.
- Define whether cancelled and expired bookings release utilization.
- Use future availability windows and booking schedule data; avoid counting
  overlapping or inactive windows twice.

Priority: **P1**. Requires a server aggregate and precise availability formula.

### T4 - "Which demand should I respond to or configure for?"

Tutor sees requests but not demand by specialization, modality, format, or
request outcome.

Plan:

- Add period request volume by specialization/category and modality.
- Add accepted/completed/declined/expired outcome counts.
- Link to bookings or profile/availability setup.
- Show only tutor-owned data; no cross-tutor private benchmarking in v1.

Priority: **P1**. Booking snapshots provide category/modality; outcome
aggregation needs a dedicated read.

### T5 - "Is my profile discoverable and converting?"

No profile-view, search-impression, booking-start, or tutor-selection events
exist. Adding a conversion card now would invent data.

Plan:

- Defer conversion analytics.
- If approved, add privacy-safe event instrumentation first: profile viewed,
  booking started, booking submitted, accepted, completed.
- Define retention and aggregation policy before exposing tutor comparisons.

Priority: **P2 / instrumentation first**.

### Tutor Dashboard Scope

Target first version:

- Needs action
- Upcoming workload
- Completed-session and payout snapshot
- Capacity utilization
- Request outcomes by category/modality

Avoid:

- guaranteed-income framing;
- tutor ratings or ranking without product support;
- profile conversion metrics before event instrumentation;
- Marks terminology in tutor financial UI.

## Admin Pain Points

### A1 - "Where is marketplace health improving or degrading?"

Current admin analytics shows booking and account creation trends, but not
repeat usage, retention, or a true active-user snapshot.

Plan:

- Add active students and active tutors with explicit definitions.
- Add first-time versus repeat booking counts.
- Add repeat-booking rate and cohort retention only after the cohort definition
  is approved.
- Count group participants correctly; `activeLearners` currently counts booking
  proposers only.

Priority: **P1**. Requires definition and aggregate query work.

### A2 - "Where does money move, and what is realized?"

Current `grossMarks` and `platformTakeMarks` come from locked booking snapshots.
They are not payment revenue, settlement, refund, or tutor-cost reports.

Plan:

- Add separate cards for Marks sold/credited, booking Marks quoted/held,
  deducted, released, and refunded.
- Add payment attempts by status: pending, paid/settled, failed, expired,
  refunded.
- Add tutor gross payout, transfer fees, and net payout.
- Add cash-revenue/net-contribution reporting only after accounting definitions
  are approved.
- Rename existing labels where needed so "gross" cannot imply realized cash.

Priority: **P0 semantic cleanup**, **P1 payment/payout analytics**.

### A3 - "Where does booking funnel break?"

Current state mix shows portfolio state, but not conversion between request,
tutor acceptance, participant confirmation, scheduling, and completion.

Plan:

- Add funnel counts and rates by booking cohort.
- Show pending separately from terminal outcomes.
- Use state history timestamps for time-to-response and time-to-schedule.
- Break down by modality, category, solo/group/series, and class size where
  sample size permits.

Priority: **P1**. Existing state history and booking snapshots are the likely
source; validate timestamp completeness first.

### A4 - "Is supply matching demand?"

Current category demand chart has no tutor supply, capacity, or availability
side. Admin cannot see underserved categories or excess capacity.

Plan:

- Compare published tutor count, active specialization count, future capacity,
  booking requests, and completed sessions.
- Include modality and category/specialization.
- Flag zero-supply/high-demand combinations.
- Avoid exposing individual tutor performance unless explicitly authorized.

Priority: **P1**. Requires joins across tutor profiles, specializations,
availability, and bookings.

### A5 - "Which operational risks need intervention?"

Current dashboard has queue counts and live booking states, but no trend or
resolution view for support, lateness, no-show, meeting, room, and payout
exceptions.

Plan:

- Add unresolved queue counts by risk type.
- Add overdue/SLA-breached support tickets.
- Add tutor/participant no-show and lateness counts.
- Add meeting retry/failure and offline-room failure counts.
- Add median time to resolution only when timestamps are reliable.
- Every metric links to its operational queue.

Priority: **P0** for unresolved risk counts; **P1** for trends/SLA.

### A6 - "Which acquisition and onboarding step leaks?"

New user counts do not show email verification, tutor invite claim, profile
submission, approval, publication, or first booking conversion.

Plan:

- Define student funnel: signup -> verified -> first booking -> completed.
- Define tutor funnel: invited -> claimed -> profile submitted -> approved ->
  published -> first completed session.
- Add conversion and median duration only after event/state timestamps are
  confirmed.

Priority: **P2**. Some states exist; timestamp/event coverage needs audit.

### Admin Dashboard Scope

Target first version:

- Existing business insights retained.
- Semantic corrections for current metrics.
- Realized Marks/payment/payout separation.
- Funnel health.
- Supply-demand health.
- Operational risk/SLA panel.

Avoid:

- calling booking snapshots cash revenue;
- mixing all-time live state with period cohort metrics without labels;
- retention charts with undefined cohort rules;
- vanity user totals without an operational decision.

## Data Readiness

### Available or mostly available

- Booking state, state history, schedule, modality, category snapshot, format,
  participants, attendance, completion, and session feedback.
- Student wallet balances and ledger entries.
- Payment records and refund/correction records.
- Tutor profile status, specialization, availability, payout, and paid cutoff.
- Admin support tickets, room bookings, meeting events, and operational queues.
- Student and admin achievement aggregates.

### Missing or insufficient

- Tutor/profile impression and conversion events.
- Explicit learning milestones, assessments, or outcome scores.
- Fully defined accounting model for cash revenue and net contribution.
- Approved retention/cohort definitions.
- Guaranteed timestamp coverage for every funnel transition.

## Implementation Phases

### Phase 0 - Metric contract and data audit

- Approve pain points and metric definitions with product owner.
- Create a metric dictionary: name, role, formula, scope, timezone, source,
  action link, and privacy classification.
- Audit group participant counting, booking state history timestamps, payment
  status transitions, payout cutoff semantics, availability overlap, and support
  SLA timestamps.
- Decide which reads need new aggregate repositories and indexes.

Exit criteria: no metric has ambiguous denominator, time scope, or financial
meaning.

### Phase 1 - Student and tutor decision dashboards

- Add role-scoped aggregate procedures/read models.
- Implement Student P0/P1 summary widgets.
- Implement Tutor P0/P1 workload, payout, capacity, and request summaries.
- Preserve current operational cards and link every alert to an action route.
- Add role authorization, aggregate query, empty/error/loading, and responsive
  UI tests.

Exit criteria: student/tutor can identify next action, workload, and financial
state without opening multiple pages.

### Phase 2 - Admin semantic and operational analytics

- Correct labels/formulas for existing admin metrics.
- Add realized Marks/payment/payout separation.
- Add funnel, supply-demand, and operational-risk aggregates.
- Keep live workload and period analytics visually separate.
- Add query bounds, indexes, performance tests, and admin-only authorization
  tests.

Exit criteria: admin can identify business trend, money state, supply gap, and
urgent operational risk from `/admin` without misreading snapshot metrics.

### Phase 3 - Instrumentation and deeper analytics

- Add privacy-safe discovery and booking funnel events if conversion analytics
  remains a product need.
- Add explicit learning milestone/assessment model before student mastery
  analytics.
- Add approved cohort-retention definitions and reporting.
- Add export only after metric definitions stabilize.

Exit criteria: deeper analytics use measured events and approved domain
definitions, not inferred UI behavior.

## Non-Functional Requirements

- Role-scoped authorization enforced at RPC boundary and repository query.
- No private student/tutor financial or identity data in cross-role analytics.
- Bounded aggregate reads; no N+1 dashboard queries.
- Indexes reviewed with `EXPLAIN` for period and role filters.
- WIB date labels and explicit period/all-time labels.
- Loading, retry, empty, partial-data, and stale-data states.
- Structured logs/metrics for aggregate latency and failures without PII.
- Update `docs/CONTEXT.md`, `docs/API-REFERENCE.md`,
  `docs/MODULE-REFERENCE.md`, `docs/RUNBOOK.md`, and this plan as contracts
  change.

## Open Decisions Before Implementation

1. Student session summary period: 30 days, 90 days, or lifetime plus recent
   trend?
2. Tutor utilization denominator: published availability, active capacity, or
   only future bookable windows?
3. Admin active user definition: login activity, booking activity, or both?
4. Financial source of truth: wallet ledger, payment records, payout records,
   or a separate accounting projection?
5. Retention cohort: signup cohort, first-booking cohort, or first-completed-
   session cohort?
6. Should student dashboard show achievement counts only, or also a defined
   learning milestone model?
