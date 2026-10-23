# Release v3 - technical specification

Date: 20 October 2026. Status: **engineering design draft; owner-approved product policies are recorded in PRD/DECISIONS, implementation status remains in TASKS**. Product requirements: [PRD](RELEASE-V3-PRD.md). Open commercial decisions: [DECISIONS](../../client/RELEASE-V3-DECISIONS.md). Proposed model/API names are not claims that endpoints/tables exist. Keep the current service/repository/handler/router composition and reuse existing wallet, audit, meeting, notification and provider ports.

## 1. Boundaries and ownership

Implementation checkpoint (18 October): pure default arithmetic now exists in
`packages/api/src/modules/pricing/v3-rate-card.ts`, exported by pricing/index.
This is not a persisted economy version, checkout quote or runtime activation.
The proposed models/procedures below remain unimplemented unless TASKS records
specific evidence. Default top-up recommendations are advisory calculator data;
Q13 is resolved: both choices remain available and tiers follow configured packages. Admin draft revision APIs/editor are implemented; migration application and runtime price activation remain pending.

| Boundary | Owns | Reuses / must not own |
| --- | --- | --- |
| Competition catalog | Parent/child identity, localized labels, ordering, lifecycle and admin CRUD | Reuse existing subject hierarchy; no financial snapshot rewriting or child price override |
| Economy/pricing | Versioned competition rate card, package/custom quote math | No mutable tutor-defined new-booking prices; keep legacy snapshot reader |
| Payment | Midtrans intent, authoritative status, credit-once and successful purchase event | Does not guarantee a class seat after checkout expiry; no outgoing transfers |
| Classes/enrollment | Public class/session, selected entitlements, capacity, reservations, installment obligations, cancellation policy | Calls wallet with explicit allocation; no duplicate wallet implementation |
| Completion/report | Delivery completion, report versions, session settlement orchestration | Uses legacy on-demand adapter or big-class adapter; no generic status override that silently spends money |
| Earned fees/payout | Session fee entitlement and active payout allocations, tax/bank snapshots, recorded transfer/void | No bank API execution; no inferred "all sessions before last cutoff" for new records |
| Referral | Registration choice, friend reward decisions/cap locks, KOL attribution/commission/settlement | Consumes first successful purchase/completion business events; does not parse browser redirects |
| Website content | FAQ/Other activity/KB/calendar records, locale content and public read projection | No editorial role system; does not expose private app tables directly |

Proposed shared completion contract returns a stable `deliveryId`, eligible student allocations, gross fee and tutor snapshot. Adapter for legacy solo/group/series preserves policy while enabling per-session reporting/payout. A cohort is not a legacy series with the headcount cap removed: proposer/acceptance, tutor ownership, partial installment and public-seat semantics differ.

Do not begin broad module refactoring solely to create these boundaries. Introduce only interfaces required by the first vertical slice; existing 5000-line booking service can delegate to focused fee/completion code without moving unrelated behavior.

## 2. Data contracts and constraints

### Competition catalog addition (S04; REQ-COMP-01..07)

Palette clarification S05 / REQ-COMP-07: parent fields are `lightTextColor`,
`lightBackgroundColor`, `darkTextColor`, `darkBackgroundColor`. New parent
creation requires all four. Parent update accepts partial patches and preserves
omitted values; child writes reject color overrides and resolve `parentColors`.
Each value is a normalized opaque `oklch(L C H)` numeric triple with bounded
components; arbitrary CSS/functions/variables/URLs/alpha are rejected. Render
through per-instance semantic CSS custom properties with `.dark` switching, not
slug-based hardcoded utility classes. Provide both theme previews and contrast
feedback without silently changing the chosen colors.

Migration evidence in the current worktree is split across 0056 and 0057 because
0056 has already been applied to the guarded test database; do not rewrite that
migration. Existing seven parent pairs copy exact foreground/background values
from current UI tokens into both modes (there are currently no dark competition
overrides). Any legacy unknown root receives a documented neutral compatibility
palette; new roots always require explicit input. Palette changes participate in
version/audit and cache invalidation. Current booking/calendar presentation
resolves parent appearance independently from locked financial/name snapshots;
legacy missing-identity fallback must not assign a new competition the existing
orange/research heuristic. Public tutor/website DTOs may expose only the safe
validated palette data, including archived identity reads where historical
presentation requires it.

