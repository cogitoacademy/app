# Cogito App — Codebase Context

## Integrated release branch validation (30 October 2026)

Merged remote `8daf883d` into the latest local V3 snapshot, retaining final Q04/Q15 decisions, plaintext reports, fee-event-only payouts and migrations 0079–0082. Remote pending half-plan checkout cancellation and strict Istanbul coverage collection are integrated. Local safe API units pass 3,203 tests / 7,881 assertions across 210 files (only verification-gate and role-scope-drift reset suites excluded); collector tests pass 18 / 189. Four typecheck tasks, lint baseline, web build and bounded server build pass. Initial server bundling exhausted memory; bounded retry passed. No database reset/migration or provider calls were performed. Hosted 100% coverage and release/UAT/OPS01 acceptance remain open; prior hosted evidence below is historical.

## Q15 business insights implementation — 30 October 2026

Dashboard analytics separates top-up receipts (IDR), delivered services (Marks/session counts), current future commitments (funded/unfunded Marks and seat-sessions), and earned tutor costs (IDR allocated paid/unpaid as of now). Marks are never converted into estimated booking IDR value or profit. The endpoint remains admin-only /rpc/admin/getDashboardAnalytics with the normal JSON envelope.

The response adds operationsSummary.delivered/upcoming/tutorFees/asOf and source-quality counts unavailablePrivateRates/unavailablePaymentDates. businessSummary exposes grossReceiptsIdr/netReceiptsIdr/refundedIdr. Cash receipts use providerSuccessAt and include subsequently REFUNDED successful purchases in gross; recorded refunds use their own event dates. Missing payment success dates are excluded from dated totals with an explicit dashboard notice, never guessed from updatedAt.

Delivery is counted from authoritative completion deductions for completed sessions; cancellation/no-show penalties are not counted as delivered service. Upcoming commitments are a current snapshot independent of selected-period filters. Tutor paid/unpaid measures the current payment allocation of fees earned during the selected period; paid is gross honorarium allocation, not bank net transfer or transfer cashflow during the period. Missing future private rates are excluded from amount totals with a visible notice.

The dashboard reuses existing Selia patterns and presents new operational facts in semantic sections. No migration, seed or provider call is required by analytics reads. Live acceptance fixtures must be scoped and cleaned up; no reset is required. Verification is recorded in the active readiness plan.

## Readiness acceptance follow-up — 30 October 2026

Real dev pricing activation passed with original pointer restoration and temporary fixture cleanup (`bun run verify:pricing-activation`; tmp/v3-only-dev/pricing-activation-live.json). The booking unit suite now uses explicit subjects, V3 revisions/snapshots and fee-event payout expectations: 319 tests passed; no compatibility runtime was restored. Friend-code query fixtures now include the current friends-list joins.

Class enrollment integration supports an explicit non-resetting dev acceptance mode: CLASS_ENROLLMENT_DEV_ACCEPTANCE=true, NODE_ENV=development, exact loopback:6767/cogito-app, reset flags absent, and zero existing Academy classes/enrollments. Normal mode still requires test loopback:6769/cogito-test. Never combine it with reset-oriented Academy suites. Private env copies must disable external payment/email delivery and be removed after the run. Scoped fixture cleanup preserves unrelated bookings. The suite uses controlled providers for race tests; real Google acceptance remains the separate verify:academy-meet harness with event cleanup.

45 PostgreSQL enrollment tests passed (362 assertions): full/half/single, installment/expiry, cancellation/refund/races, minimum/postponement, reports, class fee and payout preparation, plus a masterclass 5-Mark enrollment→report→single Rp250,000 earned fee journey. Cleanup left zero Academy fixtures and preserved four private bookings. Evidence: tmp/v3-only-dev/enrollment-acceptance.json and enrollment-acceptance.log. Payment checkout/webhooks, email delivery, recorded class payout transfer and browser acceptance remain separate gates.

REQ-CLASS-05 records server-timestamped tutor absence notices and audited same-time replacement. Ordinary rescheduling is versioned per session. Its exit deadline is the earlier of notification +24 hours and the new start; only funded/unfunded allocations active at notification receive that change version. Students can cancel the changed undelivered session before the strict deadline; funded remaining Marks return once, while only the related unpaid installment slice is reduced or released. Delivered/reported/earned sessions are excluded. Same-time tutor replacement creates no new exit right and preserves an existing schedule-change window. The separate minimum-enrollment 72-hour postponement remains unchanged. Focused Postgres/browser/provider evidence is in the [readiness plan](plans/active/V3-UI-CLEANUP-AND-READINESS.md).

## Live Academy publish verification — 30 October 2026

Run `bun run verify:academy-meet` from the repository root for explicit live acceptance against authorized development `localhost:6767/cogito-app`. The script refuses other DB targets, reads Google OAuth credentials from apps/server/.env, creates temporary online masterclass/cohort drafts, publishes through the real Academy service and database with real Google Meet, and verifies custom fees, stale-version rejection, published-edit rejection and no duplicate meeting work. Google attendee notifications are disabled; payment/email providers are not exercised.

A finally block deletes Google events by stable session identity (including after partial creation), then deletes only the created class fixtures and their scoped notifications/audits; session/meeting rows cascade. Cleanup failure fails the command and retains fixture identities in tmp/v3-only-dev/academy-meet-live.json for follow-up. This explicit provider check is separate from fast mocked unit/synthetic suites. It does not reset or reseed the database.

Live result: masterclass Rp250,000 and cohort Rp500,000 both published with matching session snapshots and real Meet URLs; repeat processing created nothing; stale publish and edits after publication were rejected. Google events and all temporary DB fixtures were removed. Evidence: tmp/v3-only-dev/academy-meet-live.json. This verifies the service/database/provider journey, not browser UI or joining a call.

## Per-class tutor fee — 30 October 2026

Admin sets the agreed flat IDR tutor fee per class. New cohort/masterclass forms start at Rp400,000/Rp300,000; these are editable defaults, not publication limits. Draft save accepts a positive whole IDR amount up to Rp2,000,000,000 and copies it to each session. Publication validates that session fees match the class fee. Published pricing remains governed by existing draft/lifecycle restrictions; no global Economy setting or data migration is added.

## Admin pricing activation — 30 October 2026

Admin-only `POST /rpc/admin/activateV3EconomySettings` accepts `{json:{version,expectedActiveRevision,reason}}`. It activates only the latest saved revision, checks the previously observed active revision, validates saved pricing/catalog slugs, and writes the pointer plus audit in one transaction. Draft saving and activation share the revision advisory lock; catalog changes are locked too. Stale input returns a conflict. Existing quotes/bookings remain pinned. Economy UI requires an activation reason and distinguishes saved drafts from active pricing. No migration or automatic activation is needed; review and explicitly activate the saved pricing in admin settings.

## V3 frontend cleanup — 30 October 2026

Frontend pricing now uses V3 catalog/quote and competition-scoped rates exclusively. Removed legacy price editors, display conversions, obsolete redirects and unused compatibility components. Booking totals require actual V3 snapshots. The Academy Accordion type blocker is fixed. See [cleanup and remaining release work](plans/active/V3-UI-CLEANUP-AND-READINESS.md).

## V3 report and settings cleanup — 30 October 2026

This completes the report-provenance, payout-source and old settings cleanup left by the pricing cutover. Admin `getEconomySettings` and `updateEconomySettings` are removed from router, handler, service and request schema. Use `getV3EconomySettings`, `previewV3EconomySettings` and `saveV3EconomySettings`; saving a draft still does not activate it.

Report text is canonical plaintext on writes and reads. Entity-decoding and legacy-version PDF detection are removed. History statuses are `submitted`/`corrected`, with `admin`/`tutor` actors only. A correction requires the existing report version's history event; missing provenance returns a conflict instead of synthesizing an unknown legacy actor. Admin history UI shows the recorded role/actor. PDF exports retain normal continuation pages for long content, without a legacy flag or label.

Payout allocations accept only `fee_event` and require a non-null `tutor_session_fee_id`. Migration 0079_v3_report_and_payout_contracts validates these rules without rewriting or deleting existing financial/report history. Invalid old rows cause migration failure and require explicit cleanup. Unused repository reads for old report-format detection, uncategorized tutor fallback and aggregate payout cutoff were removed.

Migration 0079 was applied to authorized dev `localhost:6767/cogito-app` without another reset. Preflight found zero invalid history/allocation rows. Real PostgreSQL tests rejected both legacy report values, both legacy payout source types and null fee IDs. A current admin correction and request replay preserved report identity, literal entity text, ledger and fee rows. An invalid-provenance fixture was rejected without new history/fees and then removed. Current report listing/PDF export passed. A new V3 quote-to-payment-to-booking-to-report-to-fee-to-payout service journey also passed after 0079, using stub payments/manual meetings and a local simulated transfer record only.

Evidence: `tmp/v3-only-dev/cleanup-verification.json` and `current-report.pdf`. Focused tests and server/E2E typechecks are recorded in the current handoff; full legacy-oriented suites and browser/provider acceptance were not run. The frontend cleanup subsequently fixed the Accordion callback mismatch; web typecheck now passes. No test or production database was reset or migrated in this cleanup.

## V3-only pricing cutover — 30 October 2026

Current pricing behavior supersedes earlier activation-null compatibility notes:

- New booking requests require an explicit `subjectId` and an active V3 revision. Missing configuration blocks creation before wallet holds; tutor `prices`/`baseRatesIdr` and old economy settings are never fallback inputs.
- Discovery exposes competition-derived V3 prices only. With no active revision it exposes no prices, including for the seven canonical categories.
- Booking repricing reads the booking's pinned immutable V3 revision, independently of the current activation pointer. Old snapshot formats are rejected by pricing and on-demand fee creation.
- The old package-code purchase entry point always rejects; purchases use V3 quotes and an explicit package/custom/recommended choice. Webhook, quote and report replay protections remain.
- Tutor payout aggregation reads immutable session fee events and source allocations only. Booking-snapshot fallback and historical aggregate cutoffs no longer determine payable earnings.
- `/admin-economy` presents the V3 rate card and preview only; the obsolete Cogito take schedule panel has been removed. The old take-schedule APIs have since been removed by the report/settings cleanup below.
- The temporary runtime filter for migration-0027 catalog IDs is removed: migration 0078 handles obsolete rows and fresh migrations insert no catalog data. Seed supplies the seven current parents and 34 children.

Dev execution was explicitly authorized for `localhost:6767/cogito-app`, NODE_ENV=development. Its public/drizzle schemas were reset and migrations through 0078 applied. Before seed, catalog/package/old-economy row counts were all zero. Seed created canonical catalog, PRD packages and active revision 1; rerunning seed preserved existing records. No test/payout-test/production database was reset.

Verified with real dev PostgreSQL service calls: 140-Mark custom quote recommends 150 Marks/Rp975000; stub payment replay credits once; a newly created solo booking reaches tutor acceptance, report, one fee event, payout preview, one allocation and simulated transfer-record replay. A partial group reprices N3 to N2 (21 to 25 Marks each for the seeded Essay category) from revision 1 even while the active pointer is temporarily null; reconfirmation and tutor acceptance succeed. Fixture timestamps were advanced in SQL to exercise report completion. Payment/email/Meet providers used stub/manual behavior; the payout transfer was a local record labelled DEV-SIMULATION-NO-BANK-TRANSFER, with no bank operation.

Evidence: `tmp/v3-only-dev/verification.json`, `verify.ts`, and `verify-group.ts`. Focused V3/discovery/fee tests and selected booking tests passed; server typecheck passed. Web typecheck remains blocked by the unrelated Accordion callback type mismatch in academy-class-page.tsx. Full legacy-oriented test suites and browser/provider acceptance were not run. The later report/settings cleanup removes the legacy history/actor values, allocation source enum values and old settings APIs. Unused pricing utility methods remain separate from this cleanup.

## PR #332 coverage and CodeQL follow-up (28 October 2026)

Coverage regressions exposed a pending half-plan cancellation bug: cancelling
the last session in its first installment left the checkout pending because
second-installment reservations were counted as payable checkout seats. Session
cancellation now checks the first installment specifically; when none of its
seats remain, it cancels the pending enrollment/unpaid installments and releases
the remaining unfunded reservations without wallet changes. The PostgreSQL
regression failed on `c60c1054` and passes for both full and half plans after
the fix. The latest completed all-test-pass checkpoint, run `40694971836` on
`489786b4`, reports overall lines 97.32%, functions 99.78% and branches 88.58%; the unchanged
100% gate remains open.

Real-router unit contracts cover admin/student/tutor/anonymous permissions, trusted session actors, pending/unverified paid gates, quote/request identities, schedule validation and RPC error classifications for enrollment and referrals. Follow-up tests exercise both repeat scheduler payloads and student resource input validation. The test support directory is excluded from the production source inventory so `test-setup.ts` is not counted as app code. This remains bounded unit evidence, not full financial/provider acceptance.

CI coverage uses Istanbul source counters through a Bun preload instead of merging Bun's unstable native line/function summaries. The API/auth/DB/env source inventory keeps unloaded/mocked production modules at zero, excludes tests and test support, hashes source content, merges stable function/branch identities, then runs the existing strict LCOV validator and unchanged 100% gates. The three database partitions and their reset boundaries remain separate; the runner additionally requires a confirmed reset window. The local application runtime does not load this instrumentation. Hosted run 40662816367 on c54fc6d4 still fails the unchanged gate: merged API/overall lines are 93.0%, functions 95.6%, and branches 83.1%; no thresholds or source filters were weakened. The 781ef99b batch adds service, scheduler, pricing, error-map, palette, payout, and URL-schema cases; 207 focused tests / 492 assertions pass on Windows Bun canary. Run 40667837202 on df96f51d passed build/lint/typecheck but `api-fixtures` failed because the new class-enrollment top-up test returned quote IDs absent from the FK-backed quote table; the coverage gate was skipped. The fixture now persists test-owned quote/revision rows and cleans up its revision; the 100% gate still needs a complete hosted rerun.

Two CodeQL findings in Google Meet test mocks are addressed by exact OAuth token endpoint matching. Collector regression tests and focused API tests pass on the available Windows Bun canary. Pinned Windows DB/auth timeouts and interrupted Docker setup attempts are not passes. The 100% coverage gate remains IN PROGRESS pending genuine coverage-gap work and a passing hosted run. E2E is outside the required gate for this follow-up. See RUNBOOK and BUN-COVERAGE-LIMITATION.md.

## Linux acceptance and coverage blocker (28 October 2026)

Pinned Bun 1.3.14 on isolated Linux now passes 3,116 resettable tests / 8,464 assertions, 88 reset-free fixture tests / 774 assertions, 11 payout tests / 105 assertions, and 156 server tests / 409 assertions. A separate guarded T05 rollback test passes 1 / 7. Four typecheck tasks, lint baseline and both build tasks pass; build uses real Node 24.22.1 and bounded memory, with one cached task. The Redis helper test now respects REDIS_URL; new tests cover private PDF storage failures/validation, admin content actor/version/redaction, and real PostgreSQL referral usage pagination/filter totals/literal wildcard search. Unrelated local Activities/client work remains outside this scope.

The unchanged 100% coverage gate still fails: API 87.6%, overall 87.8%, function lower bounds 94.8%, 45 files with unverified function unions. A minimal reproduction proves partition-dependent Bun line denominators and absent function identities; zero branch records are not branch-coverage proof. See [BUN-COVERAGE-LIMITATION.md](BUN-COVERAGE-LIMITATION.md) for raw evidence, reproduction and next gate. No coverage filter/threshold was weakened. Initial interrupted/undersized-memory attempts are not passes. Hosted CI, genuine remaining coverage, provider/private-R2 acceptance, production restore/cutover and client approvals/UAT remain open.

## Server acceptance follow-up (28 October 2026)

Server tests pass 156 cases / 409 assertions across 30 files on both pinned Bun 1.3.14 and Windows Bun canary; one T05-only reset integration case is skipped on the separate scratch target. The server suite uses an owned PostgreSQL 16 schema clone at loopback 6770/v3_server_acceptance_20261028 and Redis 6382, with email and scheduler disabled. Two webhook test expectations now accept the existing SHA-256 idempotency key while checking the same key is claimed for 120 seconds and marked processed with the trace payload. No payment behavior changed. LCOV merger tests pass 11 cases / 145 assertions on both runtimes. Logs: tmp/v3-server-pinned.log and tmp/v3-server-unit-fixed.log. Hosted Linux CI, full merged coverage, real providers and production/client gates remain open.

## V3 local regression continuation (28 October 2026)

Local acceptance now has a repeatable guarded browser runner, `packages/e2e/playwright.v3-acceptance.config.ts`. T05 creates a fresh tutor as well as fresh students, keeping prior bookings/history intact and preventing shared availability collisions. Stale OTP/payment/refund/legacy-entitlement test fixtures, class navigation/date assumptions and unordered report-revision assertions are corrected; domain services are unchanged by this slice. CI keeps seven reset-free UUID-fixture suites out of the resettable coverage partition and explicitly enables guarded KB/calendar DB tests.

Verified locally: 13 real-RPC Edge journeys; 203 DB cases across 34 independently reset scratch schemas; 87 cases in the combined non-reset CI fixture partition; 2,695 unit/auth/env/DB-module cases plus 12 separate DB-backed role/verification cases; 3 FAQ/public-tutor DB cases. Four workspace typechecks, web/server builds and lint baseline pass. A PostgreSQL 17 test-DB dump restores with matching row counts/content digests across 21 critical tables. This is DB-only local proof, with no production cutover or provider acceptance. See RUNBOOK for commands, runtime limits and remaining release gates. Tests ran in the shared checkout with the unrelated Activities DTO overlay present; that overlay is excluded from the acceptance commit.

## KB/calendar live acceptance (26 October 2026)

Installed Edge passed the real API/DB journey in `kb-calendar-live.spec.ts`: 1/1 test (7.0s; 44.7s total). KB browser save survives reload; a concurrent API edit makes the browser save conflict while preserving its draft. Calendar create/update/readback and stale-version HTTP 409 pass. Anonymous session is explicitly empty: private file returns 401, public uploads path returns 404. Admin, eligible student and tutor receive the exact synthetic PDF bytes with `private, no-store`; student/tutor admin list/remove return 403. PostgreSQL integration separately passes 3 tests/8 assertions for concurrent saves, audit rollback and reference protection.

Use `node node_modules/@playwright/test/cli.js test --config playwright.kb-calendar-live.config.ts --retries=0` from `packages/e2e`, with the existing guarded T05 environment: NODE_ENV=test, DATABASE_URL at loopback 6769/cogito-test, REDIS_URL at loopback 6381, SERVER_URL/BETTER_AUTH_URL/VITE_SERVER_URL at localhost:3201, WEB_URL/CORS_ORIGIN at localhost:3200, PORT=3201, WEB_PORT=3200, and T05_ENROLLMENT_TEST_{DB,REDIS,SERVER,WEB}_PORT=6769/6381/3201/3200. ENV_FILE resolves the local test env; reset flags must be absent. The dedicated config selects database sources/authoring only for its test servers, private local storage under ignored E2E test-results, disabled scheduler/Meet/email delivery and stub payments. Default browser channel is msedge; override E2E_BROWSER_CHANNEL for an installed channel.

No reset, migration, dev/prod activation or production storage operation. Resource/event fixtures are removed; seed accounts/audits and immutable synthetic PDF registrations/files remain in the isolated test environment. E2E TypeScript passes; sequential-request lint warnings remain. The PDF is a signature-only synthetic transport fixture, not PDF rendering evidence. Ineligible-student/grant expiry, production private R2 denial, full calendar browser editing/WIB agenda, native zoom/accessibility, rollback and client UAT remain open.

## Competition types workspace redesign (26 October 2026)

`/admin-competitions` is now a grouped directory rather than a persistent tree/editor split. Parent competitions show their specializations, status and Add type action; search retains parent context and input focus during refetch, with a status filter and recoverable empty state. A Selia drawer opens only for create/edit. Optional descriptions, parent colors and specialization movement use disclosures. Unsaved edits require discard confirmation when closing or changing entries; successful save restores normal close behavior. Draft palette previews reflect current inputs.

Existing catalog procedure inputs, immutable slugs, required audit reasons, optimistic versions, reference impact checks, safe-delete rules and inherited colors remain. The live catalog browser spec now passes 1/1 installed-Edge journey against isolated PostgreSQL 6769/Redis 6381, covering archive/restore/move persistence readback, inherited colors, and student HTTP 403 for admin list/archive. Test fixtures are cleaned up; no reset/migration or dev/production access. Historical-reference/concurrency and broader consumer acceptance remain open; see RUNBOOK for the 26 October checkpoint.

## Admin KOL campaign UI (26 October 2026)

`/admin-referrals` now includes KOL campaign creation and a read-only saved-terms list using the existing adminReferral procedures. Admin chooses the registration-only code; no random allocation, edit, rotation, impersonation, new route, financial logic, or migration. Verified students obtain their separate friend code through `referral.getMine` on `/referrals`.

## V3 bounded regression checkpoint (25 October 2026)

Source `be14c454` passed 58 tests / 160 assertions across 13 explicitly named
files: auth hooks and installed Google callback with memory adapter, session
response refresh, friend-code policy/service doubles, referral policy/cursor/usage,
KOL settlement policy/CSV, and report access/window/history/PDF layout. Installed
Bun was 1.4.0-canary.1, not the pinned 1.3.14 CI runtime.

The isolated Google referral Edge workflow passed 3/3 in 43.0 seconds: friend,
legacy KOL and no-code, each including blank Enter, invalid-code toast, reload,
stale cached-session handling and destination resume. All API traffic is mocked;
PostHog fetch warnings occurred. This does not establish real Google consent,
Redis/PostgreSQL integration, provider delivery or production readiness.

No DB mutation, migration, reset, seed, parent API restart or production action
was performed for this checkpoint. Historical real-DB evidence retains its own
source/environment scope. Run commands are in RUNBOOK. Backlog T09/T12 rows now
reflect their later integration/local-dev checkpoints; T13 remains in progress.

## Referral session cache correction (24 October 2026)

Live dev submits returned 200 and persisted pending=false, but Better Auth Redis
sessions retained pending=true even with disableCookieCache. GET get-session
now refreshes role/email verification/referral pending from DB using the same
helper as RPC context, preserving auth cookies and marking the response no-store.
No referral attribution or reward is reapplied; existing saved choices are retained.
Two focused response tests cover stale pending and anonymous sessions.

## Google referral error feedback (24 October 2026)

Failed Google referral saves show a Selia error toast and retain the inline
message/input. The existing synthetic browser workflow checks toast visibility.
RPC and attribution rules remain unchanged.

## Google referral keyboard submission (24 October 2026)

Referral code entry uses native form submission: Enter applies a nonblank code.
Blank or in-flight submission is ignored; no-code remains an explicit button.
The existing Google referral synthetic workflow covers Enter and blank input.
No RPC contract or referral business-rule change.

## Google signup referral callback correction (24 October 2026)

Better Auth 1.6.11 invokes user.create.before with `/callback/:id` but without
additional-field defaults: `role` is undefined for a new Google identity. The
old student-only condition therefore persisted pending=false. The hook now
resolves the student default before the administrator override and pending check.
Existing OAuth reuse does not invoke user creation and is never re-attributed.
The referral detour carries the validated original destination through reload,
errors and completion. No schema/data backfill or existing-account policy change.
Evidence: actual installed callback with memory adapter reproduced false before
fix; fresh session and reuse regression passes. Three mocked Edge UI/wire cases
cover friend/KOL/no-code, invalid code, reload and stale cached session. These
are not PostgreSQL, real Google or reward-ledger acceptance.

## Real dev class-to-PDF checkpoint (24 October 2026)

On source `94df801b92b779643068c8f823e107d00c2b02b9`, a bounded live
HTTP/real PostgreSQL acceptance passed against explicitly validated loopback
`6767/cogito-app`, using dedicated `journey-1792843607328` fixtures. Verified
identities/password hashes and a published tutor profile were inserted directly;
actual Better Auth password login issued sessions for admin/tutor/two students.
Admin draft/publication, audited admin wallet correction (+100 Marks), student
masterclass enrollment (20-Mark hold), assigned-tutor report and identical replay,
student report visibility, and authenticated student/admin PDF download passed.
Persistence shows one 20-Mark deduction, funded/spent allocation 20/20, report
version 1, completed session, one Rp300,000 earned-fee event and final wallet
80 total/available, zero held. No payout or provider settlement was executed.
Student publication denied 403; student report submission denied 404; outsider
report list excludes this session; cross-student/tutor PDF denied 403 and anonymous
PDF denied 401. PDF private/no-store header, signature, all three feedback texts
and one-page visual rendering passed. No business response was mocked.

Controlled-time boundary: after future publication/enrollment, only the dedicated
session timestamps were moved to now minus two/one hours. This is not a wall-clock
session journey. No reset, seed command, migration, API restart, external send,
payment/Meet call or existing-user balance modification was performed. Browser
login initially hit 429, then succeeded after the limit window; preview snapshot
attempts timed out. API acceptance is not full click-through browser acceptance.

Class `87dcbb4c-255b-4626-aa2a-1684884c90b0`; session
`354e79d8-e245-42b5-994e-183bff3d6856`; enrollment
`6b5c6934-c01a-48f6-b87d-64b6f13556fb`. Retain fixture financial history for
inspection; do not delete ledger, allocation, report or earned-fee records. Any
future financial reversal must use an approved audited correction, never deletion.
Local evidence/PDF/render remain ignored under this checkout's
`tmp/dev-journey/`; private login/session files must never be committed or shared.
Production, real provider delivery, full browser journey and client UAT remain gates.

## KB/calendar local dev activation (24 October 2026)

Owner-authorized local dev cutover completed on localhost:6767/cogito-app.
Migration 0075 applied after a local custom-format pg_dump; existing 34 bookings
and 91 ledger entries were unchanged. Imported 3 KB resources and 63 calendar
events from the preserved published snapshot, with explicit core-category mapping
to active parent catalog IDs. One empty education-level placeholder was omitted
from a derived import manifest; original snapshot and normalization evidence remain
local. All 66 imported identities/hashes reconcile and qualify for unchanged replay;
all three local private PDFs match SHA-256. No source documents/PDFs are committed.

Local ignored env now uses KB_SOURCE=database, CC_SOURCE=database and
CONTENT_ADMIN_ENABLED=true. KB_PRIVATE_DIR points to a separate ignored local
directory outside public uploads. API restarted; health returns 200, anonymous
protected file access 401 and the corresponding public upload path 404.
This establishes local storage denial only, not production R2 privacy. Production
is untouched. Backup restore rehearsal, real client UAT and production cutover
remain outstanding. Rollback: disable authoring, set both sources to sanity and
restart API; retain additive tables and imported files for reconciliation.

## KB/calendar integration acceptance (24 October 2026)

Migration 0075 was applied only to guarded localhost:6769/cogito-test.
Existing booking/ledger counts remained unchanged. Three PostgreSQL cases
(8 assertions) passed: concurrent version conflict, atomic audit rollback and
category/imported-record deletion protection. No reset/seed or dev/prod migration,
content import, provider upload or activation was performed. Sanity remains the
default and authoring remains disabled. This supersedes earlier test-unrun notes.

The PDF upload RPC alone has a bounded 5 MiB base64-envelope budget, shared
by declared-length and streamed-body guards; other RPCs retain 1 MiB.
Private bucket denial, real import reconciliation, redirects, activation/rollback
and client UAT remain outstanding.

Integrated checks: 34 focused Bun tests / 95 assertions, 3 guarded PostgreSQL
cases / 8 assertions, 6 Python audit tests, all 4 serial typecheck tasks and
4 synthetic Edge cases passed. Browser initial cold navigation timed out at
30 seconds; explicit 60-second-budget rerun passed in 14.8 seconds. Browser
coverage is mocked UI/wire evidence, not real admin/provider acceptance.

## Approved account email branding (24 October 2026)

OTP (pre-account and existing-account verification), welcome and password-reset
emails share `packages/auth/src/auth-email-layout.ts`: the approved report banner,
orange CTA, blue footer and full Cogito Academy name. Owner removed the orange
rule below the banner. Bodies remain separate builders; future body changes reuse
the wrapper. Resend attaches the approved PNG inline with a CID, using the
byte-identical base64 asset shared with report export.
Instructions/OTP/links remain live HTML with
alt-text branding if images are blocked. No other notification templates changed.

## Admin referral usage (24 October 2026)

`/admin-referrals` and admin-only `adminReferral.listUsage` expose saved signup
choices (friend, KOL and explicit no-code), searchable by code, user/referrer
name/email or campaign. Paged rows include signup attribution, email verification,
welcome terms/ledger credit, first chargeable friend-completion decision and
KOL payment/refund/provider-time evidence. Filtered totals use actual linked
ledger credits; the current wallet balance is not a referral earnings total.
Repeatable-read read-only queries keep rows and totals on one snapshot. Unsaved
Google choices and unused codes are outside this usage list. No schema change.

## Login draft retention (24 October 2026)

The public LoginPage no longer replaces sign-in/signup forms with a session
pending loader. Better Auth focus refetches set pending when the cached session
is null; the old branch unmounted the forms and cleared local drafts on tab
return. Session refresh and protected-route checks remain active elsewhere.
Two synthetic Edge browser regressions reproduce the loss before the fix and
pass afterward; the live dev visibilitychange repro also retains the same input
node and value. No password persistence or auth/backend contract changes.

## Student report reference layout (24 October 2026)

PDF export now follows the owner-supplied layout: supplied Cogito banner,
right-aligned Student Report title, compact two-column inline metadata and
Tutor Feedback with left-side section labels. Class type, cohort/class, session
and time remain present. The footer reads Generated date by Cogito Academy;
multi-page exports retain page numbers and labeled continuation pages. Text
remains live and paginated; dense lists can span additional pages in the narrower
feedback column. Bullets use a separate marker gutter; wrapped lines align with
the first text character. Dense bullets stay separate and paginate rather than
flowing inline. The banner is embedded from bundled JSON to survive server
bundling without a runtime asset path. Eligibility/endpoints/window are unchanged.

## KB/calendar source implementation (24 October 2026)

Additive `0075_kb_calendar_content` defines KB files/resources and calendar
records/category links. See the dated integration and local dev activation
checkpoints above for migration evidence; production rollout remains separate.
The editors in `/knowledge-bank` and `/calendar` use single-value text fields, private PDF upload, reasoned
live-save CRUD and version conflicts. Imported records retain source IDs and
can be archived, not hard-deleted. Calendar uses catalog parent identities and
palettes, inclusive WIB dates and agenda identity `(event ID, displayed date)`.

Default `KB_SOURCE=sanity`, `CC_SOURCE=sanity`, `CONTENT_ADMIN_ENABLED=false`
keeps existing reads working without querying new tables. Explicit DB mode
fails on DB/storage errors; it never silently falls back to Sanity. Existing
wallet and independently gated file routes remain. Activities/FAQ/classes/tutor
localization and global Sanity removal are outside this slice. Source content,
selection manifests and PDFs stay ignored/local; none belongs in GitHub.

Source implementation is not release acceptance. Migration/import/private bucket
privacy, guarded PostgreSQL, website redirect, rollback and client UAT remain
operator/parent gates. See RUNBOOK and migration README for activation order.

## Earlier KB/calendar preparation checkpoint (superseded by source implementation above)

Owner clarified one language-neutral input per KB/calendar text field; English
is not required for entered content. Other modules' locale policies are unchanged.
`migration/sanity-content/audit.py` verifies the published working snapshot and
prepares single-value records without DB writes: 3 KB PDFs match source size/hash,
63 competition ranges/references pass, and 80 differing legacy locale fields
retain selection evidence. Six focused Python tests pass. Existing pages and
content service still read Sanity; DB/admin/private-file migration and cutover
remain open. Activities are deferred. See the migration README for exact scope.

## Short FRIEND code source checkpoint (24 October 2026)

New codes allocated by student `referral.getMine` use exactly three ASCII uppercase
letters and three digits (`AND007`). Existing codes, attribution snapshots and
shared invitations remain unchanged. Name letters are NFKD-normalized; short names
are completed with deterministic SHA-256 account-ID letters, and names without
ASCII letters use those identity letters. No migration or bulk rotation is needed.
The shared uppercase unique namespace includes KOL codes. Allocation scans at most
1,000 distinct suffixes, skipping occupied values; prefix exhaustion is explicit
HTTP 409, never a longer code or a silent alternate prefix. Database concurrency,
auth/provider and browser acceptance remain parent-owned and unrun for this slice.

## KOL settlement release/dev sync (24 October 2026)

PR #319 is merged into release at 61031cc9, following sidebar #318 and
synthetic auth/referral/KOL acceptance #317. Root dev source is synchronized.
The normal Drizzle postgres-js runner applied additive 0073/0074 only to dev
localhost:6767/cogito-app; journal count advanced 74 -> 76. Booking (34), ledger
(90) and completion-feedback (2) counts stayed unchanged; settlement entries
start empty. No reset, seed or external transfer ran. Production is unchanged.

API was explicitly restarted to load shared module changes; health is HTTP 200
and unauthenticated /rpc/adminReferral/getKolSettlement returns 401. Web remains
on localhost:3000, Midtrans uses its existing sandbox config, and scheduler is
disabled only for the preview process. Logs: tmp/v3-dev/runtime/api-settlement.*.

The extra pre-settlement Docker dump command did not return and was stopped;
no fresh dump from that attempt is verified. Earlier checkpoint dumps remain
under ignored tmp/v3-dev/checkpoint. Re-establish a fresh verified backup and
restore rehearsal before any production rollout. This supersedes earlier
0073/0074 dev-unapplied notes; live provider/OAuth and client UAT remain open.

## KOL settlement browser acceptance (24 October 2026)

Seven synthetic Chromium settlement cases pass (19.8s): admin opening,
partial/history/overpayment display, transfer payload and WIB date, identical
retry payload, adjustment reason/precondition, blocked adjustments, monthly
CSV download bytes/name and non-admin redirect. Run from packages/e2e:
`bunx playwright test --config playwright.kol-settlement-synthetic.config.ts`.
RPC responses are mocked; the separate 21 PostgreSQL cases verify persistence,
replay/concurrency, rollback, refunds and generated CSV. Five policy/CSV units
also pass (combined 26 / 227). Full server build and normal four-workspace
pre-push typechecks/lint pass. The bounded source rereview found no remaining
findings after the numeric CSV, replay-precondition and timestamp-binding fixes.

## KOL settlement parent verification (24 October 2026)

Review fixes retain numeric negative adjustments in CSV, persist and compare
adjustment replay preconditions, and bind WIB month boundaries as explicit ISO
timestamptz values. Migration 0074 adds only expected_obligation_idr; applied
0073 remains unchanged. Both migrations are applied only to guarded test
6769/cogito-test (journal 75), without reset/seed. Current acceptance passes
26 tests / 227 assertions across 21 PostgreSQL cases (including prior PR312
ordering/refund regressions) and five settlement policy/CSV units. Concurrent
transfer/replay, stale corrections, audit rollback, refund retention and the
monthly CSV path and exact half-open WIB purchase boundaries pass. The combined auth/referral/KOL synthetic Chromium suite passes 10/10 after updating the commission-cell locator for settlement controls. Dev/production migration and browser settlement
acceptance remain pending at this checkpoint.

## KOL settlement source checkpoint (23 October 2026)

REQ-KOL-02/03 and AC-K03 source now extend the existing admin commission page
with actual external transfer recording, append-only signed obligation adjustments,
history/readback and monthly reconciliation CSV. Transfers bind to one decision;
there is no cross-campaign allocation, automatic recovery, future offset, bank
execution or worker. Rp35,000 minus Rp10,000 leaves Rp25,000 outstanding; another
Rp30,000 leaves Rp5,000 overpayment. Adjustments require reason and expected current
obligation, preserve choice/transfer rows, and audit actor/time/before/after.
Provider ordering and partial-refund semantics from PR312 remain unchanged.
Full reversal makes effective obligation zero, including prior adjustments, while
all history survives; unresolved time holds obligation at zero. Partial refunds
remain flagged for explicit manual reconciliation; no proration policy is added.

Additive 0073 SQL/snapshot/journal are generated and reviewed, **unapplied**.
DB-free focused units and web typecheck are the validation scope; guarded parent
PostgreSQL/concurrency, admin browser and migration/deployment acceptance remain
open. Earlier settlement-deferred checkpoints below describe their historical
source slices, superseded here for implementation only. T09 remains in progress.

## Synthetic referral/KOL browser checkpoint (23 October 2026)

The DB-free `v3-referral-kol.spec.ts` suite passes **10 Chromium tests** using
web port 3304, a mocked API origin on 3305, one worker and no global setup.
It verifies pending-student referral redirects, code normalization and explicit
no-code submissions, inline save-error recovery, signed-out/non-pending route
redirects, KOL next/previous cursor navigation (including unchanged microsecond
cursor text), partial-refund reconciliation labels, unresolved-time holds,
full-refund zero commission, and explicit empty/error states. E2E TypeScript
passes with `--checkers 1`. These are synthetic session/RPC browser contracts;
real Google OAuth, persisted referral choices, DB authorization/pagination,
provider reconciliation and client UAT remain separate acceptance gates.
No DB/provider/seed/reset/migration or development 3000/3001 session was used.

## Core acceptance refresh (23 October 2026)

The reset-free `class-enrollment.test.ts` suite passes 44 PostgreSQL tests /
354 assertions against exact loopback 6769/cogito-test on integrated release
source `fe3a6ea4`. It covers enrollment funding/expiry, class lifecycle/report
settlement and reminder invariants using run-owned fixtures and targeted
cleanup. No reset, migration, provider action or dev database write ran.
This refresh does not claim a real browser journey or production acceptance.
AUTH-02 source is already integrated through PR #309; its remaining gate is
real Google/new-account choice/save/resume acceptance, not parent integration.

## Development sync checkpoint (23 October 2026)

Root checkout is synchronized to integrated release source `31774397`. The
normal dev environment targets `localhost:6767/cogito-app`, API 3001, web 3000
and Redis 6379. After a custom-format backup under ignored
`tmp/v3-dev/checkpoint/`, the standard Drizzle postgres-js migrator applied
0071 and 0072. Journal row count advanced 72 -> 74; booking (34), ledger (90)
and completion-feedback (2) counts stayed unchanged. No reset or seed ran.
This supersedes earlier notes saying 0071/0072 were test-only or dev-unapplied;
production remains unmigrated by this work.

Web and API dev processes are running; web HTML, `/health` and auth session
read return HTTP 200, and the login page renders. Midtrans retains existing
sandbox (`test`) configuration. The process-level scheduler is disabled for
manual preview to avoid automatically processing existing background jobs;
`.env` is unchanged. Google Meet remains configured; its boot credential probe
succeeded. Real authenticated feature journeys and actual reminder dispatch
were not exercised during this sync. Runtime logs are under ignored
`tmp/v3-dev/runtime/`. Existing accounts/data and client document artifacts
are preserved. See the integrated checkpoint for feature and acceptance status.