Status: catalog CRUD, parent palette inheritance, archive/delete impact checks,
and palette-backed app consumers are implemented in the current worktree. The
focused isolated-DB checks and basic create/inherit/delete-preview browser
journey are recorded in `RELEASE-V3-TASKS.md`; move/archive/restore browser
journeys, full app regression, all catalog consumers, and release acceptance
remain open. The migrations have only been applied to the guarded local test DB.
Reuse `subject_category` and
`tutor_profile_subject` in `packages/db/src/schema/tutor-subject.ts`; do not
create a competing competition table. Parent = competition, child = selectable
specialization. Preserve seed IDs, globally unique slugs and existing mappings.
Add English/optional Indonesian fields with existing `name`/description values
backfilled as English, optimistic version and auditable lifecycle operations.
Use the existing active flag for archive visibility; publishing readiness also
depends on valid parent rates. A child must reference a root, not another child.

Catalog IDs are durable identity; slugs are immutable compatibility keys. The
current worktree's economy revision JSON is still keyed by immutable parent
slugs, while this design calls for revisions keyed by stable parent IDs with a
versioned adapter for existing slug-keyed data. Resolve that contract and its
migration/adapter before customer pricing activation; do not rewrite revisions
0054 already permits. The default-rate validation still requires the seven
existing slugs for compatibility, while active rate-card reads are key-driven.
Save/publish and activation must validate catalog/rate readiness in the same
transaction. An unpriced draft parent must not break unrelated existing active
rates or become silently bookable. Configuration changes create new agreements;
existing quotes and bookings keep their snapshots. No child-specific rate
overrides.

Resolve child + active parent + tutor assignment server-side for new sales;
clients supply IDs, never trusted parent/rate/fee values. Archived selections
remain in historical/admin/profile reads but cannot be newly assigned. Existing
booking continuation/repricing uses its pinned revision even after archive.
Unchanged archived profile assignments may survive unrelated edits; newly added
assignments must be eligible. Published future class sales stop for an archived
classification; existing enrollments/delivery are preserved, with admin impact
feedback rather than automatic cancellation.

Mutations lock the affected parent/child rows in a consistent order; assignment,
rate publication and new-booking writers participate in the same coordination.
Validate expectedVersion and references inside the transaction. Hard-delete
checks include children, tutor assignments/invitations, current and historical
rate revisions, booking/session JSON snapshots and future class/content links;
FK checks alone are insufficient for JSON references. No cascading deletion.
Used children cannot be reparented; create a replacement and archive instead.
Cache invalidation occurs only after commit for app catalog, discovery/rates
and website public projections. Old public URLs remain resolvable where needed;
archived categories are excluded from new-sale choices.

Proposed API family (not existing RPCs): admin competition list/get/create/update/
archive/restore/delete, hierarchy selection reads and impact preview. Implement
with the existing handler/service/repository pattern, Selia admin composition,
standard JSON envelopes and admin authorization. Reuse existing discovery
`listSubjects` where compatible rather than exposing two conflicting catalogs.
List/read DTOs separate public active choices from admin inactive/reference data.
Business mutations return conflict for stale versions, referenced delete/move,
inactive parent or incomplete rate publication; validation rejects invalid tree,
missing English and duplicate code. Never expose private reference records in
public impact/count responses.

Names are logical concepts; finalize Drizzle names during implementation. All money in whole IDR integers, Marks in integers, tax/percentage stored as basis points where two decimal percent is needed (2.50% = 250). NIK/NPWP/account numbers are strings preserving leading zeros. Store UTC instants; render app dates/financial calendar in Asia/Jakarta. Product deadline comparison is server authoritative.

| Concept | Minimum data / constraints |
| --- | --- |
| Economy version | Immutable version, effective time, actor, competition ID -> solo Marks/solo fee, online/offline adjustments, package tier configuration and surcharge. Active pointer update with expectedVersion. Validate package Marks unique/ascending, positive price, supported competition mapping and all required rates |
| Quote | Quote ID, actor, request/idempotency key, exact Marks/package, item price, economy version, recommendation, expiry and consumption status. Snapshot all arithmetic inputs; never trust client supplied amount/fee |
| Class | kind cohort/masterclass, stable slug/ID, competition, localized title/description, cover reference, capacity/default rates, state, postpone count, minimum/check time. Masterclass exactly one session |
| Class session | parent, immutable sequence identity plus display number, localized title/curriculum, start/end/mode/venue, assigned tutor, fee snapshot, state, Meet reference. Time overlap validation for tutor and venue as applicable. A changed order/date must not change entitlement identity |
| Enrollment | student, class, plan, selected ordered session IDs, rates/config snapshot, installment boundary/due time, state, enrollment version. Reject overlapping active entitlements to same session even across plans |
| Seat allocation | student/session/enrollment, reservation expiry, entitlement state, agreed Marks rate, held/spent/released/fee totals, settlement operation IDs. Capacity ledger counts blocking reservations/entitlements under a session lock; expired rows ignored even before cleanup job |
| Installment | enrollment, ordinal, locked session IDs and rates, amount, dueAt, state pending/held/defaulted/cancelled. No automatic charge for a future half; Pay explicitly holds Marks. Apply the Q01/Q02 policies accepted 20 October: reserve both halves until the installment deadline, split late joiners ceil/floor over remaining sessions, and rejoin with a current-rate future-session quote. |
| Session report | delivery/session identity, author/acting admin, three normalized bullet arrays, revision, delivery tutor snapshot, original status, reason when admin/corrected, creation/update history. Unique one current report per delivery; immutable revisions |
| Earned fee | unique delivery identity, tutor at delivery, gross IDR, pricing version/snapshot, earnedAt, adjustment links and legacy basis. One fee per session, not one per student |
| Payout allocation | earnedFeeId, payoutId, allocation/release state; unique active allocation for each fee. Preserve prior void allocation history, not delete/reassign without trace |
| Tutor payout | prepared snapshot/preview version, included fees, legal identity/bank/tax status/rate override source/gross/withholding/transferFee/calculatedNet, actual transferred amount/date/reference/proof, paid/void status, actor/time/reason, history |
| Referral choice | unique userId, code/type or explicit none, choice time, welcome/reward snapshots, campaign attribution expiry and commission terms. One saved choice; server checks eligible new account; pending Google choice does not count as none |
| Friend reward decision | unique referred user eligible-first-completion, referrer, completion ID/time, semester, reward snapshot, cap in effect, actual credit incl zero and ledger link. Lock cap across concurrent different referred students |
| KOL commission | unique qualifying payment ID and unique first-purchase decision per attributed user, terms/base/rate/flat/calculated amount snapshot, attribution, adjustment/void state. Transfer entries separate and append-audited |
| Content | localized fields `{en: required, id?: optional}`, active/order, identity/media/relation metadata. FAQ additionally showOnLanding. Retain Sanity source IDs as migration mapping keys, not runtime dependencies |

Existing `ledger_entry` permits hold/release/deduct/credit/compensation and contains bookingId/sourceReference. Proposed: add nullable class/session/enrollment/allocation relation references or a typed stable financial source relation, rather than pretending every class is a booking ID. Keep backward-compatible existing readers. Populate nonnull stable sourceReference/event business key on every new operation; unique constraints with nullable fields must not be the only deduplication defense. The current wallet DB invariant remains authoritative.

### Settings inventory

Business defaults exposed to authorized admin: package Marks/prices/active, exact surcharge/tier policy (Q13), competition solo Marks/fee, online increments (12 Marks/30000 IDR), offline additions (22/20 Marks,75000/50000 IDR), cohort full/half/single rates/fee, masterclass rate/fee, withdrawal percent and cancellation notice, class minimum/check date, friend welcome/reward/cap, campaign validity/window/flat/percentage, tax defaults/override and transfer fee. All are versioned/audited with preview or affected-use description. Settings affect new applicable agreements; snapshotted rates never silently change.

Technical/product-contract constants: OTP length/TTL/attempt safety, retry/backoff, report-reminder cadence, quote reservation TTL15m, postponement window3d, 600-character report input and report lookback3 months have explicit owners/configuration. Missing-report reminders for both class sessions and legacy on-demand bookings are due at session end, then every 24 elapsed hours; a delayed scheduler queues only the current due period. Initial implementation preserves S01 values; do not interpret "all numeric defaults editable" as permission to change agreed output/identity constraints without validation. Distinguish admin business controls from operator settings in UI/docs; if client expects these timing/format constants exposed, record that before the settings screen is accepted. NIK length16, one-session masterclass and capacity invariants are validation, not arbitrary admin tunables.

### Language contract (confirmed + technical fallback proposal)

Content-entry forms show English and Indonesian fields for website-authored title/question/answer/description/curriculum as applicable. This includes FAQ, Other activities, class public content, migrated calendar/KB content, and public-facing tutor prose where it is entered for website display. Keep the app form labels/help in English even when offering an optional field labelled Indonesian. Names, identifiers, dates, amounts and relationships are shared, not duplicated into artificial translations. Required fields require trimmed English; optional descriptions may remain empty in both languages if the product does not require them. Indonesian is nullable and never forces duplicate English entry. Website locale `id`: use nonempty Indonesian field else English field. Website `en` and app: English. Preserve rich paragraphs/lists in same safe structured representation in each locale. Tutor-generated report text is stored verbatim within limits; no translation service or rejection based on natural-language detection. App chrome/errors/system templates remain English. Keep existing website locale URLs/SEO canonical/alternate handling during migration.