## Integrated V3 progress checkpoint (23 October 2026)

The remaining V3 source checkpoints are integrated through PR #310 (private
student PDF and test infrastructure), #309 (AUTH-02 and friend rewards), #312
(KOL first-top-up decisions/refund evidence), #314 (compact class UI and auth
states), and this #313 reminder integration. Normal pre-push lint and all four
workspace typecheck tasks pass on the combined source. Guarded non-reset
PostgreSQL regressions pass 34 tests / 365 assertions across admin reports,
friend rewards, KOL decisions, PDF eligibility and legacy reminder precision.
Focused payment/provider/webhook/referral/reminder/retry units pass 160 / 428.
Private PDF access/layout/window/service/HTTP checks pass 13 / 44. The full
server tsdown build passes after restoring missing lockfile-pinned native
Rolldown artifacts with a frozen dependency reinstall.
The checked-in synthetic UI/PDF suite passes 14 Chromium cases at responsive
sizes; its catalog locator now uses the full-card link.

All local V3 branch/worktree progress was inventoried against release: older
T06/T07, class publication, payout/tax, sidebar/profile and UI-controls commits
are patch-equivalent or superseded by the release implementation. Preserve the
old dirty drafts; do not merge their stale schema, source or generated snapshots.
The September keyboard-booking branch is unique but outside V3 and incomplete
(interactive-control/modal key handling and planned detail/help flows); it stays
separate. Client quotation sources, fonts and rendered PDF artifacts are retained
locally and excluded from application commits.

Only test 6769/cogito-test has migration 0072 (journal 73); no database reset,
seed, development/production migration or live provider action ran. Remaining
release gates include real OAuth/enrollment/publish journeys, KOL admin browser
acceptance, actual email/provider delivery, final PDF branding, deployment and
client UAT. The ad hoc API-project typecheck includes the test tree and still
has test typing errors; the supported four-workspace production check passes.

## KOL PostgreSQL integration checkpoint (23 October 2026)

Migration 0072 is applied only to `127.0.0.1:6769/cogito-test` (Drizzle
journal 73); development and production remain unmigrated. The standard
Drizzle postgres-js migrator ran after exact target/readback checks, without
reset or seed. PostgreSQL acceptance passes 15 tests / 180 assertions for
concurrent callback ordering, immutable correction audits, partial/full refund
credit and reversal replay, cumulative refund snapshots, and microsecond admin
pagination. Two fixture defects found on the first run were repaired: inject
the production refund repo and use unqualified SET target columns.
The DB-free focused suite passes 140 / 355. Server and web typechecks pass;
browser reconciliation display and broader release UAT remain separate gates.
This checkpoint supersedes the earlier source-only/unapplied KOL notes below.

## Referral review corrections (22 October 2026)

Report settlement transactions now retry PostgreSQL deadlock rollbacks at most
three times; callbacks contain database writes and durable notification outbox
work, not provider I/O. The retry covers tutor/admin on-demand report submission
and academy reports. Friend reward issuance rechecks both accounts' student
roles under shared row locks before creating a new decision/credit; prior
decisions remain replayable. Admin may confirm a delivered solo student no-show
after session end using the existing report reason/delivery-confirmation flow.
The previous charge is reused, with one fee/reward and immutable audit history;
tutors cannot convert a terminal solo no-show and penalty alone earns nothing.

Migration 0071 is applied only to guarded loopback 6769/cogito-test, without a
reset/seed. Real deadlock/cap/replay, saved-term/no-code and role tests plus retry
units pass 5 / 26;
the complete on-demand admin report suite passes 12 / 118 including the solo
no-show reward and entitlement regression. Dev/production migration, OAuth
browser acceptance and the separate KOL commission workflow remain open.

## AUTH-02 and friend referral source milestone (22 October 2026)

This feature branch adds the Google new-student referral choice gate and the
friend reward path. New Google-created students remain pending until they save
one valid friend/KOL code or choose no code; the choice page resumes on later
login and does not request another OTP. Existing-account OAuth reuse is not
marked pending and cannot receive a new attribution. Email OTP signup passes an
optional code through the existing account/proof transaction. A valid code
snapshots signup settings; no code stores an immutable zero-welcome choice.

Friend rewards are decided in the delivered report/settlement transaction for
positive-charge solo, group, series-child, cohort, and masterclass completions.
Q06 chargeable no-shows qualify only when the session is delivered and reported;
a no-show penalty by itself does not. The first eligible decision is unique per
referred student, including a permanent zero-credit result. A referrer-semester
row lock enforces the active cap across different referred users. Settings are
versioned by effective time; saved signup reward terms remain fixed, while the
completion semester and cap use completion-time settings. The student page
shows a generated friend code, current semester earned/remaining Marks, and the
semester end date.

At this 22 October source milestone, admin APIs could revise/audit friend
settings and create/list KOL campaign codes. Signup validated campaign dates and
snapshotted KOL flat/percentage terms and attribution expiry. First-purchase
commission decisions, transfers, partial/overpayment accounting, CSV, corrections,
and reversal handling were still outstanding; campaign creation did not imply a
commission or payout.

At this earlier source-only checkpoint, parent follow-up had generated additive
`0071_referral_registration_rewards` after 0070: six new tables and
`user.referral_choice_pending`, with the existing snapshot tables otherwise
unchanged. The migration has since been applied only to guarded loopback
6769/cogito-test; development 6767 and production remain unmigrated. Parent web
and server typechecks pass after correcting UI/form and transaction parameter
types; the focused unit suite passes 46 tests / 101 expectations.

The read-only review against `356c352c..dfd8a2a0` closed its three original
findings with no remaining spec/behavior findings. Its P2 documentation-status
finding is corrected in this follow-up; the reviewer did not rerun tests.
OAuth/browser UAT, development/production migration, and provider acceptance
remain open.

## Report PDF parent verification (22 October 2026)

The parent repaired long metadata pagination and added a semantic student-search
group. Academy topic metadata uses the session title, not its full curriculum.
Dense current-format bullet lists can flow inline to retain one-page output;
ordinary lists and legacy line breaks remain separate. Regressions cover three
600-character fields, 300 short bullets per field, and 5,000-character metadata.
Focused checks pass 29 tests / 104 assertions. A guarded non-reset PostgreSQL
eligibility test passes 1 / 16 across private and academy adapters, exact-student
charges, cancelled series parents, unfunded/released seats and date ordering.
Web/server typechecks and a full server tsdown build pass. Three synthetic
Chromium journeys pass for student/admin downloads, empty state and tutor UI
denial. These browser routes are mocked; live-provider and final
branding/deployment acceptance remain open. This supersedes older source-only
DB/compiler notes below.

## Report PDF and admin picker rereview (22 October 2026)

The admin report picker now sends `role: "student"` to `admin.searchUsers`;
the repository filters by role before sorting and limiting, while other admin
searches retain their all-role behavior. Private PDF layout identifies legacy
feedback from the history entry matching the persisted current report version
and its `actorRole`; reports without that current history entry retain legacy
layout. Feedback length no longer determines the layout, so short legacy lists
keep their line breaks and can continue across labelled pages.

Follow-up unit checks pass 81 tests / 208 assertions. Server and web
`check-types --checkers 1` pass. The parent's PostgreSQL and synthetic Chromium
evidence above was not rerun in this continuation; no database, browser,
migration, reset, seed, or provider was used, and the saved PDF sample was left
unchanged.

## Windows TypeScript-Go memory guard (22 October 2026)

The earlier Windows workspace check failed with `VirtualAlloc` errno 1455.
Every package check script that runs `tsgo` now passes `--checkers 1`; the root
`check-types` script serializes Turbo tasks with `--concurrency=1`, and
Lefthook runs pre-push typecheck and lint-baseline commands sequentially. This
reduces concurrent compiler pressure while keeping TypeScript-Go;
`NODE_OPTIONS` does not control its Go checker parallelism.

In this worktree, `bun run check-types` passed with 4/4 uncached tasks in
12.832 seconds. The parent also measured the web check at 6.51 seconds with one
checker after the default four-checker invocation ran out of memory. See the
[typecheck memory plan](plans/active/WINDOWS-TYPECHECK-MEMORY.md).

## KOL first commission decision source slice (23 October 2026)

This branch now persists the verified provider success timestamp on each payment
and records one KOL first-purchase decision per referred student from the
signup-saved flat/percentage terms and the payment-record IDR price. The saved
price excludes provider/channel fees. Eligibility is strictly before the saved
attribution expiry. Callbacks serialize on the saved referral choice; a late
earlier success replaces the current decision and appends an immutable audit
event with before/after payment, timestamp, base amount, and commission. Equal
timestamps are ordered by ascending payment ID. A zero commission still records
the decision. The admin endpoint returns both current/local payment status and
the decision's saved status snapshot. The page uses bounded keyset pages ordered
by immutable decision creation time and ID, shows current status, and flags
partial refunds for manual reconciliation. An authenticated partial-refund
status is successful purchase evidence: it promotes a not-yet-successful local
payment to SETTLED and credits saved Marks once. Its cumulative cash-refund
amount is kept for manual reconciliation; there is no partial proration or Marks
reversal. Any calculated commission remains historical and visibly flagged for
reconciliation.

The user's 23 October ordering decision is earliest provider success time, not
first callback commit time. Midtrans webhooks are rechecked against the
authenticated status API because the signature does not cover time fields.
Midtrans confirms card `capture` as successful, but documents `transaction_time`
as transaction initiation and exposes no `capture_time` in the status response.
The card payment still credits Marks, while its KOL decision is held at zero as
unresolved; later purchases cannot take first place without an exact verified
provider time. Non-card settlement uses `settlement_time`. A full refund keeps
its purchase as the first-event reservation and voids commission to zero. No
Marks are credited when a refund is confirmed before local success. A refund
without the original success time is likewise unresolved. A later authoritative
exact provider time, if available, can resolve a hold with audit; this slice adds
no manual time-entry control. Confirmed Midtrans status must also return IDR
gross and currency, which the payment service checks against the saved purchase
amount and allowed channel-fee tolerance.
Settled transfers are never rewritten. A later full refund can advance a
partial-refund state for the same provider transaction and invoke the existing
wallet reversal once. Partial-refund proration/accounting, overpayment handling,
external transfer records, CSV, and settled-transfer reversal adjustments
remain separate work. Migration 0072 is unapplied, and guarded database proof
is authored but pending the parent test window. No
database migration, reset, seed, provider call, or browser payment ran in this
slice.

## Classes UI workspace (22 October 2026)

Student `/classes` is a single searchable catalog with Cohort/Masterclass filters,
one compact, keyboard-accessible link card per class, next-session dates in WIB,
tutor names and explicit price units. Class details place curriculum beside
enrollment on wide screens and stack on mobile, with enrollment before the
curriculum on small screens. Catalog guidance
explains the two class formats; class details and student reports link back to
the catalog. Enrollment reuses the database-backed `_app` route session
instead of independently reading a cookie-cached session. Signed-in students who
need email verification see a verification action with a return to the class;
non-student accounts see the student-account requirement, not a sign-in prompt.
The current student-only routes still redirect signed-out visitors to login and
non-students to dashboard before the panel mounts. Synthetic auth/layout checks
passed on 23 October; the permanent catalog E2E locator still targets the old
button and must be updated to the full-card link (see the UI audit plan).
The app header identifies Class details and Class studio correctly.
Admin `/admin-classes` starts with published/postponed classes. Drafts & editor
keeps the editor mounted across tab changes; publishing returns to the published
list. Manage class expands existing cancellation/minimum/schedule controls.
Student/tutor/admin report lists are bounded and scroll locally. Mobile session
selection focuses and scrolls to the selected report. Existing route role guards,
RPCs, quote math, settlement and audit rules are unchanged.

## On-demand report acceptance (22 October 2026)

PR #305 is verified against current V3, including the sidebar/profile repairs.
The guarded PostgreSQL suite passes 11 tests / 106 assertions; feedback/service
units pass 31 / 112. The real-RPC Chromium journey passes (1 test, 52.3s): initial
admin report, version-2 correction, immutable history and no second settlement.
Fixtures accept text authentication IDs, verify the run-owned student and exact
synthetic booking, choose an unoccupied tutor slot, and preserve unrelated holds.

Migration 0070 is applied through the normal runner to test 6769/cogito-test
(journal 71) and development 6767/cogito-app (journal 91). SQL SHA-256:
`eacfa97b013f23fa2e74be6d6d8e410b2b9c0f354b1d9ae6bb121370f40fc0f4`.
A local pre-migration dump is retained under ignored
`tmp/v3-dev/checkpoint/cogito-pre-0070-20261022.dump`. Development booking (34),
ledger (89), and feedback (2) counts are unchanged; history starts empty. No dev
reset/seed, production migration, or live provider action ran. Test history is
retained under run-scoped identities. The private PDF source implementation is
now authored in this isolated continuation; focused/unit/privacy checks and a
rendered sample pass. Database/browser/deployment acceptance and broader legacy
reminder coverage remain open.
This acceptance supersedes older source-only/unapplied/pending-browser notes below.

## T07 private student report PDF source implementation (2026-10-22)

The isolated report-export module adds student self-download and an admin flow
that requires selecting a student. Tutors cannot export arbitrary student data.
It reads completed private solo/group reports, completed series children even
after parent cancellation, and delivered cohort/masterclass reports with the
selected student's funded and charged allocation. Exact private-booking ledger
entitlement follows Q06; legacy feedback is decoded using report history. Data
is read in one read-only repeatable-read snapshot, filtered from the same WIB
calendar day three months ago through the captured generation instant, and
sorted newest scheduled first with report-ID tie breaking.

The Selia report workspace shows the student's live name, report count, and an
explicit empty state. PDFs use a bundled DejaVu Sans font and a placeholder
Cogito header, include live tutor/session metadata, preserve long legacy text on
continuation pages, and have WIB generation date/page numbering. Focused export
tests pass 9 tests / 31 expectations; rate-limit routing passes 18 / 67. The
combined focused run passes 27 tests / 98 expectations. A seven-page sample was
rendered and visually checked, including a three-field 600-character single-page
case and long legacy continuation. No database, browser, migration, reset, seed,
full server build or provider check ran in this source slice. Focused Bun and
tsdown PDF-module bundles each emitted one JavaScript entry with the complete
1,008,096-character font embedded and no separate font asset; the tsdown output
was 3.28 MB (tsdown 0.22.14, Rolldown 1.2.3). Guarded database, authenticated
browser, full typecheck, server tsdown/Docker build and deployment acceptance
remain with the parent.

### E2E CI environment forwarding (22 October)

The root E2E command runs through Turbo's strict environment mode. The
`@cogito-app/e2e` task now explicitly allows the variables used by Playwright
and its test servers, including `WEB_URL` and `WEB_PORT`. CI writes the port to
`apps/server/.env.test` but does not write the URL; dotenv loads after Turbo's
filtering, so both values must be preserved as ambient task environment. The
loopback URL and matching-port checks remain unchanged.

## REQ-REPORT-02/03 on-demand booking report review-fix continuation (2026-10-22)

The on-demand solo/group/series admin report source milestone is applied to
this isolated worktree as `9bc960ed`; the parent `f/release-v3` and `main` are
untouched. The existing booking-detail admin action records a report for the
assigned tutor after delivery confirmation and with an audit reason. Initial
submission settles scheduled work once; adding a report to an already-completed
legacy booking/session does not settle it again. Corrections require the current
version and append report/audit history and a tutor notice without replaying
financial effects.

Review fixes store new feedback as canonical plaintext, use history status to
decode exactly one HTML-escape layer only for known legacy rows/snapshots, and
serialize a request UUID globally before booking/tutor locks in both tutor and
admin paths. Same-key cross-booking conflicts resolve to the report conflict
(409); Q06 read coverage includes chargeable group-series no-shows. Focused
pure feedback tests pass 12 tests / 33 expectations and focused admin-service tests pass 4 / 21 and completeSession mock regressions pass 15 / 58 (exit 0). Cached format and lint pass; lint reports existing
warnings. Authored 6769 database coverage and the solo Chromium journey remain
unrun in this source worktree.

Migration `0070_on_demand_report_admin_audit.sql` remains unapplied; its SQL
SHA-256 is `EACFA97B013F23FA2E74BE6D6D8E410B2B9C0F354B1D9AE6BB121370F40FC0F4`.
History is linked to both feedback and booking with `ON DELETE CASCADE`; current
feedback is also linked to its session with cascade, while history's session ID
is text only. Hard deletion of a booking or session/feedback can therefore
remove history; the text session ID alone does not guarantee retention. No
current application hard-delete path was found, and this documents the existing
schema boundary rather than adding a release gate. No historical actor is
invented and no legacy row is backfilled.

## V3 execution priorities (22 October 2026)

Owner direction: finish core V3 work through feature branches and GitHub PRs into
`f/release-v3`, with focused validation and docs per feature. The repository uses
squash merges. Feature showcase/video and Sanity Knowledge Bank/Calendar migration
are tertiary. Their scope/release gates remain until an approved client deferral;
this priority change does not authorize production release or changing `main`.

## Explicit ongoing experience (22 October 2026)

Tutor experience dates now use an explicit "I currently work in this role"
checkbox instead of blank-end-year helper text. Checked means `endYear: null`
and disables the end-year control without removing it; unchecking starts at the
current year or start year, whichever is later. Date fields align at the top.
Existing null end years render checked. No storage or API change is required.
The Education, Achievements & Experiences header gives its text a shrinkable
span so the info button stays beside wrapped text, including at mobile widths.

## Compact tutor profile status (22 October 2026)

The tutor profile shows one status badge beside its heading. The duplicate
Profile status card and pending-edit badge are removed. Published profiles with
no review action show no notice; draft, review, revision and suspension guidance
appears as compact text in the header. Admin feedback remains in its existing
card. Public tutor details currently use a catalog drawer, so no standalone
public-profile link is added. Synthetic browser coverage checks lifecycle
states, feedback retention and mobile overflow without writing dev data.

## Tutor profile render repair (22 October 2026)

The tutor `/profile` tax-section introduction used `FieldDescription` outside
its required Base UI `Field` context, throwing during render and showing the
route error page. It now uses Selia `Text`. Synthetic authenticated Chromium
coverage reproduces the failure before the change and passes afterward,
including visible legal-name fields and no browser errors. No dev data changed.

## V3 publication lint fixes (22 October 2026)

FAQ link selection is render state; its URL input receives focus only after the
user opens the link editor. FAQ URL validation still rejects control characters
and backslashes, using explicit character checks. Public classes use the existing
30-second visibility-aware clock so upcoming sessions update without impure
render-time clock reads. Workspace typecheck and the lint baseline pass; focused
FAQ regressions are recorded in the PR. No API or storage contract changed.

## UI controls and Card/Table repair (22 October 2026)

Card responsive containment is scoped to CardHeader. Applying inline-size
containment to the whole Card inflated grid row heights and caused large blank
gaps on the economy page; the measured section gap is restored to 24px.

Payout tax default and custom tutor fields now use percentages and a rupiah
deduction example. API rates remain integer basis points; no stored rate changed.

Web numeric fields use the shared Selia NumberField with styled steppers. Academy,
lifecycle and payout date/time fields reuse CrossBrowserDateTimeInput. Card/Table
width, spacing and narrow-card header actions are handled in shared components;
per-page table-width overrides have been removed. The calendar month selector
registers its visible labels before opening, and date pickers expose the next
100 years by default for future schedules. Source audit and component browser
checks are recorded in [the UI audit plan](plans/active/UI-CONTROLS-AND-LAYOUT-AUDIT.md).
Authenticated admin/student route smoke checks now pass for the states listed
in the audit plan. Academy rate controls use an independent auto-fit grid to
prevent numeric text clipping; DB-backed write-flow acceptance remains pending. Backend contracts, migrations and provider configuration are
unchanged by this repair.

## T07 pending-report reminder integration checkpoint (2026-10-22)

The class-report reminder worker is integrated on local `f/release-v3` at
`1f9b6dd7`. It runs in the existing `class-enrollment-check` job alongside
second-installment reminders, with separate report reminder counters. The
guarded, non-reset PostgreSQL `class-enrollment.test.ts` suite passed 44 tests /
354 expectations on exact loopback `6769/cogito-test` (exit 0, 9.62s); the
pure report-reminder suite passed 7 tests / 25 expectations (exit 0, 0.15s).
The integration fixture asserts only its owned installment event keys, student
and enrollment while preserving the global report scan. `SELECT current_database()`
was verified before fixture writes. No development seed or migration ran; no
live email, browser or external provider ran. PDF export, dedicated on-demand
admin correction, and legacy solo/group/series reminder coverage were pending
at this parent reminder checkpoint; the isolated source continuation is above.

## T06 parent integration and local verification (2026-10-21)

T06 is integrated into local `f/release-v3` through `cda99280`; `main` is
unchanged. After restarting Docker, the parent applied additive migration 0069
to guarded loopback `6769/cogito-test` with the normal migration runner and no
reset flags. The non-reset enrollment/lifecycle/report suite passed 41 tests /
319 expectations (exit 0), including payment-first and cancellation-first lock
orders, stale-lease requeue, and durable generation recovery after event deletion.
A second run from the integrated root checkout also passed 41 / 319 in 12.68s.

Development `6767/cogito-app` is migrated through 0069 using the normal runner:
journal id 90, timestamp `1792593114908`, SQL SHA-256
`a6a442562692e34cea132cbd4bb20de6561906fb45ad9441add19dbf8b8c2617`.
Migration 0068 is journal id 89, timestamp `1792584327849`, hash
`cffb34e94821c878f2d897f59b1800395c7bc6ceefc44dc8cd9546db7116b173`.
Dev ledger count 89 and booking count 34 were unchanged across migration; no dev
reset or seed ran. Root workspace dependency junctions were repaired to resolve
root packages rather than a saved feature worktree, then local API/web restarted.
API port 3001 health reports database/Redis/scheduler healthy; web port 3000
returns 200. These checks do not exercise live Google Calendar or payments.

Browser acceptance: the integrated enrollment and whole-class cancellation
journeys passed in the two-case run. The new lifecycle journey initially found
missing admin storage state, then an ambiguous text locator; it now signs in
using the per-run credentials and matches the postponed badge exactly. Its
focused rerun passed (1 Chromium test, 32.4s; exit 0), covering session
cancellation, one-time postponement and exact fee-free withdrawal. Integrated
root web and E2E typechecks passed (exit 0). Focused provider 52/196,
cancellation 8/16 and reset-guard 6/40 checks passed earlier. Browser logs also
exposed a duplicate class-card React key during list refresh. The fix is
integrated through `ede98094`; its focused regression passes 2 tests / 4
expectations and the integrated lifecycle Chromium rerun passes (35.1s, exit 0)
with zero duplicate-key warnings.
Ordinary rescheduling policy, broader V3 acceptance and previously recorded
API/web full-compiler limitations remain open.

## Test database reset incident and guard (2026-10-21)

At about 13:17:59 UTC, `academy-class.test.ts` invoked the API test helper's
`resetDatabase()` against loopback `cogito-test` on port 6767. The helper
truncated its broad table list with `CASCADE`; setup then failed because
`tax_legal_name` was missing. The separate development database `cogito-app`
was read back intact and was not truncated. No test-data recovery, restore or
reseed has been performed or verified. The reset guard now always rejects 6767/6768 and permits
only exact dedicated `cogito-test:6769` or `cogito-test-payout:6770` targets
when `TEST_DATABASE_ALLOW_RESET=true` and
`TEST_DATABASE_RESET_TARGET` exactly matches `DATABASE_URL`. Test setup no
longer supplies a default database URL. The standalone guard suite passes 6
tests / 40 expectations; no database-backed tests were run for this fix.

Earlier T06 worker checkpoint (superseded by the parent verification above):
implementation and focused unit checks were completed before Docker became
available. The parent subsequently integrated and verified the same changes.

Prior integrated local checkpoint (21 October, before T06 lifecycle): f/release-v3 includes admin cancellation
446e2cd0 and student cancellation a7065443, alongside signup and payout. Migration
0066 applied through the standard runner to guarded loopback cogito-app/6767.
Dev readback: journal id 87, timestamp 1792559482042, hash
70a47d6cbd1f7539d4af45071eaf643ca99ec73c7046c033108d7e1475d54afd.
The owned API restarted; web 3000 and API 3001 return HTTP 200. No dev reset/seed
or live-provider test ran. T07 report settlement, class payout identity, and the
role-based `/class-reports` workspace are implemented in this worktree. Focused
report/enrollment browser acceptance and web/E2E typechecks pass; see the T07
runbook checkpoint. PDF, reminders, the dedicated on-demand admin correction
workflow, lifecycle follow-ups, AUTH-02/referrals and full release acceptance
remain open. Main is unchanged.

Prior T06 whole-class administrator cancellation checkpoint (before current lifecycle work):
implementation on f/v3-admin-class-cancellation
with parent acceptance complete for this slice. Admins review exact zero-fee future-hold returns,
then confirm a versioned/idempotent quote. The transaction cancels future sessions,
releases only unspent future allocations, stops unpaid/checkout obligations,
preserves past delivery holds and earned fees, and writes audit plus student/tutor
notification outboxes. Class ownership history remains readable after cancellation.
The existing meeting worker durably deletes cancelled-session provider events,
including late creates after cancellation or lease recovery. Postgres checks pass
22 / 140; Google provider fake checks pass 46 / 148. Migration 0066 only expands
the class-meeting status check and is applied to disposable 6769, not dev yet.
Minimum/postponement, one-session administrator cancellation, rescheduling,
and withdrawal-rate settings remain open. T07 report settlement, payout identity,
and the shared report workspace are implemented in this worktree; PDF, reminders,
the dedicated on-demand admin correction workflow and remaining release acceptance
stay open.

Prior T06 student cancellation checkpoint (before current lifecycle work):
withdrawal was implemented on its baseline-derived
worktree: exact preview + versioned/idempotent confirmation, per-allocation
Marks accounting, inclusive 24h deadline, unpaid-half cancellation and atomic
audit/notification. Parent Postgres checks pass 15/101 and the combined web
typecheck passes. Chromium acceptance passes (1 integrated journey / 1.2m), using real cancellation RPCs and wallet readback; E2E typecheck also passes. This is a partial T06 slice:
admin cancellation, minimum/postponement/rescheduling and configurable withdrawal
rate remain outstanding; at that baseline checkpoint, completion/report T07 was
not yet implemented.

Local dev checkpoint (21 October): f/release-v3 includes signup 3055ba54 and
payout 2482d7ec. The standard migration runner applied 0065 only after the exact
loopback cogito-app/6767 guard. Dev readback: journal id 86, timestamp 1792525224597,
hash 876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939,
and tutor_tax_config exists. The owned API was restarted; no dev reset or seed ran.
At that earlier local checkpoint, T06 cancellation and T07 completion/report
remained next; main is unchanged.

Parent integration verification (21 October): T03 on the current enrollment/signup
baseline passes 11 isolated Postgres tests / 105 assertions, 11 tax/profile/test-target
units / 32 assertions, 7 payout service cases / 13 assertions, and 3 Chromium
UI journeys (1.3m). The UI scenarios mock payout RPC responses; the Postgres suite
covers actual transaction invariants separately. E2E no-emit typecheck passes.
Final full web/API compiler acceptance remains unverified after Windows virtual-memory
exhaustion in the parent signup check. Isolated migration 0065 readback matches
row 66 / timestamp 1792525224597 / SQL hash 876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939.
Local development application of 0065 follows integration; OPS01 remains open.

Final parent web typecheck could not complete: Windows VirtualAlloc errno 1455 (virtual memory exhausted); no successful final compiler result is claimed.

Parent AUTH-01 verification (21 October): signup and existing-account OTP DB
regressions pass 15 / 73; auth path/rate-reset safety checks pass 19 / 69; both
Edge signup browser journeys pass (1.4m), including an aborted successful create
response followed by outcome recovery. Security probes and browser journeys
use isolated auth rate buckets on the disposable test Redis; the application's
limiter is unchanged. These checks do not complete AUTH-02 or referral rewards.

Enrollment is integrated into local `f/release-v3` through `bd123ce4`.
Parent verification passed 9 guarded Postgres cases / 69 expectations, 12
pricing/funding/public DTO units / 37 expectations, 5 public tutor projection
units / 28 expectations, and the integrated Chromium enrollment journey (1.6m).
The web typecheck passed in the enrollment worktree after direct fixes. Local
web/API health returned 200 with DB/Redis/scheduler/DLQ healthy. T06/T07 and the
remaining release scope are not completed by this enrollment checkpoint.

Parent enrollment follow-up (21 October): checkout confirmation and second
installment payment read authoritative time after acquiring transaction locks.
Confirmation rejects reserved sessions that have started or are no longer
scheduled. Allocation state types now match the database check constraint;
unsupported filters on public tutor one-to-one relations were removed, with
active-subject/parent filtering retained in the public DTO mapper. Parent web
typecheck passes after these fixes and the worktree Drizzle link repair.

## Enrollment schema checkpoint (2026-10-21)

`385fc959` integrates the additive enrollment schema from `2f9786d0`.
Migration `0064` is applied to local dev with table and journal hash readback;
no existing snapshot table changed. T05 runtime/API/student UI now implement
cohort and masterclass enrollment, immutable session/rate snapshots, per-session
wallet holds, checkout expiry, half-plan installments, due reminders and
test-only top-up quoting. Acceptance evidence and remaining checks are recorded
below and in `RUNBOOK.md`; this checkpoint does not complete T06 or T07.
Payout migration generation may follow this idx64 lineage.

## T05 class enrollment checkpoint (2026-10-21)

Student class detail now contains an authenticated enrollment panel separate
from the public class DTO. The enrollment API reports only the signed-in
student's own seats and exposes full/half/single cohort plans plus the one-seat
masterclass plan. Current rates and selected future session IDs are snapshotted
on the enrollment. Full enrollment reserves all selected seats and holds each
session's Marks atomically. Half enrollment holds the first ceil-half and keeps
the remaining seats reserved without wallet funds until the second installment
deadline. A 15-minute pending checkout owns its seats; expiry releases all of
them and a new request receives a fresh quote. Late join prices only scheduled
future sessions, and a missed second installment releases its unpaid future
allocations without charging them.

The downstream T07 funding boundary is an immutable allocation row per
enrollment/session. Its hold event key is
`class-enrollment:${enrollmentId}:session:${sessionId}:hold:v1`; its stable
source reference is
`academy-class-enrollment/${enrollmentId}/allocation/${allocationId}`. Wallet
hold and funded-state writes share the enrollment transaction. Allocation
accounting requires `spentMarks + releasedMarks <= fundedMarks <= rateMarks`;
unfunded future-half rows cannot be spent, and a released row must have zero
remaining funded Marks before its seat is freed. T07 completion may deduct only
from that session allocation. Enrollment and payment do not settle class fees or
complete reports. T06 cancellation remains pending; no cancellation action is
presented as available.

Pure pricing/funding tests passed 11 tests / 36 expectations; the isolated
PostgreSQL suite passed 7 tests / 64 expectations, including duplicate requests,
last-seat contention, rollback, immutable rates, expiry, installment default,
reminder catch-up and role denial. The focused Chromium student journey passed
1 spec in 58.7s covering full, half, single and insufficient-balance checkout,
retry, reload, second installment and immutable top-up quote. The DTO allowlist
unit test passed 1 expectation. Focused lint and formatting passed with lint
warnings; the E2E package typecheck passed before its final reload-wait update.
API/web typechecks remain blocked by duplicate linked Drizzle declarations; see
`RUNBOOK.md`. Do not infer T06, T07 or release readiness.

## T05 repeat-run fixture identity (2026-10-21)

On exact loopback `cogito-test:6769`, Playwright global setup creates a run-scoped student email (`cogito.e2e.<uuid>@yopmail.com`), seeds the usual password and Andre display name, and passes that identity to each E2E worker. The T05 reset command returns without querying or changing the shared seed student. Existing enrollment, cancellation, ledger, quote and payment history remains untouched; the new student starts with an independent seed wallet. The T05-only starting balance is 326 Marks so the earlier booking-flow journey can hold 126 Marks while the class-enrollment journey retains its established 200-Mark funding; other seed targets retain the 200-Mark default. A second run-scoped student starts with 200 Marks for the parallel multi-plan class journey, keeping its 149-Mark spend separate from the booking and lifecycle cases. The disposable database accumulates two run-scoped accounts and their fixtures per run; volume cleanup remains a separately assigned lifecycle task. This T05 identity flow remains separate from the API `resetDatabase()` helper. The API helper always rejects reset on 6767/6768; its only allowed reset targets are exact 6769/6770 database pairs with both explicit consent variables. This removes FK cleanup assumptions and lets later T07 report/payout rows remain attached to their original enrollments.

Pure guard and identity tests pass. A transactionally isolated regression for the exact 6769 target is authored but was not run because the T07 worker owns the serialized database window. It checks that repeated T05 reset calls preserve cancellation spending and stub-payment rows, then rolls back its synthetic class fixture. No reset, migration, browser E2E or full typecheck was performed for this slice.

## V3 integration and local migration checkpoint (2026-10-20)

Feature worktrees derive from `f/release-v3`; tested work merges there, and
`main` waits for final acceptance. The `t3/integrate-v3-progress` checkpoint
was fast-forwarded into `f/release-v3` at `10a733cd`, combining fee/payout and
class drafts with FAQ rich text, calendar, palette and shared docs. The prior
dirty source is preserved in the named `v3 pre-integration source backup
20261020` stash; client artifacts remain in place and the old fee worktree is
unchanged.

Local startup on 20 October returned HTTP 200 from the web app on port 3000
and `/health` on port 3001, with database, Redis and scheduler checks healthy.
Class public-read commit `0a0ce408` registers `classes.list/get`, fixes the
detail route ID and removes the invalid argument to the repository factory.
The web typecheck now passes, as does the public DTO allowlist unit test.
Class publishing and review fixes are merged through `42e8358f`, with room
mock compatibility in `b353cb1d`. Author verification passed the class browser
journey, 9 Postgres cases / 51 expectations, provider units and all three app
typechecks. Parent additionally verified 113 room/tutor unit tests and the
entire API unit suite (2,486 tests / 5,845 expectations). Enrollment and the
downstream class delivery/report/cancellation flows remain incomplete.
Settlement through `de76a5b9` is merged into `f/release-v3`: session-specific
no-show allocations, completion/cancellation serialization, admin parent-hold
recomputation and finalization with cancelled children. Verification on the
integration branch passed 375 core unit tests (949 expectations), 7 no-show
Postgres tests (69 expectations), and web typecheck. The database suite used
only the guarded `cogito-test-settlement` database. Browser settlement coverage
remains open. Heavy typecheck/browser work is serialized after Windows
virtual-memory allocation failures. Class checks are finished; signup owns
the next heavy verification window.

Migration `0063_academy_class_meetings.sql` is applied to local development
and the class test database. Parent verified the dev table and migration hash
`f3c0a5888c23dc94ef487f8e4d9aca7052e338705ab34c9c62b3be207ccfb41e`
at timestamp `1792496861907`. Existing migration history was preserved.

Read-only verification now confirms both local `cogito-app` and `cogito-test`
have the same four fee, FAQ-rich-text, payout and class-draft migration hashes
in timestamp order, and both have the FAQ, fee, payout, class and class-session
tables. The parent applied only the additive class-draft migration to local
development after reviewing its SQL and journal state; this integration
worktree made no database writes, and the shared test database was not changed
for this checkpoint. Neither journal was rewritten and no historical fee
backfill was added. Exact timestamps, hashes and verification details are in
[`RUNBOOK.md`](./RUNBOOK.md).

The imported Playwright guard validates `NODE_ENV=test` and loopback
`cogito-test` before setup can reset or seed, loads the same resolved env file
for config and setup, requires dedicated free API/web ports with server reuse
disabled, and retains failure traces even at zero retries. Parent verification
passed its guard unit suite (7 tests / 32 expectations) and E2E typecheck; the
browser suite was not rerun against the shared test database. See the
[runbook](./RUNBOOK.md) for the guarded command.

## Tutor tax and payout checkpoint (2026-10-21)

T03 now has tutor tax-profile fields, configurable default and tutor override
rates, whole-IDR withholding, versioned selected-session preparation, manual
external-transfer recording, audited void/reconciliation, tutor-only finance
history, transactional notification/outbox writes, and saved-snapshot monthly
CSV. New payouts snapshot the bank, identity, tax rate and fee sources; legacy
aggregate rows remain unchanged and unbackfilled. Historical cutoffs now apply
only to those legacy aggregate rows, including unresolved allocationless voids
until audited reconciliation is resolved. Identical transfer retries return
the saved paid result without another audit or notification. Tutor payout
history and its notification list the covered booking number, type and date.
OPS01 tax-adviser confirmation remains a release operational gate, and the
defaults are not legal validation. Focused pure/unit checks in this review pass
passed 78 tests / 260 expectations across tax/profile, CSV, environment guard,
repository and test-client safety; two targeted booking-service tests passed
with 3 expectations. Changed-file formatting and lint passed with no errors;
existing warnings remain in the large booking modules. The isolated Postgres
and browser suites are authored but remain pending the assigned enrollment
verification window. The dedicated target is `cogito-test-payout` on loopback
port 6770 with Redis 6382, separate server/web ports 3111/3110, provider fakes,
and a named volume; it has not been started or written. Parent-integrated
enrollment migration `0064` is the generation baseline. T03 migration
`0065_tutor_payout_tax.sql` was generated from `0064_snapshot.json` at journal
timestamp `1792525224597` (SHA-256
`876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939`). The
parent confirms `0064` is applied to local development; this worktree has not
applied `0065`. No schema change is part of these review fixes; `0065` remains
gated on parent review and the assigned database verification window.

## V3 pre-account email signup checkpoint (2026-10-21)

REQ-AUTH-01 changes public email/password signup so no account exists before a
valid email OTP is proved. `POST /api/auth/sign-up/email-otp` sends a six-digit
code with a 60-second per-email resend cooldown; a resend replaces the prior
proof. The proof and cooldown commit in a short transaction before the server
calls the mail provider, so provider latency does not hold a database
connection or email lock. A failed delivery removes only the proof row created
by that request and returns an inline error. `POST /api/auth/sign-up/email`
requires the code and attempt UUID.
Account/session creation, proof consumption, and a 24-hour email/attempt outcome
record commit in one PostgreSQL transaction. Failed account creation rolls back
and keeps the proof reusable. The UI starts with an empty code, clears proof
when the email changes, shows inline send/verification errors, and checks
`POST /api/auth/sign-up/email-outcome` after an uncertain network response
instead of retrying account creation.

These custom POST routes validate `Origin` or `Referer` against the configured
frontend-origin policy. Auth path matching uses the same repeated-decoding,
slash-normalizing canonicalizer as the 10/minute/IP auth limiter, so encoded
separator, case, or trailing-slash variants share the same budget. The browser
keeps only its attempt UUID per normalized email in session storage to recover
after an address edit or reload; changing email still clears the visible OTP
and proof state. Auth logs omit OTP values, attempt IDs, passwords, and
password-reset URLs/tokens. Better Auth's email-OTP plugin also sets
`disableSignUp: true`, so its sign-in OTP route cannot provision an account
outside this transaction.