## 3. State and transaction rules

### 3.1 Payment versus enrollment

```
quote -> checkout reservation (expires in 15m)
     -> wallet sufficient -> atomic hold + entitlement confirmation
     -> insufficient -> Midtrans purchase pending
Midtrans success -> credit wallet once
     -> valid owned reservation + agreed enrollment consent -> atomic confirm/hold
     -> reservation expired/seat unavailable -> wallet credited, enrollment not confirmed
```

Automatic conversion from a successful top-up into enrollment is a **proposed implementation only when the same checkout has explicit enrollment consent**. If unavailable, return a clear credited-but-not-enrolled outcome and action to re-check seats. Never silently spend wallet on another quote. Student retry reads checkout/enrollment outcome by idempotency key. Payment success and enrollment success are separate states/messages. Preserve provider signature/amount/currency checks and reconciliation; no credit from client callback.

Acquire locks in a documented stable order (relevant session IDs sorted, enrollment/obligation, wallets sorted; tutor fee/payout lock at agreed layer) and exercise deadlock retries. One transaction validates quote/ownership/deadline, reads capacity including unexpired reservations, rejects overlapping entitlements, holds exact Marks and commits seats. Provider network call must not be held inside long capacity locks. Reuse provider intent with a stable purchase operation identity; new exact-top-up idempotency must include quote/attempt identity, not a nullable package ID alone.

Reservation expiry, nonpayment default and cancellation are valid if invoked lazily by request and by catch-up worker, with same predicate and business event key. Count capacity by `expiresAt > now`, not job punctuality. Payment at exactly expiry is expired (proposed boundary); cancellation exactly24h qualifies; second-half payment at exact start is overdue unless already committed before boundary. Q11 handles provider timestamps and KOL windows separately.

### 3.2 Class/session lifecycle

Class: draft -> published/open -> running -> completed; alternatives postponed-once or cancelled. Session: draft -> scheduled -> awaiting-report -> completed; alternatives cancelled or reschedule-required. These logical names may map to existing conventions, but report pending must not be conflated with no-show. Store delivery exception separately from report status; reschedule updates times/meeting without creating a second fee identity for the same fulfilled obligation.

Publish validates mandatory metadata/tutor/times/capacity/plan prices. Commit database intent, then queue meeting generation; expose pending/failed/ready and use retry/manual fallback from existing integration. A repeated publish updates/reads existing meeting reference. Notification can announce only a committed schedule; audience is affected entitled students plus assigned tutor, never entire website visitors. No acceptance required for coordinated assignments. Missing/failed meeting does not imply a session was delivered or earn a fee.

Do not directly apply legacy `SCHEDULED -> NO_SHOW` sweep to new session model. For report changes across on-demand, reconcile expiry with delivery evidence and admin resolution; preserve actual on-demand student cancellation deadlines. Parent completion/archival must not prevent remaining session settlement. Fees already earned remain payable if parent later cancelled.

### 3.3 Installments/capacity [Q01/Q02]

Persist selected session IDs and both installment rates at enrollment. Split remaining R sessions into ceil(R/2) and floor(R/2). A half-plan reserves all selected remaining sessions, including the unpaid half, through its installment deadline; single-session buyers may use only unreserved capacity. On non-payment, release all future unpaid-half reservations while retaining paid sessions/history. Rejoining after removal creates a new quote at the current half rate for future sessions only; no self-service plan switching. Reminder keys `installment:{id}:reminder:7d` / `:1d`; catch-up selects due obligations, skips paid/cancelled/defaulted and checks latest schedule version. Reschedule recomputes future reminder dates, never sends stale Pay link for an already-paid obligation. Late join skips elapsed reminders and shows dueAt immediately. These Q01/Q02 rules were accepted by the project owner on 20 October 2026.

Cancellation of one session releases that entitlement only; withdrawal releases applicable unpaid/held set; completed charges cannot be released as if still held. Cancelling a current-half seat must not let the next-half invoice charge that same removed seat. Do not recompute locked installment rates/session IDs from a changed schedule or merely "remaining session count" at payment time.

### 3.3.1 T05 enrollment checkout contract [REQ-ENROLL-01..04]

This section freezes the T05 implementation contract before enrollment code is
added. It does not close T06 cancellation/rescheduling policy or implement T07
completion/report settlement.

- The authenticated student selects a cohort plan or one scheduled session;
  the server resolves the currently published class rates and eligible
  sessions. Cohort plans include every class session whose state is `scheduled`
  and whose `startAt` is strictly after the server's quote time. A single plan
  may name one such session. Masterclass has one server-selected session.
  Past, cancelled and reschedule-required sessions are never newly sold.
- Full holds the published class's `cohortFullRateMarks` per selected cohort
  session (20 in the accepted example). Half holds the published class's
  `cohortHalfRateMarks` per session for the first `ceil(R/2)` selected sessions and creates the second
  installment for `floor(R/2)`; for `R=1`, there is one immediate installment
  and no empty second installment. Single holds the published class's
  `cohortSingleRateMarks` for one cohort session (25 in the accepted example);
  masterclass holds its `masterclassRateMarks` for its one session (5 in the
  accepted example). With the accepted example rates, a full 16-session plan
  is 320 Marks; half 16 is 176 now and 176 later; half 15 is 176 now and 154
  later. The class's current published rate fields are authoritative at quote
  time. Store the selected session IDs and both applicable rates on the
  enrollment before returning the quote; later admin edits cannot reprice it.
- One idempotency key identifies one student's enrollment attempt. Replaying
  that key returns the same quote/status, including after expiry; a new attempt
  needs a new key. In one transaction, lock selected session rows in sorted ID
  order, expire stale checkout reservations for those sessions, check every
  selected session's capacity and the student's active entitlement, then either
  create all reservation/allocation rows or none. Capacity counts funded
  entitlements, unpaid-half reservations, and checkout reservations only while
  `expiresAt > now`. A partial/failed plan leaves no seats or wallet hold.
- A checkout reservation lasts 15 minutes. If the wallet can cover the first
  due installment, atomically hold it and activate the enrollment. Otherwise,
  reserve the seats without a wallet hold and offer the existing immutable
  V3 top-up quote/purchase flow for the exact shortfall. Persist the enrollment
  checkout and its top-up quote/payment identities. A top-up success credits the
  wallet through the payment module once; enrollment confirmation separately
  rechecks that the same student's owned payment matches the saved quote, the
  reservation has not expired, seats remain reserved, and the wallet can fund
  the snapshot amount. A late payment may credit the wallet, but must not
  create an enrollment or promise an expired seat. Never automatically spend
  the credited wallet on a different quote.
- Each session allocation snapshots its Marks rate, installment number and
  explicit funding/ledger identity. A half plan reserves both installments'
  selected sessions, but only the first installment allocations are funded
  initially. Paying installment two holds its snapshotted total once and marks
  only its allocations funded. No class completion/report fee may be created
  by quote, enrollment, or installment payment. T07 may later spend only the
  funded amount on that specific allocation; this T05 slice does not deduct a
  whole plan as delivered or implement settlement.
- The second-installment deadline is the current start time of the first
  session in that installment. Payment is accepted only while server time is
  strictly before `dueAt`; an unpaid due installment releases its unfunded
  session allocations at/after the deadline, including the session starting at
  the boundary. If an authorized schedule edit changes that session time,
  recompute due/reminder dates from the same locked session ID and re-read them
  before send; this does not grant a new reschedule right while Q04 remains
  open. Paid first-installment allocations and history remain. Rejoining after
  default is a new current-rate quote for future scheduled sessions only; a
  student cannot switch plans on an existing enrollment.
- Send email and in-app reminders at 7 days and 1 day before the first session
  in the relevant installment. Stable per-installment/per-boundary event keys
  make retries and catch-up idempotent. A missed job sends a still-relevant
  reminder only when the enrollment existed by that reminder boundary and the
  installment remains unpaid; an enrollment made after a boundary skips that
  historical reminder. Re-read due time and enrollment state before delivery.
- Student detail/read/action APIs authorize the student role and ownership;
  paid actions also require verified email. Public class projections remain an
  allowlist and never include students, private financial data or Meet links.
  There is no success-shaped T06 cancellation/reschedule control in this slice.

### 3.4 Session settlement and cancellation

Settlement transaction: lock session/delivery + report version + allocations/fees; assert assigned tutor/admin permission and delivery; normalize/validate report; for each chargeable allocation deduct its held amount once; save report; create earned fee snapshot once; mark completed; enqueue durable referral/notification events. Commit before provider emails. Report correction edits revision and audit only. Admin completion requires reason/confirmed delivery/all fields; undelivered outcome uses cancel/reschedule/release. Do not reuse generic `admin_correction` that currently maps to cancelled.