The proof uses the existing Better Auth `verification` table; this slice has no
schema, index, or migration change. The local OTP capture route is registered
only for `NODE_ENV=test` on loopback `cogito-test` and reads an in-memory code;
test mode suppresses signup and welcome mail. Existing-user verification,
password reset, tutor invitation claiming, and internal seed/provisioning remain
on their scoped paths. Welcome delivery is attempted once by the successful
consumer after commit and is best-effort. This completes only the REQ-AUTH-01
slice; Google pending-referral resume (REQ-AUTH-02), referral economics, and
Google-choice behavior remain outside this checkpoint.

The isolated browser run uses loopback PostgreSQL `cogito-test` on 6768,
Redis 6380, API 3201, and web 3200. See the [runbook](./RUNBOOK.md) for the
dedicated port overrides, migration, and guarded E2E command.

## Competition catalog language

**Parent competition**: A competition type, such as Debate, that owns the
on-demand pricing agreement inherited by its specializations.

**Child specialization**: A selectable topic under exactly one parent
competition, used to describe tutor expertise and the booked session topic.

**Archived competition/specialization**: A retained classification unavailable
for new selections; its existing assignments and agreements remain recognizable.

Owner-requested CRUD is specified in PRD S04 / REQ-COMP-01..07 and task T00A.
Implementation is in progress on the working branch; TASKS records verification
and remaining integration gates. The domain terms above do not imply release.

## Others activity articles (2026-10-30)

Activities Others now uses app-managed articles, replacing Sanity event reads and
the previous event detail/registration format. Admin `/activities` authors cover
URL, required English title/summary/body, optional Indonesian equivalents,
WIB start/end, location and publication. Rich text reuses the safe FAQ editor
(paragraphs, lists, bold/italic, links); registration links belong in the body.
The anonymous marketing consumer reads only published articles and derives
Upcoming/Completed from end time. Classes are unchanged. Migration 0077 adds
`activity_article`; applied only to local dev `localhost:6767/cogito-app`.
Published local example: `e7da3184-ec78-4ebf-9611-7d444842e82b`, Example: Ideas into
Action. It is labelled demonstration content and uses a nonfunctional example
registration link. No production deployment/data change.

## Activities website implementation (2026-10-26)

The marketing checkout `C:/.Projects/cogito-acad` now implements localized
`/en/activities` and `/id/activities`: the existing website heading treatment is
followed directly by Classes, then Others, without the preview's section-jump
links. Cohorts and Masterclasses share a catalog and type filters. The owner-requested
follow-up removes cover/placeholder images and uses compact My Bookings-style
rows: date tile, icon-led time/mode/tutor metadata, compact class title,
competition/session/price metadata and detail action. The follow-up matches
My Bookings text hierarchy and removes the large description paragraph.
Class rows read `/rpc/classes/list`, link to the corresponding app class detail,
and show schedules, tutor names, current rates and postponed status. The public
class DTO now includes nullable `titleId`/`descriptionId` for Indonesian fallback.
Others combines published legacy Sanity events into one article list; existing
event detail/registration behavior is retained and no category labels are added.
Desktop/mobile navigation links to Activities; the two legacy event category
routes permanently redirect to the same locale's Activities page. Fetch failure
and valid empty results have distinct messages. T10 is not complete: Others DB
migration/admin authoring, approved content and release acceptance remain open.

## Planned Activities page (2026-10-26)

Owner direction for pending T10: one Activities page with a heading matching the
other main website pages. Use two or three sections: Cohorts and Masterclasses
may be combined under Classes or kept separate, plus one Others section.
Others presents Simulation Days, Cogito 101 series, Monthly Townhall and similar
content together as an article-style list, without activity-type labels or
separate type subsections. Class sections continue to use app class records.
The presentation slice is implemented as recorded above; see REQ-CONTENT-01 and
the T10 Activities checklist in `docs/plans/active/RELEASE-V3-TASKS.md`.

## Marketing landing checkpoint (2026-10-19)

The separate `C:\.Projects\cogito-acad` branch `f/release-v3-nonvideo` has a
partial T11 implementation: the homepage Activities section and Activities /
Start Learning navigation are removed; existing `/events/[category]` routes
remain. School logos use a manually controlled horizontal strip with mouse,
keyboard and touch support. Testimonials use one responsive autoplay carousel;
compact screens add swipe while keeping arrows and dots. Hover/focus pauses it,
and reduced-motion settings disable autoplay and transitions. The methods-card
pulse is also motion-safe. A headless Edge production run checked 1280px,
1024px, 1023px, 768px, 470px, 469px, 390px and 320px, plus reduced motion. The
testimonial card surface fits its frame across those widths (including the
470px breakpoint), its controls remain below and separated from the card, and
the page has no horizontal overflow or client errors. Mobile navigation was
checked in `/en` and `/id`; touch hold pauses autoplay and swipe advances the
card. The browser pass exposed and fixed a mobile FAQ hydration mismatch by
deferring viewport detection until after the first render. Typecheck,
changed-file lint/format, diff check and production build pass. Static generation logged
connection-refused errors for the existing approved-achievements endpoint but
completed. Physical-device, screen-reader and client visual acceptance are still
pending; Why Cogito spacing is refined (16px from label to heading, 32px from
heading to cards) and checked at desktop and mobile widths in English and
Indonesian. The approved feature showcase remains open (M02/Q14). Track this
work in the T11 row and checkpoint in
`docs/plans/active/RELEASE-V3-TASKS.md`; do not infer release readiness from the
build.

## V3 checkout and booking snapshot checkpoint (2026-10-18)

Migration 0055 adds a nullable, separate customer activation pointer, immutable
15-minute student top-up quotes and payment quote/choice/label/pricing/provider
intent fields. Missing/null activation keeps legacy pricing. No activation UI or
RPC exists; draft saves never activate customer prices. New V3 top-ups lock the
quote before creating one payment, commit before provider I/O and retain its
identity on uncertain responses. Provider metadata writes cannot overwrite a
webhook's payment status. Custom and recommended choices both remain available.
Legacy purchases retain their existing retry flow while V3 is inactive; missing
checkout retries now use the payment's stored amount. Active V3 blocks new legacy
package sales while allowing existing owned pending attempts to be resumed.

Booking snapshots now distinguish untagged legacy fields from `engine:"v3"`
revision/competition/mode/headcount/Marks/IDR honorarium. New solo, group and solo
series creation uses the server-resolved parent slug; group repricing loads the
exact immutable revision pinned by the booking. Discovery and create-booking
preview project prices by the selected parent slug from the active revision. A
new parent slug without an active rate is rejected and cannot fall through to a
tutor's legacy base rate. With the activation pointer unset, the seven legacy
competition paths remain compatible. Active V3 group-series prices at target
headcount and pins the active revision; a viable partial group recalculates from
that pinned revision at confirmed headcount, adjusts each confirmed participant's
remaining scheduled-session hold, and updates booking/session snapshots before
reconfirmation. Activation-null legacy group-series and target-size-one solo
series remain unchanged. Tutor profiles
now return an active-revision fee projection for assigned parent competitions;
changed legacy `baseRatesIdr`/`prices` writes are rejected only while V3 is active,
and admin edit approval discards queued `baseRatesIdr`. Review submission reads
the pointer inside its status-update transaction: active V3 removes the legacy
fee requirement; a null pointer preserves it. With a null pointer, the projection
is null and legacy tutor rate writes remain compatible. Legacy
analytics fields are not V3 profitability; **do not activate customer pricing**
until the remaining acceptance gates are resolved.

Group-series slice verification: `bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/unit/booking.service.test.ts` passes **303 tests, 0 failures, 755 expectations**, including target-size creation, pinned partial-group repricing, reconfirmation and underfunded top-up preflight. The guarded integration command `bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/booking-group-series.test.ts` passes **9 tests, 0 failures, 55 expectations**, including a scheduled-session-only repository update check. Neither command sets the V3 activation pointer. The broader checkpoint below predates this slice. Earlier focused verification: 487 unit tests pass (1,391 expectations) across
pricing, booking, discovery and catalog behavior; 14 PostgreSQL integration
tests pass (93 expectations) across economy roles, catalog CRUD, top-up and
dynamic-parent admin. Coverage includes immutable replay, choice locking,
uncertain provider outcomes, early webhook, concurrent purchases, late credit,
dynamic active-rate selection and pinned-revision repricing. Web typecheck and
build pass. New balance UI has not yet received browser QA. Production and live
payment providers were untouched.

## V3 earned tutor session fee checkpoint (2026-10-19)

Migration `0059_massive_blindfold.sql` adds `tutor_session_fee`, an append-only
application record for the gross IDR honorarium earned when a tutor completes a
session. Completion writes it in the same transaction as the existing state,
Marks deduction, and feedback. Solo/group identity is the booking ID; each series
child uses its session ID, so a completed child is recorded while the parent
series remains scheduled. Stable event keys and unique source indexes prevent a
second fee row for the same delivery. The row pins tutor, scheduled/completed
timestamps, gross honorarium, and the booking/session price snapshot. Legacy
snapshots use their saved IDR honorarium or the existing `tutorShare × 7,000`
compatibility calculation; V3 snapshots use their saved IDR honorarium.

This is a delivery/earned-fee fact, separate from the manual bank transfer.
Tutor/admin payout summaries read fee events for the requested time window,
then use the legacy booking/session snapshot adapter only for sources without a
fee event. Source-key deduplication prevents a completed booking or series child
from being counted twice; this also makes a completed child visible while its
series parent remains scheduled. Pending summaries apply the paid cutoff to new
fees by `earnedAt` and retain the existing completion-time fallback for legacy
records.

Migration `0060_tutor_payout_allocations.sql` adds per-session source
allocations for newly prepared tutor payouts. The V3 payout workflow prepares
an immutable fee/profile/rate/bank snapshot before an external transfer, then
records only the exact net amount after that transfer. A filtered active-source
unique index and stable tutor/config locks prevent a delivery from being
reserved by two active batches. Void releases allocations but keeps payout and
transfer evidence; repayment stays blocked when external transfer evidence is
unreconciled. Existing paid aggregates remain unallocated and unchanged; their
original session breakdown is never backfilled or inferred. Tax defaults are
configurable and are not legal validation; OPS01 tax-adviser confirmation
remains an operational release gate.
The owner waived historical per-session reconciliation/backfill for unused V3;
no historical payout rows were changed. Class delivery/report/expiry integration
remains with T04/T06/T07 and is outside this payout implementation. This slice
does not change existing cancellation, no-show, expiry, or feedback rules.
Q03/Q06/Q07 and Q05 were resolved on 19 October; Q04's minimum/postponement
rules were accepted. The final 30 October decision implements ordinary rescheduling with a strict affected-session exit deadline before min(notification +24h, new start). Same-time tutor replacement creates no exit right.

Series completion and no-show now serialize on the parent booking, child
session, and participant rows. The existing session-specific no-show ledger
event marks that participant's allocation as already charged: a repeated
series no-show is rejected, and a later completion report skips that allocation
instead of consuming Marks held for future sessions. Other delivered group
seats still settle normally. A no-show ledger event alone does not prove
delivery or earn a tutor fee; the tutor must submit the completion report.
Malformed V3 snapshots with a missing or invalid `tutorHonorariumIdr` fail
before wallet/hold writes; an explicit zero honorarium remains valid.

Student and admin per-session cancellation now use the booking's reschedule
advisory lock, then lock and refresh the parent booking, child session, and
participant rows. Cancellation changes a child only while it is still
`scheduled`; a concurrent completion that commits first leaves the report,
fee, wallet, and remaining holds intact, and the stale cancel is rejected.
The shared advisory lock also serializes cancellation with proposal acceptance.

Focused verification: tutor-fee unit tests **4/4**, booking-service unit tests
**307/307**, admin-service unit tests **30/30**, solo booking integration
**12/12**, standalone group integration **8/8**, group-series integration
**9/9**, and payout/allocation integration **8/8** (**378 tests total**). Tests
cover pending source detail, fee-event and legacy snapshot allocations,
historical batch detail-unavailable behavior, completed-child visibility,
cutoff preservation, and the two-admin no-duplicate race. Server and web
TypeScript checks passed individually before the production-build attempts;
later reruns under memory pressure failed (server TypeScript-Go hit a Windows
allocation stack, and web TypeScript-Go exited 253 without a source diagnostic).
The full workspace check previously hit Windows `VirtualAlloc` errno 1455.
Production builds are not verified: server `tsdown` exited 253 without a source
diagnostic, and Vite could not allocate 27,648 bytes after transforming 8,875
modules. Retry checks/builds when memory headroom is available. No V3 activation
or external provider call was performed.

Settlement follow-on verification (2026-10-20): the focused real-Postgres
series no-show/completion suite passed twice (**12 executions, 112
expectations**), covering solo and group no-show settlement, repeat no-show and
completion, concurrent completion, the no-show/completion race, malformed V3
honoraria, and transaction rollback on fee insertion failure. The tutor-fee
unit suite passed **6/6**. Logs confirm the test meeting adapter was manual.
Browser E2E was not run for this settlement slice.

Review follow-up verification (2026-10-20): booking/admin service and repository
unit suites passed **447/447 tests, 1,153 expectations**. The settlement suite
passed **7/7 tests, 69 expectations**, including full-series completion after a
no-show and a lock-gated cancellation/completion race. Admin U6 passed **7/7,
70 expectations** across solo release/forfeit/partial cancellation and group
series release followed by completion; it asserts wallet, participant, and
parent holds plus terminal parent state. Existing G18 series completion passed
**8/8, 29 expectations**, and M4 student cancellation passed **1/1, 4
expectations**. Admin cancellation now recomputes the parent hold from remaining
confirmed/reconfirmed participant holds, excluding pending invitees. Series
completion finalizes the parent after every child is completed or cancelled,
then releases residual participant holds. These integration runs used the
retained loopback `cogito-test-settlement` database on port 6767; meeting
creation used the manual adapter and email delivery was not configured. No
browser E2E or typecheck was run for this follow-up.

## V3 class draft checkpoint (2026-10-19)

Migration `0061_academy_class_drafts.sql` adds the class and session draft model. The admin-only `admin-classes` page creates/edits drafts with localized titles/descriptions, cohort curriculum and enrollment defaults, per-session schedule/capacity/tutor/mode/room, and required audit reason. Approved defaults are cohort 20/22/25 Marks per full/half/single session with Rp400,000 tutor fee per session, and masterclass 5 Marks with Rp300,000 tutor fee. Both online and in-person are available; in-person requires an active managed room. Drafts are not public and do not reserve rooms.

The service validates active competition, published mode-compatible tutors and session capacities, active room capacity, non-overlapping class sessions, cohort curriculum/check date, and the one-session masterclass rule. Draft updates are optimistic-versioned and preserve supplied session IDs; audit actions are `academy_class.draft_created` and `academy_class.draft_updated`. The admin editor uploads PNG/JPEG/WebP/GIF covers through the existing protected upload flow (max 5 MB) and stores the returned key on the draft; approved M01 cover/curriculum assets remain pending. Publication-time room/tutor conflict checks, Meet setup, admin publish controls, and T05 student enrollment are implemented. At this dated 19 October checkpoint, T02 delivery fees and T06 cancellation remained separate work. T07 report settlement, class payout identity, and the role-based report workspace are implemented; PDF, reminders, and the dedicated on-demand admin correction workflow remain pending.

Focused integration verification: **4/4 tests, 18 expectations** against the guarded local `cogito-test` database after additive migration. A server TypeScript-Go check attempt again failed with Windows `Out of memory`; Vite build and web typecheck have not been rerun for this slice. No production database, V3 activation, or external provider was used.

## V3 published class read contract (2026-10-20)

The public `classes.list` and `classes.get` procedures expose published classes only. Their explicit DTO includes student catalog fields, the published class-plan rates and tutor display name, while omitting tutor identifiers and account fields, tutor fees, room details, admin version/audit fields, and student roster data. A missing or unpublished detail is returned as not found. The catalog and detail pages consume this contract; signed-in students use the separate T05 enrollment procedures and never receive another student's records.

## V3 class publication and meeting setup checkpoint (2026-10-20)

Admin can publish a versioned class draft after the service rechecks active competition ancestry, published tutor assignments and delivery mode, future session times, cohort minimum/curriculum, managed-room capacity and conflicts, and the approved tutor fee (Rp400,000 per cohort session or Rp300,000 per masterclass session in either mode). Publication marks sessions scheduled, writes audit state, deduplicates one tutor notification per class, and creates one durable meeting job per online session in the same transaction. In-person sessions use managed rooms and have no Meet job.

Migration `0063_academy_class_meetings.sql` adds the per-session meeting job/status record. Provider work runs after commit under a claim lease with exponential retry; stable Google event IDs recover an event after an ambiguous provider response. If Calendar accepted an event but Meet URL generation is still pending, the job remains retryable and the next attempt fetches that same event ID instead of inserting another. Admin can retry failed setup. Test mode uses a controlled local adapter; no Google Calendar call is made in tests. The admin Class studio exposes draft/edit/publish controls and failed-meeting retry. Public list/detail pages use the allowlisted DTO; the student detail route shows the separate T05 enrollment panel only to signed-in students. T04 still depends on T02 delivery/fee and T07 report integration. T06 lifecycle is integrated into Release V3; its admin view merges the published and postponed query snapshots by class ID and retains the highest-version record so one current card and its existing actions remain during refresh. Absence/expiry handling and approved client curriculum and cover inputs remain separate.

Publication takes the competition-catalog lock, sorted tutor locks, and sorted room locks before fresh row-locked reference reads. Catalog archive, tutor status, and room update/deactivation use the matching locks so publication cannot validate stale mutable references. The class publish API suite passed 9 tests / 51 expectations, including gated room-capacity, room-deactivation, and catalog-archive races. The admin-to-public Chromium journey passed 1 spec and covers pending-link retry, hidden drafts, role denial, empty/error states, and DTO privacy. Migration `0063` is applied only to isolated `cogito-test`; dev migration review remains with the parent. At this 20 October checkpoint, T04 remained in progress for enrollment, class absence/cancellation/report/expiry integration, and approved client curriculum/cover inputs. This checkpoint is not a V3 activation or release gate.

## V3 report-field character limits (2026-10-18)

REQ-REPORT-01 now applies to new on-demand/series completion submissions:
600 Unicode code points total per field across all normalized bullets, counting
one LF between nonempty lines. Shared `booking/feedback-rules.ts` normalizes CRLF,
strips UI bullet prefixes, trims line edges and removes empty lines. UI counters,
submit gating, RPC schema and direct service validation use the same rules.
The service rejects overlong input before settlement instead of silently slicing
30 bullets/1000 characters. New report text is stored as canonical plaintext;
React text output remains escaped by React. Reads return canonical plaintext unchanged; no legacy entity decoding or synthetic history snapshots remain. Corrections require the existing version history event and record the real admin/tutor actor.
Class report settlement is implemented in the T07 backend. The role-based report
workspace is documented below; PDF remains pending. On-demand booking reports
are in the isolated source continuation above. Legacy reminder coverage is
implemented in the 23 October continuation below, with its verification state
recorded there.
Focused report + booking regression: 295 tests pass; web typecheck passes.

## V3 class session reports and payout identity (2026-10-21)

The `class-enrollment.reports.ts` service implements private class-session
reports with immutable revisions and atomic settlement of remaining funded seat
Marks. It writes the fixed tutor fee only when at least one funded seat is
chargeable, preserves report access for funded students after settlement, and
keeps cancelled parents cancelled while allowing retained past sessions to
settle. Corrections append revision/audit history without replaying wallet or
fee effects. The payout source model supports a nullable booking plus real class
session identity, delivery label, and collected-Mark snapshot; class earnings
use the existing exact-net and allocation workflow without fabricated booking
price data. Migration 0067 is applied only to the guarded disposable test DB on 6769. The role-based `/class-reports` workspace uses Selia controls, normalized
600-code-point feedback, delivery confirmation, draft-preserving version conflicts,
and settlement preview/readback. The shared page supports versioned admin edits
with a required reason; the dedicated on-demand admin correction workflow remains
pending. Reminder verification passes 7 fake-clock unit tests / 25 expectations
and 3 guarded, non-reset PostgreSQL tests / 34 expectations on loopback
`6769/cogito-test`. It covers current/next-day/catch-up periods, concurrent
processors and one email-outbox row per period, report and parent-cancellation
races, cancelled/completed exclusions, transactional rollback/retry, and unchanged
wallet, allocation, ledger, fee, report and session facts across reminder writes.
Whole-class cancellation leaves a retained past scheduled session eligible until
its report is submitted; cancelled/completed sessions and completed classes stop.
At this class-reminder checkpoint, the legacy solo/group/series reminder policy
was unchanged; separate coverage was added in the 23 October continuation below.
PDF remains open. Tutor, admin, and student browser acceptance
passes against real RPCs, as do web and E2E no-emit typechecks from the earlier
report implementation checkpoint. This reminder verification used no browser,
live email or external provider and required no migration.

## V3 draft economy editor and revision storage (2026-10-18)

Branch `f/release-v3` starts at `14dc4486`, verified equal to fetched origin/main.
T01 includes editable packages/surcharge/competition/session adjustments, pure
pricing calculations, admin get/preview/save RPCs and an English Selia draft
editor in `/admin-economy`. Migration 0054 adds immutable revision storage.
Save uses transaction advisory lock, expectedVersion and transactional audit.
Reads return virtual defaults at revision 0 before first save. Q13 is resolved
by the project owner: custom and recommended package remain selectable, with
tiers following package Marks and unit prices plus surcharge.

All current catalog parents now appear in the Economy editor; superseded
migration 0027 seed rows are excluded. Additional parent rates are blank until
both values are entered, then saved only in an immutable draft revision. A
PostgreSQL integration case verifies this admin path and confirms
the activation pointer remains unset. Active booking/discovery code now reads
the selected competition rate, rejects unconfigured new slugs, and reprices V3
bookings from their pinned revision. Customer prices still use the legacy path
while the pointer is unset. Tutor profile reads now project active V3 fees by
assigned parent and group size; tutor writes to changed legacy rates are rejected
only after activation, while admin approval ignores queued legacy base-rate
proposals. Active V3 group-series pricing and partial-group repricing are
implemented in the later checkpoint above. Analytics interpretation, website
catalog projection, release acceptance and explicit customer activation remain
pending. No historical records were repriced and no provider or production
write was made.

Tests: 487 focused unit cases pass (1,391 expectations) across V3 math/config,
booking, discovery, catalog, pricing and admin regression. Web tsgo passes with
GOMAXPROCS=2/GOMEMLIMIT=768MiB. PostgreSQL suites pass: economy roles 7/26,
catalog CRUD 4/53, V3 top-up 2/9 and dynamic parent-rate admin 1/5. They verify
single-winner CAS, immutable history, audit rollback, legacy pricing unchanged,
role denial, catalog palette/readiness behavior and a saved dynamic rate with no
activation. Migrations 0054–0057 were applied only to isolated `cogito-test`;
no production migration was run. Browser QA verified
draft load/save/reload, missing-reason and invalid-rate save gating, stale-version
conflict recovery, 440 Marks equality recommendation, and 390px card/table fit.
The report dialog was checked at exact 600 and over-limit 601 code points; no
report was submitted. Screenshots: `tmp/v3-admin-440.png`,
`tmp/v3-admin-mobile-fixed.png`, `tmp/v3-report-600.png`,
`tmp/v3-report-601.png`. Customer pricing remains on legacy economy because the
activation pointer is unset. Booking/payment snapshot code and dynamic price
reads are implemented, while analytics, website catalog projection, release
acceptance and activation remain pending.
Evidence: docs/plans/active/RELEASE-V3-TASKS.md.

Latest combined focused verification: **642 API unit tests, 0 failures, 1,667
expectations across 10 files**; web typecheck/build and the narrow V3 pricing
TypeScript project pass. The API package-wide typecheck remains unverified;
existing test-fixture diagnostics fall outside that narrow check. No activation
pointer was written.

## SnapCN video tooling (2026-10-18)

`apps/video` is an isolated Remotion workspace for SnapCN video compositions.
It registers the 3-second `CogitoIntro` starter using vendored `text-reveal`
and core source (revision/license recorded inside the workspace), shares
Cogito CSS tokens/fonts, and configures `@/` in TypeScript and the bundler.
The project-local catalogue skill lives in `.agents/skills/snapcn/`.
Root `video:studio`, `video:still`, and `video:render` delegate through Turbo.
Video exports stay in ignored `apps/video/out/`. Application UI remains Selia.
Shared UI now declares the font packages imported by its own global CSS.
Typecheck passed; bundle/render verification is blocked by a full C: drive
(ENOSPC during first Chromium download). Re-run after freeing space.
Setup/verification status: `docs/plans/active/SNAPCN-SETUP.md`.

Last updated: 2026-10-19

## Grafana SQLite eval-storm + WAL fix (2026-10-09)

Daily `alertname=DatasourceError` notification bursts for BackupStale, MemCrit,
and the other Cogito rules were rule-evaluation failures, not condition firings:
Grafana's internal SQLite ran in default DELETE journal mode, a silent in-process
write transaction started ~17:52 UTC daily (76–237 lock errors in the
17:52–17:57 UTC window from Oct 4; nothing Oct 1–3), and with a ~1-retry budget
every 1-minute rule evaluation failed with `database is locked`. Host
diagnostics ruled out resource pressure (sar calm at the window), external lock
holders (only the Grafana process mounts `grafana-data`), and data growth (DB is
~1.5 MB); the holder is an internal Grafana transaction, exact origin unverified.
Fix: `GF_DATABASE_WAL=true` + `GF_DATABASE_QUERY_RETRIES=3` on `cogito-grafana`
(`infra/ansible/observability.yml`) — WAL lets rule-evaluation reads proceed
during any long write and retries absorb residual contention (the Grafana
staff-recommended fix for the identical grafana#68941 signature). If nightly
residual errors appear, enable `[database] log_queries` for one day to name the
transaction. The same change corrected the backup/watchdog cron documentation:
Debian cron ignores `CRON_TZ`, so the crons fire in UTC (02:00/03:30 UTC =
09:00/10:30 WIB), and the no-op `CRON_TZ` env lines were removed from the
playbooks.

## Student dashboard balance CTA fit (2026-10-02)

The compact student dashboard balance widget keeps **Find a tutor** on one line
by giving the primary CTA the available flexible width. Its secondary dashboard
CTA remains a 38px icon-only link using Tabler's `IconCashPlus`; the link keeps
the accessible name and native tooltip title **Top up**. The Balance page still
renders its labeled CTA because it has no competing secondary action. This is
frontend-only and changes no RPC, schema, or persistence contract.

## Nightly backup CRLF incident + hardening (2026-09-30)

The nightly backup failed Sep 28–30 during `dump` (`pg_dump: FATAL:
database "postgres\r" does not exist`). Root cause: the Sep 27 Infra Apply
run for PR #278 rewrote `/etc/cogito/backup.env` with CRLF line endings (a
vault edit), and bash `source` keeps the trailing `\r` inside values. Fix
was VPS-side `sed -i 's/\r$//'` plus a manual green run (`backups/2026-09-30.sql.gz`,
27K, R2 head-object confirmed). Hardened in-repo: `sops -d | tr -d '\r' |
grep -E` in `infra/ansible/backup-cron.yml` + `disk-watchdog.yml`, and a
one-spot trailing-`\r` sanitize guard at the top of `infra/backup.sh` +
`infra/disk-watchdog.sh` (before any use of the values). Detail + remaining `sops -d | grep` follow-ups: `docs/plans/active/BACKUP-CRLF-HARDENING.md`.
Not a container-IP problem: the vault keeps the private hostname and the
script resolves it at runtime (see Vault note in Deployment wave state).

## Production Knowledge Bank iframe CSP (2026-09-29)

Production serves the Knowledge Bank PDF from `api.cogitoacademy.id` inside
the web app at `app.cogitoacademy.id`. The web nginx CSP must therefore allow
that API origin in `frame-src`; the API response separately restricts its
allowed parent with `frame-ancestors https://app.cogitoacademy.id` and omits
`X-Frame-Options` only for the protected file route. Without the parent
`frame-src` entry, Chromium reports that the PDF content is blocked even when
the authenticated API response and PDF are valid.

## Complete tutor profile change history (2026-09-29)

Every successful tutor profile save, including canonical account-name changes,
writes one audit entry with complete
`beforeState` and `afterState` snapshots of the profile, even when one small
field changed. `details.changedFields` identifies changed leaf paths for quick
scanning. This covers direct-live fields, review-gated proposals, specialization
IDs, and profile photos. Revisions to an existing proposal compare against the
previous proposed value rather than the public value. Admin approval history
also snapshots the complete profile after promoting pending fields. The admin
review timeline expands changed fields into exact before/after values and keeps
photo previews in the same general history. The pending comparison panel is
labeled **Fields awaiting approval**, lists only actual added/changed/removed
review-gated fields, and distinguishes those proposals from direct-live edits.
The full review history appears alongside the profile review sections and keeps
direct-live edits, status transitions, and photo previews visible together.
Profile, account-name, subject, photo, and audit writes share one database
transaction. Reverting the final pending proposal clears both
`pendingProfileChanges` and `profileEditStatus` instead of leaving an empty
review task.

## Knowledge Bank PDF drawer (2026-09-29)

Knowledge Bank PDF previews now use a responsive Selia drawer: bottom sheet
below `sm`, right-side drawer from `sm` upward. The browser-native PDF iframe
is no longer sandboxed because sandboxing blocked native PDF viewers in some
browsers. The protected file proxy, role and Marks checks, CSP frame allowlist,
and new-tab fallback remain unchanged. This drawer disables backdrop blur to
avoid Chromium compositor artifacts after its native PDF viewer finishes loading.

## Automatic admin override financial policy (2026-09-28)

Emergency overrides now derive their financial outcome from the selected category instead of asking the admin to separately choose Marks handling or participants. `student_no_show` forfeits every student's held Marks and keeps the tutor eligible for the booking's normal payout. `tutor_no_show`, `medical_emergency`, `technical_failure`, `admin_correction`, and `force_cancel` return student holds and make the tutor ineligible for payment. Every student participant and the booking's assigned tutor are included in notifications automatically, even when no tutor participant row exists. The responsive drawer presents the category policy in an info/warning notice, separates student wallet effects from tutor payout effects, and shows a read-only participant roster with avatars, roles, confirmation state, and held Marks. It opens from the bottom on mobile and from the right on desktop, with an independently scrolling body and fixed action footer. The review card exposes booking-state, wallet-balance, and tutor-payout before/after outcomes through a compact info preview. Override metadata records the resolved policy. Legacy API callers may still send explicit `marksAction` and `affectedParticipants`, but the web flow always uses the category policy.

## PostHog browser analytics and auth attribution (2026-09-27)

The web app initializes one provider-scoped PostHog browser client from
`VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` when both
values exist. It captures browser exceptions, PostHog Logs records from the
three instrumented success paths, and the product event contract for auth,
booking, tutor onboarding, lifecycle, and session-completion actions. Events
carry the Better Auth `user.id` identity after session resolution; event
properties contain no personal data. Missing config is a loud development
error and a production no-op that preserves the existing error boundary. The
Playwright web server runs Vite in `test` mode, where the same disabled client
keeps analytics config from blocking seeded browser tests.

Google OAuth passes separate Better Auth `callbackURL` and
`newUserCallbackURL` values. The frontend callback stores the resolved outcome
(`signed-in` or `created`) in session storage, then `PostHogIdentity` identifies
the user before capturing `account_signed_in` or `account_created`. Email
authentication uses the same handoff, so both methods include the correct
`authentication_method` without an anonymous auth event. The web Docker build
accepts the public PostHog values as build args; production CD supplies them
from GitHub Actions secrets. This is frontend/deployment configuration only; no
RPC, schema, or server event contract changed. Delivery still requires browser
smoke verification in PostHog.

## Role-based dashboard analytics (2026-09-25)

Student and tutor dashboards now show action-oriented insight cards sourced
from protected `booking.listMine` counts: needs action, upcoming, completed,
and problem outcomes. Students also see verified achievement count from
`achievement.stats` and a wallet-readiness CTA; tutors see active availability
windows from `tutor.listAvailability` and the nearest available action deadline.
Tutor dashboard's **Needs action** queue uses `booking.listMine({ view: "action" })`,
matching the Bookings page instead of locally selecting only tutor-review requests.
Admin Business insights show selected-period counts by saved pricing engine
(V3, legacy, other, or missing). Booking-derived money totals are omitted because
parent booking and per-session snapshots use different units across solo, group,
and series records, and V3 does not snapshot a gross service IDR or platform take.
Counts use booking creation date and include all booking states. Do not estimate
service totals using the current Marks rate. The finance card below uses successful
top-up payment and refund records for realized top-up revenue.
Admin `/dashboard` shows queue counts for escalated bookings, booking
exceptions, tutor reviews, and achievement reviews using existing admin reads.

Admin Business insights labels are explicit: the booking-state portfolio is
all-time/live, selected-period trends use WIB calendar days, and the pricing
snapshot mix counts booking records rather than sessions. Booking-derived Marks,
IDR, and platform-share totals remain gated on Q15; successful top-up payments
less refunds remain the cash-revenue source.
`activeLearners` remains proposer-based and is rendered as **Active booking
proposers** until group-participant and login-activity definitions are approved.
Admins can use 7/30/90-day presets or an inclusive custom WIB range of up to
366 valid calendar days; impossible dates are rejected at the RPC boundary.
Account insights separate current/rolling snapshots from selected-
range metrics: total accounts and current student Marks ownership are current;
MAU, inactivity, and churn use rolling 30-day auth-session activity; signups and
realized top-up revenue use the selected range. Paid conversion is lifetime
students with a `PAID`/`SETTLED` top-up divided by all student accounts. Gross
range revenue uses successful payment `updatedAt` as the available settlement-
time proxy, while refund rows are reported separately and subtracted for net
top-up revenue.
During mixed frontend/API rollout, older analytics responses without
`businessSummary` keep the existing admin dashboard usable; account and revenue
cards appear once the updated API is active.
No new RPC endpoint was added. Remaining plan work: tutor capacity/payout
analytics and admin payment, funnel, supply-demand, and SLA aggregates.
Booking date copy uses `WIB` for `Asia/Jakarta` instead of `GMT+7`; other
timezones retain native Intl labels. A dashed border trial on shared empty
states was reverted and is not part of the current visual system.

## Competition Calendar stable event lanes (2026-09-23)

Month-view competitions keep one vertical lane across every day they span within
a calendar week. A lane becomes reusable only after its previous event ends, so
continuing events no longer jump above or below adjacent events when crossing a
date boundary. This is frontend-only; API, schema, and persistence contracts are
unchanged.

## Tutor onboarding form layout (2026-09-23)

Tutor onboarding fields use a responsive label-and-description column on the
left and control column on the right, stacking on narrow screens. The shared
layout covers profile, teaching setup, payout, evidence, education,
achievements, and experience entries, including add/remove actions
and validation messages. Teaching setup and payout account cards now run as one
full-width sequence instead of side-by-side cards. Specialization categories
and options use one vertical column to preserve readable labels. Teaching
capacity selectors and base-honorarium steppers fill the available
control-column width. Profile photo editing now lives inside the Public profile
section. Entry delete actions use a dedicated right-aligned action row instead
of overlapping the fields. The canonical profile contract uses
`education`, `achievements`, `experiences`, and `affiliation`; migration
`0051_short_hobgoblin.sql` removes the old structured field names and pending
keys.

## Tutor class capacity preferences (2026-09-22)

Tutor profiles store separate online and offline maximum class sizes from 1 to
6, defaulting existing tutors to 6. The tutor profile editor labels size 1 as
private-only; capacity changes take effect immediately for new bookings and do
not alter existing bookings. Discovery exposes both limits and omits pricing
rows above each modality's capacity. The booking form caps invitees and explains
the active modality limit, while `createGroup` and `createGroupSeries` enforce
the same limit server-side with `BOOKING_TUTOR_CAPACITY`. Migration
`0050_tutor_class_capacity.sql` adds the two checked columns.

## Tutor weekly availability date range (2026-09-22)

The tutor `/availability` weekly-hours form exposes separate **Start date** and
**End date** Selia date pickers. Both dates are inclusive, must start no earlier
than tomorrow in Asia/Jakarta, constrain each other, and keep the existing
52-week server limit. Saving sends the selected start through
`effectiveFrom` and the selected end through `repeatUntil`; the weekly weekday,
time, and modality rules are otherwise unchanged. This is a frontend exposure
of the existing `tutor.replaceWeeklyAvailability` contract and requires no
schema or RPC shape change.

Date overrides may include today so a tutor can publish a later slot on the
same day. The client compares each selected start minute with the live clock
and rejects starts that have already passed; the API's existing future-date
validation remains the authoritative backstop.

## Temporary Knowledge Bank access grants (2026-09-18)

Admins can open `/admin-knowledge-bank` to grant a student access to Knowledge
Bank by email without the normal 35-Mark minimum. Each student has one optional
grant with an admin-selected future expiry and note. The wallet/content gate
checks that expiry on every request, so expired grants immediately fall back to
the normal Marks rule without a cleanup scheduler. Admins can edit or remove a
grant; create/update/remove actions are audit-logged, while removal deletes
only the live exception. The create dialog resolves students through the
admin-only `admin.searchUsers` lookup and requires selecting a student result,
so operators do not have to enter an email address blindly. Its expiry control
uses the shared Selia calendar plus the cross-browser minute time picker; new
grants default to 30 days from today at 23:59 in the operator's local timezone.
The grant table is contained by its Selia card: filters keep normal card
padding, while wide columns scroll horizontally inside the card at narrow
viewports.

## Offline Calendar room metadata (2026-09-18)

Offline booking Calendar events now prepend the assigned room metadata to the
description: `Site: {room.location}` followed by `Room: {room.name}`, then the
existing tutor/student, session-topic, Session Notes, and booking-link content.
The same description is sent through the Google Calendar API when an existing
offline event is refreshed during room assignment or relocation; no database
column or public RPC response changed.

## Competition Calendar agenda list (2026-09-18)

The authenticated calendar's 30-day Agenda is a flat list rather than a
day-grouped rendering. It keeps competitions overlapping the selected period,
renders each competition id once, and orders the items by the competition's
first event date. Each item still shows the complete start/end range. This is
frontend-only and does not change the protected `content.listCompetitions`
contract, schema, or persistence behavior.

## Session completion feedback (2026-09-17)

Tutor `completeSession` now requires 3 bullet-list sections (Session discussion, Strengths observed, Areas for improvement; each textarea line is one bullet and Enter adds another). Booking detail shows the booking's read-only Student notes (`learningGoal`), while `CompleteSessionDialog` is reserved for tutor feedback. After completion, the page refreshes and shows the persisted Session feedback directly below Student notes in the same Session overview block. Backend stores one `session_completion_feedback` row atomically per completion (per session for series) and exposes `booking.listCompletionFeedback` to student/tutor/admin. Admin payout drawer points to it as payout consideration. Migration `0046_session_completion_feedback.sql`.