One chargeable allocation has cumulative spent + released = originally held when final, with cancellation fee included in spent and separately classified. 20% rounded nearest positive Mark: `floor((remaining*20 + 50)/100)` with integer math; configurable percentage uses a defined integer denominator. Withdrawal computes on aggregate applicable remaining hold, single cancellation on that session's agreed rate. Never separately round per-session fees for an aggregate withdrawal unless the accepted product rule changes. Ledger keys tie settlement to allocation and operation version, not user-provided random retry IDs. Never create amount=0 ledger row because current ledger constraint requires positive amounts; record zero reward/fee decisions in domain table.

Report input normalization proposal: strip UI bullet prefix, normalize CRLF to LF, trim line edges, remove empty lines, count joined text including separators up to600 Unicode code points. Match UI/server behavior and test emoji/newlines; final policy is a developer contract, not an invisible `.max(600)` per array element. Preserve original historical data. New-format PDF layout must fit max600x3 plus bounded metadata without clipping; do not reduce fonts arbitrarily to fit unbounded legacy text. Q07 is resolved: longer legacy reports use clearly labelled continuation pages and are never truncated.

Report export selection proposal: scheduled session date within `[Asia/Jakarta today minus3 calendar months at start of day, exportInstant]`, completed/reported and authorized entitlement; sort scheduled date descending then stable ID. Session date defines period, not report submission date. Q06 governs entitlement access. Include old on-demand and new class adapter results; admin role alone authorizes any-student export, tutors cannot export arbitrary students. Use generation snapshot so page count/order/data stay stable. Empty result returns explicit no-reports state, not blank PDF. Private cache/download URLs; avoid embedding NIK/NPWP/bank in metadata/logs.

### 3.5 Payout and tax [Q07/Q08]

Create fee entitlement per completed delivery. Do not backfill historical per-session fees or reconcile partial legacy series for this release; the owner confirmed V3 is not yet in use. New V3 completions use the fee-event contract as their source of truth. Preserve historical paid aggregates; do not fabricate historical tax or actual transfer amounts.

Prepare preview obtains current profile/rate, stable selected fee list/version and bank snapshot. Tax `round(gross*rateBps/10000)` whole IDR; transfer fee charged once per batch, BCA0/nonBCA2500. Net = gross - tax - transfer fee; reject invalid negative net (do not silently clamp the recorded obligation). On commit, revalidate preview version/profile/allocations; if anything material changed, ask admin to review refreshed numbers before recording externally transferred funds. Capture both prepared basis and actual transfer; never recalculate historical rows from current profiles.

Once external transfer is recorded, pay action allocates selected unpaid fees transactionally under tutor/fee lock. A unique active allocation prevents duplicate payment through two admins. Actual transfer must equal calculated net to mark fully paid; partial tutor payouts are unsupported. Corrections require an audited action. Void is history-preserving, releases fee allocations, and requires reconciliation of any real external transfer before repayment; it is not a bank reversal. These Q08 rules were accepted by the project owner on 20 October 2026. Monthly CSV uses actual paidAt in Asia/Jakarta and recorded snapshots; exclude void rows from statutory-style payout sum while retaining void/adjustment reconciliation export. Neutralize spreadsheet formulas in user-entered name/reference fields.

### 3.6 Registration/referral

Email flow needs a pre-registration verification proof bound to normalized email and purpose, hashed server storage, expiry and attempt limits. Consume proof + account creation + referral choice + welcome decision atomically, or use a durable provisioning state whose retry is idempotent before allowing app use. Do not claim cross-package atomicity until tested against installed Better Auth/Drizzle integration. Prototype the transaction seam first; check all raw auth routes, tutor invite and admin creation paths. Ordinary password signup may not bypass proof by calling the old endpoint. Existing login/recovery remains functional; no new signup reward on email linking.

Google identity can create a pending-referral user; protected app entry enforces saved choice, while logout/help/referral resolution remain accessible. Account linking uses existing trusted identity semantics, never arbitrary same-email string takeover. Code errors do not consume email proof. OTP resend limits enforced server-side, old OTP invalid, network timeout resolves by operation status; no logging OTP/proof tokens.