## Session notes API compatibility and booking feedback UI (2026-09-18)

The completed-booking Session notes card is no longer rendered in the web UI because the product surface now uses read-only Student notes plus tutor-authored Session feedback. The former rich-text editor, toolbar, preview, Add note control, and client-side note renderer were removed. The protected `addSessionNote` and `getSessionNotes` procedures remain available for API compatibility and legacy data; the web client does not query or render them.

## Tutor completion queue in Needs action (2026-09-18)

The shared booking list now treats an ended `scheduled` booking as a tutor
action. For a single or group booking, the row enters **Needs action** when
`scheduledEndAt` has passed and remains there until the tutor completes it. For
a series, the same rule is evaluated per `booking_session`, so a parent series
appears when any scheduled child session has ended, even if a later session is
still upcoming. This completion predicate is tutor-only; students do not see a
false completion task. The server applies the same predicate to action,
upcoming, history, and facet counts, and the sidebar badge requests the action
view so it stays in sync. No RPC input, response shape, schema, or lifecycle
transition changed.

## Observability alert-latch fix + Important Logs board (2026-09-14)

The CpuHigh 80% alert kept firing while live VPS CPU sat at 28–45%.
Root cause: every Grafana alert query filtered in PromQL/LogQL (e.g.
`... > 80`), which returns an empty vector — not 0 — when healthy, and the
blanket `noDataState: KeepLast` (2026-09-07) then held firing forever.
All 14 rules in `infra/grafana/provisioning/alerting/rules.yaml` now use
zero-safe queries (thresholds in the C step) with `noDataState: OK`
(= Normal state; file-provisioning enum is `NoData`/`Alerting`/`OK` — the
first cut used invalid `Normal` and crash-looped Grafana on boot until
corrected);
`TargetDown` additionally excludes the by-design-DOWN
`cogito-api-internal` job. Three never-fire bugs fixed in the same file:
TargetDown (`0 > 0`), DiskForecast (negative forecast vs `> 0`), BackupStale
(`lt 1` with `or vector(0)`). The payment-only **Payment Logs** board is
replaced by the general-purpose **Important Logs** board
(`infra/grafana/provisioning/dashboards/important-logs.json`: traceId/userId
trails, errors, bookings, webhooks, scheduler/DLQ, meetings, plus payment
boot-line / test-gate / provider-stat panels — all `action=` strings
grep-verified); delete the stale standalone board once in Grafana
(`disableDeletion: true` keeps the provisioned copy). No app code, RPC,
schema, or persistence contract changed (merged #249 + #251). See RUNBOOK →
Monitoring & Alerting.

## Achievement summary presentation (2026-09-09)

The student `/achievements` page renders Total, Approved, and Pending counts in
one compact three-column Selia card at every viewport width. The page component
and file use the correctly spelled `AchievementsPage` / `achievements-page.tsx`
names. This is presentation-only and changes no RPC, schema, or persistence
contract.

## Role- and time-aware dashboard greetings (2026-09-08)

The student, tutor, and admin dashboards now share `DashboardWelcomeCard` and
the pure `dashboard-greetings` phrase engine. It selects from distinct copy for
morning (05:00–10:59), midday (11:00–14:59), afternoon (15:00–17:59), and
evening (18:00–04:59) in the browser's local time. Each role has its own title
pool, while the supporting line can reflect an upcoming student lesson, tutor
review queue, or admin priority workload. A random choice is captured once per
card mount, so ordinary query updates and re-renders do not make the greeting
jump. Student and tutor titles use the account's first name; admin titles
deliberately use the fixed label `Admin` instead of the account name.

## Unified booking-detail actions (2026-09-08)

The booking detail header is now the single action zone for propose, cancel,
review, complete, reschedule decisions, invitations, reconfirmation, and
lateness reporting. Lifecycle states that need explanation replace the generic
state description with concise contextual copy. The old sticky-rail Booking
actions card is removed; Student notes and tutor Session feedback live in the
Session overview, while support reports remain in the main flow. Lateness
reporting is an accessible icon-only secondary action. This
supersedes older placement notes below that refer to contextual booking actions
in the sticky rail. The user-facing state timeline is labeled **History**;
internal state-history and activity component names remain unchanged.

## Competition field palette and catalog CRUD (2026-10-18)

The working branch adds versioned admin CRUD to the existing two-level subject
catalog. Parents own four configurable OKLCH values: light text/background and
dark text/background. Children inherit all four and cannot store overrides.
Creating a parent requires all four colors; patching a subset preserves omitted
values. Migrations 0056 and 0057 were exercised against the guarded local test
database, preserving existing IDs/slugs/active flags and the seven current plus
seven legacy 0027 palettes. Production migration and complete UI acceptance remain
release gates.

Admin writes use a transaction-only shared catalog lock, optimistic row versions,
and before/after audit records with a required reason. New parents begin inactive
and cannot sell until dynamic pricing is configured. Archiving a parent preserves
child flags and historical assignments, labels, booking/session price snapshots,
and financial terms. Delete and child-move eligibility includes historical tutor
profile audit snapshots. The guarded Postgres suite proves both assignment/delete
orders: assignment-first makes deletion conflict on the resulting reference, and
delete-first makes the queued assignment fail selection validation. It also
proves both booking/archive orders over `booking.sessionTopic`: booking-first
preserves category/specialization IDs and slugs and appears in archive impact;
archive-first makes the queued booking fail with `BOOKING_NOT_EDITABLE`. A
stale concurrent admin edit waits behind the first versioned update and returns
`CONFLICT`, leaving one mutation audit. `bun test --timeout 30000 --env-file
apps/server/.env.test packages/api/src/tests/integration/competition-catalog.test.ts`
passed 6 tests/72 expectations. Sequentially,
`bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/v3-dynamic-competition.test.ts`
passed 1 test/5 expectations and left the V3 activation pointer unset. The
focused Chromium browser journey in `packages/e2e/src/specs/competition-catalog.spec.ts`
passed child-slug search, archive impact preview/confirmation, restore, and
moving an unused child while checking its inherited destination palette. It
exposed that a child-only search result was omitted from the parent-grouped
tree; the admin catalog now includes the matching child's parent as context.
Full app regression and website projection remain in T00A/T10/T12 acceptance.

The focused palette resolver uses stable catalog IDs first and exact stored slugs
second, including archived entries for historical displays. Only the content
boundary maps the seven known legacy Sanity aliases. Unknown historical content
uses the neutral compatibility palette. API projections provide parent colors to
calendar and booking read models without changing their saved names, prices, or
other financial terms. App surfaces now receive configured light/dark values
instead of relying on the fixed seven-type class map; see T00A for the remaining
typecheck, browser and release acceptance gates.
The separate `C:\.Projects\cogito-acad` marketing site uses app catalog parent
palettes for public tutor specialization badges. Its calendar migration remains
part of the planned T12 content work; do not expose inactive catalog rows through
a new broad public endpoint to bridge that gap.

## Public tutor website source (2026-10-19)

The app exposes anonymous `publicContent.tutors.list` for the marketing site's
server-side tutor directory and landing cards. It filters on the existing published tutor
status and maps a strict profile/catalog DTO with optional Indonesian catalog
names and the parent category's light/dark palette inherited by each subject.
Inactive child or parent catalog rows are filtered from the public projection;
empty results remain `[]`, while API/database errors remain errors. The selection and mapper exclude account
IDs/emails, prices, payout and tax details, consent, review state, and unknown
future fields. `profileImageUrl` is the canonical `user.image`; `modality` is
teaching format. The tutor schema has no physical tutor-city field, so the API
does not emit `locations` or derive a location from modality. The marketing site
now filters by Online/Offline modality, with `both` matching either choice, and
builds its competition-field filters from active parent categories in the public
tutor results. Public tutor pages use a no-store API adapter and show an
unavailable state on request failure; they do not fall back to Sanity. Tutor
profile copy follows the current app's English-only fields, while Indonesian
catalog labels are used when available and otherwise fall back to English. See
[T10 public tutor API checkpoint](plans/active/T10-PUBLIC-TUTORS-API.md). Before
release, reconcile the intended public tutor roster with published app profiles;
the website read does not migrate or fall back to Sanity tutor data.

## FAQ admin and public API slice (2026-10-19)

FAQ management is consolidated into `/faq`: admins get All/Active/Inactive
filters, add/edit controls, a desktop split editor and a mobile drawer. Dirty
drafts are guarded on close, switch and navigation. Students/tutors retain the
read-only public view. `/admin-faq` and its duplicate sidebar item are removed.

The app FAQ uses one medium-sized FAQ heading and the same full-width layout
as bookings. Rounded question rows expand inline with circular plus/close
controls; answer spacing sits inside the panel's 250 ms height transition so
closing reaches zero height. Reduced-motion preferences disable the transition.

The app `/faq` question/answer section uses separate rounded accordion rows with
theme-accent collapsed surfaces, card surfaces when expanded, and circular
plus/close indicators. Existing heading text and FAQ content remain unchanged.

FAQ entries are owned by the app database and edited by admins at `/faq`. Authenticated students and tutors read active FAQs at `/faq` through the anonymous public projection and Selia accordion; admins use the admin projection and editor on the same page. The sidebar exposes FAQ to all app roles and uses a single FAQ link for all roles. Migration `0059_faq_rich_text.sql` adds rich JSONB documents while preserving and backfilling the legacy question/answer columns. The English question and answer are required; Indonesian fields are optional and hidden in the new-entry form until requested. The admin editor supports bold, italic, safe links, and ordered/unordered lists. Admin rows are alphabetized by the English question and show their modified date. The `showOnLanding` selection is limited to six active entries and serialized in the database transaction.

The anonymous `publicContent.faq.list` endpoint keeps the legacy plain-text `question`/`answer` fields and adds locale-selected `questionRich`/`answerRich` documents; the additive fields preserve existing consumers. Entries remain alphabetized by the question displayed for the requested locale, and `landing` also filters to `showOnLanding`. Admin visibility/version fields remain private; writes require admin authorization and updates use expected-version checks. The marketing adapter reads both surfaces server-side with `no-store`, requires the response `json` field while allowing absent or array-valued `meta`, validates rich documents and safe links, and falls back to the legacy fields when an older API omits rich fields. It renders rich formatting, answers, and lists; links inside question triggers remain non-interactive to preserve button semantics. FAQ JSON-LD continues to use the plain-text projection. Empty results and API/configuration errors retain their separate localized states. No FAQ copy was seeded and neither Sanity nor legacy FAQ fallback is used.

Migrations `0058` and `0059` have been exercised on local `cogito-test`; `0059` is also applied to the local development database `cogito-app`. Shared/production migration and initial FAQ copy remain release gates. See [T10 FAQ checkpoint](plans/active/T10-FAQ-CHECKPOINT.md).

## Tutor specialization selector layout (2026-09-09)

Tutor onboarding renders competition category cards and their specialization
options in one vertical column at every viewport width, keeping long labels from
being cramped. This is frontend-only presentation behavior; taxonomy, selection
limits, RPC inputs/outputs, and persistence are unchanged.

## Request tracing with W3C traceparent (2026-09-05)

Every request carries a `traceId` end to end via `AsyncLocalStorage`
(`packages/api/src/lib/trace.ts`: `runWithTrace`, `getTrace`,
`parseTraceparent`, `emitTraceparent`). The server middleware seeds the scope
per request (incoming `traceparent` wins, then `x-request-id`, then a
generated `req_*` id) and the RPC layer attaches the authenticated userId, so
`request_complete`/`request_error`/`rpc_error` lines, all seven BullMQ scheduler
payloads (`traceJobData`), notification metadata, and webhook idempotency
records correlate in Loki. Structured logs carry `userId`/`traceId` and never
email (enforced by the logger allowlist, which drops any `email` key).

## Server-backed table pagination (2026-09-04)

All database-backed tables in the web app now paginate at the API/database
boundary. Student and admin achievement lists, the active-room catalog, and
pending-room approvals use deterministic offset pages; the admin booking queue
and wallet ledger use cursor pages; and Manage Tutors plus Tutor Payouts use
independent offset pages. The UI requests a bounded page plus one sentinel row
when it needs to discover `hasNext`, keeps previous rows visible through
`keepPreviousData`, scrolls the owning card back into view after navigation, and
resets pagination when filters or the selected wallet change. Tutor Payouts
requests ten tutor profiles per page and loads the pending summary for each
visible tutor. Its custom report range uses the shared Selia date picker; the
web app does not rely on browser-native date controls.

Achievement status cards use dedicated `achievement.stats` and
`achievement.adminStats` aggregates, so counts do not describe only the
visible page. `pending` aggregates both `pending` and legacy `pending_review`.
The unpaginated `room.list` compatibility path remains available for the
booking room selector. The economy schedule preview and tutor pricing matrix
are finite configuration/reference tables, not database collections, so they
remain intentionally unpaginated.

## Tutor discovery filter viewport containment (2026-09-04)

The student `/tutors` page bounds its search row and collapsible filter panel
with shrinkable, full-width containers so responsive controls cannot create a
wider intrinsic page than the viewport. Shared Selia select positioners and
popups also cap their width at Base UI's `--available-width` boundary, keeping
category and specialization options inside the available viewport when
multiple values are selected. This is frontend-only presentation behavior; no
RPC, schema, persistence, or operational contract changed.

## Tutor discovery profile presentation (2026-09-04)

The student tutor drawer mirrors the public tutor profile treatment with a
full-width 300px hero using the published profile image, top-aligned cover
cropping, a bottom gradient, a close affordance, and specialization badges
overlaid at the bottom. Affiliation, education, achievements, and experiences
render from canonical discovery fields without text fallbacks. Tutor cards keep their
desktop metadata on one line with natural-width specialization labels that do
not repeat the parent category, reveal one, two, or three badges at
progressively wider breakpoints, and retain a `From [Marks icon] #` price
label; no RPC, schema, or persistence contract changed.

The student `/tutors/:tutorId/book` page also exposes **View tutor profile**
beside the booking heading. It reuses the same published-profile drawer from
the tutor directory, keeps the booking form mounted while the drawer is open,
and replaces the drawer's booking CTA with **Back to booking**. This is
frontend-only; the existing `tutors.getProfile` response is sufficient and no
RPC, schema, or persistence contract changed.

## Student dashboard balance widget (2026-09-04)

The student dashboard replaces its standalone Knowledge Bank promo card with a
compact Selia balance widget inspired by the Watermelon quota-card composition.
It shows available Marks as the primary value, held and total Marks as supporting
values, and links to the Balance page for top-up. The Balance page reuses the
same widget beside its Knowledge Bank access card on desktop. Eligibility uses
the canonical total-balance threshold of 35 Marks. This is presentation-only
and adds no new data source.

The reusable widget keeps its dashboard **Top up** CTA by default; the Balance
page configures the same action as **Find a tutor** and routes to `/tutors`,
which is the next step before creating a booking.

The Balance page and reusable widget explicitly allow their grid/flex children
to shrink on narrow screens. Held and total values use equal bounded columns,
and mobile ledger amounts move below their transaction descriptions so Marks
history cannot impose a desktop-sized intrinsic width on the entire page. The
QRIS payment code also scales to the nested card's available width instead of
enforcing a fixed 272-pixel padded box.

The Balance page presents Knowledge Bank eligibility as a compact status card.
Its 35-Mark rule and no-charge explanation live in an accessible info preview,
while the always-visible surface is limited to the current status and a short
Open or Top up action. On mobile the action occupies a single full-width row;
on wider screens the same content collapses into one horizontal row. The page
heading and compact card form the wider left column, while the denser balance
widget fills a narrower right rail. The Knowledge Bank card keeps its natural
content height instead of stretching to the grid row, preventing empty vertical
space inside its boundary. The two columns stack in the same reading order on
mobile.

Marks history renders the transaction date on its own metadata line below the
reason. Transaction amounts and resulting balances use the shared `CogitoMarks`
icon-prefix presentation instead of spelling out Marks as a text suffix.
`CogitoMarks` call sites declare an icon size appropriate to their surrounding
typography: size 3 for compact body/metadata text, size 4 for standard values,
and sizes 5–6 for prominent totals. The component uses a vertically centered
inline-flex box with middle alignment; prose-only call sites add local inline
margin while grouped labels continue to rely on their parent gap.

## Card title info preview (2026-09-04)

The shared Selia `Card` now provides `CardInfoPreview`, an optional inline slot
that places the existing `InfoPreview` popover trigger directly beside
`CardTitle`. `InfoPreview` also accepts a custom icon alongside its accessible
label, title, and explanatory content. The admin dashboard's Booking activity
card uses this composition instead of a separate header description. The shared
booking-detail surface follows the same treatment for Session overview, Series
sessions, Activity, Honorarium/Marks, lifecycle, contact, room-assignment, and
admin-extension cards. Explanatory header copy across dashboard, admin, tutor
availability, onboarding, profile, notification, and wallet cards also uses this
compact title-adjacent preview. Sign-in and sign-up keep title-only headers, and
their initial loader reserves the full authentication content height so the legal
notice remains stable. Descriptions that are primary card content or metadata
remain visible. This is presentation-only and changes no RPC or persisted data
contract.

## Competition Calendar empty months (2026-09-04)

The authenticated Competition Calendar keeps the normal month grid visible when
the selected month has no events. Dates, weekday headings, outside-month cells,
and month navigation remain available; the month view does not replace the grid
with an empty state. The page-level empty state is still used when no published
competitions exist at all, while the agenda view may continue to explain an
event-free selected period. This is frontend-only and changes no API, schema, or
persistence contract. When the page-level state is shown because there are no
published competitions, its calendar glyph keeps the Cogito orange accent.

## Competition Calendar empty-state accent (2026-09-08)

The page-level no-competition state keeps the calendar icon in the brand orange
token while shared empty-state tones remain unchanged for other surfaces. This
is frontend-only and changes no API, schema, or persistence contract.

## Sidebar booking-action badge (2026-09-04)

The authenticated sidebar now shows a compact count badge beside the shared
`/bookings` navigation item when the role-visible `booking.listMine` action view
contains rows. That view includes pending decisions and, for tutors, scheduled
sessions whose end time has passed and still need completion. The badge uses
the server-side action predicate, displays `99+` when the result exceeds the
compact limit, and stays hidden while the count is zero or still loading.

## Sidebar logo contrast (2026-09-04)

The authenticated sidebar keeps the branded `/cogito-academy-logo.webp` asset
in light mode and applies a dark-mode filter so the complete logo renders
white, including both the wordmark and academy label. This is frontend-only
presentation behavior with no RPC, schema, persistence, or operational
contract change.

## Sidebar navigation groups (2026-10-22)

`apps/web/src/components/dashboard/app-sidebar.tsx` groups admin links by task:

- **Overview:** Dashboard, Operations.
- **Teaching:** Bookings, Classes, Session reports, Tutors.
- **Finance:** Tutor payouts, KOL commissions, Economy.
- **Content & reviews:** Competitions, Achievements, Knowledge access, FAQ.

Student links use **Overview** (Dashboard, Balance) and **Learning** (Tutors,
Classes, My Bookings, Session reports, Achievements, My referrals). Tutor links use
**Overview** (Dashboard) and **Teaching** (Bookings, Session reports,
Availability, Tutor Profile). Student and tutor FAQ links sit in **Resources**
after Knowledge Bank, alongside How it works, Competition Calendar, and WhatsApp
Support. Admin FAQ stays in Content & reviews. All roles retain the account footer. The groups reuse Selia
SidebarGroup with SidebarItemButton headings and independent default-expanded
SidebarCollapsible/Trigger/Panel sections, including Resources. Native button
triggers support Enter/Space, expose expanded state and a rotating chevron, and
retain visible keyboard focus. Collapsed panels remove their links from the tab
order. State lasts only for the mounted sidebar; no persistence is added.
The existing link rendering, active states,
and booking-action badge are preserved. This is frontend presentation only; routes, RPC
contracts, services, event keys, persistence, and business rules are unchanged.

## Human-readable booking references (2026-09-04)

Every booking now receives an immutable global `bookingNumber` from a
PostgreSQL sequence. The admin Operations → Booking queue renders this short
reference as `#N` instead of the long UUID and accepts exact searches in either
`N` or `#N` form. The UUID remains the internal route and relationship key, so
existing booking links, audit records, wallet references, and lifecycle logic
do not change. Sequence values are intentionally allowed to have gaps when a
booking transaction is rolled back, matching the normal behavior of PR/issue
number sequences.

## Production UI and E2E audit (2026-09-04)

The authenticated web shell now exposes a semantic skip link, an accessible
sidebar toggle with `aria-expanded`/`aria-controls`, and a page-level `h1`
hierarchy without using the visual navigation title as a heading. Tutor cards
are native buttons, the production bundle excludes router/query devtools, and
responsive booking tabs keep overflow inside their own scroller down to the
tested 170px viewport. Time-sensitive labels share a visibility-aware
30-second clock hook, and the achievement dismissal state is SSR-safe.

The complete browser workflow now covers **14 tests across four specs**. The
2026-09-05 booking-flow run passed 7/7, including solo/offline-group/online-
group booking transitions, accepted-online reschedule, cancellation, and
tutor decline. The suite resets and seeds deterministic users, reuses one
authenticated student storage state to respect the auth rate limit, and covers
access denial, contact privacy, economy roles, and 170px/390px layout
containment.
The responsive layout assertions are order-independent and accept either a
real booking row or an empty collection state.

On 2026-09-05, the CI browser setup was tightened to install Chromium from
`packages/e2e`, where the locked Playwright dependency is resolved. This keeps
the installed headless-shell revision aligned with the browser tests instead
of allowing a repository-root transient CLI to select a different revision.

Production payment checkout uses Midtrans Snap (`PAYMENT_PROVIDER=midtrans`).
Snap returns a hosted `redirect_url`; the Balance page navigates directly to
the hosted payment page after the drawer's final confirmation. Choosing
**Buy** only opens a content-height bottom
drawer with the selected package summary; `payment.createPurchase` runs from
the drawer's **Continue payment** action. Hosted checkout redirects immediately
without a second drawer click or intermediate QR renderer, so the package grid
does not shift. The Top Up
Marks header shows a persistent **Test mode** badge when the protected
`payment.getConfig` response reflects `MIDTRANS_MODE=test`, including on a
production-domain UAT deployment. The webhook
`signature_key` is verified in the body
(`SHA512(order_id + status_code + gross_amount + key)`), statuses map
`capture`→PAID / `settlement`→SETTLED / `pending`→PENDING /
`deny|cancel|failure`→FAILED / `expire`→EXPIRED / `refund|partial_refund`→
REFUNDED, and `order_id` is the payment UUID (unique per repurchase attempt).
`MIDTRANS_MODE` asserts Sandbox versus Production; the matching Server Key
selects the provider environment. Midtrans Sandbox has no simulation endpoint,
so `canSimulate` is false. `PAYMENT_TEST_ALLOWED_EMAILS` gates production-like
Sandbox purchases to approved verified students. Approved-user status polling
can reconcile a terminal provider status through the same transactional,
idempotent confirmation path used by webhooks. Payment packages are repeatable:
the latest PENDING attempt is reconciled against Midtrans before reuse, so a
remotely expired checkout becomes terminal and re-purchase creates a fresh
payment row and Snap URL. A genuinely pending attempt remains resume-safe,
while PAID, SETTLED, FAILED, EXPIRED, and REFUNDED attempts remain history and
never block a new payment row/provider reference.

## Website audit P2 hardening

User-supplied links used by achievements, tutor verification/profile photos,
and manual meeting-link flows accept only bounded `http://` or `https://`
URLs; generated local profile assets may use the bounded `/uploads/...` path.
Achievement and tutor-profile moderation decisions use the persisted
row version as an optimistic compare-and-swap, preventing two admins from
silently overwriting each other or producing duplicate side effects. BullMQ
jobs are copied to the DLQ only after their configured retry budget is
exhausted; intermediate failures remain in the normal retry flow.

CI pins oxlint 1.80.0 and oxfmt 0.65.0. Known legacy React compiler errors
remain explicitly tracked in `.github/lint/baseline.txt`; new findings fail
the baseline gate. Lefthook and CI both run the cross-platform
`.github/lint/check-baseline.ts` checker, so documented legacy findings do not
make every push fail while new errors still block both local pushes and CI.
The lint auto-fix commit disables
Lefthook while pushing so the workflow's dedicated baseline and formatting
checks are authoritative.

## Tutor Terms of Service acceptance (2026-09-02)

The tutor profile action area presents one bilingual consent checkbox labeled
**I agree to the Tutor Terms of Service**. The adjacent **Read terms** action
opens the Indonesian/English Terms of Service from
`apps/web/src/components/tutor/tutor-terms-of-service.tsx` in a read-only
dialog. Draft saves do not require consent, and closing the dialog leaves the
profile's checkbox state unchanged. While the tutor has not accepted the
terms, both **Submit for review** and **Submit changes for review** stay
disabled until the tutor checks the agreement.

The server accepts `acceptTerms?: boolean` on `tutor.submitForReview`, enforces
acceptance when the tutor profile has no prior consent, and writes
`terms_of_service_accepted_at` plus `terms_of_service_version` (`2026-09`) once
in the same transaction as `pending_review`. Later review submissions do not
need the flag. These fields are available to the tutor-owned profile response
but are explicitly removed from public tutor discovery. After acceptance, the
profile checkbox remains checked and disabled, while **Review Tutor Terms**
keeps the read-only document available. The consent row and action controls
stack/wrap responsively across mobile, tablet, and desktop widths.

## Deployment wave state

**APPLIED (2026-08-31).** The full Terraform + Ansible apply chain completed via `infra/apply.sh`:

- **Terraform**: 7 resources in state (R2 buckets `cogito-infra-state`/`cogito-backups`/`cogito-bucket` + DNS `api.`/`app.`/`status.`/`cl.`), zero drift, state in R2. The `r2bucket.cogitoacademy.id` custom domain is console-managed (provider v5 has no import for it — #133).
- **Tailscale + hardening**: VPS joined the tailnet (`cogito-vps`), UFW tailnet-only for 22/8000/6001/6002, fail2ban + unattended-upgrades on.
- **Coolify resources**: project `cogito` / env `production` declared; databases `cogito-prod-db` (postgres:16-alpine) + `cogito-prod-redis` (redis:7.2) drift-checked; applications `cogito-api` + `cogito-web` declared; **47 env vars applied to cogito-api from the SOPS vault**; env sync refreshes the live env list after creating missing rows before its uniqueness guard; deploy-webhook route live on `cl.cogitoacademy.id` (probe returns 401 = auth-required form; CD sends `Authorization: Bearer`).
- **Backup cron**: nightly 02:00 UTC (09:00 WIB) `pg_dump -Fc` → `cogito-backups` (30-day retention), env at `/etc/cogito/backup.env`, log `/var/log/cogito-backup.log`. AWS CLI v2 detected at `/opt/cogito-actions-tools/bin/aws` (noble dropped the apt package — #137).
- **Monitoring (2026-09-01)**: Uptime Kuma declared as a Coolify service (`cogito-uptime-kuma`, `louislam/uptime-kuma:2`, port 3001, volume `uptime-kuma-data:/app/data`) at `status.cogitoacademy.id` via `infra/ansible/uptime-kuma.yml` (Coolify API, control-node driven, idempotent); disk watchdog `infra/ansible/disk-watchdog.yml` installs `/usr/local/bin/cogito-disk-watchdog.sh` (nightly 03:30 UTC / 10:30 WIB, warn ≥ 85%, auto-prune ≥ 92% — never volumes/active images/postgres data, newest 1–2 cogitoacademy/app images kept for rollback); `ops.sh disk` + `deploy-retry` added. **Kuma wired 2026-09-02** (operator): 4 monitors + `COGITO ALERT` Discord attached + `cogito` status page — see `docs/KUMA-RUNBOOK.md`.
- **Observability stack PLG (APPLIED live 2026-09-05):** `infra/ansible/observability.yml` declares Coolify services `cogito-loki` / `cogito-prometheus` / `cogito-grafana` / `cogito-alloy` (all tailnet-only). Verified live: Loki ingesting (`{service="cogito-api"}` traceId search works), all 3 Prometheus targets UP, Grafana at loopback `:3000` with provisioned datasources/dashboards/alert rules (DLQFresh/DiskWarn/DiskCrit/ApiErrors → `Discord-ops`), 2G swap live. Gotchas fixed during apply (all in git): base64 `docker_compose_raw`, `loki.source.docker` (not `docker_logs`), Loki 3.x `delete_request_store`, 720h old-sample window, 0644 metrics token, cAdvisor → loopback `:8081`, shared `cogito-obs` network (services are network-isolated by default), suffix-stripped `service` labels, dashboard label `cogito-api`. Grafana admin password in vault (`GRAFANA_ADMIN_PASSWORD`, SOPS-encrypted since 2026-09-06 rotation — live reset verified, Coolify `GF_SECURITY_ADMIN_PASSWORD` UI value still pending operator update). Logs carry `userId`, never email.
- **Observability No-Data wave (2026-09-06, branch `fix/obs-grafana-no-data`):** live audit found three healthy-but-empty panels — 5xx error-rate exprs (empty numerator when zero 5xx) made zero-safe with `or vector(0)` (App RED, Delivery, ApiErrors alert), `breaker_state` panels made healthy-safe (`or on() vector(0)` / `max(...) or vector(0)`; healthy exposition omits the section when no `cogito:cb:*` keys exist). Container-memory panel root cause: cAdvisor `v0.52.1` predates containerd-snapshotter support (upstream #3709, fixed in `v0.54.0`) and Docker 29.7.2 uses the containerd image store, so cAdvisor drops every Docker container (only `id/instance/job` labels, no `name`/`container_label_*`); fix is image bump to `ghcr.io/google/cadvisor:v0.60.5` in `observability.yml` — compose PATCHed into Coolify by the pipeline on 2026-09-07 (drift-detection repair); pipeline auto-redeployed the same day (restart latest:true) and container labels returned — Infra memory panel rendering. Folders reunified 2026-09-07 (boards + rules in afxfpsyn1jldse, duplicate deleted).
- **Drizzle Studio (owned + healthy 2026-09-05):** Coolify service `cogito-studio` (app `drizzle-gateway`) was unhealthy 11 days (wedged vendor healthcheck + dead sslip.io domain); revived via service restart + loopback publish `127.0.0.1:4983` (PATCHed compose) — status `healthy`, UI 200. Access: `ssh -L 4983:127.0.0.1:4983`; credentials in Coolify service env; writes only in maintenance windows. See RUNBOOK → Monitoring & Alerting → Drizzle Studio ownership.
- **Vault**: R2/Coolify tokens rotated 2026-08-31; `DATABASE_URL` keeps the Coolify-private hostname (e.g. `noxeaeuxfreq0axa9unpew5r`) and `infra/backup.sh` resolves it to the container IP at runtime (`getent` → `docker inspect` on the `coolify` network, e.g. `10.0.1.8`); the operator never hand-maintains a container IP (dynamic since 2026-09-05; see RUNBOOK → Backup & Restore).

**Remaining (see `docs/plans/active/`):** drills (DEPLOYMENT-PLAN Phase 5), payment-provider Live Mode E2E (Midtrans), and `ACTIONS_BOT_PAT` keep-or-drop (operator). p95 baseline via the App-RED dashboard after 7 days.

**OPS-VISIBILITY-WAVE (2026-09-02/03, merged #179):** `docs/FAILURES.md` added (the
canonical failure → detection → recovery guide, incl. the disk-full
deploy-failure class and the "CD does not auto-retry" procedure); circuit
breaker states surfaced in `/health` (`checks.circuitBreakers`,
informational — live-verified 2026-09-03); DLQ queue job retention bounded
(`JOB_RETENTION` on `cogito-jobs-dlq`); `ops.sh` DB-name default fixed
(`postgres`) + `cb` command added; CD pre-migrate snapshots pruned beyond
the newest 7 (`PRE_MIGRATE_KEEP`); `infra/secrets/**` added to the
`infra-apply.yml` paths filter (vault-only merges now re-apply the env);
Kuma wired by the operator (4 monitors + `COGITO ALERT` Discord attached +
`cogito` status page — see `docs/KUMA-RUNBOOK.md`); disk-watchdog
verification procedure and memory-headroom recommendation documented in
RUNBOOK; CD `COOLIFY_API_BASE_URL` rollback-path fix (unbound-variable
crash during the 2026-09-02 disk-full incident). Merged #179.

**Error tracking / tracing (2026-09-05, observability-stability wave):**
Sentry is **dormant** — `SENTRY_DSN`/`SENTRY_ENVIRONMENT` are plumbed
through the vault example, Coolify resources, and drift-check, but no SDK
consumes them and no code sends events; errors go to structured logs plus
Discord (Kuma, watchdog, backup self-check, R2 audit). OpenTelemetry is
**deferred** (O1): the W3C-compatible `traceId` propagation through
request logs, BullMQ jobs, and dispatch/webhook records plus the PLG stack
covers current correlation needs with no new dependency; adding the OTel
SDK remains a future option, not a gap.

## Stable collection transitions (2026-08-28)

The admin tutor Invitations and Tutor Profiles tables use TanStack Query's
`keepPreviousData` placeholder while a page or status filter changes. Their
pagination controls target the owning card IDs (`admin-tutor-invites` and
`admin-tutor-profiles`) and scroll that card into view after a page change, so
only the selected collection becomes the user's visual focus. This is handled
with an element anchor and `scrollIntoView`; pagination does not add a route
query or hash parameter. Tutor discovery applies the same stale-data pattern
when search or filters change, and the admin booking queue applies it while
its server-side filters reload. Wallet lookup and student search intentionally
show only results for the submitted query because retaining another user's
data would be misleading. Notifications already retain loaded pages through
`useInfiniteQuery`.

Student cancellation closes at the exact scheduled start and requires a written reason that is persisted in activity and shared with the tutor. Tutor request declines and student/tutor reschedule proposals likewise require a non-blank reason at the API boundary. The backend rejects `booking.cancel`, participant `withdraw`, and per-series-session cancellation at or after the applicable `scheduledStartAt`, leaving the booking live for tutor completion; the booking-detail UI hides the primary cancel action on the same boundary. Pre-start H-2 penalties remain unchanged. Attendance or delivery problems after start use support/admin review instead of allowing a student cancellation path to strand tutor payout.

The shared `/bookings` surface is task-oriented with Needs action, Upcoming, Series, History, and All tabs. Students and tutors are taken to Needs action when a response is pending. History consolidates terminal outcomes. URL-backed Recommended sorting keeps pending decisions above active bookings and terminal outcomes at the bottom, with Soonest and Latest alternatives.

## Admin wallet lookup search (2026-09-02)

The Operations → Wallet lookup surface first searches the admin-only
`admin.searchUsers` procedure by case-insensitive partial name, email, or user
ID. It returns a bounded identity projection (`id`, `name`, `email`, `image`,
and `role`) with exact email/ID matches ranked first; the admin then selects a
result before `admin.getWallet` and `admin.listLedgerEntries` load the wallet.
Search results are replaced only after the submitted query completes, and
wildcard characters are treated literally.

The shared booking list consumes `booking.listMine` with cursor-based infinite
loading in batches of 20. Each tab is filtered server-side through the `view`
input, and the response includes exact role-scoped facet counts. Changing tabs
loads a fresh filtered first page; **Load more bookings** appends only that
view's next cursor. Sorting remains client-side within the loaded filtered
pages.

Shared booking cards include a compact time indicator. Deadline-bound pending states use the server-provided `deadlineAt` to show `Respond in`, urgent, or overdue messaging; confirmed/scheduled bookings show Today, Starts in, Starting soon, or In progress when relevant. Terminal bookings show no time indicator. One shared client clock refreshes all visible cards every 30 seconds.
In booking lists, this indicator sits after the role-appropriate financial summary (Marks for students/admins, IDR honorarium for tutors) with a vertical divider. Dashboard next-lesson cards hide their financial summary to keep the compact overview focused on people, timing, and the detail action.

## Production deployment topology

The public company profile remains on the apex `cogitoacademy.id` host at
Hostinger. The deployed Cogito application uses separate subdomains: the API
and Better Auth base URL are `https://api.cogitoacademy.id`, while the web app
and CORS origin are `https://app.cogitoacademy.id`. The production frontend
image must be built with `VITE_SERVER_URL=https://api.cogitoacademy.id`; the
static nginx image does not proxy `/rpc` to the API.

Frontend SEO/prod surface: the favicon set lives in `apps/web/public/`
(`favicon.svg`/`.ico`, PNGs, `site.webmanifest`); the root head (`__root.tsx` plus the
`index.html` baseline) carries description, OG/Twitter, theme-color, and
robots meta; `/robots.txt`, `/sitemap.xml`, and `/llms.txt` are served static.
nginx sends HSTS + CSP, never caches HTML (stale asset hashes), and caches
hashed `/assets/` immutable for a year.

The PostgreSQL service currently runs as Coolify's private `postgres:16-alpine`
container and does not serve TLS. Production-like API deployments therefore set
`DB_SSL_ENABLED=false`; `DB_SSL_REJECT_UNAUTHORIZED` only controls certificate
verification when TLS is enabled, and should remain `true` for a managed or
external PostgreSQL endpoint that requires TLS.

Server boot outside test mode reconciles the comma-separated `ADMIN_EMAILS`
allowlist before serving traffic. It defaults to
`itcogitoacademy01@gmail.com`, matches case-insensitively, promotes matching
existing accounts, and never demotes other admins. The Better Auth signup hook
covers a matching account created after boot. Development uses the same explicit
allowlist; tests never bootstrap configured admins. The guarded production seed uses
a separate `SEED_REVIEW_ADMIN_EMAIL` and refuses to reuse any address in
`ADMIN_EMAILS`; local/test seed keeps `admin@cogitoacademy.id`. Its review
student has verified local authentication and seeded Marks, while its review
tutor has a published structured profile, normalized specializations, and future
availability. The presentation booking seed creates an idempotent wallet hold
for the review student and repairs older scheduled presentation rows that were
created without that ledger entry, so tutor completion settles student-held
Marks rather than failing with insufficient balance. Default launch identities are Diego by Cogito for the tutor and
Andre, Argya, and Athena by Cogito for the three students, using
`cogito.<name>@yopmail.com` addresses. The Google Calendar operator password is never part of reviewer
credentials. Additional admins can still be granted through the existing admin
role management flow.

The OVH host bootstrap is repeatable through the Terraform configuration in
`infra/terraform`, which runs the idempotent `infra/provision.sh` over SSH for
an already-created VPS. The bootstrap keeps SSH password authentication off,
allows only Coolify's generated key for its localhost root connection, and
exempts Docker's private range from fail2ban so internal validation cannot
self-ban. Coolify's service/resource setup remains a one-time control-plane
operation. The end-to-end provisioning, release, manual CI-quota fallback,
verification, and rollback procedure is documented in [Setup and Deployment](./DEPLOYMENT.md).

The authenticated `/guide` route is the product-facing **How Cogito Works** guide. It is a frontend-only, code-managed journey map rather than a developer setup document. Students can see only the Student journey; tutors can switch between Tutor and Student; admins can switch between Admin, Tutor, and Student. A full-width role switcher and introductory Selia `Card` explain the selected journey before a responsive two-column reading layout. Desktop keeps the chapter index sticky on the left; mobile turns the same index into a horizontal, snap-scrolling row above the content, avoiding the former multi-column overflow risk. Each numbered step is a keyboard-accessible Selia card with default-open details, a global collapse/expand control, status badges, exception branches, and feature CTAs. Its token-based layout, responsive type, compact mobile padding, and reduced-motion-aware disclosure animation support learners ages 5–18 as well as tutors and admins. Timing-sensitive copy is explicit and bolded in the rendered guide: invite links last 7 days; booking response, participant confirmation, reconfirmation, and room approval use 12-hour windows unless the session starts sooner; student self-service changes close at H-2 (2 hours before start); reschedule proposals last 24 hours; lateness is measured at 15 minutes; meeting retries run every 5 minutes for up to 3 attempts; and the admin support SLA is 30 minutes in business hours or 4 hours outside. The static content source is `apps/web/src/components/guide/guide-content.ts`; no API or database contract is involved.

The shared frontend pending state is rendered by `apps/web/src/components/loader.tsx` as the default loading component: a token-based loading ring whose primary Selia `Spinner` arc uses `cogito-orange`, with a loading label and reduced-motion behavior. Feature loading placeholders that previously used bespoke pulse skeletons now reuse this same component. It is presentation-only and keeps the same router/onboarding/auth loading entry points.

Unknown client-side paths render the branded `NotFoundPage` from the root route instead of TanStack Router's generic `Not Found` fallback. Route and outer-boundary failures use the matching `ErrorPage` status treatment with a single tertiary browser-back action. Network failures across query and auth surfaces are normalized by `apps/web/src/lib/error-message.ts`; technical messages such as `Failed to fetch` become plain-language connection guidance without changing any API or persistence contract. The same mapper translates the legacy admin-override `terminal state` wording into the admin-facing locked-booking copy (final bookings are locked — check state history or use a wallet correction); the API itself now emits that copy directly with the final status named, keeping the `TERMINAL_STATE_OVERRIDE` code and 409 status unchanged.

The profile and tutor-onboarding routes keep every Selia `FieldLabel`, `FieldDescription`, and `FieldError` under a `Field` root, including checkbox copy and section-level validation messages. This preserves Base UI field context when validation errors render; otherwise Base UI error #28 reaches the outer error page and can look like a misleading 500. This is frontend-only and does not change an API or persistence contract.

The tutor profile editor uses the authenticated shell's page-level vertical
scroll container, matching the student profile instead of nesting a second
scrollable region inside the page. The shell keeps direct page children from
flex-shrinking, and the tutor profile wrapper therefore follows the onboarding
content's natural height instead of stopping at the viewport height.
The normalized specialization-category grid uses content-sized fieldsets so shorter
categories do not stretch into large blank areas, and the final action card
stays in normal document flow so the page ends without trailing scroll space.
This is presentation-only.

All roles use Better Auth `user.name` as the single canonical visible name.
Tutor onboarding sends a changed account name through the transport-only
`displayName` input on `tutor.updateMyProfile`; the service updates `user.name`
and its audit entry atomically, not a second `tutorProfile.displayName` value.
Tutor discovery, booking, dashboards, sidebar, and admin review render
`user.name`. The legacy tutor-profile column and compatible response key remain
temporarily, but the response key is projected from `user.name` and new UI does
not depend on the stored legacy value.

Empty-state backgrounds are neutral, with tone color confined to the icon box and no background gradients. Collection empty states use the shared presentation component at `apps/web/src/components/empty-state.tsx`. `EmptyStateCard` is used for page and card-level states, while `EmptyState` supports `default`, `compact`, and `inline` density for calendars, menus, dialogs, fields, and embedded lists. Empty copy distinguishes a genuinely empty collection from a filtered no-match state; the component uses Selia tokens and provides success, warning, secondary, and danger tones without changing any API or persistence contract. The audit covers calendar periods, resource and tutor discovery, bookings, notifications, session/activity history, Marks ledgers, specialization selection, tutor proof links, and availability previews.

Invitation history keeps metadata but never stores plaintext invite secrets. The latest generated link remains visible and repeatedly copyable during the current admin page session. For any pending history entry, **Generate & copy link** rotates the token, invalidates the previous link, and records the existing resend audit action.

Before submission, the admin tutor invite form checks whether the normalized email is registered and displays the user's current role and linked Better Auth methods (Google, email/password, or both). This preflight is admin-only and resets whenever the email input changes.

Booking scheduling and reschedule rules: [Booking Scheduling and Reschedule Specification](./booking-scheduling-and-reschedule-spec.md) (v1.0.0, 2026-08-16). Student booking and reschedule forms expose 15-minute minus/plus controls, derive the fixed 90-minute end time, and show tutor-window validation only when the chosen start is outside the allowed range.

The student booking form uses a balanced responsive composition. At desktop widths, session format and the sticky booking summary occupy the right rail; availability remains a card grid, and selecting a slot expands that slot into a two-column row with its own start-time editor directly beside it. On narrower screens, the same editor stacks below its selected slot, modality returns to the start of the form flow, and the full summary moves into a bottom drawer opened from a persistent compact price/schedule preview; the drawer submit button remains associated with the booking form.
The page header remains stable while the Participants section owns the live Solo/Group badge. Its student search field uses the Selia `InputGroupAddon` search icon, and the field, results popup, and result actions inherit default Selia radii without local pill or enlarged-radius overrides. Both summary surfaces describe participant scope separately from Single/Series cadence, list every selected series date and time, and distinguish the student's price from the balance reserved at submission. Monetary values use the shared `CogitoMarks` component. User-facing booking dates use the shared compact `EEE, d MMM yyyy` booking formatter, while the calendar strip omits the year to preserve space.

Booking list rows and the booking-detail header reuse the canonical
Calendar/Meet event-title format (`Cogito - {Competition} | {Tutor} x
{Student}`, with `& Friends` for groups), so participant names do not produce
long `+N` titles. This is a frontend presentation rule backed by the shared
`booking-event-title` formatter and does not change the booking RPC contract.

Recommended-tutor summaries keep their starting Marks price inline with subject
metadata on wider layouts. On narrow screens, the price moves below the avatar
so the content column remains available for the tutor name, modality, bio, and
subject badges.

The authenticated `/dashboard` route is role-specific. Students retain the learning-first dashboard (next lesson, Knowledge Bank eligibility, competition calendar, and tutor recommendations). Tutors see booking decisions, next lesson, upcoming sessions, availability, profile status, and payout totals. The tutor dashboard prioritizes a two-row action-first layout: welcome and teaching setup share the first row, while requests to review and next lesson share the second row before metrics and payout details. The payout details card keeps the main metrics compact and exposes the unpaid-honorarium and transfer-fee explanations through shared accessible `InfoPreview` popovers. Student and tutor dashboards share the same `DashboardWelcomeCard` visual, including its SVG illustration, minimum height, spacing, and CTA structure, while keeping role-specific copy and destinations. Both student and tutor next-lesson sections reuse the same `BookingListCard` composition as the shared booking list, including its date tile, participant metadata, role-appropriate financial treatment (Marks for students, IDR honorarium for tutors), status tooltip, and detail action; the compact next-lesson card hides financial details to keep the overview focused. Admins see escalated booking operations plus pending tutor-profile and achievement review queues, as well as a Business insights section backed by the admin-only `admin.getDashboardAnalytics` aggregate procedure. That section offers 7/30/90-day WIB booking and audience trends, a live booking-state portfolio, modality/category signals, and counts of parent booking records by V3, legacy, other, or missing pricing snapshot. Booking-derived Marks, IDR, and platform-share totals remain omitted until their population, participant, session, and date basis is defined; top-up cash reporting remains based on payment/refund records. All roles share the role-aware `/bookings` list/detail surface; the page keeps the same layout while adapting people, Marks, status, and permitted actions to the viewer. The authenticated shell uses the profile image in the sidebar user avatar when available and falls back to initials. Its theme menu supports Light, Dark, and System, and pressing `D` outside editable fields toggles between the currently rendered light and dark themes; the explicit selection remains persisted by `next-themes`. Booking rows use the Cogito mark icon as the Marks prefix, keep time/location/tutor in the booking metadata column, show student participants (not the tutor) in the avatar stack, use the per-student amount for a single-session group's `You pay` value, place financial/status metadata beside participant avatars, and expose status explanations through hover/focus tooltips. These dashboards are frontend compositions of their relevant oRPC procedures, with the admin analytics read documented in `docs/API-REFERENCE.md`.

The authenticated `/notifications` route is a focused inbox for durable in-app notifications. It uses cursor pagination, a category label badge, an exact date/time plus relative age, visible unread treatment, row selection, select-all for the currently loaded rows, and batch read/unread updates. Selected IDs are sent through the protected `notification.updateReadStatus` procedure, which scopes the database update to the authenticated user. The existing mark-all-read action and notification-bell unread count remain available. Bell items mark unread notifications as read and then navigate to the associated booking, balance, achievements, calendar, or notifications page; they no longer stop after changing read state. Retired economy rate-change rows are omitted from the inbox and unread count.

## Student contact privacy

Contact exchange is available only after a shared group booking reaches
`completed`. Eligible confirmed/reconfirmed student participants who were not
marked absent can see one another's name and profile image on the booking
detail, then send a lightweight in-app request with an optional note. This is
not a general directory or chat feature. Email and phone fields stay private;
the original requester sees the recipient's account email only after that
recipient explicitly chooses **Share email**. **Accept privately** records
consent to the connection without disclosing email, and **Decline** closes the
request. Incoming request projections never return the recipient's own email.

Each student can disable new requests from the profile's **Contact privacy**
setting. The API enforces the completed-booking, participant, attendance,
recipient-setting, and recipient-consent checks independently of the UI. Search
by email remains available for the existing group-invite workflow, but all
student-search, tutor-discovery, and booking participant responses return only
safe display identity; meeting attendee email arrays remain server-only.

## Authenticated editorial content

Competition Calendar and Knowledge Bank content are now delivered inside the authenticated app. Sanity remains the editorial source of truth; content is not duplicated into PostgreSQL. The API uses a server-side Sanity client with the `published` perspective and projects English values from the academy's bilingual competition fields. The app UI is English-only. Knowledge Bank category slugs are mapped to known labels or title-cased when rendered, while their raw values remain the filter keys.

- `content.listCompetitions` is protected for every authenticated role and powers `/_app/calendar`. Admins see an `Edit competitions` button that opens the `competition` list in Sanity Studio (`https://cogitoacademy.sanity.studio`).
- The authenticated calendar keeps the academy's read-only interaction model: month view with multi-day event spans and overflow popup, a flat 30-day agenda list that shows each overlapping competition once in first-event-date order, keyboard shortcuts (`M`/`A`), period navigation, a responsive event-details drawer (right-side on desktop, bottom sheet on mobile), and a toolbar type filter built from the loaded competition categories. Filter keys use each category's parent `coreCategory` slug and labels use its English `name`, with the seven legacy labels as fallbacks when a name is missing. All current types are selected by default, newly loaded types are selected unless explicitly excluded, uncategorized events remain visible when no filter is active, and Reset restores all current options. The filter narrows both month and agenda views. Its colors, controls, and icons use the app's Selia design system; the academy's bilingual copy is not carried into the English-only app. The calendar route uses a contained viewport shell: the page heading and calendar toolbar stay in place while the calendar body owns vertical scrolling, and the month grid owns horizontal scrolling. A month with no events still renders the normal calendar grid so users can navigate dates; only the page-level no-competition state and event-free agenda period use empty-state messaging.
- `content.listStudentResources` powers the authenticated `/knowledge-bank` route for students, tutors, and admins. Admins see an `Edit resources` button that opens the `studentResource` list in Sanity Studio. Students receive resources after `wallet.knowledgeBankEligible` confirms the existing 35-Mark total-balance threshold (held Marks count) or an active admin grant; tutors and admins bypass that wallet threshold. Resource category slugs are presented as readable labels in the UI without changing the API values used for filtering. PDF previews use an unsandboxed browser-native iframe inside a bottom drawer on mobile and a right-side drawer on desktop, with a new-tab fallback.
- Knowledge Bank list responses never expose Sanity asset URLs. `GET /content/knowledge-bank/:resourceId/file` rechecks the student/tutor/admin role and wallet threshold, with the threshold bypassed for tutors and admins or while a student's admin grant is unexpired, fetches the published Sanity asset server-side, and streams it with private/no-store cache headers. The file response may be framed only by the configured app origin so the cross-subdomain PDF preview works; every other API route retains `X-Frame-Options: DENY` and `frame-ancestors 'none'`. The proxy is hardened (`apps/server/src/content-proxy.ts`): host allowlist (`cdn.sanity.io` / `*.sanity.io` — anything else is a 502 before any fetch), a 10s `AbortController` timeout, and a 5MB cap enforced on `content-length` and on the streamed body; the route is rate-limited 30/min per IP (`content` kind, `rate-limit-paths.ts`).
- The academy landing site remains bilingual. Its calendar and Knowledge Bank navigation uses app-login CTAs with an internal redirect target; the old localized URLs remain compatibility redirects rather than public content pages.

The shared booking list sorts active and all rows by the nearest scheduled start while keeping past/cancelled history newest-first. It defaults to Upcoming for students and tutors and All for admins; an explicit `tab` query parameter overrides the role-aware default. Needs action includes pending decisions for every role plus ended scheduled sessions requiring tutor completion. For series, an ended child session is enough to surface the parent while later sessions remain upcoming. Dashboard next-lesson cards use the nearest future booking that is neither terminal nor pending, matching the list's Upcoming semantics. The tutor review queue keeps a stable empty/loading card so the requests and next-lesson modules remain visible together even when no review request exists.

The booking status switcher uses a page-local semantic button tablist styled with Selia's `tabs`, `tabs-accent`, and `tabs-border` tokens. The active state updates optimistically on click while the filtered content shows the normal loader until the server returns the selected view. On narrow screens, sorting moves into the wrapping header action row while the rounded tab strip directly precedes the booking content; only the inner list scrolls horizontally. On larger screens, sorting remains beside the tabs.

## Admin offline room workflow (2026-09-02)

The Operations → Room approvals tab is the cross-booking work queue for
offline bookings waiting for an admin room decision. A requested room can be
assigned directly from its row. Choosing a room or choosing another room
navigates to the admin-only `/admin-operations/bookings/{bookingId}` detail
page, where the admin sees the booking context and uses the Offline room card
to select, assign, relocate, or remove a room. The detail flow derives the
room window from the booking and never asks the operator to type a booking
UUID; the room RPC contracts remain unchanged and continue to receive
internal IDs.

The same tab also exposes an **Active rooms** catalog and an **Add room**
dialog. Admins enter the room name, physical location, and positive whole-
number learner capacity; successful creation calls the existing
`room.create` procedure and invalidates the shared `room.list` cache so the
new room is immediately available to offline booking and assignment selectors.
No schema or RPC input change was required.

The booking detail page uses participant `user.image` values with initials as the fallback, prefixes Marks values with `/cogito-mark.png`, and renders state history as a newest-first transition timeline (`fromState → toState`, actor type, timestamp, and reason). Each transition uses a context icon (users for participant actions, calendar for scheduling, map pin for rooms, and check/X/alert icons for outcomes) while the destination state remains the single colored status badge. The overview puts schedule first, merges modality and meeting/room state into a prominent `Format & access` subsection, and shows participant profile images, names, roles, and confirmation states in a compact responsive list. Role-appropriate primary booking actions, including propose, cancel, review, and complete, sit directly below the status badge, while contextual actions remain in the sticky desktop rail or main flow. Admin operations uses this same detail shell with admin-only review context, override, room, wallet/ledger, and history extensions; room approval monitoring remains in Operations → Room approvals, while booking-specific room actions are available on the admin booking detail page. For online sessions, meeting creation starts when the tutor accepts after required confirmations. A successful link moves the booking to `scheduled`; a failed Google attempt leaves it `confirmed` for the 5-minute retry job, while the assigned tutor or an admin can enter a manual fallback link. The detail page surfaces these states and refreshes while a link is pending. Manual-link entry updates the newest meeting-attempt row so the detail read stays consistent after multiple retries.

Online meeting status stays compact as an accessible Selia `IconInfoSquareRounded` trigger for both unavailable and available links. The popover contains the pending/failed explanation and retry/manual setup badge when needed; when `meetingUrl` exists, it contains the meeting-room action instead of a `Ready` badge or standalone CTA. Missing offline-room details and tutor completion timing use the same trigger beside the related status or action, opening the explanation on hover, focus, click, or touch. The booking detail also exposes a shared Selia manual-link dialog: the assigned tutor can add or replace a trusted URL for their own online `confirmed`/`scheduled` booking, and admin operations can add or replace it for any eligible online booking. Backend guards reject offline, terminal, pre-confirmation, and wrong-tutor requests. This is a small workflow/API follow-up rather than a schema change.

The booking detail overview merges the date and session hours into one `Date & time` field with a calendar-clock icon, then places Format & access beside it in a responsive two-column grid that stacks on narrow screens. The Participants heading uses the same Selia `IconBox` treatment as the other overview fields.

The booking detail desktop layout keeps the overview/activity flow in an independent left column from the sticky Actions/financial rail, so the rail height cannot create a blank grid row before Activity. Narrow layouts retain the order overview → actions/financial content → Activity. On the admin detail, offline room controls and participant wallet/ledger facts are embedded in Session overview, the participant list uses one column, review context sits in the right rail with Wallet impact, Marks amounts use the shared `CogitoMarks` icon-and-value component, and State history reuses the standard Activity timeline while retaining the admin-only actor identifier. This is presentation-only; no RPC, schema, or persistence contract changes.

The tutor reschedule drawer presents its two scheduling modes through the shared Selia Tabs component and groups published availability by local calendar date. The tutor `/book` flow uses one cohesive date-first scheduler: Online/Offline also uses Selia Tabs, its calendar strip shows seven consecutive dates on desktop and three on mobile (dates without slots remain visible but disabled), and selecting an available date reveals concrete valid 15-minute starts grouped into Morning, Afternoon, and Evening for the fixed 90-minute session. Series selection is keyed by availability slot plus concrete start, so multiple non-overlapping sessions may be selected from one availability window or calendar date; overlapping 90-minute choices are disabled. Chosen starts appear in a separate Selected sessions tray. Selected dates and times rely on the button variant without redundant check icons. Card explanations use the shared CardInfoPreview/InfoPreview popover pattern, while Specialization and the optional focus prompt share one semantic Session details fieldset instead of separate cards. Users no longer select a broad availability window and adjust it in a second control, and modality no longer occupies a standalone side card. Booking payload semantics are unchanged.

Removing a room from a scheduled offline booking keeps the booking scheduled. Admins may subsequently assign a new room from the same overview controls; the backend permits this only when the booking is offline and has no active room assignment, preserving relocation as the path when a room is still active.

The booking proposer may propose or counter a time in the eligible pre-terminal states, including `confirmed` and `scheduled`, subject to the student H-2 checks. The proposed start minute must differ from the active booking/session schedule and from an existing pending proposal for the same target; the picker disables identical proposals and the service rejects them. For series bookings the detail hides the header-level action and each session row proposes its own `sessionId` target. Proposal replacement is serialized per booking, while a partial unique database index guarantees at most one pending proposal. Tutor honorarium display for series bookings sums per-session snapshots (`Total honorarium (N sessions)` plus per-session breakdown); solo/group single bookings show the single-session honorarium. A force-majeure or other emergency exception is not an automatic student reschedule after H-2; it must be handled through support/admin operations with an auditable reason and any applicable Marks decision.

Booking detail also renders the current response window for deadline-bound states (`awaiting_tutor_review`, participant confirmation, reconfirmation, room approval, and `reschedule_proposed`) in the booking timezone, refreshing the countdown every 30 seconds. The booking form validates a one-session group against the temporary target-headcount hold and shows that total explicitly; series and solo totals remain session-based. Seed tutor availability windows are at least two hours so the server-fixed 90-minute session has a valid UI start time, and seed demo students are email-verified so local booking smoke tests can pass the verified-student gate.

## Email notifications (P1/P2, PRD notification matrix)

- **Group/group-series invitee email (P1):** the invitee notification written by `booking.service.ts` (`createGroup`/`createGroupSeries`) carries the PRD-mandated content in its body — full schedule, per-student price, total Marks hold, the no-opt-out disclaimer (series only), and a direct in-platform CTA (`${CORS_ORIGIN}/bookings/{bookingId}`). Because `notification.write` uses `notif.body` as the email `html`, the CTA is present in both the in-app notification and the dispatched email.
- **Invitation-phase closure:** `declineInvite` and proposer-side `withdrawInvite` lock the parent booking before mutating an invitation, then query remaining pending invitees. Concurrent final responses therefore serialize. While any remain, participant confirmation continues. Once none remain, fewer than two confirmed participants causes hold release and expiry (plus group-series session cancellation), a viable partial group enters fresh reconfirmation, and a full group advances to tutor review.
- **Signup verification/welcome email (P2/G2, REQ-AUTH-01):** public email/password signup sends the pre-account OTP before creating a user; it no longer uses Better Auth's automatic signup-verification email. After the proof transaction commits, the winning request attempts one separate welcome/onboarding email with the login link. Welcome delivery is best-effort and does not roll back signup. Resends, legacy-account verification, sign-in OTPs, and password/change-email OTPs remain scoped to their existing authentication purpose; an existing-user sign-in never receives signup welcome copy.

## Tutor invite flow

Admin create/resend produces a single-use plaintext token, stores only its SHA-256 digest, and attempts delivery through the shared Resend provider. The branded invitation email explains the tutor value proposition, uses one primary profile-setup CTA, identifies the required account email, displays a readable UTC expiry, and includes the raw claim URL as a fallback. Delivery status is returned to the admin UI; failed/stubbed delivery keeps the invite usable and exposes the one-time clipboard fallback. Claim requires an authenticated account with the same email (case-insensitive), consumes the invite and creates the tutor profile transactionally, and permits only student/tutor roles—admin cannot be silently demoted. Email/password and Google accounts share this claim path; OAuth preserves the `/invite?token=...` return URL.

## Agent Herd (lead + skill-gated workers)

Parallel development uses a lead-agent + worker-herd setup on top of Herdr (see `docs/RUNBOOK.md` → **Agent Herd** for the operational runbook).

- **Lead agent** (`~/.config/opencode/agents/lead.md`, mode: primary) plans work, proposes a per-goal worker roster for user approval, then spawns/monitors/verifies workers through the `herd` wrapper (`~/.local/bin/herd`) and `herdr`. The lead **never sleep-polls**: it blocks on `herdr agent wait <name> --timeout <ms>` and `gh pr checks <n> --watch`.
- **Worker agents** (`.opencode/agents/worker-*.md`, mode: primary, git-tracked) are started in Herdr panes via `herd-spawn-worker` (`~/.local/bin/herd-spawn-worker`), which passes `--agent <worker-role>` to the spawned opencode process.
- **Skill isolation:** each worker's `permission.skill` block denies all skills except its one role skill, so worker contexts never load unrelated skill bodies. Workers still see `AGENTS.md` and the `.opencode/skills/AGENTS.md` workflow routing.
- **Worker roster:** `worker-frontend` → frontend-design · `worker-review` → code-review (edit: deny) · `worker-feature` → feature-workflow · `worker-core` → engineering-core · `worker-prod` → production-reliability. Each carries anti-loop rules (never re-run a command that already produced output).
- **Work isolation:** each write-capable worker operates in its own git worktree + branch under `~/cogito/wt-*` (or `<repo>/.worktrees/<branch>`), per the `parallel-worktrees` skill; workers never share a working directory. Before integration the lead diffs worker file sets against each other and reconciles overlaps.
- **Integration:** worker branches are never merged directly into main. The lead rebuilds the wave as a clean feature branch from `origin/main` with Conventional Commits, opens a PR, waits for CI (`gh pr checks --watch`), then squash-merges. Findings/concerns go into `docs/plans/active/` in the same PR (planning-first, AGENTS.md rule 11).
- **Escalation rule:** the lead must route every worker `blocked` state to the user first; it never resolves approvals autonomously. Passwords/secrets are typed by the user via `herd attach` directly in the worker pane.

## Architecture

Monorepo (Turborepo + Bun workspaces). PostgreSQL 16 (Docker port 6767). Drizzle ORM. Elysia server. oRPC (not tRPC). Better Auth 1.6.11. React 19 + TanStack Router/Query/Form. Selia UI (TailwindCSS v4 + @base-ui/react).

**4-layer architecture (after consolidation):** Router → Handler → Service → Repository

```
cogito-app/
├── apps/
│   ├── server/              # Elysia HTTP server (port 3001)
│   │   └── src/
│   │       ├── index.ts     # Bootstrap: init logger → create server → listen
│   │       ├── routes.ts    # Mount: evlog + cors + /api/auth + /rpc + protected content proxy + /health
│   │       └── middleware.ts # identifyUser (evlog/better-auth)
│   └── web/                 # Vite + React 19 + TanStack Router
├── packages/
│   ├── api/                 # Business logic (4-layer modules)
│   │   └── src/
│   │       ├── procedures.ts # publicProcedure, protectedProcedure, adminProcedure (tutorProcedure after foundation hardening)
│   │       ├── routers.ts    # appRouter composition
│   │       ├── services.ts   # Composition root: createModule() calls (~60 lines)
│   │       ├── context.ts    # Per-request: { session, services }
│   │       ├── lib/          # errors, db, tx (DbOrTx type), idempotency, circuit-breaker, rate-limit
│   │       ├── shared/
│   │       │   └── constants.ts  # NO shared/ports/ — ports are inline in consumer services
│   │       └── modules/      # Domain modules (4-layer each)
│   ├── auth/                # Better Auth config (pure, no wallet coupling)
│   ├── config/              # Shared TS config
│   ├── db/                  # Drizzle schema + migrations (postgres.js driver)
│   ├── env/                 # Zod-validated env vars
│   └── ui/                  # Selia component library (22+ components)
├── docs/                    # PRD, plans, context
└── designs/                 # .pen design files
```

### Server layout (2026-09-04, REFACTOR-PR)

`apps/server/src/routes.ts` was split into a plugin-per-area layout under
`apps/server/src/routes/`:

- `create-server.ts` — composition root: builds the Elysia app, mounts the
  route plugins, wires the logger and error handling.
- `middlewares.ts` — `identifyUser` (evlog/better-auth) and shared request
  middleware.
- `rate-limits.ts` — RPC + auth rate-limit path matching
  (`matchRateLimitPath`/`matchAuthPath`).
- `auth-routes.ts` — Better Auth `/api/auth/*` mounting.
- `rpc-routes.ts` — oRPC `/rpc/*` mounting.
- `upload-routes.ts` — `/uploads/*` local serving + presigned upload.
- `content-routes.ts` — protected Sanity content proxy.
- `openapi-routes.ts` — OpenAPI spec (auth-gated outside production).
- `health-metrics.ts` — `/health` + metrics.
- `webhooks/` — payment webhook routes (`payments.ts` + provider tests).
- `seed/` — guarded production seed scripts.

Typed webhook errors live in
`packages/api/src/modules/payment/payment.errors.ts`:
`WebhookSignatureError` (bad signature → 401), `WebhookTimestampError`
(stale timestamp → 408), `UnknownPaymentStatusError` (unmapped provider
status → 400). The webhook route classifies them as permanent (4xx, no
provider retry) vs transient (5xx, claim released).

## 4-Layer Architecture

**Router → Handler → Service → Repository**

| Layer      | Responsibility                                         | DB? | File                  |
| ---------- | ------------------------------------------------------ | --- | --------------------- |
| Router     | oRPC route definition, zod validation, auth middleware | No  | `{module}.router.ts`  |
| Handler    | DI factory + `{ context, input }` transport adapters   | No  | `{module}.handler.ts` |
| Service    | Pure business logic + consumer port interfaces         | No  | `{module}.service.ts` |
| Repository | Data access (SQL queries only)                         | Yes | `{module}.repo.ts`    |

Each module also has:

- `{module}.types.ts` — Zod input/output schemas
- `index.ts` — `createModule()` factory function

**No `shared/ports/` directory.** Cross-module dependencies use consumer-driven port interfaces defined inline in the consuming service. Types (`HoldParams`, `WalletSnapshot`, etc.) are defined in the provider's service file and imported by consumers.

### Consumer-Driven Port Pattern

Each consuming module declares only the methods it needs from another module:

```ts
// booking.service.ts — declares what booking needs from wallet
interface BookingWalletPort {
  hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}
```

TypeScript verifies structural compatibility at the `services.ts` wiring site when `wallet.service` is passed as `BookingWalletPort`.

### Handler Pattern

Each handler is a DI factory that creates `{ context, input }` adapters:

```ts
// wallet.handler.ts
export function createWalletHandler(wallet: WalletService) {
  return {
    get: async ({ context }: { context: Context }) => {
      const w = await wallet.getOrCreate(context.session!.user.id);
      return { id: w.id, totalBalance: w.totalBalance, ... };
    },
    hold: async ({ context, input }: { context: Context; input: HoldInput }) => {
      return wallet.hold(context.session!.user.id, input);
    },
  };
}
export type WalletHandler = ReturnType<typeof createWalletHandler>;
```

### Request Flow

```
POST /rpc/booking.create
  → Router: protectedProcedure.input(createBookingSchema).handler(bookingHandler.create)
  → Handler: extract userId from context, delegate to bookingService.createSolo(userId, input)
  → Service: validate, calculate price, call wallet.hold (via BookingWalletPort), create booking
  → Repo: INSERT INTO booking, INSERT INTO booking_participant
```

### ServiceRegistry

```ts
export interface ServiceRegistry {
  auth: AuthHandler; // Handler type for modules with HTTP endpoints
  admin: AdminHandler;
  adminKnowledgeBank: AdminKnowledgeBankHandler;
  wallet: WalletHandler; // Handler type (was WalletPort before)
  booking: BookingHandler; // Handler type (was BookingService before)
  contact: ContactService; // Service type for consent-based contact exchange
  pricing: PricingService; // Service type (no HTTP endpoints)
  audit: AuditService; // Service type (no HTTP endpoints)
  // ...
}
```

Routers access handlers via `context.services.{module}.{method}`. Other modules access services via DI through their consumer-driven ports.

## Domain & Policy References

### Booking creation UX

- The student booking form does not ask users to choose solo versus group up
  front. `Invite students (optional)` is always available; zero invitees uses
  the solo/solo-series RPC, while one or more invitees automatically uses the
  group/group-series RPC and updates participant count and pricing.
- Removing the final invitee automatically returns the request to solo without
  clearing the selected schedule or Session Notes.

- New tutor profiles store IDR base honoraria. Tutor discovery and booking
  creation derive the current Marks price from the active economy config, while
  every new booking stores an immutable economy version and IDR/Marks snapshot.
  Admin Cogito take changes affect future booking snapshots only and send one
  durable in-app system notification to every current tutor; identical saves
  are no-ops.
  Existing profiles/bookings that still use the legacy Marks map remain readable
  during migration.

- [`marks-economy-architecture.md`](marks-economy-architecture.md) — canonical reference for the closed-loop Marks economy, package pricing, tutor honorarium/take-rate formulas, regulatory assumptions, Knowledge Bank gating, and related engineering changes.
- The Marks blueprint is a reference architecture, not a substitute for Indonesian legal, regulatory, accounting, or payment-provider review before production launch.

## Infrastructure

- **Database:** PostgreSQL 16 via `postgres.js` (consolidated — driver migration complete)
- **Redis:** Shared instance for sessions, idempotency, rate limiting, circuit breaker state, BullMQ persistence (after production readiness)
- **Scheduler:** BullMQ with Redis persistence for booking expiry, hold release, email dispatch
- **Email:** Resend (production) / stub (development) via EmailService
- **Meeting/Calendar:** Online bookings use Google Meet (production) / manual link fallback via CircuitBreaker. When an offline booking receives a room and becomes `scheduled`, the provider creates a normal Google Calendar event without conference data or a Meet URL. Offline events carry the assigned room name/location and the same attendees, title, description, schedule, and booking deep link as online events; their description starts with `Site: {room.location}` and `Room: {room.name}`. Assignment/relocation sync runs best-effort after the room transaction commits; repeat syncs reuse the live provider row and refresh its room metadata. Accepted online reschedules update the event in place with conference-data support retained and Google attendee emails gated by `GOOGLE_CALENDAR_SEND_UPDATES` (`none` by default, `all` in production; Cogito notifications always fire), so seed/dev runs never spam attendees or bounce DSNs to undeliverable seed addresses. Automated E2E forces `GOOGLE_MEET_ENABLED=false`, so seeded runs use the manual fallback and never touch the live calendar. Reschedules update the event, and terminal booking paths delete it through the shared lifecycle hooks. Booking creation selects one active tutor competition specialization and snapshots its category/specialization metadata in `booking.session_topic`. Calendar titles use `Cogito - {Competition} | {Tutor} x {Student}` for solo bookings and append `& Friends` for groups; MUN/WSC use their standard abbreviations. Descriptions list tutor/students, `Session Topic: {category} - {specialization}`, Session Notes (including reference links), and `/bookings/{bookingId}`. `learning_goal` remains the Session Notes compatibility carrier; file uploads are deferred. OAuth refresh-token and service-account setup is documented in [`docs/GOOGLE-MEET-SETUP.md`](GOOGLE-MEET-SETUP.md).
- **Deployment:** Coolify on the OVH VPS; production API and web images are pulled from GHCR
- **Database TLS:** Controlled by `DB_SSL_ENABLED`; Coolify's bundled PostgreSQL is non-TLS, while external managed databases may require it

## DB Schema (32 tables)

### `user` (auth.ts) — CHECK(role IN ('student','tutor','admin'))

### `session` / `account` / `verification` (auth.ts) — Better Auth owned

### `wallet` (wallet.ts) — CHECK(total=held+available), uuid PK

### `knowledgeBankAccessGrant` (knowledge-bank-access.ts) — one optional per-student admin exception, future `expires_at`, audit-preserved removal

### `ledgerEntry` (wallet.ts) — UNIQUE(wallet_id,event_key,source_reference), CHECK entry types

### `studentProfile` (student-profile.ts) — uuid PK

`allow_contact_requests` defaults to true and blocks only new contact requests
when set to false.

### `contactRequest` (contact-request.ts) — completed-session request state, explicit email consent, and booking/user foreign keys

### `tutorProfile` (tutor-profile.ts) — CHECK modality + onboarding_status + profile_edit_status; keeps approved public values separate from pending reviewed edits; stores IDR base honoraria in `base_rates_idr` and one-time Tutor Terms of Service acceptance metadata (`terms_of_service_accepted_at`, `terms_of_service_version`)

### `economyConfig` (economy-config.ts) — singleton active Marks value, IDR tutor honorarium parameters, and admin-managed Cogito take schedule

### `notification` (notification.ts) — durable in-app notifications; economy schedule changes use a per-version/per-tutor event key and the `system` category

### `availabilitySlot` (availability-slot.ts) — tutor availability windows (one-time + weekly-generated)

### `tutorInvite` (tutor-invite.ts) — CHECK status, revoked_by/at fields

### `achievement` (achievement.ts) — CHECK status; private `evidence_url`, optional admin-managed public `documentation_url`, `awarding_date`

### `auditLog` (audit-log.ts) — CHECK actor_type, before/after state jsonb

### `booking` (booking.ts) — immutable booking_number, status state machine, deadline_at, hold_amount

### `bookingParticipant` (booking.ts) — confirmation_state, attendance

### `bookingSession` (booking.ts) — series child sessions with independent state

### `bookingStateHistory` (booking.ts) — state transition audit trail

### `bookingRescheduleProposal` (booking.ts) — tutor-proposed reschedule; status pending/accepted/rejected/expired

### `sessionNote` (booking.ts) — notes on completed sessions (author_id + booking_id)

### `sessionCompletionFeedback` (booking.ts) — required tutor feedback at completion (booking_id + nullable session_id for series, author_id, discussion[]/strengths[]/improvements[] jsonb). One row per solo/group booking or per series session; read by student/tutor/admin for payout review.

### `room` (booking.ts) — offline rooms, is_active flag

### `roomBooking` (booking.ts) — room assignment with status requested/confirmed/relocated/cancelled

### `meetingEvent` (booking.ts) — provider event/link state (google_meet/manual), status + error_reason. `google_meet` identifies the shared Google Calendar provider row; offline rows intentionally have no `meetingUrl`. Calendar title/description/location metadata is provider-side and is not a new database field.

### `paymentRecord` (payment-record.ts) — payment status tracking

### `refundRecord` (payment-record.ts) — refund/correction tracking, UNIQUE(provider_event_id)

### `markPackage` (mark-package.ts) — purchasable mark packages; application-generated UUID text ids, stable `code`, and active/inactive catalog state. Default rows are installed by the idempotent data migration `0041_seed_mark_packages.sql`.

### `notification` (notification.ts) — in-app notification records

### `notificationDispatch` (notification.ts) — email dispatch tracking

### `supportTicket` (support-ticket.ts) — lateness/no-show + issue reports; status + sla_deadline

## API Modules (21 routers + internal modules)

All procedures are POST (oRPC convention). Auth via session cookies.

### Auth Module (protected)

- `me`, `getProfile`, `updateProfile`, `searchStudents`
- `searchStudents` accepts a name/email lookup but returns only `id`, `name`, and `image`.

### Admin Module (admin)

- `listUsers`, `searchUsers`, `setRole`, `getWallet`, `listLedgerEntries`, tutor payout report/preview/prepare/record/void/reconciliation, tax defaults/override, `getV3EconomySettings`, `previewV3EconomySettings`, `saveV3EconomySettings`

### AdminKnowledgeBank Module (admin)

- `list`, `create`, `update`, `remove`
- Owns the one-per-student temporary Knowledge Bank exception, validates future expiry, and records audit events. Wallet and content consume its `getActiveByUserId` port for read-time gating.

### AdminMarkPackage Module (admin)

- `list`, `create`, `update`, `setActive`
- Owns the transactional admin catalog API for mark packages. Package codes are immutable business keys used by payment creation; deactivation is a soft state change, not a delete.

### AdminTutor Module (admin)

- `createInvite`, `listInvites`, `resendInvite`, `revokeInvite`
- `listTutorProfiles`, `reviewTutorProfile`, `updateTutorAchievements`

### Tutor Module (tutor)

The tutor `/profile` editor presents Education, Achievements, and Experiences in one combined card with a single public preview; each subsection keeps its own private proof-link field. Affiliation stores a current study program/university or professional role/organization. Short bios are limited to 50 words, and proof guidance recommends one Google Drive folder shared with “Anyone with the link can view”.

- `getMyProfile`, `updateMyProfile`, `submitForReview`
- The first complete `submitForReview` requires the bilingual Terms of Service checkbox exposed in the profile action area; **Read terms** opens the read-only document, **Submit for review** and **Submit changes for review** remain disabled until the checkbox is checked, the server records the acceptance timestamp/version once, and later `changes_requested` resubmissions proceed without a second prompt.
- Tutor profiles store required-on-review `affiliation` (current program and university, or professional role and organization; maximum 255 characters), structured `education` (maximum 2 entries), `achievements` (maximum 5 entries, each with comma-separated award titles), and `experiences` (maximum 5 role/organization/year/description entries). Draft saves may omit affiliation; published rows remain nullable. The web editor previews normalized values and public discovery renders them without year grouping dots.
- The tutor profile editor separates **Save draft**/**Save profile changes** from **Submit for review**. Draft saving does not require the complete onboarding set, while malformed values are shown with field-level errors, a validation summary, and focus on the first invalid control; submission applies the complete required-field gate. Published tutors remain editable while profile changes are under review: saving updates the pending proposal, and submitting validates and queues the latest version.
- The admin tutor index derives its displayed status from both onboarding and edit-review state: a published tutor with submitted pending changes is labeled **Edit review**, while an edit returned by admin is labeled **Revision requested**, so admins can identify work requiring attention before opening the full-page review workspace.
- The tutor profile photo uploader is the first editable field inside the Public profile section and uses the same compact clickable-avatar crop flow as the student identity editor. Published tutors see the current public photo beside their proposed replacement; the replacement remains staged in `pendingProfileChanges.profileImageUrl` until admin approval. The field stays focused on the current/proposed photo and does not embed audit history; audit-backed photo and review history remains available in the admin review page. Full photo previews stay behind the compact Selia `InfoPreview` popover, while the admin review page shows the current and proposed assets side by side rather than presenting the pending asset as already public.
- The compact profile-image picker uses a native screen-reader-only file input rather than applying Selia's visible full-width Input styling. This prevents the hidden control from creating document-level horizontal overflow and a second outer scrollbar alongside the dashboard content scroller.
- The authenticated dashboard shell is fixed to the viewport while its content pane owns vertical scrolling and contains overscroll. This prevents long tutor forms and sticky action bars from growing or scrolling the outer document; public and authentication pages retain their normal document scrolling.
- The tutor credentials editor uses a border-light editorial layout: Education, Achievements, Experiences, evidence, and live preview are separated by whitespace and thin rules. Individual entries are rows rather than nested cards; fields use responsive internal grids. Proposed changes remain private until approval.
- `subjectIds` uses the normalized competition category/specialization taxonomy; tutors may select at most 7 active specializations. Drafts may save without specializations, but review submission requires at least one active current specialization. Archived legacy specializations remain readable but cannot be newly selected. The product term is **specialization**; compatibility API/database names such as `subjectIds`, `subjects`, and `listSubjects` remain unchanged.
- `listAvailability`, `upsertAvailability`, `createWeeklyAvailability`, `deleteAvailability`
- `getMyPayouts`

### TutorDiscovery Module (protected)

- `listSubjects` (public — the seven active competition categories with 34 selectable specializations, including Law Debate under Debate)
- `listPublished`, `getProfile` (student-only; supports single or multi-value `categoryId`/`subjectId` filters via normalized specialization joins; a missing match returns an empty list)
- Shared Selia controls keep category/specialization IDs and modality values for query inputs while rendering labels; tutor onboarding shows all competition categories with checkboxes, while the tutor list allows multiple categories and specializations, with empty arrays meaning “All”. Tutor discovery keeps search visible and places category, specialization, and modality controls in a collapsed-by-default filter panel; its trigger retains an active-selection count when the panel is closed. The panel expands with a short height/fade transition, rotates its chevron, remains outside keyboard navigation while closed, and disables motion when reduced motion is requested. Multi-select values truncate only the leading label while keeping the `+N more` chip and its ring visible. Search and filter changes debounce `listPublished` by 300 ms so rapid typing or multi-select toggles coalesce into one request.
- On mobile, tutor discovery cards use a compact profile composition: a 56-pixel avatar and identity header, two-line bio, short specialization badges, and a separated price footer with the shared Marks prefix plus a chevron. Desktop retains the denser horizontal summary, uses natural-width child specialization labels without a repeated parent category, keeps its metadata on one line, and progressively reveals additional specialization badges at wider breakpoints while preserving the `From [Marks icon] #` price label. The whole card remains the profile trigger with a smooth hover-shadow treatment and no translate or pressed-scale effect.
- The student-facing tutor drawer renders available pricing maps as one group-size matrix with separate Online and Offline Marks columns, prefixing populated price cells with the Cogito Marks icon. This is presentation-only; the discovery response and pricing contracts remain unchanged.
- The student-facing tutor drawer opens as a swipe-down bottom sheet below `sm` and as a right-side drawer at `sm` and above. Affiliation, education, achievements, and experiences use canonical discovery fields only.

### Invite Module (public + protected)

- `verify` (public), `claim` (protected)

### Achievement Module (protected + admin + public)

- `list`, `create`, `update`, `delete`
- `adminList`, `adminUpdate`, `adminReview`
- `listApproved` (public — consumed by the public `cogito-acad` achievement archive and homepage preview)
- The student `/achievements` list and admin `/admin-achievements` moderation queue use compact, horizontally scrollable Selia tables with minimum column widths; each row opens a shared detail drawer for category, level, description, location, attachments, notes, and available edit/delete or correct/approve/reject actions. The drawer presents metadata as consistent labeled values while retaining a semantic status badge, opens as a swipe-down bottom sheet below the `sm` breakpoint, and becomes a right-side drawer at `sm` and above. Evidence and public-documentation attachments open in a lightweight image preview with an original-file fallback. The student summary counts use the same compact label-and-pill cards as the admin moderation counts; the three admin moderation counts stay in one compact row even below `sm`. Table containers remain full-bleed within their card bodies, but a table followed by shared pagination preserves its bottom spacing so the last row's hover surface does not visually run into the pagination divider. Page/card wrappers stay constrained to the viewport so only the table content scrolls horizontally. This is presentation-only and does not change the achievement RPC or persistence contract.
- The public projection is an allowlist: it includes approved + visible records and the owner's display name, but never `userId` or private `evidenceUrl`. Optional activity documentation remains public-safe.
- Student achievement levels are presented in this order: `International`, `National`, `Province/State`, `City/Regency`, `School`. The student proof field gives Google Drive guidance (upload proof, set General access to “Anyone with the link” + Viewer, then paste the link); students do not provide the public documentation image.
- The student form uses one clear Location value (for example `Jakarta, Indonesia`, `Geneva, Switzerland`, or `Online`) and a long-answer `Brief Description` field with a ranked-result example. The public documentation image is an admin-only correction field.
- `adminUpdate` lets admins correct all submission fields plus the public documentation image while a record is `pending`/`pending_review`; it uses the row version as a compare-and-swap, writes an `achievement_admin_updated` audit record, and leaves status unchanged until the separate review action.
- Admin soft-delete/restore commits its row mutation and audit record atomically. Aggregate moderation counts exclude soft-deleted rows.
- The achievement form uses the shared Selia calendar; selected/today states are drawn on the rounded day button rather than its square grid cell. Add, edit, and admin-correction forms open as swipe-down bottom drawers below the `sm` breakpoint and right-side drawers at `sm` and above. Their portal-based date picker and Category/Level selects render above the drawer so every popup control remains interactive.

### Wallet Module (protected)

- `get`, `listLedger`, `listPackages`, `knowledgeBankEligible`
- (`hold`/`release`/`deduct`/`credit`/`compensate` are service-layer only — not exposed over RPC)

### Pricing Module (internal)

- `computeSplit` (legacy Marks pricing), `computeEconomics` (IDR honorarium + Cogito take), `validateBaseRates`, `getEconomyConfig`

### Booking Module (student mutations + shared authenticated reads)

Tutor availability is modeled as free-time windows rather than pre-sized sessions. The booking UI uses the shared Selia calendar/date picker and a cross-browser 24-hour autocomplete time field; students can enter any exact minute, but a start must leave room for the server-fixed 90-minute session inside the selected window. A one-session selection is one-time and multiple selections form a series automatically.

- `createSolo`, `get`, `listMine`, `cancel`
- `proposeReschedule` (booking proposer), `acceptReschedule`, `rejectReschedule`, `cancelSession`, `getRescheduleAvailability`
- `addSessionNote`, `getSessionNotes`
- `createGroup`, `createSeries`, `createGroupSeries`, `confirmInvite`, `declineInvite`, `withdrawInvite`, `reconfirm`, `withdraw`
- `listSessions`

Tutor discovery and every student-owned booking mutation are guarded by `studentProcedure`. The protected booking list/detail/session reads are shared by authenticated parties: students see proposer/participant bookings, tutors see assigned bookings, and admins see all bookings. Tutor/admin accounts still cannot browse the student tutor catalog or create/cancel/confirm/reconfirm/withdraw bookings; tutor fulfillment remains under `tutorActions.*`.

Booking read relations expose only safe user identity (`id`, `name`, `image`,
`role`). Internal meeting attendee email arrays are selected only by
server-side meeting/notification code.

After submission, the tutor or booking proposer can propose a replacement time from the booking-detail action panel. The proposal form opens in a height-constrained bottom Selia drawer on mobile and a right-side drawer on desktop, with a scrolling body and persistent action footer. The frontend dispatches student proposals to `booking.proposeReschedule` and tutor proposals to `tutorActions.proposeReschedule`; both routes use the shared service. Rescheduling is session-scoped; each proposal requires tutor and all active-student approval, and the original schedule remains active until unanimous acceptance.

### TutorActions Module (tutor)

- `listBookings`, `proposeReschedule`, `acceptBooking`, `declineBooking`, `setMeetingLink`, `completeSession`, `markAttendance`, `markParticipantNoShow`

### Contact Module (student)

- `listForBooking`, `request`, `respond`
- Available only to eligible students who shared a completed group booking.
  Requests are in-app only; the recipient chooses whether to share email, and
  the requester is the only viewer who receives a shared email value.

### Payment Module (protected + public webhook)

- `createPurchase`, `getPurchase` (protected)
- `POST /webhooks/payments/:provider` (public — signature + IP allowlist + timestamp validation)

### Room Module (protected + admin)

- `list`, `checkAvailability` (protected)
- `create`, `assign`, `relocate`, `cancelBooking` (admin)

### Notification Module (protected)

- `list`, `getUnreadCount`, `markAsRead`, `updateReadStatus`, `markAllAsRead`

### AdminBooking Module (admin)

- `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`
- `setMeetingLink` (admin manual meeting-link entry for online `CONFIRMED`/`SCHEDULED` bookings), `cancelSeriesSession` (admin per-session series cancel with Marks-return choice)

### Refund Module (admin)

- `createCorrection`, `listCorrections`

### Support Module (protected + admin)

- `createTicket`, `listTickets` (protected)
- `adminListTickets`, `adminResolveTicket` (admin)

### Upload Module (protected)

- `createUploadUrl` — validates the image-only content-type allowlist (`ALLOWED_IMAGE_TYPES`; `application/pdf` is rejected on photo flows, `ALLOWED_DOCUMENT_TYPES` stays unreferenced until a flow needs it), filename, and 1-byte–5 MB content length, then returns a presigned PUT upload for Cloudflare R2 or an authenticated local `/uploads/*` raw-body POST URL (dev); `GET /uploads/*` serves local files when `R2_PUBLIC_URL` is unset. The local POST magic-byte-sniffs the body (`sniffImageKind`) and returns 415 for non-image bytes. R2 signs the content type and exact declared length, and browser uploads require bucket CORS (verified app-origin-only 2026-09-05); the nightly `infra/r2-upload-audit.sh` alerts on ContentType vs key-class mismatches. The student profile photo picker crops the selected image to a square in the browser before uploading.

### Scheduler Module (internal)

- BullMQ repeatable jobs: `expire-bookings` (5m), `release-expired-holds` (10m), `check-tutor-lateness` (5m), `send-notification-email` (60s — consumes the email outbox via `dispatchQueuedEmails`; failed rows are retried up to 3 attempts), `escalate-support-tickets` (15m), `retry-failed-meetings` (5m — re-creates Google Meet for CONFIRMED online bookings whose meeting creation failed, up to 3 attempts), and `reconcile-payments` (15m — checks stale Midtrans pending/failed/expired requests and confirms terminal provider status)

Internal-only modules with no RPC procedures: `audit`, `economy`, `email`, `meeting`, `pricing`, `scheduler`.

## Auth Config

- Email/password enabled. Google OAuth optional (conditional on env vars, after foundation hardening); the configured Google provider sends `prompt=consent` so the Google permission screen is shown during verification runs even for a previously authorized account.
- Admin bootstrap outside test mode uses `ADMIN_EMAILS` (default `itcogitoacademy01@gmail.com`) to promote matching existing or newly-created accounts case-insensitively; development, staging, and production are included. Existing admins are preserved and the normal admin role-management flow remains available for other addresses.
- Password reset flow: Better Auth built-in endpoints (`/api/auth/request-password-reset`, `/api/auth/reset-password`). Email via existing EmailService (category `auth`), wired through `setAuthEmailSender()` from the composition root (`apps/server/src/index.ts`). Unknown emails get the same success response (no enumeration). `revokeSessionsOnPasswordReset: true` — all existing sessions die on reset. Reset token valid 1 hour.
- Wallet created lazily via `WalletService.getOrCreate()` on first `auth.me` call.
- Cookies: session cookies use sameSite=strict (production) / lax (development), secure=true (production), httpOnly=true. The short-lived Better Auth OAuth state cookie is explicitly sameSite=lax so the signed state returns on the provider's top-level callback GET; it remains secure/httpOnly and is checked against the database verification record. Same-site subdomain requests work because `app.cogitoacademy.id` and `api.cogitoacademy.id` share the `cogitoacademy.id` site. Google login uses `prompt=consent` to make the provider permission screen visible for verification evidence; it requests identity scopes only and does not add the server-side Meet/Calendar scope to every user's login.
- `CogitoUser` type exported with role field.
- Web email sign-in and sign-up treat authentication as one awaited handoff: Better Auth must return success, the client reads a fresh session with `disableCookieCache`, and then TanStack Router navigates by a validated return path or the role/onboarding default. Tutor accounts without a profile, or with `draft`/`changes_requested` onboarding status, go to `/profile`; tutors in review, approved, published, or suspended states and admins go to `/dashboard`, as do students by default. The client suppresses Better Auth's overlapping session signal refresh during that handoff so the form does not remount into the global pending loader; the authenticated shell uses the same fresh session source for its parent route guard. A user whose fresh session has `emailVerified !== true` is sent to `/verify-email` after a new OTP request, including legacy accounts created before verification was introduced; the selected post-login destination is preserved for after verification. Existing users are not backfilled as verified. This is frontend-only and does not change auth endpoints or persistence.
- The `/login` email forms validate each touched field on change and blur, keep the client rules aligned with the server password policy, show inline Selia field errors and danger outlines for touched or blocked fields, and normalize name/email whitespace before calling Better Auth. This is presentation and client-validation behavior only; it does not change auth endpoints or persistence.
- **Pending (foundation hardening):** password policy — **fully implemented (C6 closed by REVIEW-FIXES-3 P6)** — min 8 via `minPasswordLength` + upper/lower/digit via `assertPasswordPolicy` enforced in the server auth route at sign-up (`apps/server/src/routes.ts`), mirrored in the sign-up form (single consistent statement — 2026-08-17). Conditional Google OAuth — implemented (gated on env vars). Session expiry is set (7 days, `expiresIn`); the authenticated web shell warns during the final 30 minutes and keeps the existing unauthorized redirect as the fallback. **Email verification (G2) — implemented (REVIEW-FIXES-4 P4.4, #76), enforcement level: sign-up/sign-in routing plus paid actions** — Better Auth `emailOTP` plugin (6-digit OTP, 5 min expiry) handles existing-account verification via the shared email port (`setVerificationEmailSender` + `buildVerificationEmail`); public email/password signup uses the REQ-AUTH-01 pre-account OTP flow and attempts separate welcome mail after the account-creation transaction commits. `/verify-email` UI route collects the code; `auth.api.verifyEmailOTP` marks the user verified. New and legacy users with `emailVerified !== true` are sent to `/verify-email` after email/password or Google sign-in, with a new OTP request and a validated return path; existing users are not backfilled as verified. **Enforcement (backend finalization):** the four booking-create procedures (`booking.createSolo/createGroup/createSeries/createGroupSeries`) and `payment.createPurchase` run on `verifiedStudentProcedure` (`procedures.ts`), which throws `FORBIDDEN` ("Email verification required") unless the session user is a student with `emailVerified === true` — an unverified user cannot create bookings or purchase Marks.

## CI/CD

- **CI test and coverage performance (2026-09-02):** `.github/workflows/ci.yml` restores the shared Bun install cache before `bun install`, and typecheck/build restore separate Turbo caches. Pull requests use full git history plus Turbo `--affected` for typecheck and build; manual dispatches still run the full graph. The web `check-types` task runs `tsgo --noEmit`, leaving the production Vite build to the Build job. Test + Coverage starts independently of lint/typecheck, captures and merges the three coverage partitions, then runs the server suite in a separate process because its webhook test uses `mock.module`; the previous duplicate uninstrumented API pass is removed. A failed coverage test command is explicitly propagated after the coverage comment/gate step.
- **GitHub Actions** (`.github/workflows/ci.yml`): 5 jobs (lint, typecheck, build, test+coverage, and the isolated E2E Browser Workflow). The lint job auto-applies `oxlint --fix` + `oxfmt --write` and commits the fixes back to the PR branch before verifying, so formatting nits don't require a manual push cycle. Tests run `packages/api/src/tests/`, the env/auth/db package tests, and `apps/server/src/openapi.test.ts` in the coverage process; the remaining `apps/server/src/` tests stay in a **separate process** because the webhook idempotency TTL test uses `mock.module` for `@cogito-app/api`. The E2E package participates in the root typecheck gate and the E2E job provisions PostgreSQL 16 and Redis 7, writes an isolated `.env.test`, migrates, installs Chromium, starts the web server in Vite `test` mode, runs the full seeded workflow, and uploads the Playwright HTML report plus failure screenshots/traces on failure or success. Test hooks have a 30-second budget to absorb slow CI database setup while still catching hangs. Coverage gate: `packages/api` lines, overall lines, overall functions, and overall branches must each be 100% (enforced by `.github/scripts/coverage-comment.ts`; a 0/0 branch total is treated as 100%). The PR comment separates the status blockquote and coverage tables with blank lines required by GitHub Markdown. Test + Coverage uses disposable PostgreSQL services at runner ports 6769 (`cogito-test`) and 6770 (`cogito-test-payout`); the payout schema is migrated separately and `booking-payout-g16.test.ts` runs only against the latter with its reset consent scoped to that command. Reset-free report fixture suites run on 6769 without reset overrides. Bun writes each run's LCOV output to the configured `coverage/lcov.info`; the workflow clears that file before each of the resettable, fixture, and payout partitions, then snapshots the fresh non-empty profile under `coverage/api-*` before the next Bun process replaces it. The three raw profiles are merged to `coverage/lcov.merged.info` before the unchanged coverage gate; the comment step only reads this merged output after the test/merge step succeeds. The DB unit test mock includes a test-only auth secret because Bun can share module mocks with integrations in the resettable process; it restores its shared server env mock after each case so the SSL-redaction setup cannot leak NODE_ENV=development into resettable auth integrations. `.github/scripts/merge-lcov.test.ts` verifies line/function/branch unions, raw profile preservation, and rejects missing, empty, or recordless profiles. The E2E job maps disposable PostgreSQL targets 6769/cogito-test and 6770/cogito-test-payout, with separate Redis services on 6381 and 6382. Regular browser tests use strict Turbo env forwarding, the full T05 target tuple, and T06/T07 role-state opt-ins; the three payout specs run separately against 6770/6382 with T05 variables unset. E2E_AUTH_RATE_LIMIT_RESET is explicit workflow consent for a target-guarded helper that clears only disposable auth limiter keys before seeded sign-ins; the production rate limit is unchanged. Report fixture reset overrides remain absent, and T05 keeps its fresh per-run student identity.
- **CD**: The production workflow and `scripts/migrate-and-deploy.sh` are restored to their last known successful state at `bb1ccb9a` after a VPS-side immutable-image pull exhausted disk and crashed the self-hosted runner. GitHub Actions builds and pushes server/web images on a hosted runner; the VPS job resolves the private database, runs pg_dump → private R2 snapshot → `bun run db:migrate`, posts the configured Coolify webhook, and verifies `/health.version`. The VPS deploy job does not pull application images directly. Infra apply and production CD share the `production-deploy` concurrency group, preventing env restarts from racing image rollout.
- **Lefthook** pre-commit: oxlint + oxfmt. Pre-push: typecheck.
- **Labeler** (`.github/workflows/labeler.yml`): labels PRs `server`/`web`/`infrastructure`/`docs` by changed paths (`.github/labeler.yml`); needs `pull-requests: write` permission.
- **Dependabot**: weekly npm + GitHub Actions updates.
- **Coverage**: 100% for `packages/api` lines, overall lines, overall functions, and overall branches; package-level env/auth/db tests are included in the coverage command
- **Health**: `GET /health` returns `{ status, checks: { database, redis, scheduler, dlq }, dlqDepth, timestamp, version }` — DB `SELECT 1`, Redis `ping()`, and scheduler readiness (`checkSchedulerHealth`) are checked; `checks.scheduler` is `error` whenever Redis is unreachable (the scheduler cannot run), `degraded` when no Redis client exists. `checks.dlq`/`dlqDepth` are alert-only and never flip the overall status. `dlqDepth` is age-aware (2026-08-31): it counts only DLQ ledger entries whose push-time `failedAt` is within the freshness window (`DLQ_FRESH_WINDOW_MS` = 24h default; `DLQ_FRESH_WINDOW_HOURS` env override; invalid values fall back to 24h), computed in Lua; entries without `failedAt` (the pre-2026-08-31 ledger) count as stale and never trip the alert — the full ledger stays in Redis. `version` is the deployed image sha (`process.env.GIT_SHA`, injected by the Dockerfile; `"dev"` when unset) so the CD pipeline can verify the deployed container
- **Deployment platform**: Coolify for the API (self-hosted PaaS on the VPS) and Cloudflare Pages for the frontend
- **Scheduler boot**: The BullMQ worker + 7 repeatable jobs (`expire-bookings` 5m, `release-expired-holds` 10m, `check-tutor-lateness` 5m, `send-notification-email` 60s, `escalate-support-tickets` 15m, `retry-failed-meetings` 5m, `reconcile-payments` 15m — wired in `apps/server/src/scheduler.ts`) only start when the server runs with `SCHEDULER_ENABLED=true` **and** `REDIS_URL` set (via `initScheduler()`, wired in server bootstrap). Without both, the scheduler logs `scheduler_skip` and the booking-expiry/hold-release/email/SLA/payment-reconciliation jobs never run. **Fail-loud boot:** when `SCHEDULER_ENABLED=true` but Redis is unreachable, `initScheduler()` pings the shared Redis (`checkSchedulerHealth`) and **throws — the boot aborts** instead of silently running without the expiry/hold-release/email/payment-reconciliation jobs. `send-notification-email` consumes the email outbox (`notification.dispatchQueuedEmails`): notification writes queue dispatch rows (`status='queued'`) inside the DB transaction and the scheduler sends them, so no email I/O happens inside open transactions. `GET /health` surfaces a `checks.scheduler` entry (`ok`/`error`/`degraded` from the same Redis ping), so a dead scheduler trips the readiness check.
  1d8dd3b (feat(infra): add OVH Terraform and Coolify bootstrap)

PR310 LCOV merge behavior (23 October 2026): Bun may emit `FNF`/`FNH` without function identities. The merger preserves the exact named union and uses the maximum profile summary and known named counts as conservative lower bounds, writes a function-identity sidecar, and labels incomplete counts in the PR report. It fails the unchanged 100% gate when unidentified functions remain uncovered; incomplete identities are not described as a fully measured function union.

PR310 CI follow-up (23 October 2026): Run [#39896841727](https://github.com/cogitoacademy/app/actions/runs/39896841727) passed Build, Lint and Type Check. Test + Coverage stopped on two server guard unit assertions that expected obsolete denial text; the coverage threshold step was skipped, so this run does not establish a coverage failure. The regular E2E partition had eight failures: outdated empty-state copy, a seeded wallet with an earlier 126-Mark booking hold, stale pre-V3 pricing assertions, and report fixtures with overlapping fixed schedule times. The payout partition failed during setup because nested Bun children loaded the regular env file instead of the selected payout file. Scoped fixes preserve strict guards and production limits, give the exact 6769 T05 booking/lifecycle student 326 Marks for its 126-Mark booking hold, and create a second run-scoped 200-Mark student for the parallel multi-plan class journey. They also assert current student Marks pricing and the read-only tutor honorarium table, use retry-stable class session dates, and pass the resolved absolute E2E env file into child Bun commands. Both browser partitions, all tests and the 100% coverage thresholds remain enabled. Focused pure guard/environment checks pass 15 tests / 50 expectations under available Bun 1.4.0-canary.1, and Playwright test discovery lists 54 tests across 14 files without starting a browser; pre-commit lint/format hooks pass with existing lint warnings; the serial pre-push check, push and one manual CI dispatch remain. No local database, Redis, seed, migration or provider operation is part of this follow-up.

Run [#39909560681](https://github.com/cogitoacademy/app/actions/runs/39909560681) on `6ef0b948` passed Build, Lint and Type Check. The two server reset-guard assertions are now resolved; server tests finished with 152 passed, one skipped, and zero failures. All three coverage partitions also passed (3,031 resettable tests, 56 fixture tests, and 11 payout tests), but the merger stopped because `coverage/api-resettable/lcov.info` was absent. Bun 1.3.14 printed the full resettable coverage table but did not create the requested custom `--coverage-dir` path; a focused run under available Bun 1.4.0-canary.1 reproduced the configured default output at `coverage/lcov.info`. The workflow now removes that default profile before each partition, requires a fresh non-empty LCOV file, and copies it into the partition path before the next process. The merger remains fail-closed and all 100% thresholds remain unchanged. E2E completed with payout successful and the regular partition at 45 passed, 5 failed, and 1 flaky. Three class enrollment/report failures came from sharing the run-scoped student wallet: the multi-plan journey spends 149 Marks while the other class journeys need 80, 22, and 25 after the seeded 126-Mark booking hold. The multi-plan case now uses a second run-scoped 200-Mark student in its dedicated authenticated browser context; the T05 326-Mark balance and the 80/44/25 and insufficient-funds assertions remain unchanged. The class-publish journey exceeded Playwright's default 30-second test timeout, so that one multi-step test now has 90 seconds with its assertions intact. The uppercase auth `NOT_FOUND` log corresponds to the deliberate case-variant route rejection in `pre-account-signup.spec.ts`. The flaky FAQ validation passed on retry. This run does not establish a coverage-threshold failure.

Run [#39913840116](https://github.com/cogitoacademy/app/actions/runs/39913840116) passed Build, Lint, Type Check and all server/coverage test partitions (152 server tests passed, one skipped; the three coverage partitions had zero failures), but the merger stopped because Bun 1.3.14 emitted `FNF`/`FNH` summaries without `FN`/`FNDA` identities for some sources. The 100% threshold step did not run. E2E had 48 regular passes and 3 regular failures; all 3 payout tests passed. The failed regular cases were the class-publish helper using calendar-dialog selectors for native `datetime-local` inputs, an ambiguous replacement-start accessible name, and class-report assertions matching a timestamp plus badge while the report enrollment reused a wallet depleted by parallel class journeys. The helper now fills and checks the native value, the enrollment test selects the textbox role, and T07 uses its own run-scoped 200-Mark report student. The 326-Mark booking/lifecycle wallet, the multi-plan 200-Mark wallet, and the 80/44/25 and insufficient-funds checks remain intact. Focused LCOV merger tests pass 6 tests / 55 expectations; E2E identity fixture tests pass 2 / 4. At that checkpoint the edits were still unpushed; the later 8945d6b update and current CI follow-up are recorded below.

PR310 follow-up on `90863a22`, based on `8945d6b` (23 October 2026): The partition runner uses a temporary Bun config without the per-file 80% threshold; the merged gate retains 100%. Class schedule E2E uses Selia calendar and minute-time controls, keeps generated dates inside the calendar future range, and matches report-version text exactly. The focused LCOV suite passes 11 tests / 145 expectations under Bun 1.4.0-canary.1; touched TypeScript formatting passes and focused lint exits 0 with existing `no-await-in-loop` warnings. Normal pre-push passed on `90863a22` (serial typecheck 4/4 tasks, 25.04 seconds). Full hosted CI [run 39939287307](https://github.com/cogitoacademy/app/actions/runs/39939287307) is in progress on this code commit. No local database or browser acceptance ran.

## Plans

### Release v3 planning baseline (2026-10-18)

The Post-Meeting Release Scope has a development planning package in
`docs/plans/active/RELEASE-V3-PRD.md`, `RELEASE-V3-SPEC.md`, and
`RELEASE-V3-TASKS.md`. The source/code audit and consolidated open decisions are
in `docs/client/RELEASE-V3-AUDIT.md` and `RELEASE-V3-DECISIONS.md`.
Status: draft specifications, not implemented functionality. Baseline app HEAD:
`14dc4486`; website checkout reviewed: `ab43c2fc`. Financial/enrollment decisions
remain gated as recorded in the decision register. User clarification on
2026-10-18: website content requires English, Indonesian is optional, both inputs
must be available; the app interface stays entirely English. This is a planned
content contract, not a claim that all current forms already enforce it.

Active plans live in `docs/plans/active/` (indexed in `docs/plans/README.md`).
Completed plan documents are deleted when their work merges (policy set
2026-10-09) — the merge PR, its commit message, and the dated entries in this
file are the permanent record; plan-file archives are not maintained.

> **`.superpowers/sdd/` disposition (updated 2026-10-09):** the SDD execution
> ledger (worktree paths, commit ranges, test counts, merge reconciliation) is a
> **local-only workspace** — `.superpowers/` is gitignored and its historical
> ledgers are no longer committed (supersedes the 2026-08-17 keep-and-commit
> decision). Fresh clones need no `.superpowers/` content.

| Plan                                                  | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/active/RELEASE-V3-PRD.md` + SPEC/TASKS    | `RELEASE-V3-TASKS.md` is the status authority. T07 PDF/reminders, T09 settlement/admin usage and T12 KB/calendar implementation are integrated. Local dev activation and historical DB/browser results are documented in dated checkpoints. T09/T12 remain in progress for provider, production/storage, restore and client acceptance. T13 has bounded current-head regression evidence, not full release acceptance. Q04 and Q15 are resolved and implemented; Q14, OPS01 and final release gates remain open. |
| `docs/plans/active/DEFERRED-OPS-TASKS.md`             | Active — code gaps done, §3/§4 operator-console items pending                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/plans/active/DEPLOYMENT-PLAN.md`                | Active — applied 2026-08-31; remaining scope tracked in the plan                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/plans/active/PAYMENT-INTEGRITY-FLAP.md`         | Active — payment-integrity alert stability                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/plans/active/ROLE-BASED-DASHBOARD-ANALYTICS.md` | Active — tutor capacity/payout + admin aggregates remaining                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Also see [`docs/MIDTRANS-MIGRATION.md`](MIDTRANS-MIGRATION.md) — the active
production payment-provider guide.

Historical plans (consolidation #16, 2026-08-15, through the Midtrans UAT gate
#252, 2026-09-14) were removed on 2026-10-09; their content lives in this
repository's merge-PR history.

## Role E2E Readiness Snapshot (2026-09-04)

Use this section as the current role-readiness baseline. Re-audit only after the related backend or frontend plans materially change.

**2026-08-14 update:** Backend PRD gaps (G1–G20) landed on main (#35, #36, #39–#43). Tutor reschedule (propose/accept/reject) and session notes are now backend-ready; group invite accept/decline/reconfirm UI and admin override/room UI remain frontend work (FRONTEND-GAPS-SPEC).

### Student

The student My Profile surface supports self-service account name and profile-image updates through Better Auth, alongside learning/contact fields. The sign-in email remains read-only on this page. The compact identity header exposes photo editing through the avatar itself, with a pencil badge communicating that it is clickable. Students upload a JPG, PNG, or WebP photo, adjust the visible area with a circular drag/zoom crop editor, and save the resulting square avatar through the existing protected Upload Module. Student identity edits do not require admin review.

Student profile UX is organized as a responsive account-identity card plus separate learning and parent/guardian sections. The page shows profile completion, keeps account identity saving separate from learning-profile saving, and uses one visible save action for the learning fields. It reads the student row through the focused `auth.getProfile` procedure and treats a missing row as the initial empty form, so the page does not depend on the wallet/tutor aggregate in `auth.me`.

**Primary promotion flow is ready:** email/password auth -> tutor discovery -> solo booking -> Marks hold -> booking list/detail -> cancellation. Profile, balance/top-up, basic achievements, notification bell, calendar export, and WhatsApp contact surfaces are also present. WhatsApp support actions confirm the destination (`+62 881-0119-90195`) before opening it in a new tab.

Economy role coverage is ready: students see computed Marks prices and cannot open admin economy settings; tutors see IDR honorarium setup without Marks cash-out language; admins see the active Cogito take schedule in a read-only default state and explicitly enter edit mode before using direct IDR entry or Rp5,000 stepper controls. Edit mode exposes draft status, cancel, and save actions, then returns to read-only after a successful save. The admin schedule preview reuses the tutor pricing table presentation, while both economy card explanations live in compact header info previews for mobile layouts. Economy take changes do not create tutor notifications because tutors do not need the platform take schedule.

The 2026-09-05 browser regression covers all 14 tests across the four
`packages/e2e` specs. The booking spec passes 7/7, including the online group
invite -> participant confirmation -> tutor acceptance path, the accepted-
online reschedule -> student acceptance -> cancellation path, and tutor
decline with a required reason. E2E setup resolves the seed student by email
before cleanup and resets test economy defaults, while the admin economy form
accepts locale-formatted IDR values without exposing a Selia field-context
error. The remaining specs cover cross-student booking access denial, the
admin future-booking economy snapshot path, rejection of a negative IDR amount,
and booking-list containment at 170px and 390px. The layout spec is
order-independent: it checks either the seeded booking rows or the empty
collection state. The query client does not retry deterministic
`BAD_REQUEST`/`FORBIDDEN`/`NOT_FOUND`/`UNAUTHORIZED` responses, so access and
validation errors surface promptly instead of leaving the detail skeleton in a
retry loop.

Booking detail uses a task-detail layout shared by student, tutor, and admin views: a compact identity-and-status header, role-appropriate primary actions directly below the status badge, a primary content flow for overview, series sessions, notes/reports, and activity, plus a sticky metadata rail for contextual actions and role-appropriate financial information. The overview keeps participant names and profile images visible without a separate low-priority rail card. Admin operations composes the same page through explicit header, main-content, sidebar, and activity slots, preserving room assignment, review context, participant wallet/ledger inspection, wallet impact, state history, and override controls without giving admins student/tutor lifecycle actions. All existing lifecycle actions and data remain available without changing the booking API.

The admin booking detail is a refresh-safe page at `/admin-operations/bookings/:bookingId`, rather than a separate visual inspector. Its admin-only extensions keep the shared responsive shell consistent while retaining the wider operational read model and controls. This is presentation-only; no RPC, schema, or persistence contract changed.

Tutor booking review uses a compact responsive accept/decline dialog. The accept path shows the scheduled date/time, modality, attendance, and the next state transition before calling the existing tutor action; the dialog is informational and does not add a new backend procedure.

Booking cancellation and session completion also use in-app Selia confirmation dialogs. Global success/error toasts render above dialog layers so mutation feedback remains visible while a modal is open; native browser confirmation prompts are not used.

Form controls use Selia wrappers for multiline text, numeric amounts, calendar dates, and minute-level times. App-level raw browser date/time/number/select/textarea controls are not used; the wrappers retain semantic native elements underneath for accessibility and form behavior. Text-entry controls in the shared `Input`, `NumberField`, and `Textarea` variants use an explicit 16px font size below the `lg` breakpoint so mobile browsers do not zoom on focus, then use the tokenized `text-base` size from `lg` upward. Portal-based Selia popups use an overlay layer above dialogs, including date and select controls inside the student achievement form.

**Tracked PRD product surfaces are complete:** group/series booking UI, reschedule accept/reject, lateness/no-show reporting, public achievements, F1 admin operations, F9 session-note API compatibility plus the Student notes/Session feedback booking-detail surface, F18 proposer-side invite withdrawal, J2 session-expiry warning, and the dead-component cleanup are implemented. Backend support for the related workflows (G1/G6 and the existing booking procedures) has landed. Booking reliability follow-up now also covers flat-price reconfirmation, offline room schedule synchronization during reschedule, and suspended-tutor restoration. Operational follow-ups remain in `docs/plans/active/DEFERRED-OPS-TASKS.md`.

### Tutor

The tutor workspace now has the primary management surfaces: the tutor profile editor at `/profile`, a Calendly-style availability page, the shared role-aware `/bookings` list, and booking detail actions for accept, decline, and complete. Tutors configure multiple weekly-hour ranges per weekday, copy a range to weekdays, choose modality per range, and generate concrete future windows through an end date (up to 52 weeks). Weekly range rows keep both minute-time fields at the compact width used by the start field, show a centered dash between them, and let their autocomplete popup size to its contents beyond the field. Modality triggers keep their icon and label side by side. The date-override editor uses Online/Offline/Both tabs, collects up to 14 selected dates as removable chips, and applies up to four shared time ranges to all selected dates in one atomic batch. Inline validation blocks save and explains missing dates, invalid or reversed times, overlapping ranges, past dates, and existing one-off conflicts before the mutation runs. Date-specific overrides supersede conflicting recurring occurrences; a conflict with an existing one-off window rejects the full batch. The calendar preview sits directly below the date-override editor on desktop, uses the same date-strip/detail pattern as booking availability, and exposes each window's source and modality. Removing a preview window requires explicit confirmation before the existing delete mutation runs. Existing bookings remain intact because replacement soft-deactivates availability rather than deleting referenced rows. The legacy `/tutor-bookings` route remains as a compatibility redirect to `/bookings`; tutor list data now comes from protected `booking.listMine`, not the proposer-only query. The legacy `/onboarding` route redirects tutors to `/profile` and other roles to `/dashboard`. After a tutor submits the profile for review, the form awaits the existing profile/auth cache invalidation and navigates to `/dashboard` with history replacement.

Published tutor profiles remain editable. Bio edits and tutor-set base honoraria publish immediately; a new honorarium applies only to future bookings. Existing bookings keep their stored price snapshot, including the original tutor honorarium, for weekly payout. Other trust-sensitive edits are held in `pendingProfileChanges` with a separate edit-review status, so discovery continues serving the last approved profile until an admin approves the proposal or requests revisions.

Tutor profile editor uses canonical Education, Achievements, and Experiences sections. Education allows two entries; achievements and experiences allow five each. Labels sit above inputs; add/delete actions sit below entries. Experience years share a desktop row and stack on mobile. No legacy profile-text fallback remains.

Manage Tutors shows at most three invitations and five tutor profiles per page in compact Selia tables and paginates each list independently. Invitation operations are grouped into a per-row actions menu. The invitation table uses semantic status badges: invited is warning, accepted is success, and expired/revoked are danger; unknown values fall back to secondary. Tutor details open at `/admin-tutors/:profileId` in a focused full-page review workspace, which retains the full achievements, experiences, section-specific private proof links, current/proposed profile photos, admin edited-photo upload, audit-backed photo/review history, and review-action workflow without overwhelming the index page. The tutor-facing history endpoint returns actor id/name metadata without account email addresses, while the admin review page retains the richer moderator context. Status filter changes reset the corresponding list to page one. The review body remains usable at narrow widths while its fixed action area stays visible.

The Invite Tutor card sizes to its own form content instead of stretching to the adjacent Invitations table, so its footer remains the visual bottom edge without an empty strip below it. The Invitations card follows its parent grid-row height and pins pagination to the bottom whenever its content is shorter than that available space.

Tutor specializations are normalized in `subject_category` (self-referencing category/specialization hierarchy) and `tutor_profile_subject` (profile-to-specialization join). Migration `0029_competition_taxonomy.sql` archives the previous catalog with `is_active = false` and seeds the seven current competition categories plus 33 specializations; migration `0047_debate_law_specialization.sql` adds active Law Debate specialization under Debate, bringing current catalog to 34. Onboarding and published discovery use normalized specializations. Specialization changes on published profiles follow pending review and apply atomically when approved. Migration `0051_short_hobgoblin.sql` adds nullable `affiliation`, renames structured JSONB columns to `achievements` and `experiences`, preserves their arrays, and removes obsolete pending JSON keys.

The primary Tutor E2E flow has been manually verified with seeded accounts, including availability, incoming booking review, online meeting-status handling (real provider or manual fallback), student notification/state, and completion. Tutor reschedule, session notes API compatibility, payout, and individual series completion are now backend-ready (G6/G7/G16/G18); their UI is tracked in FRONTEND-GAPS-SPEC (F6/F7/F8/F9/F13 closed). Completed booking detail renders Student notes and tutor Session feedback in the Session overview; the former shared session-notes rich-text toolbar, editor, and card are no longer exposed in the web UI. Lateness/no-show support is backend-ready via `support.createTicket` (G1) with the report UI implemented (F3, merged #55). Assigned tutors can now add or replace a meeting URL from booking detail when automatic setup is unavailable; the API limits this to their own online `confirmed`/`scheduled` bookings, while admins retain the operations fallback. The local 2026-08-26 run detected an expired/revoked Google Meet token; online acceptance correctly remained `confirmed` with meeting setup attention instead of falsely claiming the session was scheduled.

### Admin

Backend is ready for user role management, tutor invite/review, structured tutor achievement editing, achievement moderation and public achievement surfacing, the full booking operations console (queue/override preview/refund), room list/create/update/deactivate/assign/relocate, wallet/ledger lookup, tutor payouts, refund corrections, the active economy schedule, and manual meeting-link fallback for eligible online bookings. Admin wallet lookup resolves visible user identity through `admin.searchUsers` (name/email/ID) before reading the selected wallet and ledger. The /admin-economy screen lets admins edit the four Cogito take fields in Rp5,000 increments with optimistic versioning; updates are audit-logged and apply only to future/new repricing snapshots. The admin tutor review card resolves pending `subjectIds` through the active normalized taxonomy and renders readable category/specialization labels with wrapping values; it also lets admins correct structured education and competition entries through the version-checked `adminTutor.updateTutorAchievements` procedure, with an audit event for each save.

The focused admin tutor review card now derives presentation-only added/changed/removed/filled/empty states from normalized current and pending values. Its summary counts support composable field search and status chips, each pending field expands into current/proposed panes, and Profile, Teaching setup, Credentials, Proofs, Marks, Photo, and Payout sections expose changed or empty badges where applicable. Profile photos remain in the existing side-by-side current/proposed panel; no RPC, schema, or persistence contract changed.

The admin override queue, wallet/ledger view, override preview, room assignment → scheduled transition + notifications, room availability/approval backend (G8–G10, G13–G14), and the read-only all-bookings view at `/bookings` have landed. The admin workspace is now available at `/admin`; its operations queue provides category/urgency/SLA filters, exact booking-number search, OQ-04 business-hours deadlines, escalation status/channel, and report context. Queue rows display the immutable human-readable booking reference (`#N`) while retaining the UUID behind the detail link, and each row links to the admin-only `/admin-operations/bookings/:bookingId` page, where the full participant read model, per-wallet balances, booking-scoped ledger entries, meeting fallback, state history, and override action remain available in a refresh-safe layout. The override form loads the booking roster and presents affected participants as a name/avatar/role multi-select; selected user IDs are serialized automatically for the unchanged preview/apply contract. The queue table uses stable column widths, top-aligned content, readable body text, and non-wrapping status badges. On narrow viewports, the monitor card remains constrained to the content viewport and only the table container scrolls horizontally. The **Room approvals** tab now includes the active-room catalog and Add/Edit/Deactivate room controls backed by `room.create`, `room.update`, and `room.deactivate`; deactivation is a soft removal that preserves historical assignments while preventing new selections. Its `room.listPendingApprovals` section remains the cross-booking queue; requested rooms can be assigned inline, while **Choose room** / **Choose another** opens the admin-only booking detail Offline room card for context-aware assignment or relocation. No admin room flow requires typing a booking UUID. The separate `/admin-tutor-payouts` workspace owns operational tutor payouts: its default view shows tutors who need payment, status filters and sorting expose paid history, a date window controls paid transfer history while current unpaid balances remain visible, and the filtered result can be downloaded as a CSV sheet with tutor name, bank/account details, gross/fee/net, transfer status, and transfer date. Paid rows snapshot the account number and account holder at transfer time. Manage Tutors remains focused on invitations and profile review. F1/F2/F11/F12 are closed. Backend U-item sub-gaps are tracked in `docs/plans/active/PRD-GAPS-PHASE3.md` (all closed; U9 closed by REVIEW-FIXES-4 P2.8). The admin economy UI was browser-verified for role denial, valid future-booking snapshot updates, and invalid negative amounts; no UI access bypass was found.

### Backend Gap Groups

- Ready now (merged to main): student solo/group/series booking primitives, reschedule propose/accept/reject, session notes, group invite confirm/decline/reconfirm/withdraw, wallet/ledger/packages/Knowledge Bank, purchases, achievements, notifications, tutor profile/availability/payouts/incoming-booking actions, support tickets (G1), and the admin capabilities listed above (G8–G10, G16–G18).
- Backend PRD U-items (all closed, verified 2026-08-18): manual meeting-link entry (U1→`adminBooking.setMeetingLink`, plus assigned-tutor `tutorActions.setMeetingLink`), student self-reschedule (U2), reconfirmation-deadline repricing (U3), group-series full withdrawal blocked (U4), per-participant no-show (U5), admin per-session cancel (U6), per-session reschedule (U7), refund reconciliation guard (U8), **business-hours SLA windows (U9 — closed by REVIEW-FIXES-4 P2.8)**, achievement field parity (U10), registered-user invitee validation (U11), offline room deadline (U12), KB total-balance eligibility (U13), offline room availability in booking creation (U14). Dead-code/silent-failure items were cleared by the post-audit cleanup (2026-08-15, merged #50-#57 era).

### Current Execution Order

1. Complete Admin Tutor invite -> claim -> onboarding -> review -> publish E2E and verify published discovery.
2. Refresh the real Google Meet credential and rerun the online-provider smoke path before recording marketing footage; the manual-link fallback remains intentionally available.
3. Close the production deployment-readiness items in `docs/plans/active/DEPLOYMENT-PLAN.md` before enabling real payments and scheduled jobs. The production domain may run Midtrans Sandbox first with the UAT allowlist; real payments remain disabled until the sandbox checklist and live smoke are complete.
4. Keep the approved-achievement public surfacing smoke check in the release checklist; the student list and admin moderation queue now use horizontally scrollable tables, including narrow-viewport coverage.
5. Admin booking override and offline-room UI (F1/F2/F11/F12) — backend landed (G8–G10, G13–G14); F1/F2/F11/F12 implemented, including the dedicated admin workspace, hydrated participant wallet/ledger detail, and OQ-04 SLA projection.

## Known Bugs

### Existing bugs (production-readiness plan audit)

| ID  | Bug                                                | Priority | Status    |
| --- | -------------------------------------------------- | -------- | --------- |
| B5  | No CSRF protection on mutations                    | P0       | **Fixed** |
| N3  | Scheduler not shut down gracefully                 | P1       | **Fixed** |
| N8  | withdraw doesn't release other participants' holds | P2       | **Fixed** |

The following bugs from the production-readiness plan are **fixed** (see completed plan for details): B1 (double session validation), B2 (meeting rollback), B3 (refund correction), B4 (series deadline), N1 (release holds), N2 (send emails), N4 (series sessions), N5 (listLedger filters), N7 (randomUUID), N15 (holdAmount update), B6 (overlap check in tx). N9 (pagination) was also fixed by PR #28 — `listBookingsByState` in `admin-booking.repo.ts:94` now consumes the cursor (`gt(booking.id, cursor)`).

### Frontend error UX TODO

- Map oRPC/Zod input-validation issues to field-specific, non-technical messages across every form. Raw transport errors such as `Input validation failed` must never be shown directly to users. The solo-booking form currently provides a readable fallback, but a shared mapper remains to be implemented.

**Remaining deferred items** are tracked in `docs/plans/active/DEFERRED-OPS-TASKS.md`
(§2 Redis session caching is done — R1 secondary storage, 2026-09-05; §3/§4
still pending).

**Fixed by PR #28 (`improvement/foundation-critical-fixes`):**

- Redis rate limiting and composition-root wiring
- Atomic idempotency get-or-set flow
- Migration journal, missing indexes, and booking-participant uniqueness
- Notification scheduling, BullMQ retry backoff, and Redis health check
- Admin and student booking pagination cursor consumption
- Wallet atomic balance guards and explicit wallet repository columns
- Admin override correctness and optimistic locking
- Payment/refund bounds and pending-provider retry handling
- Series future-slot validation and Tutor booking route guard
- Discovery search escaping and nginx security headers

### New findings (foundation-hardening plan audit)

Status column: **Fixed** = verified in code on main after #17 merge; **Open** = not yet implemented.

| ID  | Bug                                                                    | Priority | Story | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------- | -------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Group booking cancel doesn't release invitee holds                     | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A2  | Group booking tutorDecline doesn't release invitee holds               | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A3  | expireBookings doesn't release invitee holds                           | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A4  | withdraw→cancel doesn't release other participants' holds              | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A5  | confirmedHeadcount not decremented on withdraw                         | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A6  | holdAmount not zeroed on cancel/decline/expire                         | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A7  | Series cancel doesn't cascade to bookingSession rows                   | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B1  | RESCHEDULE_PROPOSED has no expiry — booking stuck forever              | P0       | 2     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B2  | AWAITING_ADMIN_ROOM_APPROVAL/SCHEDULED not in expiry cron              | P0       | 2     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C1  | booking.get() IDOR — no ownership check                                | P0       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C2  | booking.listSessions() IDOR — no ownership check                       | P0       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C3  | Tutor actions lack tutorProcedure role guard                           | P1       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C4  | resendInvite doesn't invalidate old token                              | P1       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C5  | OpenAPI spec exposed without auth                                      | P1       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C6  | No password policy                                                     | P1       | 4     | **Fixed** — `minPasswordLength: 8` + `assertPasswordPolicy` upper/lower/digit enforced server-side at sign-up (REVIEW-FIXES-3 P6, #65)                                                                                                                                                                                                                                                                                                                                                               |
| D1  | Wallet ledger insert not atomic with balance update                    | P0       | 5     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D2  | 8 read-then-write race conditions without optimistic lock              | P1       | 5     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D3  | Payment webhook out-of-order delivery — user not credited              | P0       | 5     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D4  | Booking creation has no idempotency key                                | P1       | 7     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E1  | notification.write() swallows all errors silently                      | P1       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E2  | Google Meet + Resend calls have no timeout                             | P1       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E3  | No statement_timeout on DB pool                                        | P1       | 6     | **Fixed** (`packages/db/src/index.ts:20` — `statement_timeout: 30_000`)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| E4  | No uncaughtException handler                                           | P1       | 6     | **Fixed** (`apps/server/src/index.ts:24`)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| E5  | Webhook timestamp validation disabled outside production               | P1       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| F1  | Unbounded string inputs (no .max()) — DoS vector                       | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| F2  | Unbounded array inputs (no .max())                                     | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| F3  | Dates not validated to be in the future                                | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| G1  | No session expiry configured                                           | P1       | 4     | **Fixed** (`packages/auth/src/index.ts:39` — `expiresIn: 60*60*24*7`)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| G2  | No email verification flow (DEFERRED to production-readiness/PRD-gaps) | P1       | 4     | **Fixed (REVIEW-FIXES-4 P4.4)** — the Better Auth emailOTP plugin for existing-account email verification and sign-in routing for legacy and new unverified accounts, with OTP delivery through the shared email port (`setVerificationEmailSender` + `buildVerificationEmail`). Public email/password signup now uses the REQ-AUTH-01 pre-account proof flow and sends welcome/onboarding mail separately after commit, `/verify-email` UI route; `auth.api.verifyEmailOTP` marks the user verified |
| G3  | Google OAuth credentials fall back to empty string                     | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| G4  | No CSRF token (sameSite=none in production)                            | P0       | 4     | Fixed — session cookies remain sameSite=strict in production; the short-lived OAuth state cookie is sameSite=lax for the Google top-level callback and remains signed, secure, and httpOnly                                                                                                                                                                                                                                                                                                          |
| H1  | CSP incomplete — production-breaking (no connect-src)                  | P0       | 8     | **Fixed** (`packages/api/src/lib/security-headers.ts:15` — `connect-src 'self' ${corsOrigin}`)                                                                                                                                                                                                                                                                                                                                                                                                       |
| I1  | findBookingsExpiringByDeadline has no LIMIT — OOM risk                 | P1       | 8     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| I2  | Missing composite index for overlap check query                        | P2       | 8     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| I3  | Dev DB logging may expose sensitive params                             | P2       | 8     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| J1  | No React error boundary — blank page on crash                          | P1       | 9     | Fixed (`apps/web/src/components/error-boundary.tsx`)                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| J2  | No auth session expiry handling on frontend                            | P1       | 9     | **Fixed (2026-08-22)** — authenticated shell warns during the final 30 minutes, offers sign-in again, and preserves the existing 401 redirect                                                                                                                                                                                                                                                                                                                                                        |
| J3  | 4 dead frontend components                                             | P2       | 9     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| J4  | `any` type casts in route files                                        | P2       | 9     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| K1  | No constant-time comparison for signatures/tokens                      | P2       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| K2  | No body size limit on webhook endpoints                                | P2       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| K3  | Scheduler jobs have no retry attempts                                  | P2       | 8     | Fixed — all 7 repeatable jobs have `attempts: 3` + exponential backoff; DLQ added (prod-fixes M4): failed jobs land in `cogito-jobs-dlq` + bounded Redis list `cogito:dlq` (100 entries)                                                                                                                                                                                                                                                                                                             |
| K4  | DRAFT and AWAITING_MARKS_HOLD are unreachable dead states              | P3       | 2     | Accepted (dead states, no action needed)                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K5  | repricedMarks column is dead — never set or read                       | P3       | 2     | Accepted (dead column, no action needed)                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K6  | timezone field stored but never used                                   | P3       | 2     | Accepted (stored, no action needed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| K7  | metrics.ts has no TTL eviction for stale path entries                  | P3       | 9     | Fixed — `lib/metrics.ts` evicts entries older than 10 min (cleanup every 60s)                                                                                                                                                                                                                                                                                                                                                                                                                        |

### 2026-08-14 audit additions (implemented via PR #46)

Status: verified at git HEAD `ec8b16c` (post-#46 merge). B3/B4/B6/B8/B9 are **Fixed**; U13 remains retained as an implemented reference in `docs/plans/active/PRD-GAPS-PHASE3.md`.

> Note: these B-IDs are distinct from the B1–B6/N-series IDs in the production-readiness plan above (same letter, different findings).

| ID  | Finding                                                                                                                                                                                           | Severity | Status                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| B3  | Group booking with 2 ≤ headcount < target EXPIRES at the 12h deadline instead of repricing + reconfirming (FR-16/TC-18) — `expireBookings` `booking.service.ts:2009-2048` has no headcount branch | High     | **Fixed (#46)** — headcount branch reprices to `AWAITING_RECONFIRMATION` + 12h deadline + notify. Reconfirmation-deadline sub-case → U3 |
| B4  | Knowledge Bank eligibility uses `availableBalance` not total balance (DL-16) — `wallet.service.ts:431`                                                                                            | Medium   | **Fixed (REVIEW-FIXES-2 PR F / U13)** — `knowledgeBankEligible` uses total balance, so held Marks count                                 |
| B6  | No payment/refund notifications at all (notification matrix rows unfulfilled) — `payment.service.ts` writes none                                                                                  | Medium   | **Fixed (#46)** — `payment.{id}.credited`/`.refunded` (+ admin refund payer notify)                                                     |
| B8  | Group-series creation flow missing entirely — `createSeries` hardcodes `targetGroupSize:1` (FR-20 TC-24/25/27/28/30/32-34) — `booking.service.ts:1881`                                            | Medium   | **Fixed (#46)** — `createGroupSeries` with upfront per-session holds                                                                    |
| B9  | `cancelSession` after H-2 throws instead of forfeiting Marks (series rules) — `booking.service.ts:1134-1140`                                                                                      | Low-Med  | **Fixed (#46)** — post-H2 cancelSession forfeits the session hold                                                                       |

**Security items (all resolved in #46 unless noted):**

- ✅ Stub payment checkout flag-gated (`STUB_WEBHOOK_ALLOWED` + `NODE_ENV` not production-like + provider check; staging is production-like — C2)
- ✅ `TRUST_PROXY` handling — `getClientIp` uses `x-forwarded-for` first hop only when trusted
- ✅ Seed script production guard (`SEED_ALLOWED_IN_PROD` + `SEED_ADMIN_PASSWORD` min 12 chars)
- ✅ Webhook idempotency atomic — `IdempotencyStore.claim` keyed on verified payload event id
- ✅ Invite (10/min) + booking mutation (30/min) rate limits; protected
  booking detail/list/availability reads stay outside that mutation bucket so
  normal page refreshes cannot block a reschedule action
- ✅ M3 (prod-fixes): support ticket creation (5/min), achievement submission (30/min), upload URL creation (30/min) rate limits; email-OTP / forget-password / change-email auth paths throttled
- ✅ `PAYMENT_PROVIDER=midtrans` requires Midtrans credentials and explicit `MIDTRANS_MODE` (no silent stub fallback)
- ✅ Production/staging Midtrans Sandbox requires `PAYMENT_TEST_ALLOWED_EMAILS` so sandbox purchases are limited to UAT accounts
- ✅ Unbounded `reason` inputs bounded (`.max(500)`) + `escapeHtml` in email bodies (adminNote interpolation tracked in BACKEND-CLEANUP)
- ✅ OpenAPI spec auth-gated in non-production; read-time body-size enforcement (413)
- Remaining: RPC rate-limit path bug (R1) was **Fixed** (wave-2); password policy (C6) is **Fixed** (wave-3 P6) — see the tables below.

### 2026-08-15 wave-2 findings

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                             | Location                                             |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| R1  | HIGH     | RPC rate-limit paths use dotted keys; real URLs are slash keys — limits never fire. **FIXED** (PR A): path matching extracted to `rate-limit-paths.ts` (`matchRateLimitPath`/`matchAuthPath`), tested in `rpc-rate-limit.test.ts`                                                                                   | `routes.ts`, `rate-limit-paths.ts`                   |
| R2  | HIGH     | Solo `withdraw` from CONFIRMED/SCHEDULED → `AWAITING_RECONFIRMATION` instead of CANCELLED (hold not zeroed, Meet link not cancelled, withdrawn student can reconfirm into a no-hold booking). **FIXED** (PR B): solo CONFIRMED/SCHEDULED/AWAITING_ADMIN_ROOM_APPROVAL → CANCELLED + hold zeroed + meeting cancelled | `booking.service.ts` (withdraw)                      |
| R3  | HIGH     | `meeting.cancelEvent` inside the withdraw tx isn't rolled back if the reprice throws. **FIXED** (PR B): provider call deferred until after `db.transaction` commits (`cancelMeeting` flag)                                                                                                                          | `booking.service.ts` (withdraw)                      |
| R4  | MED      | Historical presigned-POST policy omitted `x-amz-algorithm/credential/date` conditions — R2/S3 rejected unmatched form fields. **SUPERSEDED** (2026-09-01): R2 now uses the AWS SDK presigned PUT flow with signed content type/length; the obsolete POST policy implementation was removed.                         | `storage.ts` (current R2 PUT flow)                   |
| R5  | MED      | REFUNDED webhook keeps credited marks; provider status mapping lacked REFUNDED. **FIXED**: REFUNDED webhook reverses credited marks via `compensate_deduct` (`refund.{id}.reverse` key); `mapMidtransStatus` maps `refund`/`partial_refund`                                                                         | `payment.service.ts`, `midtrans-payment.provider.ts` |
| R6  | MED      | Outbox stale-`sending` reclaim ignores the attempts budget. **FIXED** (PR D): stale reclaim requires `attempts < MAX_DISPATCH_ATTEMPTS`                                                                                                                                                                             | `notification.repo.ts` (claimPendingDispatches)      |
| R7  | MED      | Webhook idempotency claim locks the key 24h on crash. **FIXED** (PR D): claim uses a 120s TTL (processed records still stored for 24h)                                                                                                                                                                              | `payments.ts` (webhook claim)                        |
| R8  | MED      | `waitForMeetUrl` failure after successful insert → duplicate Google events on retry. **FIXED** (PR D): poll failure keeps the created row with `meetingUrl: null`                                                                                                                                                   | `google-meeting.provider.ts` (createEvent)           |
| R9  | LOW      | `eventName` unescaped in the adminReview notification body. **FIXED** (PR D): escaped via `escapeHtml`                                                                                                                                                                                                              | `achievement.service.ts` (adminReview)               |
| R10 | LOW      | `seed-invite.ts` prints the stored token hash as if it were the plaintext. **FIXED** (PR D): prints a fresh-invite hint instead                                                                                                                                                                                     | `seed-invite.ts`                                     |

### 2026-08-17 wave-4 findings

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Location                                                                                                         |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| C1  | CRITICAL | Group `markParticipantNoShow` transitions the whole booking to NO_SHOW and strands other participants' holds (PRD: one no-show forfeits only their own Marks). **FIXED** (REVIEW-FIXES-4 P2.1): group no-show forfeits only the target's hold, keeps the booking live, recomputes `holdAmount` from remaining confirmed participants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `booking.service.ts` (markParticipantNoShow)                                                                     |
| C2  | CRITICAL | Student bypasses the H-2 late-cancel penalty via `proposeReschedule` (no guard that the **current** session is still > H-2 out). **FIXED** (REVIEW-FIXES-4 P2.2): the student branch now requires `b.scheduledStartAt - now > LATE_CANCEL_THRESHOLD_MS` (mirrors `cancel()`); the tutor proposal path and the new-slot H-2 rule are unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `booking.service.ts` (proposeReschedule)                                                                         |
| C3  | CRITICAL | `completeSession` (solo/group) has no "session started" guard (tutor can deduct held Marks before the session) while `completeSeriesSession` has one. **FIXED** (REVIEW-FIXES-4 P2.3): `completeSingleSession` now throws `BookingSessionNotStartedError` when `b.scheduledStartAt > now`, after the SCHEDULED check and before any wallet deduct; completion at/after start (incl. the start+15min lateness edge) is unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `booking.service.ts` (completeSession)                                                                           |
| H1  | HIGH     | Accepted reschedule keeps the deadline at proposal `now+24h` — a reschedule for a session 2 weeks out is auto-cancelled ~24h later and holds released. **FIXED** (REVIEW-FIXES-4 P2.4): `acceptReschedule` now refreshes the deadline for SCHEDULED targets (offline `proposedEndAt+2h`, online `proposedEndAt+24h`, mirroring `transitionBookingToScheduled`/`finalizeMeetingSchedule`) and for AWAITING_ADMIN_ROOM_APPROVAL targets (`min(now+12h, proposedStartAt)`, mirroring the creation path); AWAITING_TUTOR_REVIEW keeps the 12h window. Also restores `expired` to the `reschedule_status_check` constraint (migration 0024) so the RESCHEDULE_PROPOSED expiry branch works                                                                                                                                                                                                                                                               | `booking.service.ts` (propose/accept/expire), `packages/db/src/migrations/0024_reschedule_status_expired.sql`    |
| H2  | HIGH     | Tutor-lateness handling flawed both ways: pre-marking attendance dodges detection; taught-but-unmarked sessions auto-cancel + release holds. **FIXED** (REVIEW-FIXES-4 P2.5): `markTutorAttendance` is now allowed only within `[scheduledStartAt ± 15 min]` (`BookingNotEditableError` otherwise, so pre-marking is impossible); `checkTutorLateness` no longer auto-cancels or releases holds — it keeps the session SCHEDULED with holds intact, merges `overrideMeta.category = "tutor_lateness_pending"` (surfacing the booking in the `adminBooking.listBookings({ category })` queue, reachable via the RPC's `listOverridesInput` filter), writes a `tutor_lateness_pending_review` audit record, and notifies the proposer + tutor. Flagging is idempotent: the lateness sweep excludes already-flagged bookings, so repeat sweeps do not re-flag or duplicate audit/notification rows. NO_SHOW for tutor absence is now an admin decision | `booking.service.ts` (markTutorAttendance, checkTutorLateness), `booking.repo.ts`, `admin-booking.types.ts`      |
| H3  | HIGH     | `relocateRoom` doesn't transition `AWAITING_ADMIN_ROOM_APPROVAL` → SCHEDULED (unlike `assignRoom`), so relocated bookings get expired by the deadline job. **FIXED** (REVIEW-FIXES-4 P2.6): `relocateRoom` now takes an `actorId` and calls `transitionBookingToScheduled` after inserting the new CONFIRMED roomBooking (mirroring `assignRoom`); the safe no-op guard keeps an already-SCHEDULED booking untouched, and the relocated booking's deadline is bumped to `scheduledEndAt + OFFLINE_SCHEDULED_GRACE_MS` so the expiry sweep cannot cancel/no-show it. Covered by `room-relocate.test.ts` (relocate from awaiting → SCHEDULED + deadline bump; from scheduled → no-op; notifications; expiry sweep survival)                                                                                                                                                                                                                           | `room.service.ts` (relocateRoom), `room.handler.ts`                                                              |
| H4  | HIGH     | REFUNDED webhook auto-reversal throws when Marks already spent → webhook 500/retry loop instead of admin reconciliation. **FIXED** (REVIEW-FIXES-4 P2.7): `confirmFromWebhook`'s REFUNDED branch reads the wallet via `getOrCreate` before compensating; when `availableBalance < record.marks` it marks the payment REFUNDED, writes a `refund_webhook_reconciliation` audit record and a `refund_record` row (`reason` "REFUNDED webhook: marks already spent; manual reconciliation required") for admin, and skips the reversal + refund notification — no throw, no 500/retry loop. The clean case (available balance >= marks) still reverses via `compensate_deduct` (`refund.{id}.reverse`) and notifies as before (R5). Covered by `refund-flow.test.ts` (H4) + `payment.service.test.ts`                                                                                                                                                  | `payment.service.ts`, `payment/index.ts` (PaymentAuditPort, PaymentRefundRecordPort)                             |
| H5  | HIGH     | Support SLA is flat 12h; no business-hours/WIB computation or WhatsApp escalation; no auto-ack on ticket creation (PRD OQ-04). **FIXED** (REVIEW-FIXES-4 P2.8): `computeSlaDeadline` applies the OQ-04 rule (30 min Mon–Sat 09:00–21:00 WIB, else 4h; wall-clock), tickets are auto-acknowledged on creation, and escalation emits a `support.{id}.escalated` notification row (metadata `whatsappTarget: +62881011990195`) as the hook a future WhatsApp adapter consumes                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `constants.ts`, `support.service.ts`                                                                             |
| H6  | HIGH     | `applyOverride` to terminal states never cancels the Google Meet event (unlike every other terminal path). **FIXED** (REVIEW-FIXES-4 P2.9): `applyOverride` calls `meeting.cancelEvent(bookingId)` best-effort after the tx commits for terminal transitions (mirroring `cancel()`); a Google failure is logged and never breaks the override                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `admin-booking.service.ts` (applyOverride)                                                                       |
| M1  | MED      | `applyOverride` with `marksAction` but empty `affectedParticipants` silently no-ops the money action → stranded holds. **FIXED** (REVIEW-FIXES-4 P2.9): `planOverride` throws `OverrideMarksParticipantsRequiredError` (400) when a `marksAction` is provided without a non-empty `affectedParticipants`, so a money action is never a silent no-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `admin-booking.service.ts`                                                                                       |
| M2  | MED      | `expireBookings` SCHEDULED→NO_SHOW **releases** holds instead of forfeiting (PRD: no-show → deduct). **FIXED** (REVIEW-FIXES-4 P2.10): the no-show branch now deducts each confirmed participant's held amount (`booking.{id}.no_show.{userId}` event key, `system` actor) and zeroes the participant hold, then transitions to NO_SHOW — the "forgot to click anything" default enforces the forfeit; release stays for genuinely pre-start expiry states (EXPIRED/CANCELLED). Notification copy updated to "held marks were forfeited"                                                                                                                                                                                                                                                                                                                                                                                                            | `booking.service.ts` (expireBookings)                                                                            |
| M3  | MED      | Proposer `cancel()` of a confirmed group **series** bypasses the no-opt-out guard and releases every participant's holds. **FIXED** (REVIEW-FIXES-4 P2.11): `cancel()` throws `BookingSeriesNoOptOutError` (409) for `type === SERIES && targetGroupSize > 1` once the series is past `AWAITING_PARTICIPANT_CONFIRMATION` — the escape hatch is an admin override; pre-confirmation cancellation still works (terminal target falls back to EXPIRED where CANCELLED is unreachable, mirroring withdraw)                                                                                                                                                                                                                                                                                                                                                                                                                                             | `booking.service.ts` (cancel vs withdraw)                                                                        |
| M4  | MED      | `releaseExpiredHolds` releases holds without a state transition → later tutor accept/complete deducts from a zero hold (`InsufficientBalanceError` → delivered-but-unpaid session). **FIXED** (REVIEW-FIXES-4 P2.12): transition-or-skip — the terminal transition (shared `EXPIRY_TARGET` with `expireBookings`) is applied FIRST in the same tx and the hold is only released/forfeited after it succeeds; version conflicts, terminal bookings and RESCHEDULE_PROPOSED (owned by `expireBookings`) are skipped without touching the wallet                                                                                                                                                                                                                                                                                                                                                                                                       | `booking.service.ts` (releaseExpiredHolds)                                                                       |
| M5  | MED      | Reconfirmation-decline / withdraw-pre-H2 don't refresh `deadlineAt` to `now+12h` → sub-12h reconfirmation windows. **FIXED** (REVIEW-FIXES-4 P2.13): both the reconfirm-decline survival path and the withdraw-pre-H2 regression path now call `updateBookingDeadline(now + RESPONSE_WINDOW_MS)` after repricing, so remaining participants always get a full fresh 12h window                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `booking.service.ts`                                                                                             |
| M6  | MED      | `cancelRoomBooking` (admin) only cancels the roomBooking row; the booking stays `AWAITING_ADMIN_ROOM_APPROVAL` until its deadline expires it (PRD FR-22 expects cancel + hold release + audit). **FIXED** (REVIEW-FIXES-4 P2.14): `cancelRoomBooking` now calls `bookingPort.cancelOfflineBooking` (new booking-service method: releases all holds, zeroes the hold, transitions to CANCELLED with reason "No room available" + audit, no-op once the booking left `AWAITING_ADMIN_ROOM_APPROVAL`) in the same transaction; the room lookup broadened to include pending `requested` rows so a never-confirmed room can be cancelled too. A SCHEDULED booking still continues without a room (G14)                                                                                                                                                                                                                                                  | `room.service.ts` (cancelRoomBooking), `booking.service.ts` (cancelOfflineBooking)                               |
| M7  | MED      | Withdraw from `AWAITING_ADMIN_ROOM_APPROVAL` regresses to reconfirmation but leaves the `requested` roomBooking live for admin assign. **FIXED** (REVIEW-FIXES-4 P2.13): both the group regression path and the solo/series cancel path call `roomPort.cancelRequestedRoomForBooking` (new room-service method: cancels the pending `requested` row, no-op if already confirmed/cancelled) so an admin `assignRoom` mid-reconfirmation cannot resurrect a room for a booking heading back to tutor review                                                                                                                                                                                                                                                                                                                                                                                                                                           | `booking.service.ts` (withdraw), `room.service.ts`                                                               |
| M8  | MED      | Pre-H2 withdraw group reprice throws `InsufficientMarksError` and rolls back the withdrawal (PRD TC-19: fall through to expiry). **FIXED** (REVIEW-FIXES-4 P2.15): the withdraw regression branch catches `InsufficientMarksError` from `repriceGroupForHeadcount`, releases the remaining participants' holds, zeroes the booking hold and transitions to EXPIRED (mirroring the B5 expiry fallback) — the withdrawer is never stuck in a group they cannot leave                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `booking.service.ts` (withdraw/repriceGroupForHeadcount)                                                         |
| M9  | MED      | Knowledge Bank eligibility was previously exposed to every protected role. **UPDATED (2026-09-01):** the endpoint and content/file paths admit students, tutors, and admins; students retain the 35-Mark total-balance gate while tutors and admins bypass it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `wallet.router.ts`, `content.router.ts`, `apps/server/src/routes.ts`                                             |
| L1  | LOW      | `completeSeriesSession` can deduct more than the remaining hold after an admin `cancelSeriesSession(..., release)` → `InsufficientBalanceError`; guard with `Math.min`. **FIXED** (REVIEW-FIXES-4 P2.16): both the solo-series and group-series completion deducts are capped at the participant's remaining held amount (`Math.min(session.holdAmount, p.heldAmount)`) so a delivered session never throws on an exhausted hold. P2 follow-up recomputes the admin-cancelled parent hold from remaining confirmed participants and finalizes the series after every child is completed or cancelled, releasing residual holds                                                                                                                                                                                                                                                                                                                      | `admin-booking.service.ts`, `booking.service.ts`                                                                 |
| L2  | LOW      | `meetingEvent` row written on the global `db`, not the booking tx → tx rollback after Google event creation leaves an orphan event + row; tutor re-accept duplicates the event. **FIXED** (REVIEW-FIXES-4 P2.17): `MeetingPort.createEvent` accepts an optional `conn` (DbOrTx) and both providers write the local row through it, so the row commits/rolls back with the booking; `finalizeMeetingSchedule` passes the booking `tx` and best-effort `cancelEvent`s the provider event when the tx fails after creation (no orphan, no duplicate on re-accept)                                                                                                                                                                                                                                                                                                                                                                                      | `google-meeting.provider.ts`, `booking.service.ts`                                                               |
| L3  | LOW      | "Meeting link ready" notification sent even with no URL (fallback provider) — should say "link pending". **FIXED** (REVIEW-FIXES-4 P2.17): `finalizeMeetingSchedule` derives the copy from `meetingResult.meetingUrl` — "Meeting link ready" only when a URL exists, otherwise "Meeting link pending" (manual/fallback rows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `booking.service.ts`                                                                                             |
| L4  | LOW      | Webhook timestamp validation was provider-agnostic; Midtrans notifications use a body signature and no timestamp header. **FIXED**: timestamp validation is provider-conditional and skipped for Midtrans                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `apps/server/src/webhooks/payments.ts`                                                                           |
| L5  | LOW      | `infra/.env.prod.example`/RUNBOOK env table stale — missing R2__, GOOGLE_MEET__, GOOGLE_IMPERSONATED_USER, WEBHOOK_ALLOWED_IPS, SEED_*; RUNBOOK references non-existent `RESEND_FROM_EMAIL` (actual `EMAIL_FROM`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `infra/*.example`, `docs/RUNBOOK.md`, `infra/monitoring.md`                                                      |
| X1  | —        | **Retired provider readiness** — historical implementation completed and later removed during the Midtrans cutover. Active runtime supports `stub`/`midtrans`; historical payment rows remain readable for audit/reconciliation, with no retired-provider rollback path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `docs/MIDTRANS-MIGRATION.md`, `midtrans-payment.provider.ts`, `payment.service.ts`, `packages/env/src/server.ts` |
| X2  | —        | Resend: correct provider; missing `NODE_ENV=production` requirement on `RESEND_API_KEY` → silent stub suppresses all critical emails with no alert. **FIXED** (REVIEW-FIXES-4 P4.1 + prod-fixes C2): env schema superRefine requires `RESEND_API_KEY` when `NODE_ENV` is production/staging and rejects the dev-default `EMAIL_FROM` (must be a verified Resend address)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `packages/env/src/server.ts`                                                                                     |
| X3  | —        | Google Meet: both auth paths correct; missing `GOOGLE_IMPERSONATED_USER` guard for SA mode (events land on the SA's own calendar), no boot-time probe, `.env.prod.example` broken. **FIXED** (REVIEW-FIXES-4 P4.2): env schema requires a complete credential set when `GOOGLE_MEET_ENABLED=true` (OAuth triple OR SA email+key) and `GOOGLE_IMPERSONATED_USER` in SA mode; boot-time `meeting.probe()` (calendarList.get) logs loudly on failure (wired into server bootstrap); `.env.prod.example` + `.env.staging.example` corrected. Also fixed `z.coerce.boolean()` coercing the string `"false"` to `true`; empty and whitespace-only boolean values use their schema defaults                                                                                                                                                                                                                                                                | `google-meeting.provider.ts`, `infra/.env.prod.example`, `packages/env/src/server.ts`                            |
| X4  | —        | R2: the old manual presigned-POST flow was rejected by R2 with `501 NotImplemented` because R2 does not support multipart-form POST presigned URLs. **FIXED** (2026-09-01): R2 uses the AWS SDK presigned PUT flow with signed content type/length, and the upload bucket has browser CORS for the local and production app origins. The existing env guard still requires all four `R2_*` vars together AND `R2_PUBLIC_URL` in production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `storage.ts`, `packages/env/src/server.ts`, R2 bucket CORS policy                                                |
| X5  | —        | WhatsApp/SLA: no WhatsApp adapter (out of scope until approved); SLA business-hours WIB not implemented (H5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                |

## Redis Key Namespace Map

Redis keys follow the pattern `cogito:{namespace}:{key}`. **Redis is mandatory** (`REDIS_URL` is required in the env schema since #48); all stateful services use Redis for persistence. The in-memory implementations remain only as defensive fallback code when a configured Redis call fails at runtime.

| Namespace       | Key Pattern                            | Used By                       | TTL / Eviction               |
| --------------- | -------------------------------------- | ----------------------------- | ---------------------------- |
| `cogito:idem`   | `{prefix}:{parts}`                     | IdempotencyStore              | 24h TTL (Redis EX)           |
| `cogito:rl`     | `{keyPrefix}:{identifier}`             | rateLimit                     | Window TTL (Redis EXPIRE)    |
| `cogito:cb`     | `{name}`                               | CircuitBreaker                | 2× resetTimeout (Redis HSET) |
| `better-auth:*` | `{token}` / `active-sessions-{userId}` | Better Auth secondary storage | Session TTL (Redis EX, 7d)   |

> Session cache (R1, 2026-09-05): Better Auth reads sessions from Redis
> (`packages/auth/src/secondary-storage.ts`, `better-auth:` prefix — its own
> convention, not the `cogito:` namespace) with `storeSessionInDatabase: true`,
> so the database row remains the fallback and revoke clears both stores.
> Redis failures degrade (warn, never 500). `cogito:sess` stays reserved/unused.
> | `cogito-jobs` | BullMQ managed | Scheduler | Per-job repeat interval |

### In-Memory Fallback (defensive only)

Each stateful service (`IdempotencyStore`, `rateLimit`, `CircuitBreaker`) checks for Redis availability at runtime. If a configured Redis call fails, the service falls back to an in-memory implementation (with a warning log):

- **IdempotencyStore**: `Map<string, { result, timestamp }>` with periodic cleanup and max-entries eviction.
- **rateLimit**: `Map<string, { count, resetAt }>` with periodic cleanup and max-entries eviction.
- **CircuitBreaker**: In-memory `state`, `failureCount`, `lastFailureTime`, `halfOpenAttempts` fields.

Redis itself is mandatory (`REDIS_URL` is required); the fallback only keeps tests and degraded moments working, and only per-process.

### Adding Redis to a New Feature

1. Define your key pattern in `COGITO_NS` (in `packages/api/src/lib/redis.ts`).
2. Accept an optional `redis?: RedisClient` parameter in your service constructor.
3. Try Redis operations in a `try/catch`, falling back to in-memory on failure.
4. Test both paths: unit tests use `InMemoryRedis`, integration tests (if any) use real Redis.

## How to Add a New Module

Follow the 4-layer architecture: **Router → Handler → Service → Repository**.

### 1. Create the module directory

```
packages/api/src/modules/{module}/
├── {module}.types.ts    # Zod input/output schemas
├── {module}.errors.ts   # DomainError subclasses
├── {module}.repo.ts     # Data access (SQL queries only)
├── {module}.service.ts  # Business logic + consumer port interfaces
├── {module}.handler.ts  # DI factory: { context, input } → service calls
├── {module}.router.ts   # oRPC route definitions
└── index.ts             # createModule() factory function
```

### 2. Define types and errors

```ts
// {module}.types.ts
import { z } from "zod";
export const createSomethingInput = z.object({ name: z.string().min(1) });
export type CreateSomethingInput = z.infer<typeof createSomethingInput>;

// {module}.errors.ts
import { DomainError } from "../../lib/domain-errors";
export class SomethingNotFoundError extends DomainError {
  constructor(id: string) {
    super("SOMETHING_NOT_FOUND", `Something ${id} not found`);
  }
}
```

### 3. Create the repository

```ts
// {module}.repo.ts
import type { DbOrTx } from "../../lib/tx";
export interface SomethingRepo {
  findById(db: DbOrTx, id: string): Promise<Row | null>;
  create(db: DbOrTx, data: CreateData): Promise<Row>;
}
```

### 4. Create the service with consumer-driven ports

```ts
// {module}.service.ts
export function createSomethingService(deps: {
  repo: SomethingRepo;
  auditPort: AuditPort;     // Only the methods this module needs
  walletPort: WalletPort;   // Only the methods this module needs
}) { ... }
```

### 5. Create the handler

```ts
// {module}.handler.ts
export function createSomethingHandler(service: SomethingService) {
  return {
    create: async ({ context, input }) => { ... },
  };
}
```

### 6. Create the router

```ts
// {module}.router.ts
import { publicProcedure, protectedProcedure } from "../../procedures";
export const somethingRouter = {
  create: protectedProcedure.input(createSomethingInput).handler(...),
};
```

### 7. Wire into the composition root

Add to `packages/api/src/services.ts`:

- Import and call `createSomethingService({ repo, auditPort, walletPort })`
- Import and call `createSomethingHandler(service)`
- Add to `ServiceRegistry` type

Add to `packages/api/src/routers.ts`:

- Add `something: somethingRouter` to `appRouter`

### 8. Add DB schema and migration

In `packages/db/src/schema/`:

- Define the table with `pgTable`, checks, and indexes
- Export from `packages/db/src/schema/index.ts`
- Run `bun run db:generate` to create a migration

### 9. Add tests

Create `packages/api/src/tests/unit/{module}.service.test.ts` and `packages/api/src/tests/unit/{module}.handler.test.ts` with:

- Mock `DbOrTx` as `{ transaction: mock(async (fn) => fn(tx)) }` plus repo mocks
- Test each service method for happy path and error cases
- Test handler input validation and authorization

### Key Conventions

- **No `shared/ports/` directory** — ports are consumer-driven interfaces defined inline in the consuming service file.
- **`DbOrTx`** type from `packages/api/src/lib/tx.ts` — pass `db` for reads, `tx` inside transactions.
- **`ORPCError`** from `@orpc/server` for HTTP error responses.
- **`DomainError`** subclass for business logic errors — mapped in handlers via `withDomainMap()`.
- **Consumer-driven port interfaces** — each module declares only the methods it needs from other modules.
- **Redis integration** — optional `redis?: RedisClient` parameter with in-memory fallback.
- **Circuit breaker** — wrap external service calls (email, meeting) with `CircuitBreaker` from `../../lib/circuit-breaker`.

## Common Commands

```bash
bun install                # Install deps
bun run dev                # Dev all (web + server)
bun run dev:web            # Dev web only
bun run dev:server         # Dev server only
bun run db:start           # Start PostgreSQL Docker
bun run db:migrate         # Apply migrations
bun run db:generate        # Generate migrations
bun run db:studio          # Drizzle Studio
bun run check              # Oxlint + Oxfmt
bun run check-types        # TypeScript check (all workspaces)
bun run build              # Build server + web
bun run test               # Run tests
bun run test:coverage      # Run tests with coverage
```

### 2026-08-25 audit findings (fixed and merged via #106)

Status: **all fixed and merged via #106 (2026-08-26)**; the follow-up re-audit findings (N1–N4, W1–W5) were fixed and merged via #107 (2026-08-26). Findings come from the two-worker audit (worker A: business-logic/data layer; worker B: server/ops/CI) plus lead re-verification.

| ID      | Severity | Finding                                                                                                                                                                                                       | Fix                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | HIGH     | Seed package prices stale vs PRD OQ-01 (Starter 50/430k, Pioneer 300/2.18M — PRD: 50/312.5k, 400/2M)                                                                                                          | `0041_seed_mark_packages.sql` now installs/upserts the PRD catalog during normal migrations; seed-packages.ts/seed.ts/test-client remain aligned for local/test setup                                                                                                                                                                                                                                                     |
| F2      | HIGH     | `invite.claim` silently demotes an admin to tutor (no role guard; CONTEXT claimed a guard that didn't exist)                                                                                                  | `validateClaim` throws `InvalidRoleForClaimError` for admin accounts                                                                                                                                                                                                                                                                                                                                                      |
| F3      | HIGH     | `reconfirm` accept path skips re-reprice when headcount changed mid-cycle (PRD: recalculate + reissue)                                                                                                        | re-enters AWAITING_RECONFIRMATION + fresh 12h + reprice; survivors reset to `confirmed`                                                                                                                                                                                                                                                                                                                                   |
| F6      | MEDIUM   | `tutorAccept` meeting failure leaves CONFIRMED booking with stale deadline (expiry can fire while retry pending)                                                                                              | deadline bumped to `scheduledEndAt + 24h` on failure                                                                                                                                                                                                                                                                                                                                                                      |
| F7      | MEDIUM   | Outbox `claimPendingDispatches` OR-precedence could claim `sending` rows past the attempts budget                                                                                                             | predicate parenthesized + regression test                                                                                                                                                                                                                                                                                                                                                                                 |
| F8      | MEDIUM   | `markTutorAttendance` inserts a CONFIRMED tutor row that `findConfirmedParticipants` counts into group repricing                                                                                              | repo excludes `role='tutor'`                                                                                                                                                                                                                                                                                                                                                                                              |
| F9      | MEDIUM   | Lateness sweep filters `modality=online` — offline no-show tutors never flagged                                                                                                                               | filter removed (offline scheduled bookings flagged too)                                                                                                                                                                                                                                                                                                                                                                   |
| F10     | MEDIUM   | `setMeetingLink` writes the meetingEvent row on the global db, not the booking tx (orphan on rollback)                                                                                                        | `conn: DbOrTx` param threaded through providers                                                                                                                                                                                                                                                                                                                                                                           |
| F11     | MEDIUM   | `adminRefund` FIFO spend across ALL payments — can over-credit the wrong payment                                                                                                                              | per-payment FIFO attribution (`listCreditStatePaymentsForUser`), capped at availableBalance                                                                                                                                                                                                                                                                                                                               |
| F12     | MEDIUM   | Achievement `archived` status defined but unreachable (no archive/restore action)                                                                                                                             | `adminReview` supports archive + restore transitions                                                                                                                                                                                                                                                                                                                                                                      |
| F14     | MEDIUM   | `getTutorPayouts` unbounded query + N+1                                                                                                                                                                       | documented (pagination follow-up; payouts are admin-internal, low volume)                                                                                                                                                                                                                                                                                                                                                 |
| F15     | MEDIUM   | `invite.claim` doesn't require `emailVerified` (PRD: "after email ownership is verified")                                                                                                                     | documented as defense-in-depth — claim requires a valid session; OTP is the email-ownership proof at signup                                                                                                                                                                                                                                                                                                               |
| F16–F19 | LOW      | Role-scope drift: `searchStudents`/`achievement.*`/`payment.createPurchase` not student-scoped                                                                                                                | `studentProcedure`/`verifiedStudentProcedure` applied                                                                                                                                                                                                                                                                                                                                                                     |
| F22     | LOW      | `assignRoom`/`relocateRoom` insert roomBooking rows on wrong-state bookings                                                                                                                                   | `RoomBookingStateError` guard (awaiting approval + RESCHEDULE_PROPOSED carve-out)                                                                                                                                                                                                                                                                                                                                         |
| F24     | LOW      | `applyOverride` silently ignores non-participant `affectedParticipants`                                                                                                                                       | `OverrideParticipantNotInBookingError`                                                                                                                                                                                                                                                                                                                                                                                    |
| F25     | MEDIUM   | `reviewTutorProfile` has no per-status action state machine                                                                                                                                                   | `REVIEW_ACTION_TABLE` in `validateReviewAction`                                                                                                                                                                                                                                                                                                                                                                           |
| S1      | HIGH     | API-REFERENCE documents wrong RPC paths (`/rpc/tutor/booking/list` vs actual `/rpc/tutorActions/listBookings`; oRPC derives URLs from router keys)                                                            | API-REFERENCE corrected to the true paths                                                                                                                                                                                                                                                                                                                                                                                 |
| S2      | MEDIUM   | Sanity proxy streams unbounded upstream bytes (no size cap)                                                                                                                                                   | 5MB cap (content-length + streamed counter) + 10s timeout + host allowlist + 30/min rate limit                                                                                                                                                                                                                                                                                                                            |
| S4      | MEDIUM   | Auth rate limiter path prefixes miss better-auth's real endpoints (`/request-password-reset` and `/reset-password` have no trailing segment — password-reset brute force and OTP-email spam were unthrottled) | `matchAuthPath` now matches at segment boundaries (exact path or `prefix/`), covering `/sign-in/email`, `/request-password-reset`, `/reset-password`, `/change-email`, `/email-otp/*`                                                                                                                                                                                                                                     |
| S7      | MEDIUM   | `cd-prod.yml` deploy trigger: unset `COOLIFY_PROD_SERVER_WEBHOOK` secret → `curl` exit 6, image pushed but never deployed                                                                                     | **Fixed (#118)** — webhook secrets guarded (clear error + exit 1); `scripts/migrate-and-deploy.sh` polls `/health` until `version == GIT_SHA`; canonical Coolify host renamed to `cl.cogitoacademy.id` (2026-08-31, was `coolify.cogitoacademy.id` — the live host); operator must recreate the secrets with the resolvable `https://cl.cogitoacademy.id/api/v1/deploy?uuid=...` URL (Option A, DEPLOYMENT-PLAN Task 0.2) |
| S14     | LOW      | CI coverage gate excludes `apps/server/src/` (except openapi.test.ts) — 100% claim covers a curated subset                                                                                                    | **report-only** — server suite runs in a separate process; coverage consolidation tracked in DEFERRED-OPS                                                                                                                                                                                                                                                                                                                 |

## Tutor weekly honorarium and payout account (2026-08-28)

Tutor-facing financial UI uses IDR and never presents internal/student Marks. The tutor dashboard reads only the authenticated tutor's unpaid count, gross, rate/status, tax, transfer fee, net, and own payout history. NIK/NPWP and bank account fields stay out of public discovery and tutor finance responses. A new payout requires legal name, 16-digit NIK, and complete bank details; published tutors may continue teaching before tax-profile completion.

Admin payout uses immutable selected-source previews and two phases: prepare the versioned fee/profile/rate/bank snapshot, then record the externally performed transfer only after its exact net amount is paid. Admin default rates are configurable (250 bps for NIK+NPWP, 300 bps for NIK-only and missing identity), with audited tutor overrides. Whole-IDR withholding uses basis-point arithmetic and one Rp2,500 non-BCA fee per batch; exact bank name `BCA` is fee-free. The historical cutoff applies only to allocationless aggregate rows; pre-T03 rows that already have source allocations are scoped by those rows even when preview fields are NULL. Void keeps history and releases allocations; when transfer evidence exists, reconciliation blocks repayment for each released source until audited resolution. Admin and tutor history, CSV, and payout notifications label missing legacy coverage/tax snapshots as unavailable rather than inventing zero values. Paid CSV rows use saved snapshots and actual `paidAt` in Asia/Jakarta, with void/reconciliation rows separate. No historical aggregate or tax snapshot is backfilled. These defaults are not legal validation; tax-adviser confirmation remains OPS01.

## Cogito Marks amount presentation (2026-09-08)

Student- and admin-facing numeric Marks amounts use the shared `CogitoMarks` component, which prefixes the value with the Cogito mark symbol and supplies an accessible `N Marks` label. Conceptual copy such as “Top Up Marks” remains plain text.

### T07 integrated development checkpoint (21 October)

Report workspace, class settlement, immutable revisions and class fee payout identity are integrated through `d508467b` on local `f/release-v3`. Development DB 6767 is migrated through 0067 (journal id 88; hash `0510e3bd5f1fd36860b8f289c81db5034b4ba40a2f1527736ea280ea77651037`), with API health and protected report route verified after restart. Isolated acceptance: report journey 1 pass, enrollment 2 passes on each of two runs, web/E2E typechecks passed; the saved DB suite passed 29 tests / 203 assertions. At that checkpoint PDF export, on-demand admin correction and remaining T06 lifecycle rules were still open; main was unchanged.

### T07 pending-report reminder implementation (21 October)

This isolated T07 worktree wires pending report reminders into the existing
one-minute class-enrollment scheduler. It queues a bounded batch of
private tutor reminders for ended, scheduled cohort/masterclass sessions with no
report. The first reminder is due at session end and repeats per 24 elapsed
hours; catch-up writes only the current period. Existing unique notification
event keys and the email outbox provide restart/replay idempotence without a
migration. The worker rechecks report, class/session state, schedule and tutor
under the class/session locks. A whole-class cancellation keeps a retained past
scheduled session eligible; cancelled/completed sessions, completed classes and
submitted reports stop reminders. It does not touch report, delivery, wallet,
allocation or tutor-fee state. Fake-clock unit tests pass 7 / 25; guarded non-reset
PostgreSQL regressions pass 3 / 34 on exact loopback `6769/cogito-test`, using
only owned UUID fixtures. No live email, browser or external provider was used.
At this 21 October class-only checkpoint, legacy solo/group/series reminder
coverage remained pending; the 23 October continuation below records its
implementation. PDF export and the
dedicated on-demand admin correction workflow remain pending.

### T07 legacy on-demand missing-report reminders (23 October)

The existing one-minute `class-enrollment-check` scheduler now also runs a
bounded tutor-only worker for ended solo/group bookings and scheduled series
children without their matching report. It repeats at session end and every 24
elapsed hours, with delayed runs writing only the current period. The worker
locks the booking and (for a series) its child, then rechecks tutor, state,
schedule, report absence and event identity in the notification/outbox
transaction. Whole-session cancel/completed/no-show states are excluded;
participant-level group/series no-show does not by itself mean the remaining
session was not delivered. The message explicitly asks tutors to report only if
delivery occurred. It does not mutate completion, report, wallet, fee or
settlement state and adds no migration. SQL eligibility, elapsed periods, and
locked schedule fingerprints use full stored timestamp precision; only the
pagination cursor is normalized to milliseconds. Historical focused suites
passed 7 / 27 and 8 / 33; the current unit suite passes 10 tests / 44
expectations, including a pg-proxy period regression. The normal pre-push typecheck passed 4/4 tasks in 14.961s (2 cached). Guarded non-reset PostgreSQL acceptance passed 3 tests / 32 expectations at 127.0.0.1:6769/cogito-test; browser and actual email delivery remain open. PDF remains open.

The global bounded scan advances a process-local keyset cursor after each
candidate, including failed outbox writes, and wraps to retry the oldest due
items. Restart returns to the oldest item; event-key/outbox dedupe is durable,
but the fairness cursor is not. A unit regression covers a failed 100-item
batch progressing to later eligible bookings and wraparound retry. Guarded
PostgreSQL regressions for actual report/state rechecks, duplicate scheduling,
tutor-only email outbox identity, microsecond cursor progress, single and
series-child 24-hour boundaries, due-at-end and same-millisecond reschedule
rejection passed 3 tests / 32 expectations on guarded loopback 127.0.0.1:6769/cogito-test, with test-only timestamp fixture corrections and no migration, reset, or seed. The current
focused unit suite
passes 10 tests / 44 expectations. The normal pre-push typecheck passed 4/4 tasks in 14.961s (2 cached).

### KOL responsive polish checkpoint

Frontend checkpoint (2026-10-25): KOL settlement responsive polish only. Long unbroken history references overflowed the card (1743px content at 288/358/736/1119px card widths) and were clipped by the existing app scroller. Settlement cards now wrap identifiers; settlement/export buttons grow with labels and retry actions wrap. Synthetic Edge checks pass 13/13; see RUNBOOK. No backend, accounting or authorization changes. Economy, payout, class/report, native 200% zoom, RTL and screen-reader acceptance remain unverified.

### Economy/payout responsive checkpoint (25 October 2026)

The bounded frontend slice gives V3 economy amount controls a 14rem minimum width so ten-digit IDR values remain readable inside locally scrolling tables. Shared Card/NumberField styles and financial/auth/RPC behavior are unchanged. Dedicated mocked Edge coverage inspects economy read/edit and tutor payout prepared, unpaid-preview and void/reconciliation drawers at 320/390/768/1440 CSS px. This is synthetic layout evidence, not payout persistence or release acceptance; native 200% zoom remains unverified. See RUNBOOK and the active UI audit plan.

### Canonical KB/calendar management (25 October 2026)

Admin authoring is now part of `/knowledge-bank` (resources/PDFs) and `/calendar` (events), with View/Manage controls on each page. The duplicate KB & calendar sidebar destination is removed; `/admin-content` remains an admin-only compatibility redirect to Knowledge Bank. Student/tutor readers and server-side access gates are retained. Editor queries run only in Manage mode, and save/delete invalidates the corresponding reader query. This UI consolidation requires no migration or API/provider change.

### Academy capacity policy (2026-10-29)

Academy class capacity is set by Cogito per session and is independent of tutor online/offline private teaching limits. Draft save and publication retain tutor status/mode, schedule overlap, session quota, and managed-room capacity validation.

Classes catalog cards on mobile and desktop follow My Bookings: date tile and session metadata, class title, competition and rate, class type/session count, and a compact Details action aligned to the right. The same card composition is used across the responsive catalog grid. Prices use Start from with the lowest positive configured cohort plan rate or the masterclass rate; missing rates show Price unavailable.

Classes and My Bookings share `FilterTabBar` for pill styling and horizontal overflow; booking counts remain optional per tab.

Classes page heading uses the Tutors page typography and title-to-description spacing (Heading md, muted Text, no extra vertical gap).

Classes competition badges use the configured parent competition palette (or the competition itself for root types), with light/dark theme support and a neutral fallback.

Classes card metadata shows tutor names for masterclasses and session count for cohorts; cohort cards omit tutor names and avoid repeating the session count.

Classes card session metadata uses an explicit flex column so icon-bearing Selia Text rows remain stacked vertically.

Cohort catalog cards show the first-to-last session date range instead of a session time. Enrollment copy reflects the per-session start cutoff and availability, not a single cohort-wide deadline; single-session enrollment can select a future session mid-cohort, while full/half plans quote remaining upcoming sessions.

Classes catalog Cohort/Masterclass type badges use the tertiary variant to distinguish them from the card background.

Class detail uses a compact overview with competition palette, tertiary class type, expandable description, schedule metadata and starting price. Desktop enrollment sits beside the overview and expandable session curriculum; mobile order is overview, enrollment, sessions. Existing ClassEnrollmentPanel retains authentication, payment, cancellation and postponement handling. No progress/review/week grouping is inferred.

<!-- Student referral dashboard, 2026-10-29 -->

Student referrals: `/rpc/referral/getMine` now includes `friends` scoped to the authenticated referrer (name, signup date, first completed paid session date, credited Marks). The page shows an invitation panel, inline semester summary and full-width invited-friends table with account-created/completed-session states; zero credited Marks remains visible when no reward was granted. No migration or environment changes required.

Student referral layout (30 October): invitation panel highlights the code and copy action; inline semester metrics precede the full-width friends table. Mobile stacks the invitation content and semester metrics. Completed referrals with zero reward explicitly show No Marks credited.

Enrollment & payment uses one outer Card. Existing enrollment summaries, new-plan payment summary, and quoted top-up use plain sections and dividers; financial calculations and mutation handlers are unchanged.

### Class detail layout validation (2026-10-29)

Compact overview, expandable session curriculum, and the single-card enrollment/payment panel are implemented locally. Focused Edge synthetic browser run: 25 passed in 43.8s, covering catalog/detail widths 320/390/768/1440, keyboard disclosure, long/empty/missing content, starting rate and schedule ordering, unavailable states, signed-out/unverified/tutor route guards, loading/API errors, postponed/sold-out states, mid-cohort single-session request selection, and pending/second-installment/shortfall/defaulted payment controls. Web and E2E typechecks, scoped lint, and diff checks pass. Desktop render was inspected. No live DB checkout, provider/payment, cancellation transaction, or production acceptance was run; broader release gates stay open.

Class enrollment plan selection uses Selia tabs (Full, Half, Single session), retaining allowed-plan restrictions; single sessions use a labeled radio list. Session accordion cards use tighter horizontal and vertical padding.

Plan-tab and compact-session follow-up: 27 focused synthetic Edge cases are covered (26 passed initially; the desktop catalog navigation timeout passed on a focused rerun). Direct/keyboard plan switching and reduced session padding pass at 320/1440px. Web and E2E typechecks, scoped lint and diff checks pass; web typecheck used GOMAXPROCS=2 and GOMEMLIMIT=768MiB after an initial machine-memory failure. Live payment/provider acceptance remains unrun.

Class enrollment uses the Booking summary presentation: warning IconBox header, label/value metadata and cost rows, and a CardFooter action. The single-session radio list excludes sold-out/already-entitled sessions; summary tutor, format, schedule and amounts reflect the selected session. Existing checkout, installment and top-up handlers remain intact.

Booking summary/radio follow-up: 29 focused synthetic Edge browser cases passed (53.4s), plus 6 pricing unit tests / 22 assertions. Final layout adjustment was rechecked with 5 passing overview/radio responsive cases (13.4s). Web/E2E typechecks, scoped lint and diff checks pass. Mobile and desktop renders were inspected. Live database checkout, external payment/provider calls and production acceptance remain unrun.

My referrals Invited friends table has a hover/click InfoPreview on Status explaining Account created and First session completed. The descriptions follow the existing completedAt projection and do not imply a fixed reward beyond the semester cap.

My referrals table and reward note sit directly in a semantic section below the invitation panel and semester summary.

Admin referral layout (2026-10-30): Activity and KOL campaigns use the shared FilterTabBar. Activity opens by default with inline summary metrics above the filtered usage table. Usage details open in a Selia drawer with collapsible technical evidence and saved terms. Existing search, pagination and campaign actions remain; API and reward rules are unchanged.

Classes catalog cards lead with a two-line class title, then competition/type/status badges, then date and session metadata. Starting price and Details share the bottom row. Masterclass date/time is consolidated in metadata. Focused synthetic catalog/enrollment browser checks pass at 320, 390, 768 and 1440px (4/4); mobile render inspected.

Published admin classes render directly in the tab without an outer Card, using the student catalog card grid, title and badge hierarchy, and WIB date tiles; meeting setup and class management remain available within each card.

Class studio: the tab bar has Drafts and icon-only New class actions. Drafts toggles the saved draft list; selecting a draft or creating a class closes the list so the editor appears alone by default.

Shared CardBody table spacing (2026-10-29): remove top padding when a direct-child TableContainer is first and bottom padding when it is last. This also covers tables followed by pagination or preceded by controls, while preserving the inset for those siblings.

Class studio draft list and editor are mutually exclusive. The icon-size New class action opens an editor grouped into details, pricing/enrollment, and sessions cards, following tutor profile form sections. Cohort pricing uses explicit vertical spacing.

The Session Reporting tab in `/class-reports` uses a full-width Selia table for class/session, Jakarta date, format, report status, and selection action. Search and filters narrow by class/session text, class type, date range, and report status; clearing filters resets the list. The selected report reader/editor follows below; narrow screens scroll the table horizontally.

Published class Manage class opens a right-side Selia drawer with a scrollable body containing cancellation and lifecycle controls, replacing the inline accordion.

### Tutor honorarium in booking detail (2026-10-29)

Admin booking participant details show tutor gross IDR honorarium per recorded session with payout status; student wallet and booking ledger remain available.

Page title convention: use Selia `Heading level={1} size="md"` followed by `Text className="max-w-full text-muted"` in a plain div (optionally `min-w-0 max-w-full`).

Class Studio Manage class uses the default Selia side drawer width (max-w-md, 28rem).

Academy class scheduling (2026-10-29): the admin session form accepts start date/time and duration in minutes (default 60). Editing derives duration from existing timestamps; saving computes endAt as startAt plus duration. The API and stored startAt/endAt contract remain unchanged; no migration or environment change is required.

Session reports UI: a single empty state replaces redundant export and selection placeholders when no sessions exist. Student Reports now uses a selection toolbar and the eligible catalog; bulk PDF requests include explicit reportIds, with the entitlement window unchanged.

Academic class references (2026-10-30): academy_class.class_number is a database-generated serial with a unique constraint (migration 0076_academy_class_number). Admin class reads, public catalog responses and class session report rows expose classNumber. Session Reports displays/searches CLS-{classNumber}; UUIDs remain the relational identifiers. Applying 0076 and restarting API processes is required before running this schema. Migration has not been applied by this change.

Notification bell and sidebar booking indicators use red dots. The bell checks unread notifications with `notification.list({ unreadOnly: true, limit: 1 })`; the sidebar requests one action booking instead of 100. No numeric totals are fetched for these indicators.

Tutor pricing (V3 only): Cogito admins own all honorarium rates. Tutor profile updates reject changed `prices` or `baseRatesIdr` even before an economy revision is active. Tutor onboarding does not require legacy rates; without active pricing, the UI shows an admin-configuration message instead of editable inputs. Configure pricing through admin economy settings before new sales.

Referral empty states (30 October): reuse the shared EmptyState with contextual icons and copy. Student invites offer a copy-message action; filtered admin results offer Clear filters; unfiltered activity explains when records appear; an empty KOL list opens the existing create form. No new API or reward rules.

Navigation query caching: fresh query data is reused for 60 seconds on remount; stale or invalidated queries still refetch. First visits still fetch from the API. Live navigation latency has not yet been measured.

Admin referral detail refinement (30 October): table prioritizes student identity, source, split date/time, outcome and right-aligned welcome credit. Compact chevron actions have student-specific accessible labels. Drawer remains mounted with selected content retained during closing so Selia enter/exit transitions can run. Detail sections separate identity/source, rewards/outcome, and collapsible technical evidence; null technical fields are omitted. No RPC or reward-rule changes.

## Student report bulk export (30 October 2026)

The Session Reports workspace defaults to Student Reports for admin/student. Admin selects one student using the toolbar search; students see their own reports. The same input searches report references, sessions and metadata after student selection. One eligible catalog includes private, cohort and masterclass feedback from the existing three-calendar-month entitlement window. Checkboxes select up to 100 reports across client-side filters/pages (10 rows/page); changing student clears selection. View opens a Selia drawer. Download Selected combines exactly the chosen reports into one PDF. Admin Session Reporting and the tutor workspace retain class feedback submission/correction and settlement behavior. Pending reports remain in Session Reporting, outside the downloadable catalog.

POST /reports/student/list and PDF export share the same authorized eligibility loader. Bulk export revalidates every source-qualified ID and returns 409 if any is unavailable; it never silently exports a subset. Route/selection/access/window/PDF-layout tests (19 cases / 71 assertions), focused lint and web typecheck cover this slice; Eight synthetic Edge journeys pass, including exact selected-ID download payloads, empty states, role-specific drawers/editors and selection retention at 320/1440px. Live database/auth and selected-data PDF acceptance remain open.

- Academy class editor: cohort session actions follow Tutor Experience placement: add at the last session footer, icon-only remove at each footer, disabled for the final remaining session.

Admin referral density (30 October): activity records now use a single text line with centered alignment and compact vertical padding. Student email, source owner, reward breakdown and verification remain in the detail drawer; date/time is inline. No API or business-rule changes.

- Academy session editor reuses the class-detail Selia accordion pattern. Sessions expand independently; adding a session opens its fields. Panels stay mounted to retain native form validation.

- Class editor Sessions uses one outer Card with a single heading and description. Session accordion rows use separators rather than individual card surfaces; panel padding preserves field rings.

UI states: use the shared EmptyState for empty collections and Loader without visible loading text for pending content. Loader retains an accessible status label.

Latest shared-checkout typecheck (30 October 2026): web passed before concurrent changes; the final rerun is blocked by academy-class-page.tsx:1274 (Accordion onValueChange unknown[] versus number[]). Server check remains blocked by the unrelated unused MODALITY import in tutor.service.ts. No errors from the bulk-report files were reported. Focused lint, formatting, route/selection/PDF tests and the eight synthetic Edge journeys passed; these do not prove live API/database acceptance.

### Session Reporting workspace

Session Reporting combines ended private booking sessions and cohort/masterclass sessions in one searchable, paginated table. Search accepts BKG/CLS references or titles; type and report-status filters narrow the list. Selecting a row opens its report in a drawer. Student Reports remains the student-centric bulk PDF workspace. Booking detail shortcuts open `/class-reports?workspace=sessions&report=private:<booking-or-child-id>`. Recorded private reports are view-only for tutors and correctable by admins; class report permissions remain unchanged.

Competition types uses a compact Selia table with collapsed category rows and expandable specialization tables. Search reveals matching groups. Superseded migration-0027 seed IDs are excluded from this admin directory; database records remain untouched.

Others article layout follow-up (2026-10-30): at desktop widths (1024px+),
the detail modal places cover/title/schedule/location in the left column and
rich article content in the right column. Narrower screens stack metadata
above the body. No data/API change. Scoped lint and marketing tsc pass.

Activities admin editor layout correction (2026-10-30): the owner intended
the cogito-app authoring form. At 1024px+, metadata/publication occupies the
left column and English/optional Indonesian rich-text editors occupy the right
column, with a larger desktop editing area. Mobile stacks fields above editors.
Save/cancel remain in the same form. Scoped lint passes; whole-app typecheck
still reports the pre-existing academy-class-page Accordion type error.

### KB/calendar management controls (2026-10-30)

Admin resource and event lists use tables. Calendar education levels are `sd`, `smp`, `sma`, `mahasiswa`; scale is `international` or `national`, validated by the authoring API. Dates use the shared date picker in WIB, preserving existing times. Manual order is hidden; new entries default to zero and edits retain stored order. Resource categories render verbatim. Admin-only `/rpc/adminContent/previewPdf` accepts `{ "json": { "fileId": "..." } }` and returns a base64 PDF plus its filename, including archived/unattached files; authoring must be enabled. The browser renders a temporary PDF blob and revokes its URL when closed/replaced. Web CSP permits blob frames; deploy the updated nginx configuration with the web app. No database migration is required.

KB/calendar management now follows the FAQ page composition: header add action, status filter, list plus sticky desktop editor, and right-side drawer on smaller screens. Tables remain the record list; opening another entry or closing the editor confirms draft discard.

KB/calendar management refinement: compact rows, shared TablePagination (10 records per page over the loaded admin collection), search resets pagination, no active/archive filter or manual reload control. Existing TanStack Query refresh and mutation invalidation remain. Calendar create/update/delete accept an omitted reason and generate an operation-specific audit reason; Knowledge Bank changes still require a reason. Deploy matching API and web changes together; no environment or database migration changes.

KB/calendar editor confirmation uses Selia Dialog for discarding drafts and deleting entries. Discard confirmation appears only when field values differ from the opened draft; closing an unchanged editor proceeds immediately.

Calendar toolbar: admin management is an accessible gear-only button immediately before Filter inside CompetitionCalendar, including empty calendars. Calendar page/panel widths are constrained to their parent so the 720px month grid scrolls horizontally inside the panel on narrow screens. Focused mocked browser checks cover scroll movement, toolbar placement, manage navigation, and reader visibility; they do not prove live API/data behavior.

### Booking exact top-up (2026-10-30)

Private booking summaries now quote the current Marks shortfall using the existing payment quote and purchase RPCs. A drawer confirms the exact IDR price and opens hosted payment in a separate tab so booking selections remain available. Returning to the booking tab refreshes the wallet; Check balance also refreshes it. Continue booking becomes available when the wallet has sufficient available Marks. Booking submission still validates current availability and price; payment does not reserve a slot. Same-tab redirect restoration and automatic booking submission are not implemented. Provider/browser acceptance remains pending.

Competition types directory toolbar now places search, an icon-only status filter, and an icon-only Add competition action in one row. Both actions retain accessible labels and title hints. The table keeps a 48rem minimum width and nonwrapping records, scrolling horizontally inside its focusable labeled container on narrow screens.

Classes exact top-up now uses a confirmation drawer and opens hosted payment in a separate tab. Returning refreshes wallet and enrollment state. Check balance and Continue class checkout allow explicit refresh and return to the existing installment funding controls. Payment still does not extend seat reservation expiry; funding continues through existing server validation. Browser/provider acceptance is pending.

Competition types result metadata is compact (`N groups`). Color inheritance guidance is available through the shared InfoPreview popover beside the count, supporting tap, hover and keyboard access.

Migration 0078_remove_superseded_competition_seeds removes only the seven parent and 21 specialization seed IDs from migration 0027. It aborts atomically if pending tutor selections, booking snapshots/topics, economy revisions or foreign-key references still use them; clean up those references explicitly before retrying. Canonical migration 0029 rows and audit history remain. Migration authored but not applied or database-tested.

Seed competition taxonomy: seed.ts now inserts the seven canonical parent competitions and 34 specializations (including Law Debate), with migration-0056 parent palettes, before assigning review tutor subjects. Missing rows are inserted by slug in one transaction; existing catalog edits and archive status are preserved. Seed code updated only; database seed not executed.

Initial data ownership (2026-10-30): migration 0027/0028 retain schema creation only; 0029/0041/0047 retain no-op journal slots. Competition taxonomy (7 parents, 34 specializations including Law Debate), Marks packages and default economy config are inserted only by apps/server/src/seed/seed.ts. Non-test seed preserves existing config/catalog values; test seed retains its explicit economy reset. Existing databases are not retroactively changed by editing these migrations; 0078 remains the cleanup for obsolete 0027 seeds. Migration 0056/0057 palette backfills remain for existing rows; they create no records. For a fresh database, run schema migrations then the server seed. No migration or seed was executed for this change.

V3 seed alignment (2026-10-30): server seed and standalone seed-packages derive package defaults from DEFAULT_V3_ECONOMY_CONFIG (50/350000, 150/975000, 250/1500000, 500/2750000). After canonical taxonomy and review admin creation, server seed transactionally initializes and activates a new PRD-default V3 revision only when no revision is active; it preserves and validates an existing active revision and does not activate an unrelated saved draft. Review tutor seed no longer writes legacy prices/baseRatesIdr and clears those fields on its existing demo profile. New presentation bookings use an assigned active specialization, active V3 revision, V3 snapshots and quote-derived Marks holds. Existing legacy presentation bookings cause an explicit reset-required error. This supersedes earlier notes describing seedEconomyConfig and legacy seed pricing. Runtime compatibility removal is still pending. No database migrate, seed or reset was executed. Focused package-default test passed (1 test, 4 assertions); server typecheck remains blocked by the existing unused MODALITY import in tutor.service.ts; live seeding is unverified.

### PR #332 coverage continuation (28 October 2026)

Hosted run `40671516167` on `d7f70efb` passes all three API coverage test partitions and server unit tests, then fails only the unchanged 100% coverage thresholds: API lines 94.4% (9,931/10,515), overall lines 94.4% (10,270/10,877), functions 96.6% (2,672/2,766), branches 84.9% (7,431/8,757). This validates the persisted top-up quote/revision/payment fixtures. CodeQL and both language/action analyses pass on this head. New focused tests cover FAQ rich-text safety/conversion and payment-handler Test Mode/catalog/purchase/reconciliation paths; under the repository counter preload, both target files reach 100% lines, functions and branches in the focused run (10 tests / 45 assertions). Full merged coverage is still open; E2E is not required for this follow-up.