Accept one friend or KOL code at registration. The welcome reward applies to either valid code; friend reward applies only to friend attribution and KOL commission only to KOL attribution. Only students participate as referred users/referrers. A friend completion event has stable referred user/qualifying delivery ID; lock referrer+semester, create the decision once at the first eligible completion (including zero-credit), evaluate current cap minus credited, and write a positive bonus ledger entry within the same transaction. No rollover or later retry; cap reductions do not claw back prior rewards. Semantic event replay cannot re-trigger even if random message ID differs. Existing rewards are immutable. Q06's chargeable-delivery rule applies to reward eligibility. A delayed worker must use authoritative completion time and the setting effective at that time, not processing time; retain settings history accordingly. These Q09/Q10 rules were accepted by the project owner on 20 October 2026.

KOL terms lock on signup. Code validity runs from campaign activation to explicit expiry. Record the authoritative first successful IDR purchase decision in the payment transaction or durable event, not the first webhook arriving at a worker. Commission uses the server-snapshotted IDR purchase price excluding gateway/channel fees and rounds to whole rupiah. Payment provider success time must be before attribution expiry; retries and duplicate events count once. PAID and SETTLED for one purchase count once; out-of-order callbacks for different purchases require stable provider success ordering/reconciliation before final first-purchase attribution. Corrections need reason/history and cannot rewrite settled transfers. A reversal voids that qualifying commission but does not automatically make a later top-up a new first event. A top-up using bonus/released Marks is not an IDR purchase. These Q11/Q12 rules were accepted by the project owner on 20 October 2026.

Commission formula/transfer/adjustments separate. Outstanding = active calculated obligation + signed obligation adjustments - actual nonvoid transfers. Positive = owed, zero = settled, negative = overpayment. Genuine reversal adjusts obligation; money transfer history survives. Correction cannot transfer money or change saved student choice without authorized reason/history. No automatic future offsets.

## 4. Proposed RPC/API inventory

Actual runtime paths are procedure keys separated by `/`, e.g. existing `/rpc/auth/getProfile`; payload `{"json": input}`, response `{"json": data, "meta": [...]}`. OpenAPI `.route({path: ...})` metadata is not evidence for the runtime RPC path. Verify root router registration when implementing. Below keys are proposals and must be reflected in API-REFERENCE only when implemented.

| Proposed procedure family | Main input -> output | Auth / requirement |
| --- | --- | --- |
| economy.getPublicRates / getTutorRates; adminEconomy.preview/update | competition/mode/N or proposed config+expectedVersion -> versioned tables/differences | Public/tutor reduced projection; admin mutation; REQ-ECON |
| payment.quote / createPurchase / getCheckoutStatus | Marks/package, quoteId, idempotencyKey -> amount/Marks/recommendation/expiresAt; intent URL/status/enrollment outcome | Student owner; REQ-PAY |
| classes.list/get; publicContent.listActivities | filters/cursor/locale or slug -> cards/curriculum/availability, no private roster/Meet | Auth app/public limited; REQ-CLASS/CONTENT |
| adminClasses.create/update/publish; adminSessions.update/reportException | versioned class/session input -> saved version/meeting state/audited impact | Admin; REQ-CLASS |
| enrollment.quote/confirm/payInstallment/getMine | session set/plan/quote/operation key -> exact hold/dueAt/seat status | Student owner; REQ-ENROLL |
| enrollment.previewCancellation/cancel/withdraw | allocation/enrollment+version -> deadline/fee/release; committed resulting balance/status | Student/admin permitted action; REQ-CANCEL |
| sessionReport.submit; adminSessionReport.complete/correct | delivery+expectedVersion+3 fields, admin reason -> report revision/settlement ID | Assigned tutor/admin; REQ-REPORT |
| reports.list/export | date scope fixed default, optional targetStudentId admin-only -> authorized report list/private PDF | Student owner/admin; REQ-REPORT |
| adminPayout.prepare/recordPaid/void/list/exportTax; tutorPayout.getMine | feeIds+previewVersion, actual amount/date/ref or void reason -> snapshot/covered sessions/tax CSV | Admin/own tutor read; REQ-PAYOUT/TAX |
| registration.sendOtp/verify/complete/getOutcome; referral.saveGoogleChoice | normalized email/proof/code-or-none/operationId -> proof/outcome/saved choice | Pre-auth rate limited / authenticated pending user; REQ-AUTH |
| referral.getMine; adminReferralSettings.update; adminKolCampaign.* | own code/semester; versioned settings; campaign terms -> balances/history | Student own/admin settings; REQ-FRIEND/KOL |
| adminKol.recordTransfer/correct/voidCommission/exportMonthly | commission/transfer IDs, amount/date/reference/reason -> calculated/transferred/outstanding/history | Admin only; REQ-KOL |
| publicContent.tutors/faq/calendar; adminContent.* | locale/filter/cursor or versioned localized content -> allowlisted active records | Public active read/admin write; REQ-CONTENT/FAQ |

Business errors need stable codes with meaningful recovery: `QUOTE_EXPIRED`, `SEAT_UNAVAILABLE`, `ALREADY_ENROLLED`, `INSUFFICIENT_MARKS`, `INSTALLMENT_OVERDUE`, `CANCELLATION_DEADLINE_PASSED`, `REPORT_REQUIRED`, `REPORT_TOO_LONG`, `FEE_ALREADY_ALLOCATED`, `PAYOUT_PREVIEW_STALE`, `PAYOUT_RECONCILIATION_REQUIRED`, `REFERRAL_CHOICE_SAVED`, `OTP_EXPIRED`, `OTP_RATE_LIMITED`, `VERSION_CONFLICT`. Names proposed. Return current safe outcome on idempotent retry instead of treating successful prior attempt as duplicate error. No raw provider/PII leaks in user errors.

## 5. Website and migration

Implement DB/API data first; deploy compatible public DTO before switching website consumers. Public tutor read reuses published eligibility filter with explicit allowlist, not `SELECT *` minus a few sensitive fields. App discovery currently needs student authentication, so implement dedicated public contract. Include CORS if browser reads required, or Next server fetch; website must not need embedded user credentials.

Switch `getTutors` and featured tutor cache to app source and invalidate old Sanity cache. Remove fallback completely. Initial empty list is allowed; network failure and empty data are distinct states. Activity cards adapt shared data, not necessarily shared React package across repositories. Reuse app Selia components within cogito-app; do not import website's shadcn UI into app or impose a website-wide design migration.

FAQ structured safe paragraphs/lists or sanitized limited markup, active-only public query, shared locale/order flags, no arbitrary HTML execution. Admin saves must invalidate website caches; if hosting cannot receive invalidation, select request-time reads for these small collections. Do not promise immediate save while an hour-long featured cache stays stale.

Inventory Sanity export/read-only snapshot: counts by type/locale, IDs/slugs, references, date ranges, file URLs and expected access, retired versus retained content, redirect map. Export source and mapping before manual re-entry. Preserve canonical source identity so agenda dedupe uses eventID+calendarDate, not title/date. For multiday event repeat on each legitimate date; define source end-date inclusivity consistently during import. Website `/student-resources` currently redirects to app: preserve this gated behavior, don't publish protected file URLs through the public calendar/content DTO.

Sanity cutover is incremental: Activities -> tutor public source -> FAQ/landing changes -> KB/Calendar last according to accepted delivery sequencing. Keep rollback data/source snapshots; operational rollback can restore old content reads only for modules not subject to the no-legacy-tutor-fallback rule. Tutor rollback must use compatible prior app API/website release or explicit incident decision, not silently reinstate old tutor identities.

## 6. Rollout, observation and rollback

1. Additive schema + compatible readers first; separate schema migration, default config activation and client UI deploy. Verify backups and restore procedure before irreversible cutover.
2. Snapshot package/payment/booking/wallet/payout totals. Backfill no fabricated tax/history; preserve pending intent amount/Marks, completed fees and old balances. Existing seed does not update old packages. Version active pricing cutover; new booking uses v3, pending accepted legacy quotes follow explicit expired/new quote path without editing existing payment terms.
3. Use feature availability/operational controls only where needed to keep partial schemas/UI inaccessible. Do not expose partial enrollments. No half-built referrals visible in signup.
4. Local/test Postgres migrations + dry-run/backfill reconciliation + rollback rehearsal. Use test env; never run fixture/seed on production as a validation shortcut.
5. Metrics: outstanding holds by delivery/report state, expired reservations, rejected seat conflicts, reminder failures, duplicate event suppression, earned-unpaid/allocated-paid fees, payout mismatch/void, cap decisions, commission outstanding/overpayment and content read failures. Log operation IDs, not NIK/NPWP/proofs/tokens.
6. Alert/action for paid-but-not-enrolled, stuck report holds, meeting/notification permanent failures and reconciliation gaps. Admin can see/audit resolution. Reuse existing queue retry/dead-letter retention; durable event delivery must survive process crash after financial commit.
7. Rollback application/code to compatible schema; never reverse real external payments, erase settled history or restore wallet balances from old dump after new money movement without reconciliation. Suspend new sales if rollback cannot preserve active terms, keep read/history/support available.

Readiness tests and dependency gates live in TASKS. This spec is development guidance; the open decision register prevents unsupported commercial assumptions from becoming implementation facts.
