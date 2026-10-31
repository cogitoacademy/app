# Cogito Module Reference

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

Historical readiness snapshot before the focused REQ-CLASS-05 implementation: tutor absence and replacement were not yet available. Current behavior and acceptance evidence are recorded in “Tutor absence and same-time replacement” below. Ordinary schedule changes grant 24 hours from notice and refund only the affected undelivered session as Marks; whether replacement may begin inside that window remains open under [Q04](client/RELEASE-V3-DECISIONS.md#q04-follow-up--perubahan-jadwal-biasa-dan-tutor-absen).

## Live Academy publish verification — 30 October 2026

Run `bun run verify:academy-meet` from the repository root for explicit live acceptance against authorized development `localhost:6767/cogito-app`. The script refuses other DB targets, reads Google OAuth credentials from apps/server/.env, creates temporary online masterclass/cohort drafts, publishes through the real Academy service and database with real Google Meet, and verifies custom fees, stale-version rejection, published-edit rejection and no duplicate meeting work. Google attendee notifications are disabled; payment/email providers are not exercised.

A finally block deletes Google events by stable session identity (including after partial creation), then deletes only the created class fixtures and their scoped notifications/audits; session/meeting rows cascade. Cleanup failure fails the command and retains fixture identities in tmp/v3-only-dev/academy-meet-live.json for follow-up. This explicit provider check is separate from fast mocked unit/synthetic suites. It does not reset or reseed the database.

Live result: masterclass Rp250,000 and cohort Rp500,000 both published with matching session snapshots and real Meet URLs; repeat processing created nothing; stale publish and edits after publication were rejected. Google events and all temporary DB fixtures were removed. Evidence: tmp/v3-only-dev/academy-meet-live.json. This verifies the service/database/provider journey, not browser UI or joining a call.

## Per-class tutor fee — 30 October 2026

Admin sets the agreed flat IDR tutor fee per class. New cohort/masterclass forms start at Rp400,000/Rp300,000; these are editable defaults, not publication limits. Draft save accepts a positive whole IDR amount up to Rp2,000,000,000 and copies it to each session. Publication validates that session fees match the class fee. Published pricing remains governed by existing draft/lifecycle restrictions; no global Economy setting or data migration is added.

## Admin pricing activation — 30 October 2026

Admin-only `POST /rpc/admin/activateV3EconomySettings` accepts `{json:{version,expectedActiveRevision,reason}}`. It activates only the latest saved revision, checks the previously observed active revision, validates saved pricing/catalog slugs, and writes the pointer plus audit in one transaction. Draft saving and activation share the revision advisory lock; catalog changes are locked too. Stale input returns a conflict. Existing quotes/bookings remain pinned. Economy UI requires an activation reason and distinguishes saved drafts from active pricing. No migration or automatic activation is needed; review and explicitly activate the saved pricing in admin settings.

## V3 frontend cleanup — 30 October 2026

Frontend booking fee summaries require engine=v3 and valid IDR snapshots; missing fees show unavailable. Series totals sum loaded session snapshots, never infer count from held Marks. Discovery and booking UI require competition-scoped V3 prices. Archived specialization display remains intentional catalog lifecycle behavior.

## V3 report and settings cleanup — 30 October 2026

This completes the report-provenance, payout-source and old settings cleanup left by the pricing cutover. Admin `getEconomySettings` and `updateEconomySettings` are removed from router, handler, service and request schema. Use `getV3EconomySettings`, `previewV3EconomySettings` and `saveV3EconomySettings`; saving a draft still does not activate it.

Report text is canonical plaintext on writes and reads. Entity-decoding and legacy-version PDF detection are removed. History statuses are `submitted`/`corrected`, with `admin`/`tutor` actors only. A correction requires the existing report version's history event; missing provenance returns a conflict instead of synthesizing an unknown legacy actor. Admin history UI shows the recorded role/actor. PDF exports retain normal continuation pages for long content, without a legacy flag or label.

Payout allocations accept only `fee_event` and require a non-null `tutor_session_fee_id`. Migration 0079_v3_report_and_payout_contracts validates these rules without rewriting or deleting existing financial/report history. Invalid old rows cause migration failure and require explicit cleanup. Unused repository reads for old report-format detection, uncategorized tutor fallback and aggregate payout cutoff were removed.

Migration 0079 was applied to authorized dev `localhost:6767/cogito-app` without another reset. Preflight found zero invalid history/allocation rows. Real PostgreSQL tests rejected both legacy report values, both legacy payout source types and null fee IDs. A current admin correction and request replay preserved report identity, literal entity text, ledger and fee rows. An invalid-provenance fixture was rejected without new history/fees and then removed. Current report listing/PDF export passed. A new V3 quote-to-payment-to-booking-to-report-to-fee-to-payout service journey also passed after 0079, using stub payments/manual meetings and a local simulated transfer record only.

Evidence: `tmp/v3-only-dev/cleanup-verification.json` and `current-report.pdf`. Focused tests and server/E2E typechecks are recorded in the current handoff; full legacy-oriented suites and browser/provider acceptance were not run. Web typecheck remains blocked by the existing Accordion callback mismatch in academy-class-page.tsx. No test or production database was reset or migrated in this cleanup.

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

## Coverage collection module (PR #332, 28 October 2026)

`.github/scripts/coverage-sources.ts` builds the fixed source inventory for API, auth, DB and env; test files, declaration files and declarative DB schema files are excluded. This retains every source in the prior merged report and includes previously unloaded source files. `coverage-instrument.ts` injects Istanbul counters only into test processes started with its explicit preload; query-suffixed module imports share source identities, and test cleanup runs before the counters flush. Unloaded or mocked modules keep their zero baseline.

`coverage-runner.ts` runs the existing resettable, reset-free fixture and payout partitions serially. Inputs are NODE_ENV=test, exact loopback DATABASE_URL=6769/cogito-test, PAYOUT_DATABASE_URL=6770/cogito-test-payout and COVERAGE_DB_RESET_WINDOW=confirmed, with ambient reset overrides absent. Only resettable/payout children receive matching reset flags; the fixture child receives KB_DB_TEST_WINDOW=confirmed. Failed partitions remain failures even if a report can be generated.

`coverage-report.ts` verifies source hashes, complete source/function/statement/branch identities and nonnegative integer counters before merging. It emits named LCOV functions using declaration positions, preserves real branch counters, and delegates final LCOV validation to `merge-lcov.ts`. Missing/stale/malformed data cannot reuse a previous successful report. `coverage-comment.ts` continues to enforce 100% API lines, overall lines, functions and branches. No service endpoint, domain event or financial rule is changed by these CI modules.

## Competition catalog UI composition (26 October 2026)

`CompetitionCatalogPage` groups the server's flat catalog into parent cards with child edit rows, including parent context for child-only search matches. `keepPreviousData` keeps the search field mounted while query keys change. Create/edit uses a Selia drawer with guarded dirty closing; descriptions/colors/movement are progressively disclosed. Palette validation, reason requirements, version-conflict retention and reference-gated lifecycle mutation handlers are retained. Parent palette previews read the current draft. No accounting or catalog eligibility policy changes.

## Admin KOL campaign presentation (26 October 2026)

`KolCampaignsSection` composes Selia fields/cards on the existing referral usage page. `kol-campaign-input.ts` reuses `createKolCampaignInput`, the tax percentage conversion helper, and explicit WIB date conversion. Saved campaign terms are read-only; codes apply to new registrations. Friend codes remain student-owned through verifiedStudent `referral.getMine`; admin creation only creates KOL campaigns. Failed creation preserves fields; uncertain results instruct admins to refresh the list before another submission. Success clears fields, shows a toast, and invalidates campaign queries. No backend/security/commission/settlement behavior changed.

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

## Google user-create default ordering (24 October 2026)

Installed Better Auth 1.6.11 `db/internal-adapter.mjs` createOAuthUser calls
`createWithHooks` before adapter defaults. `db/with-hooks.mjs` forwards the current
auth context; actual callback path is `/callback/:id`, role is absent. Resolve
role=student in Cogito's before hook, then configured production admin, then set
referralChoicePending for new OAuth students. Existing OAuth identities bypass
user creation; never reopen attribution. Legacy referral codes remain accepted;
no code format or reward changes. Browser referral route preserves safe redirect
and reads a fresh session after save. No migration or backfill is part of this fix.

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

## Reusable account email shell (24 October 2026)

`auth-email-layout.ts` owns the table-based, inline-CSS layout, optional approved
banner URL, blue branded footer, orange CTA helper and shared escaping. The three
account builders supply body HTML and retain OTP/expiry/action semantics. User
data is escaped at interpolation; action/header URL schemes are restricted to
HTTP(S). Full Cogito Academy naming is used throughout. User approved the second
design with the orange rule beneath the banner removed. This shared shell covers
OTP, welcome and password reset; unrelated notification emails are unchanged.

## Referral usage read model (24 October 2026)

`referral-usage.repo.ts` joins saved referral choices to current account identities,
saved settings/terms, welcome ledger, unique friend reward decision and unique
KOL commission decision. Row ordering is chosen-at/id descending, with bounded
offset pagination. Filters and aggregate share a repeatable-read read-only
transaction. Search escapes LIKE wildcards. Summary credits come from linked
welcome/friend ledger amounts; missing ledger evidence must not be counted as
credited. Pending completion/top-up, capped or zero friend rewards and KOL
refund/time holds remain distinct UI states. Admin router + route guard protect
identity/financial details; no public or student endpoint exposes this read model.
Saved choices with kind none are included; unsaved pending choices are excluded.

## Public auth form lifetime (24 October 2026)

`LoginPage` renders sign-in/signup independently of session pending state. A
null-session Better Auth background refetch must not unmount forms: their local
name/email/password/referral/OTP state belongs to the active form. Deliberate
form switching and navigation retain their existing behavior. Auth completion,
session freshness and protected-route guards are unchanged; drafts are not
persisted to storage.

## Student report PDF reference template (24 October 2026)

`report-export.pdf.ts` embeds the supplied banner from
`report-export/assets/student-report-header.json` (base64 of the adjacent PNG).
The two-column metadata keeps student/tutor, competition/date, mode/topic and
additional class/session details. Feedback display labels map discussion to
Session focus, strengths to Positive observations, and improvements to Points
of improvement; stored fields are unchanged. Feedback labels sit left of body
text. All prose stays live and paginates, retaining legacy line breaks. Each
bullet has a separate marker gutter and hanging indent; dense lists keep one
item per bullet and paginate instead of compacting inline. Banner/footer repeat per page; multi-page exports
include pagination. No changes to selection, ownership or chargeable entitlement.

## KB/calendar destination modules (24 October 2026)

`content-admin` follows repo/service/handler/router composition. Validation is
single-language-neutral text, trimmed required titles, explicit-offset ISO dates,
non-reversed ranges, bounded HTTP(S) links and unique catalog category IDs.
Mutations take the existing catalog advisory lock, check expected row version,
validate file/category references and write content plus `content.created`,
`content.updated` or `content.deleted` audit atomically, with admin actor/reason.
Event audits include category IDs. Imported rows cannot be hard-deleted, retaining
identity for replay and old links. Native records support versioned deletion.
Catalog use-count/deletion guards include calendar links only after explicit
CONTENT_ADMIN_ENABLED or CC_SOURCE=database activation; a restrictive FK also
prevents deleting referenced categories. Archive retains existing calendar labels.

`private-kb-storage` has only put/read, no public URL/signing method. Local files
live outside public uploads (including resolved directory aliases); production/
staging requires a separate private bucket. Immutable SHA-256 object names,
PDF signature/size validation and readback hash/length checks protect attachment
identity. Resource DTOs select only ID/title/description/category. File bytes
remain behind the independent server gate. Unattached uploads are retained
privately; operators may reconcile orphans only after checking DB references.

`content.service` selects KB and CC adapters independently from explicit config.
Defaults preserve legacy Sanity reads; no new table is queried on construction.
DB mode projects current catalog names/palettes and fails closed, without a
Sanity fallback. Calendar wall-clock dates are display-only WIB values; original
instants are persisted unchanged. Agenda enumerates each inclusive day and
suppresses only duplicate event-ID/date pairs, preserving distinct same-title
records and legitimate multi-day occurrences.

Offline `migration/sanity-content/import.ts` validates all input/assets and an
explicit source-category-ID -> catalog-parent-ID map before applying. Default is
dry-run, with no DB connection/provider calls. Apply requires exact DB target,
existing admin actor, consumers on Sanity and authoring disabled. Per-record
transactions allow restart: same source identity/hash at version 1 skips;
changed payload/identity or edited version conflicts rather than overwriting.
Partial failure may leave earlier records/private orphans; reconcile and rerun.
Raw source/locale selections remain local archives, never public DTOs or Git data.

## Earlier KB/calendar preparation checkpoint (superseded above)

KB/calendar authored text is language-neutral, one value per field, with no
translation or bilingual-entry requirement. This is scoped to these modules.
The existing Sanity content adapter remains active. The offline audit/preparation
tool under `migration/sanity-content` preserves source IDs, timestamps, category
references and raw locale evidence while selecting existing displayed text for
single-value import. It verifies all three KB PDFs against source size/SHA-1 and
records SHA-256. No database import/admin module/storage cutover is implemented.
Retain wallet eligibility and server-side file authorization during that work.

## Short FRIEND allocation (24 October 2026)

`referral.friend-code.ts` derives three letters from NFKD-normalized name ASCII
letters, completed by deterministic SHA-256 user-ID letters when fewer than three
remain. Empty/non-Latin-only names use identity letters. Only `getMine` lazily
allocates; email signup's transactional choice writer and Google `saveGoogleChoice`
continue resolving existing global codes and immutable attribution snapshots.
Existing owners return their original code before allocation, including after a
name change. A random starting suffix wraps through all 000–999 values once;
occupied shared FRIEND/KOL values are skipped. `onConflictDoNothing` and existing
uppercase/global-code + owner unique constraints arbitrate insert races, with an
owner reread after each insert and before a final exhaustion error. Infrastructure errors propagate. Exhaustion raises
`REFERRAL_CODE_EXHAUSTED`, mapped to HTTP 409; format is never weakened.

KOL settlement entries persist expected_obligation_idr for adjustment replay matching (additive migration 0074). Monthly CSV SQL binds explicit ISO timestamptz bounds, and the encoder preserves validated numeric adjustments.

## KOL external settlement source (23 October 2026)

`referral.service` adds `getKolSettlement`, `recordKolTransfer`,
`adjustKolCommission`, `exportKolMonthly`; `kol-settlement.policy` owns integer
balance calculation and WIB month bounds. `kol_settlement_entry` stores one
append-only transfer or signed obligation adjustment, decision FK (restrict),
global unique operation ID, amount, actual paidAt/reference or required reason,
actor FK and server time. The API offers no update/delete. Corrections append
obligation entries; they never rewrite a recorded transfer or saved choice.
An incorrectly recorded transfer cannot be silently replaced by this interface.

All settlement mutations lock the decision row (also locked by PR312 provider
reconciliation) before reading totals/writing entry/audit in one transaction.
They acquire no payment/wallet lock. A unique operation index backs retries;
concurrent different-decision key collisions conflict. Adjustments check expected
obligation and cannot create a negative obligation at entry time. Provider-driven
later changes preserve all entries and can require further manual reconciliation.
No amount is reallocated to a later commission or campaign.

Active obligation = saved calculated commission + signed adjustments. Full refund
voids the entire effective obligation (including adjustments); unresolved provider
time holds it at zero. Historical adjustment totals remain visible. Balance =
effective obligation - actual transfers; positive is outstanding, negative is
overpayment, never an automatic offset/recovery. Partial refund retains PR312's
historical base and manual flag; operators enter only an explicitly approved
adjustment, never inferred proration. Audits `kol_external_transfer_recorded` and
`kol_commission_adjusted` include before/after balances and operation/entry/reason.
The existing provider invalidation/correction audit remains the base-change record.

CSV is current reconciliation selected by monthly activity, with summary and entry
rows, not a tax or month-end closing report. Read-only repeatable-read protects
its multi-query snapshot. Additive 0073 remains unapplied; parent DB acceptance
is required. Earlier decision-only deferred scope is superseded by this source.

## Referral/KOL browser contract coverage

`packages/e2e/src/specs/v3-referral-kol.spec.ts` covers referral-choice route
states and save recovery, plus admin commission cursor navigation, historical
partial-refund warnings, full-refund zero display and unresolved-success-time
holds. Ten synthetic Chromium cases pass. It changes no financial rules and
proves no real OAuth, DB ordering, persisted choice or provider behavior.

## Booking reminder cursor precision

The process-local rotation key uses the session end time truncated to
milliseconds, booking ID, and child-session ID. SQL projections, ordering, and
keyset predicates use that identical precision; actual due-time eligibility
still compares the original timestamp. Computed timestamps use the existing
timestamp column decoder, and SQL cursor bounds bind explicit ISO timestamptz
values. This prevents PostgreSQL microseconds from repeatedly selecting a
failed first batch. Rotation remains volatile and restarts from the oldest due
candidate after process restart; notification event-key idempotency is durable.

## Referral settlement review corrections (22 October 2026)

`settlementTransaction` retries a fully rolled-back PostgreSQL `40P01` at most
three times, including driver-wrapped causes; domain and uniqueness failures are
not retried. Its callbacks contain database/outbox work only and cover all
report completion adapters. Reward decisions acquire shared user-row locks and
require both current roles to be student, coordinated with ordinary role updates.
An existing saved decision still replays unchanged.

For an ended solo no-show, only the admin report path can confirm delivery using
the existing reason/receipt/three-field contract. It reads the exact student's
prior marked-no-show or legacy expiry deduction key, records the audited
no-show-to-completed transition, and creates one earned fee/reward. No second
wallet deduction occurs. Student reads accept that same charge only after the
booking is completed/reported; a penalty alone does not grant access or rewards.

## Referral and signup module source milestone (22 October 2026)

`packages/api/src/modules/referral` owns referral choices, settings history,
student codes, KOL campaign validation/snapshots, and first friend reward
decisions. `packages/auth/src/index.ts` invokes the email choice writer in the
verified signup transaction. Its Better Auth user-create hook marks only a new
Google-created student pending; `packages/api/src/procedures.ts` blocks student
app APIs until the choice is saved. The authenticated `referral.saveGoogleChoice`
procedure is the only pending-account resolution path.

Schema: `referral_code` has one global code value and one friend code per
student or campaign code per KOL campaign; `referral_choice` has one immutable
choice per user and stores welcome/settings/KOL term snapshots;
`referral_settings_revision` retains effective-time history;
`referral_semester_usage` is unique by referrer and WIB half-year; and
`friend_reward_decision` is unique by referred user and stores positive or zero
credit decisions. `referral_campaign` stores KOL activation/expiry and terms.
Signup welcome ledger keys use `referral.signup.<userId>` with the choice ID as
source reference; friend rewards use `referral.friend.<studentId>` with the
decision ID as source reference.

Email/Google choice, welcome credit, and choice snapshot share one transaction.
At completion, booking and class-report modules call the referral port in their
existing settlement transaction. Only positive-charge deliveries qualify;
Q06 prior no-show charges qualify after a delivered report, while a penalty-only
no-show does not. The service locks the referred choice, then the referrer’s
semester usage row, applies the completion-time cap, writes one decision even
when zero, and credits a positive reward atomically. Cap exhaustion does not
roll over or retry, and cap reductions do not reverse existing credits.

At that 22 October source milestone, student `referral.getMine` lazily created a
stable friend code and returned active signup settings plus current-semester
earned/remaining Marks and the end date. Admin APIs create audited settings
revisions and KOL campaigns. KOL signup terms are immutable snapshots.
First-purchase commission, transfer, partial/overpayment, CSV, correction, and
reversal scope is tracked in the later 23 October checkpoint below.
Parent-generated additive migration
`0071_referral_registration_rewards` follows 0070 and is applied only to
guarded loopback test 6769/cogito-test (journal 72). Development 6767 and
production remain unmigrated. Wallet creation accepts the caller's transaction,
including its upsert, so referral credits do not escape the signup or completion
transaction.

## Report PDF pagination follow-up (22 October 2026)

Metadata columns paginate wrapped lines above the footer and label continued
values. The class adapter selects its session title as the report topic. Normal
feedback bullets preserve their line breaks; dense current-format lists flow
inline only when needed to fit, retaining bullet markers and the fixed font
size. Private-booking legacy layout uses the current report version's history
`actorRole`; pre-history rows without a current version entry remain legacy. That
classification replaces the text-length cutoff, so short legacy fields also keep
their line breaks and can continue on labelled pages. Academy class reports use
the current layout. Parent PostgreSQL coverage validates exact-student ledger
entitlement and funded/spent class allocation filters; it uses UUID-owned
fixtures and no reset/seed.

## KOL first commission decision source slice (23 October 2026)

`payment_record.provider_success_at` stores the verified provider timestamp on
the first accepted successful transition. Since Midtrans's webhook signature
does not cover its time fields, a successful notification is rechecked through
the authenticated status API. Non-card settlement uses `settlement_time`. The
status API documents card `transaction_time` as initiation and exposes no
`capture_time`, so card status is accepted and Marks are credited while its KOL
decision is held at zero as unresolved. No webhook-body or local receive time is
substituted. `payment.confirmFromWebhook` persists payment status and any
verified provider time, records the KOL decision, and credits the purchased Marks
in the same transaction. Confirmed status must include an IDR gross amount and
currency; the service binds it to the saved purchase price using the existing
channel-fee tolerance.

`kol_commission_decision` is unique by referred student and payment. It stores
the selected payment, provider success time, server-saved `payment_record.amount_idr`
(excluding channel fees), signup-snapshot flat/percentage terms, and calculated
whole-rupiah commission, including zero. Strict expiry is `providerSuccessAt <
kolAttributionExpiresAt`. The referral-choice row lock serializes callbacks for
one student. Earliest timestamp wins; ties use ascending stable payment ID. A
late earlier callback updates the current unpaid decision and writes immutable
audit action `kol_commission_earlier_purchase_correction` with old/new purchase
and amount snapshots. A late earlier refunded purchase uses
`kol_commission_earlier_refunded_purchase_correction`; refunding the current
winner uses `kol_commission_refund_invalidation`. If a successful payment has
no authoritative time, `kol_commission_provider_time_unresolved` moves the
current decision to a zero hold, even if a later-timestamped purchase had been
provisionally selected. Corrections include
the prior decision and corrected purchase state, with provider time, amount, and
commission. Exact replay or a later success adds no correction. A full
refund keeps its purchase reserved as first and voids commission to zero. A
refund arriving before local success moves the payment to REFUNDED without
crediting Marks. When Midtrans does not provide an exact success time for a card
capture or refund, the decision has null time, zero commission, and
`providerSuccessTimeState: unresolved`; later purchase callbacks cannot take
first place until the provider supplies an authenticated exact time and an
audited re-evaluation resolves the hold. This slice has no manual time-entry
control. A refund/reversal never resets first-event eligibility.

Midtrans `refund` and `partial_refund` both map to the application-level
`REFUNDED` provider status, but the service preserves the distinction from the
authenticated status response. A partial refund stores bounded provider refund
facts on `payment_record` and records a transactional
`partial_refund_reconciliation` audit. If this is the first local success
evidence, the purchase advances to `SETTLED` and saved package Marks are credited
once; the partial cash refund does not prorate or reverse Marks. Successive
status snapshots update one provider-transaction reconciliation row with the
largest authenticated cumulative refund amount, including when an older snapshot
arrives later. If it is the first-purchase candidate,
the KOL decision retains its historical calculated amount and sets
`refundReconciliationState: partial_refund`; the admin page labels it for
manual reconciliation. This slice does not prorate the commission or automate
cash refund/accounting. A later full refund with the same Midtrans transaction
ID uses distinct decision evidence, transitions the payment to REFUNDED, and
uses existing wallet transaction idempotency so the full reversal happens once.
The first-event reservation remains attached to that purchase.

Webhook claim keys hash bounded decision-bearing evidence: normalized status,
refund kind, authenticated cumulative amount/refund-history fingerprint, and a
verified provider-success timestamp. Exact replays retain the same key; an
authenticated partial-to-full update or newly available success time is
re-evaluated without repeating wallet effects. Raw webhook refund-history
fields are not used because Midtrans's notification signature does not bind
them.

Every KOL decision snapshots local payment status and refund reconciliation
state. A zero/unresolved decision whose payment later becomes REFUNDED receives
one immutable `kol_commission_refund_invalidation` transition audit; exact
replay does not create another. `adminReferral.listKolCommissions` returns
bounded keyset pages ordered by immutable decision creation time and ID, so
unresolved timestamps cannot hide verified rows.

Admin read endpoint `adminReferral.listKolCommissions` is admin-protected and
returns bounded pages with current and decision-snapshot payment status,
provider-time state, and any partial-refund reconciliation flag. The Selia page
does not record transfers. Settled-transfer edits, partial-refund proration and
accounting, overpayment handling, transfer history, CSV, and settled-transfer
reversal adjustment remain deferred. Migration
`0072_kol_first_successful_topup_commission` is applied only to test 6769/
cogito-test; guarded PostgreSQL acceptance passes 15 / 180. Dev and production
migration and browser acceptance remain pending.

## Classes UI composition (22 October 2026)

The student catalog uses Selia Card/Field/Input/Button, with one compact card per
class whose full surface links to its detail page. Details use a divider-based
session list and separate curriculum from enrollment, placing enrollment first
on mobile. `ClassEnrollmentPanel` consumes the existing `_app` route session,
retaining the student + verified-email gate. Its UI distinguishes
signed-out, unverified student, and non-student states; email verification links
return to the current class. The current class routes remain student-only:
signed-out visits redirect to login and non-students redirect to dashboard.
The reserve action explicitly confirms Marks; hover translation respects
reduced-motion preferences. Admin class
studio groups published/postponed management and the draft editor into tabs, with
existing management panels inside a Selia Accordion. Draft panel mounting retains
local editor/file-input state across tab changes. Publishing selects the list.
The shared class-report workspace bounds its session list and moves mobile focus
to the selected report. No service, event key, authorization or payment rule changes.

## On-demand report acceptance (22 October 2026)

PR #305 admin report submission/correction is verified with 11 guarded DB tests
(106 assertions), 31 feedback/service tests (112 assertions), and one real-RPC
Chromium journey (52.3s). The browser verifies assigned-tutor authorship, versioned
history, consumption of only the owned booking hold, and no repeat settlement
on correction. Migration 0070 is applied to local test/dev; production is separate.
The endpoint and service contracts below are unchanged by these fixture repairs.

## Ongoing tutor experience control (22 October 2026)

`TutorExperiencesEditor` maps the ongoing checkbox to the existing nullable
`endYear`. Checking clears and disables the end-year input; unchecking uses
`max(currentYear, startYear)`. The input stays mounted and the date row aligns
at the top. Existing period validation and Present display are unchanged.
The combined education/achievements/experience CardTitle uses a shrinkable
text span to retain its info button alongside multiline text.

## Tutor profile status presentation (22 October 2026)

`OnboardingForm` renders one lifecycle badge beside the heading and conditional
header guidance. An ordinary published profile has no status notice; published
pending edits explain that the live profile stays visible during review.
Revision feedback and non-published state guidance remain available. No review
transition, event key, validation or persistence rule changes.

## Tutor profile section copy (22 October 2026)

The onboarding form uses Selia `Text` for the tax section introduction.
`FieldDescription` requires an enclosing `Field` and is reserved for individual
field descriptions. Tax validation and payout business rules are unchanged.

## Shared UI control contracts (22 October 2026)

The named Card container query lives on CardHeader, not the Card root. Root
inline-size containment inflated grid intrinsic row heights inside column Stacks,
leaving empty vertical space below Cards; header containment keeps action wrapping
without changing the whole Card's grid contribution.

Payout tax controls display and accept percentages (0..100, two decimal places).
`percentToBasisPoints` rounds the percentage times 100 before it enters the
existing integer draft/API fields, avoiding floating-point fractions such as
2.55 * 100. Empty default rates remain invalid; empty tutor override clears the
override. Default-rate fields show an example tax deduction on Rp400,000.

Academy draft rates occupy their own row and use auto-fit columns with a 10rem
minimum. They must not be nested as three columns inside half the editor width:
that leaves no drawable numeric text space between the stepper buttons.

Selia NumberField composes its own decrement/input/increment group when no custom
children are supplied. Numeric drafts map an empty control to null, then retain
the caller's original empty-string/number submission convention. Min/max/step,
required, disabled and read-only props remain on the number root; accessible
input-only attributes belong in inputProps.

CrossBrowserDateTimeInput composes DatePicker and MinuteTimeInput, preserving a
local YYYY-MM-DDTHH:mm string and the existing caller's timezone conversion. The
calendar trigger uses the component ID; the time input uses ID-time. Without an
explicit maximum date, the calendar year list extends 100 years beyond the
current year so future class schedules remain selectable. Required or partial
date/time values and times before the same-day minimum fail form validation.
Choosing a date without a time initializes midnight; clearing the date clears
the combined value. CardBody owns direct-child table width/spacing and no longer
negatively offsets arbitrary Stack content. Header actions wrap below the title
based on Card width. See the UI audit plan for coverage limits.

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

## API test database safety (2026-10-21)

`packages/api/src/tests/helpers/test-database-safety.ts` is a standalone URL
validator with no application or database imports. In test mode, its connection
check accepts only exact local test database/port pairs; destructive reset
consent is a separate check. `resetDatabase()` runs both checks before
truncation or seeding,
always rejects ports 6767/6768, and requires both
`TEST_DATABASE_ALLOW_RESET=true` and an exact `TEST_DATABASE_RESET_TARGET` URL
for `cogito-test:6769` or `cogito-test-payout:6770`. Validation errors never
include URL credentials.

The 2026-10-21 incident was triggered by `academy-class.test.ts` resetting
`cogito-test` on 6767; its broad `TRUNCATE ... CASCADE` ran before fixture setup
failed on missing `tax_legal_name`. Development `cogito-app` was read back
intact and was not truncated. No recovery or reseed of the affected test data
has been verified.

Admin class cancellation locks class, sorted sessions, sorted enrollments,
installments, allocations and sorted wallets. Future scheduled sessions are
cancelled; remaining funded Marks on those allocations are released in full with
`class-allocation:{id}:admin-cancel:return` and their original funding source.
Unfunded reservations and pending checkouts/installments are cancelled without
charging. Past/ongoing funded delivery holds, spent Marks and existing tutor fees
remain intact. Audit `academy_class.cancelled` stores actor, reason, before/after
version, quote and request key; all wallet changes and notification outboxes share
the transaction. The admin UI requires an exact return preview before confirmation.
Cancelled sessions drive durable meeting deletion in the existing retry worker.
Provider DELETE 404/410 counts as success; retryable failure remains failed with
30-second retry delay. An ambiguous accepted create can be deleted using the
stable class-session provider event ID. Claim timestamp/count fences prevent an
old cancellation worker from overwriting newer work. A late creator always queues
a fresh deletion, even if lease recovery already deleted an absent event. A
pending event with no creation attempt needs no provider call. `processReadyMeetings`
is an internal service operation; `retryFailedMeetings` also processes deletion.
No new public provider endpoint or live-provider test is introduced.

Student class cancellation uses enrollment allocation identity. The first slice
supports quote/confirm for an early funded seat and whole-plan withdrawal.
Withdrawal rounds the current 20% fee once over the eligible remaining funded
Marks, distributes that rounded fee deterministically across allocations, and
cancels all unfunded reservations/pending installment obligations without charging
them. Original enrollment/rate/session snapshots remain in history. Funded seats
inside 24h and past/report-pending delivery holds remain funded for completion;
withdrawal does not erase their liability. Fully cancelled seats become released
with spentMarks = cancellation charge and releasedMarks = available-Marks return.
Lock order: sorted sessions, owned enrollment, installments, allocations, wallet;
clock is read after locks. The SHA-256 quote covers scope, allocation identities,
amounts and deadlines. Confirmation rechecks it, writes fee/return ledger events,
audit receipt and notification atomically. Receipt replay is serialized by the
enrollment row lock. Stable keys are class-allocation:{allocationId}:cancel:charge
and :cancel:return; the funding sourceReference is retained. No tutor fee is
created by student cancellation.

Ordinary Academy schedule changes use Q04 separately. Admin rescheduling locks
class then session and existing tutor/room advisory locks, validates the new time
against active bookings and every other scheduled Academy session, and keeps
tutor/mode/room/capacity/fee unchanged. Migration 0081 stores the schedule-change
version and server notification/deadline timestamps on the session; 0082 snapshots
that version on only funded/unfunded active seat allocations present at notice.
The exit deadline is the earlier of notification +24 hours and the new start,
with confirmation strictly before it. Audit and deduplicated in-app notices are
transactional; the existing Meet update runs after commit through durable retry.

Q04 cancellation is session/allocation scoped. The quote binds change version,
window, allocation identity and remaining funded Marks. Confirmation locks class,
session, enrollment, installments, allocation and wallet, then rechecks the
deadline, eligibility marker, report/earned state and amount. Funded remaining
Marks return once under
class-allocation:{allocationId}:schedule-change:{version}:return. An unfunded
second-installment seat returns zero Marks and adjusts only its installment count,
amount and due session. Other seats, installments and earned fees remain intact.
Audit JSON stores ISO timestamps; receipt replay validates/coerces these back to
Date while public API output remains Date. A later real reschedule snapshots a
new version; same-time tutor replacement preserves the active window. Minimum-
enrollment postponement keeps its separate 72-hour exit rule.

## T06 admin session and minimum lifecycle (2026-10-21)

Individual admin cancellation is separate from whole-class cancellation. Preview
and confirmation lock the class, target session, affected enrollments,
installments, allocations and wallets, and require the exact class/session
versions, audited reason, stable request UUID and SHA-256 quote. Only one future
scheduled session is cancelled. The transaction returns unspent funded Marks for
allocations on that session and releases its reserved seat. Other funded session
allocations and original enrollment prices/session count do not move. Affected
unpaid installments are reduced to remaining reserved sessions, with the next
due session/date updated, or cancelled when no reserved sessions remain.
For a pending checkout, only remaining first-installment reservations keep it
payable. If none remain, cancellation cancels the enrollment and all unpaid
installments and releases the other unfunded reservations without wallet or
ledger changes; second-installment reservations cannot keep it pending.
Ongoing, past, completed or reported sessions cannot be cancelled. Past delivery
holds, reports and earned tutor fees remain intact. Audit, student/tutor
notification outboxes and durable calendar cleanup use existing services.

The minimum check applies once to an unresolved published cohort at or after its
saved check time. It counts unique active students with paid full/half plans and
at least one funded, unspent allocation on a scheduled session; single-session
buyers, expired checkouts, cancelled enrollments and defaulted plans do not
count. Admin may continue despite a shortfall or postpone once. A postponement
requires one replacement for each scheduled session, strictly after the
authoritative 72-hour deadline. Session identities/order/durations, enrollment
prices, allocation IDs and funding remain unchanged; class/session versions
advance, pending second-half due dates/reminder markers follow replacement
dates, and capacity plus tutor/room overlaps are checked under shared locks.
Postponed cohorts remain visible in the public class catalog/detail, but
`createEnrollment` accepts only published classes. Existing students retain
their owner-scoped enrollment view and can withdraw without a fee through the
exact inclusive `freeExitUntil`. Ordinary schedule changes use Q04's 24-hour
affected-session Marks refund policy; replacement start inside that window
remains unresolved and no ordinary reschedule API is implemented here.

Calendar updates use the saved external event ID directly and preserve title,
attendees and Meet conference through OAuth or service-account transport.
Transient failures keep the ID and return to the durable retry worker. On a
404/410 tombstone, migration 0069's persisted `creationGeneration` advances
before a new provider insert; accepted-but-response-lost retries reuse that
generation key. Stale provider completions queue the latest session schedule
even when a newer lease exists, without dropping cancellation work. Migration
0069 adds a positive integer generation with default 1; its SQL hash is
`A6A442562692E34CEA132CBD4BB20DE6561906FB45AD9441ADD19DBF8B8C2617`. Provider
units passed 52 tests / 196 expectations in this continuation. Database
integration and 0069 readback remain open because loopback `6769/cogito-test`
was unavailable; the earlier 0068 test readback is not refreshed here. Parent
integration and full release acceptance remain pending.

T03 integrates with the current enrollment/signup baseline. Bank account ownership
snapshots accept only self/trusted_person; unprepared preview projections include
null proof/transfer audit fields. Parent checks cover allocation-aware legacy cutoffs,
reconciliation blocking and repayment, exact-net retries, and CSV/UI presentation.
No historical payout backfill is performed.

Signup E2E runs isolate the auth IP rate-limit bucket between security probes
and UI journeys through a local seed script, not an HTTP bypass. It requires
test mode, exact loopback `cogito-test`, and a paired test Redis port before
deleting only auth-rate keys; all other Redis state remains intact.

The T05 enrollment E2E runner uses a new seeded student email for each run on
loopback `cogito-test:6769`. The student retains the familiar Andre display
name, while each run owns a separate wallet and enrollment history. Global
setup does not delete T05 ledger, payment, cancellation, or enrollment rows;
the dedicated `cogito-test-payout:6770` runner keeps its existing fixed-seed
reset path.

Enrollment timing invariant: creation refreshes its clock after session locks;
confirmation and second-installment funding read time after transaction locks.
Confirmation rechecks scheduled/future session state before creating holds.
This prevents a request started before expiry from funding after a database
wait crosses its deadline. Allocation state TypeScript literals match the
existing SQL state check; no migration change is required for that annotation.

## Academy enrollment funding schema (2026-10-21)

Migration `0064` adds enrollment, installment, session allocation and top-up
attempt records. Allocation IDs identify each session's funding; a unique
`fundingEventKey` and a `fundingSourceReference` retain wallet-operation identity.
Database checks enforce nonnegative balances and
`spentMarks + releasedMarks <= fundedMarks <= rateMarks`; reserved unfunded
allocations have zero funding/spending/release balances. A partial unique index
prevents duplicate active student/session allocations. Atomic funding, capacity,
expiry and completion consumers remain under implementation and require tests;
the schema alone does not enforce those transaction workflows.

## Competition catalog ownership — implementation in progress

T00A / REQ-COMP-01..07 extends the existing subject-category hierarchy with
admin parent/child CRUD on the working branch. The catalog owns identity,
labels, hierarchy/order and selection lifecycle. Pricing owns immutable parent
rate agreements; children inherit them. Tutor assignment, discovery, booking,
classes, reports and website projections consume that same catalog. See SPEC
§2 for compatibility and transaction design; do not create a parallel taxonomy.

The focused `competition-catalog` module composes into the `admin` RPC namespace.
All catalog mutations acquire a transaction-only shared advisory lock, enforce
expectedVersion and record before/after/reason through the audit port before
commit. Reference writers must acquire that same lock before final eligibility
validation/persistence. PostgreSQL tests cover both assignment/delete orders,
both booking/archive orders, and stale simultaneous edits: deletion-first makes
the queued assignment fail selection validation; assignment-first leaves the
specialization referenced and blocks deletion; booking-first persists the
category/specialization IDs and slugs in `booking.sessionTopic` and archive
counts that reference; archive-first makes the queued booking fail with
`BOOKING_NOT_EDITABLE`; and only the first edit using a shared expectedVersion
commits/audits, while the queued stale edit returns `CONFLICT`. English uses
existing name/description columns; optional Indonesian and version columns are
additive. Parent archive preserves child flags; public selectability requires
both levels active. Reference counts include current tutor FK assignments,
pending profile JSON, historical tutor-profile audit snapshots, booking/session
snapshots, economy revisions and static default rates. The guarded catalog suite
passed 6 tests/72 expectations; see TASKS for the exact command and remaining
dynamic-pricing/website integration gates. A focused Chromium browser journey
also verifies child-only search, archive/restore confirmations and moving an
unused specialization with its inherited destination palette. The catalog tree
keeps a matching child's parent visible as context during child-only searches.

Parent appearance has four independent validated OKLCH fields: light text and
background, dark text and background. Children inherit `parentColors`; they
cannot store overrides. New parent creation requires a complete palette, while
patches retain omitted colors. Render the safe values through semantic CSS
variables. Only the seven known Sanity category aliases map at the content
boundary; unknown references use the neutral compatibility palette.
Current appearance projection is separate from immutable booking names/prices.

## V3 customer pricing boundaries (2026-10-18)

`economy.getActiveV3Config` reads only the separate activation pointer;
`getV3ConfigByVersion` reads exact immutable history. Neither selects the latest
draft as an implicit fallback. Missing activation means legacy operation.
Payment quote snapshots contain top-up terms only, excluding tutor fee tables.
Quote owner/request key uniqueness and a locked quote row plus unique payment
quote ID prevent concurrent duplicate checkout. Payment intent metadata updates
only provider request ID/URL/intent state, preserving financial status when a
webhook arrives first. CREATING/UNCERTAIN retries reconcile the same identity;
they never automatically POST another V3 provider intent. Late success credits
stored Marks via existing `purchase.<paymentId>` wallet idempotency.

Booking JSONB snapshots are a union: old untagged economics or explicit V3
revision/competition/modality/headcount/perStudentMarks/collectedMarks and
tutorHonorariumIdr. V3 records contain no synthetic tutorShare/cogitoTake or
Marks-to-IDR conversion. Group repricing uses the pinned revision; old/null
snapshots stay on the legacy path. Payout IDR uses the saved V3 honorarium.
Legacy payout Marks/take accumulators exclude V3; consumers must not present
those partial values as whole-period profitability. Analytics presentation
remains an unfinished activation gate. With an active revision, group-series
starts at target headcount and pins that revision; a partial group recalculates
at confirmed headcount and updates remaining participant holds plus booking and
scheduled-session snapshots before reconfirmation. Activation-null group-series
and target-size-one solo-series retain legacy behavior. Tutor profile
reads consult the same active pointer: `null` returns no V3 fee projection and
preserves legacy base-rate updates; an active revision returns read-only online
and offline IDR fee rows for headcounts 1–6 for each assigned parent competition.
Changed legacy `baseRatesIdr` or `prices` updates are rejected, unchanged stale
values are ignored, and admin edit approval discards queued legacy base rates.
These projections do not change saved booking snapshots.

## Tutor earned fees and manual payout allocations (2026-10-19)

`booking/tutor-session-fee.ts` builds stable source keys for immutable earned-fee
facts. The `tutor_session_fee` row records the tutor, delivery identity, scheduled
and earned timestamps, gross IDR amount, and pinned price snapshot. A fee belongs
to either a booking session or an academy class session; class fees store the
class/session label and collected Marks without inventing a booking or price
snapshot. Payout reports use that row when present and retain the legacy
booking/session snapshot adapter only for sources without a fee event.

For series settlement, no-show and completion lock the parent booking before
the child session and participant rows. The existing session-scoped no-show
ledger key is the allocation marker: repeat marking is rejected, and a later
completion report skips only that participant's already-forfeited allocation,
preserving future held Marks. Attendance state is participant-wide and is not
used to infer a no-show on another child session. No-show alone proves neither
delivery nor an earned fee; the delivery report and fee event are committed in
the same transaction as completion. A V3 fee snapshot must contain a valid
nonnegative whole-IDR `tutorHonorariumIdr` before settlement writes; zero is
valid.

`tutor_payout_allocation` records one immutable source line per session included
in a newly recorded manual tutor bank transfer. It snapshots source type,
booking/session IDs and type, delivery status, timestamps, gross IDR, and price
snapshot. `sourceKey` is globally unique across payout batches (and fee-event IDs
are unique when present), so an earning cannot be allocated twice. The payout
header and all source lines are inserted in the same transaction; the line total
must equal the header gross amount. Pending admin details show the sources that
would be paid, while paid details read the saved allocations.

Pre-allocation paid batches are not backfilled: their stored aggregate and
cutoff do not prove which individual sessions were included. Their detail API
returns `detailsAvailable: false`. The owner confirmed that the V3 app is not
in use and historical per-session reconciliation is not required for this
release; current fee events are authoritative for new V3 completions. No rows
were deleted or production data accessed. Do not fabricate allocation rows from
the current series state; review any later-discovered legacy data before acting.

Class delivery fees participate in the same pending and manual payout flow.
Repository reads left-join the nullable booking source and resolve class
identity from `academy_class_session`; payout source lines preserve the class
session ID, delivery label, class kind, collected Marks, and exact gross/net
amounts. They keep `bookingId` and price snapshot null for class fees. Active
source uniqueness and fee-event identity still prevent double allocation, while
the existing tax, transfer-fee, void, and reconciliation behavior is shared.

## V3 on-demand booking session reports (2026-10-22)

The booking module exposes an admin action on the existing booking-detail
surface for solo, group, and series sessions. An initial report requires
delivery confirmation and a trimmed audit reason; scheduled work follows the
existing completion transaction and settlement locks, and an already-completed
legacy booking/session without a report gets the report without replaying
settlement. Corrections require the current report version, append immutable
actor/time/status/reason snapshots, and notify the assigned tutor without
replaying wallet deductions, tutor fees, referrals, or rewards.

New feedback is canonical plaintext. Read paths decode one exact HTML-escape
layer only when version history identifies a legacy row/snapshot; `submitted`
and `corrected` text is never heuristically unescaped. This preserves literal
entity text on repeated corrections and leaves legacy rows longer than 600 code
points readable without truncation. React renders the strings as text.

Admin and tutor completion acquire a PostgreSQL advisory lock for the request
UUID before booking/tutor locks. The history table's unique request key therefore
replays identical payloads and returns a 409 conflict when a key is reused for
another booking or changed payload, including concurrent cross-tutor calls.
Q06 reads require the completed delivered booking/session plus a matching
chargeable per-student/per-session ledger event; a chargeable group-series
no-show is visible, while unpaid and early-released participants are not.

Migration `0070_on_demand_report_admin_audit.sql` is additive after 0069 and
remains unapplied in this source worktree (SQL SHA-256
`EACFA97B013F23FA2E74BE6D6D8E410B2B9C0F354B1D9AE6BB121370F40FC0F4`). History
rows cascade with their feedback and booking; the current feedback's session
reference also cascades. The history `session_id` is text, but does not by itself
preserve the row after a booking or current feedback hard delete. No current
application hard-delete path was found; this is the existing retention boundary,
not a new release gate. Historical rows are not backfilled and unknown actors
remain unknown.

### Legacy on-demand missing-report reminders (2026-10-23)

The existing one-minute `class-enrollment-check` job also runs a bounded worker
for ended legacy solo/group bookings and each scheduled series child without a
matching report. Whole-booking/session cancellation, completion, and no-show
outcomes are excluded. A participant-level group/series no-show does not by
itself establish that the tutor failed to deliver to the remaining participants;
the reminder text asks the tutor to submit a report only if delivery occurred.
This follows REQ-REPORT-02 and does not treat no-show expiry as proof of delivery.

The first reminder is due at the scheduled end, followed by 24-hour elapsed
periods. A delayed job queues only the current period. Stable event keys use
`booking:{bookingId}:session:{booking|sessionId}:missing-report:day:{period}`.
Before writing, the worker locks the booking then (for series) the child session
and rechecks tutor ownership, state, exact schedule, report absence and the
current event key inside the same transaction as the in-app notification and
existing email outbox row. Only the assigned tutor is notified. No report,
delivery, settlement, wallet or fee state changes, and no migration is needed.
The SQL finder calculates due periods and exact schedule fingerprints from the
full stored timestamp precision. Only keyset pagination normalizes timestamps
to milliseconds. The initial focused unit suite passed 7 tests / 27
expectations and its fairness follow-up passed 8 / 33; the current suite passes
10 tests / 44 expectations, including a pg-proxy regression for a sub-
millisecond end just before 24 elapsed hours. Parent verified four uncached
workspace checks at `b0b80bec`; this precision delta passed bun run check-types (4/4 tasks, 15.204s; 2 cached); the normal pre-push hook reruns it. Guarded PostgreSQL acceptance results are recorded below.

The bounded scan keeps an in-process keyset cursor in schedule-end, booking-ID,
then child-session-ID order. It advances after each candidate even when its
outbox write fails, then wraps to the oldest due item when there are no later
candidates. A failed oldest batch therefore does not monopolize every scheduler
pass. A process restart resets the cursor to the beginning; event keys and the
transactional outbox remain durable, but retry fairness position is not. No
per-candidate retry table or migration is used. The follow-up unit test covers
100 persistent failures, progress to a later eligible booking, and retry after
wraparound. Guarded PostgreSQL regressions now also exercise the production SQL
finder and locked writer at microsecond boundaries: 101-row pagination
progress, single and series-child day boundaries, exact-end eligibility, and
same-millisecond reschedule rejection. Parent ran the guarded suite against the
exact loopback target 127.0.0.1:6769/cogito-test; **3 tests / 32 expectations
passed**, including concurrent duplicate jobs, outbox identity, cursor
progress, and precision-boundary cases. No migration, reset, seed, or provider
call ran. The focused unit suite passes 10 tests / 44 expectations. Normal
pre-push lint and typecheck passed on head 56fc3bbd; typecheck completed 4/4
tasks in 14.961s (2 cached). Browser acceptance and actual email delivery remain
unverified.

## V3 class session report and settlement boundary (2026-10-21)

`class-enrollment.reports.ts` owns `classes.submitSessionReport` and
`classes.listSessionReports`. The shared booking feedback schema normalizes the
three bullet fields and enforces the 600-code-point per-field limit. Only the
assigned tutor or an admin can submit/correct; admin writes require a reason.
Student reads require a funded seat and an existing report, and the read DTO
does not expose student identities or private meeting links.

Settlement locks class, session, report, allocations sorted by ID, then wallets
sorted by ID, and reads the current time only after those locks. Initial report,
immutable revision, residual funded-Mark deductions, session completion, audit,
notifications, and the earned-fee event commit atomically. The stable wallet
event is `class-allocation:${allocationId}:complete:deduct`; the fee event is
`academy-class-session:${sessionId}:earned-fee`. Late withdrawal and parent
cancellation do not erase a retained past funded seat; early-released and
unfunded allocations are excluded. A fee uses the fixed session IDR amount and
is emitted only when at least one funded allocation is chargeable. Replays are
idempotent; stale versions conflict. Admin corrections append revision/audit
history and notify the tutor without repeating economic effects. The parent
class completes only after every non-cancelled session is complete and is never
resurrected from cancelled state.

The backend, payout source support, role-based `/class-reports` workspace, and
pending-report reminder worker are implemented. The shared page shows settlement
preview/readback to tutors/admins, keeps student settlement fields null,
normalizes feedback bullets, and preserves unsaved edits on stale-version
conflicts. It supports versioned admin edits with a required reason.
The booking-detail on-demand report implementation was verified in merged PR #305; migration 0070 is applied on local test/dev. PDF support and broader acceptance remain open.

`class-enrollment.report-reminders.ts` runs from the existing one-minute
`class-enrollment-check` job. It selects at most 100 ended, scheduled sessions in
published/postponed cohorts and masterclasses that have no report and no current
reminder event, plus retained past scheduled sessions on cancelled classes. The
first reminder is due at `endAt`; later reminders are due in 24-hour elapsed
periods from that time. A delayed scheduler writes only the current due period.
Cancelled sessions, completed sessions/classes, and sessions with a report are
ineligible. The notification event key is
`academy-class-session:${sessionId}:missing-report:day:${period}`; the unique
notification event-key index and existing email outbox make replay/restart safe
without a migration. Before writing, the worker locks the class then session and
rechecks class/session state, schedule, tutor, report, and current period. It sends an action
notification and email only to the assigned tutor with a private `/class-reports`
link. A submitted report, cancelled session, completed state, or stale schedule/
tutor candidate suppresses the write; cancelling the parent class does not suppress
a still-scheduled retained past session. The worker never changes report, session
or financial state and does not use no-show expiry as proof of delivery. This
class sessions keep their existing class-specific query and event identity. The
same one-minute scheduler separately runs the legacy on-demand worker described
above, with its own booking/session identity and period keys.

The integrated `createClassEnrollmentService.processDueJobs()` runs this bounded
global report scan alongside installment reminder processing and returns
separate `reportRemindersQueued` and `reportRemindersFailed` counters. At parent
integration `1f9b6dd7`, the full guarded class-enrollment PostgreSQL suite passed
44 tests / 354 expectations (exit 0, 9.62s); the pure reminder suite passed
7 tests / 25 expectations (exit 0, 0.15s). No development seed or migration ran.
At that parent checkpoint PDF export and broader legacy solo/group/series reminder
coverage were pending; see the current Report Export Module status below.

## V3 class/session draft foundation (2026-10-19)

`academy-class` owns the admin-only draft boundary. Migration `0061_academy_class_drafts.sql` adds `academy_class` and `academy_class_session`; session capacity, tutor, mode, room, dates, and tutor-fee snapshot are session-level. Class rows retain localized metadata, active competition identity, cohort minimum/check date and plan-rate defaults, masterclass seat-rate default, state, postponement count, and optimistic version.

`admin.listAcademyClasses`, `admin.getAcademyClass`, and `admin.saveAcademyClassDraft` expose the current slice. Save creates or version-checks a draft and requires an audit reason. Audit actions are `academy_class.draft_created` and `academy_class.draft_updated`; snapshots include class/session terms but exclude tutor account data. Existing session IDs survive draft edits and sequence changes. Only draft classes are editable. The admin view combines its published and postponed reads by class ID and keeps the highest-version snapshot during refresh, preserving one current class card for its existing lifecycle actions.

Server validation requires an active competition (including an active parent for a specialization), a published tutor profile supporting the mode, an active managed room with sufficient capacity for in-person sessions, valid non-overlapping session times, English cohort curriculum, and a minimum-check date before the first cohort session. Masterclasses contain exactly one session. Approved draft defaults are cohort 20/22/25 Marks for full/half/single sessions and Rp400,000 tutor fee per session; masterclass 5 Marks and Rp300,000 tutor fee. Admin can edit draft values.

`classes.list` and `classes.get` are public procedures backed by `listPublished` and `getPublished`. Both map through an explicit student DTO; detail treats drafts as not found. It includes only catalog fields and tutor display name, with no payout/tax fields, private tutor account data, room details, audit/version values, or roster.

Drafts are not public and do not reserve rooms; conflict checks happen at publication. The admin editor uploads PNG/JPEG/WebP/GIF covers through the existing protected upload flow (max 5 MB) and saves the returned key on the draft; approved M01 cover/curriculum assets remain pending. Admin publish controls, notifications, and durable Meet retry are implemented and browser-verified. Student enrollment is implemented in the T05 module below; T06 cancellation and T07 report/expiry settlement and reminders are implemented. The role-based report workspace is documented above; the private PDF source is documented below with guarded DB/browser/server-bundle acceptance still open. On-demand booking report acceptance is recorded in PR #305. Public list/detail projection is implemented as described above. This is not a V3 activation or release checkpoint.

## V3 class publication and meeting jobs (2026-10-20)

`admin.publishAcademyClass` locks the class row and checks `expectedVersion` before changing a draft. Inside one transaction it takes the competition-catalog lock followed by sorted tutor and room advisory locks, then rereads mutable competition, tutor, and room references under row locks. Catalog archive, tutor status changes, and room update/deactivation coordinate with those locks. It revalidates active competition ancestry, published tutor assignment and supported mode, the approved flat tutor fee (cohort Rp400,000; masterclass Rp300,000 in either mode), future session times, cohort prerequisites, managed-room capacity and conflicts against active bookings/published classes. It schedules the sessions, writes one audit record, enqueues one unique meeting row per online session, and writes a deduplicated notification per assigned tutor. A failure in these writes rolls back the publication as a whole.

`academy_class_meeting` stores provider event identity, URL, status, attempts, retry time, and a five-minute processing lease. Provider calls happen after the publication transaction commits. Workers claim rows conditionally, retry failures with exponential backoff capped at six hours, and use session-scoped stable Google event IDs so a retry can recover an event created before a process failure. An accepted Calendar event without a usable Meet URL stays failed/retryable; the retry fetches the preserved event ID and never inserts a duplicate event. Manual fallback is not marked ready. Admin retry resets failed rows to pending; the existing scheduler also drains due class jobs. In-person sessions never receive a meeting row. The class adapter is injected only in `NODE_ENV=test`; its controlled title prefix accepts an event without a Meet URL once, then returns the link on retry without a network call.

### Tutor absence and same-time replacement

`academy_class_tutor_absence` stores one notice per session/tutor assignment version, including tutor, server timestamp, reason, scheduled-start snapshot, and the late flag. `late` is true only when reported less than 24 hours before the captured start; an exact 24-hour notice is on time. Tutors can report after a session starts and even after its scheduled end while the session remains scheduled. Tutor authorization checks the current assigned tutor under the class-then-session lock order. Admin reads retain the full notice history and late-notice count per tutor.

`admin.replaceAbsentClassTutor` is also the same-time recovery path when a tutor never reported. It locks the class/session and old/new tutor resources, checks expected session version, active published tutor profile/mode/capacity, booking/class overlap, and refuses report/earned-fee sessions. It changes only `academy_class_session.tutor_id` and version; schedule, class flat fee, and allocations remain unchanged. The stable meeting row is marked pending; existing lease/version reconciliation ensures an in-flight provider update is retried against the current tutor. The provider updates the saved Calendar event attendee without creating a second Meet. One transaction writes audit and deduplicated in-app notifications to both tutors and funded/unfunded-reserved students. Replacement alone does not grant an exit window. A schedule change/refund policy remains out of scope pending Q04 decisions.

Public `classes.list/get` remain a separate allowlisted read model. The student DTO contains catalog, schedule, curriculum, published cohort/masterclass rates, and tutor display fields only; it omits IDR fees, payout/tax/account fields, rooms, meeting links/status, admin audit/version values, and student data. Enrollment is not exposed by these routes. T04 still depends on T02/T07 delivery, report and expiry integration, plus parent review/dev integration of the T06 lifecycle worktree; approved curriculum and cover content are external inputs.

## V3 class enrollment and session funding boundary (2026-10-21)

`class-enrollment` owns student class enrollment, checkout, installment, expiry, reminder and per-session funding state. It does not modify booking, signup or payout modules. `classes.getMyEnrollments` returns only the caller's rows; mutations require a verified student and recheck ownership in the service. `classes.createEnrollment` resolves current published rates and future scheduled sessions, then snapshots the session IDs, sequence, start time and rate. Full, half, single and the one-session masterclass plan share this snapshot boundary. Full enrollment creates one funded allocation per session in the same transaction as the seat reservations and wallet hold. Half enrollment funds the first ceil-half now and reserves the second floor-half as unfunded until installment payment; a one-session late join becomes a single nonempty first installment. A 15-minute pending checkout reserves all selected seats and expiry releases them. Unpaid second-half default releases only future unfunded reservations; missed sessions are never charged. Plan/rate edits after enrollment do not reprice the entitlement.

Wallet hold identity for each funded session is `class-enrollment:${enrollmentId}:session:${sessionId}:hold:v1`, with source reference `academy-class-enrollment/${enrollmentId}/allocation/${allocationId}`. The wallet hold, ledger entry, allocation funded state and installment state commit together. `academy_class_enrollment_allocation` is the stable T07 funding identity. T07 may spend only the remaining funded Marks on that same session allocation after delivery; enrollment/payment does not deduct a class fee or settle a report. The invariant is `spentMarks + releasedMarks <= fundedMarks <= rateMarks`. An unfunded reservation cannot be spent or released as funded balance. A funded allocation is terminally released only when its remaining balance is zero, before its seat is freed; replay cannot hold, spend, release or fund a terminal allocation again.

Financial mutations acquire sorted session row locks, then enrollment, installment, per-session allocation rows in session order and wallet locks, followed by ledger writes, all in one database transaction. Enrollment creation also serializes the student request key and locks the class before selected sessions. This order is the T07 integration contract; any new settlement path must preserve it and must leave no wallet or seat residue if a later write fails. Notifications are written through the existing notification service with stable event keys. The existing one-minute scheduler checks checkout expiry, second-installment deadlines, 7-day/1-day installment reminders, and bounded pending class-report reminders; catch-up creates only the currently due report reminder period and never historical reminders for late joiners.

T06 student/admin cancellation releases only future unspent allocation balances under the approved policy and preserves past funded delivery liability. Q04 ordinary schedule changes use the separate versioned session/allocation flow documented above, with deadline min(notice +24 hours, new start). T07 report completion and fee deduction are implemented by the class report settlement path below.

The T05 global setup gives each 6769 run a fresh seeded student (keeping the Andre display name) and leaves earlier enrollment, allocation, ledger, quote and payment rows untouched. Its reset command is a no-op on T05, remains no-write on 6767/6768, and keeps the exact seed-Andre legacy reset on payout target 6770. This avoids FK cleanup assumptions and keeps later T07 session report and payout facts attached to their original enrollment history.

## V3 report input contract (2026-10-18)

`booking/feedback-rules.ts` is shared by input schema and English completion UI.
`normalizeFeedbackBullets` splits CRLF/CR/LF, removes leading UI bullets, trims
and discards empty lines. `countFeedbackCharacters` counts code points in the
normalized lines joined by LF, at most 600 per report field. The editor preserves
invalid drafts and shows an over-limit count rather than silently truncating;
completion is disabled until all three fields are nonempty and within the limit.
Direct service completion revalidates through the same schema before deductions
or report persistence. Existing HTML escaping is applied after validation and is
not truncated; encoded entities can therefore occupy more than 600 stored code
units. No migration rewrites old reports. Completion settlement/authorization,
reminders and future PDF export are otherwise unchanged by this slice.

## V3 economy draft revisions (2026-10-18)

Pricing's `v3-economy.config.ts` owns validated defaults and editable configuration.
Session calculations use the booking competition's canonical slug, online/offline
and integer headcount 1–6. Marks round upward per student; tutor fees remain IDR.
Q13 was approved by the project owner: preserve custom top-ups and recommend
the next larger package when cheaper/equal. Tiers follow configured package Marks.
Below the first threshold use the first package's unit price; thereafter use the
largest threshold not exceeding the requested Marks, plus surcharge per Mark.
Exact package Marks use package price without surcharge. Rational unit prices
round the full custom purchase upward once to whole IDR using integer arithmetic.
Package validation requires ascending Marks/prices and decreasing unit rates.

`competitionRates` is keyed by stable parent catalog slugs, not a seven-value
runtime enum. All seven canonical (migration 0029) parent rates remain required; additional
current parents may have a configured solo rate, while missing rates remain
unconfigured. Children inherit the parent rate. Admin settings and save
validation exclude superseded migration 0027 seed rows and use current catalog
parents under the catalog lock.
Session preview enumerates configured parents, both modalities and headcounts
1–6. The calculator accepts any configured parent slug.

`economy_v3_revision` retains version PK, JSON values, required reason, actor FK
(set null on account deletion) and timestamp. Reads return latest or virtual
version 0 without writing. Repository append runs inside the admin transaction,
takes an advisory transaction lock, checks expectedVersion, and inserts the next
revision without updating earlier versions. Admin audit event
`economy_v3_revision_created` stores before/after/reason in that same transaction.
Audit failure aborts save. The real-Postgres integration suite passed against the
isolated `cogito-test` database: 7 tests/26 expectations verify one-winner CAS,
immutable prior revisions, audit rollback, unchanged active legacy settings and
role denial. This does not verify production migration or pricing activation.

`V3EconomySettings` adds an English Selia draft editor and six-headcount
online/offline preview to `/admin-economy`, plus exact top-up and better-value
preview. It lists all catalog parents, leaves unconfigured parent rates blank,
and saves only complete rate pairs. Invalid configurations block save;
stale-version failures retain edits with cancel/reload recovery.

The nullable activation pointer remains separate from saved draft revisions.
When unset, existing legacy pricing remains in force for the seven legacy parent
slugs, while a new parent without an active V3 rate is rejected rather than
falling back to a tutor's legacy base rate. With an active revision, discovery
projects rates by the selected parent slug and new solo/group/solo-series
booking snapshots pin that revision. Group-series creation also prices at target
headcount and pins the revision. When invitations resolve to a partial group,
repricing loads that exact revision at confirmed headcount, adjusts each
confirmed participant's remaining scheduled-session hold, and updates booking
and scheduled-session snapshots before reconfirmation. Target-size-one solo-series
and activation-null legacy group-series retain their existing behavior. Legacy
analytics interpretation, customer activation and production migration remain
gated; draft saves do not enable any of them.

## SnapCN video tooling (2026-10-18)

`@cogito-app/video` (`apps/video`) registers Remotion compositions in
`src/root.tsx` via `src/index.ts`. SnapCN source lives in
`src/components/snap-cn/`; its core lives in `src/lib/snap-cn-ui/`.
It consumes shared UI CSS tokens/fonts, independently of the web runtime.
No services, event keys, database writes, or business rules are introduced.

Last updated: 2026-10-18

## Student dashboard balance CTA fit (2026-10-02)

`BalanceWidget` gives its primary action flexible no-wrap width. The student
dashboard configures the secondary `/balance` action as an icon-only
`IconCashPlus` link with the accessible label **Top up**; the Balance page keeps
the existing labeled CTA. This is presentation-only: no service, repository,
event key, or business rule changed.

## Role-based dashboard analytics (2026-09-25)

Dashboard analytics stays read-only and role-scoped. Student and tutor cards
consume `booking.listMine` counts from `listAccessible`; the repository computes
`completed` and `problem` across every accessible booking rather than the
current page. Student achievement status comes from `achievement.stats`, tutor
availability count comes from `tutor.listAvailability`, and admin queue cards
reuse admin booking/tutor/achievement moderation reads. Balance readiness is
derived from the wallet snapshot without claiming future affordability.

Admin Business insights labels distinguish selected-period metrics from the
live all-time state portfolio. The selected-period pricing snapshot breakdown
counts booking records by V3, legacy, other, or missing snapshot; V3 is
engine-tagged, legacy requires the known untagged numeric shape, other includes
unknown or malformed non-null snapshots, and missing is SQL NULL. It does not
count sessions or estimate money, and includes all states in the booking-created
date range. Booking-derived Marks, IDR, and platform-take
totals are omitted pending Q15 because parent and per-session snapshots have
different units across booking types. Top-up revenue is separately aggregated
from successful payment and refund rows. Active learners is currently named
**Active booking proposers** because the aggregate does not yet count group
participants or login activity.

`admin.getDashboardAnalytics` accepts preset or custom inclusive WIB ranges.
Impossible custom calendar dates are rejected before query execution.
Its account aggregate uses correlated auth-session existence checks: current
MAU is activity in days 0-30, and churn is prior-window activity in days 31-60
without current-window activity. Wallet health counts all student accounts,
treating a missing wallet as zero Marks. Lifetime paid conversion counts unique
students with `PAID`/`SETTLED` payment rows. Selected-range gross revenue sums
those successful rows by `payment_record.updated_at`; refunds are summed from
`refund_record.created_at`, then subtracted for net top-up revenue. Reads run in
parallel and return aggregates only, never user identities.

`formatBookingDate` maps `Asia/Jakarta` to the user-facing `WIB` suffix while
preserving native Intl short labels for other IANA zones. The shared
`EmptyState` visual remains unchanged after reverting the dashed-border trial.

## Temporary Knowledge Bank access grants (2026-09-18)

The admin Knowledge Bank access workspace grants a named student a temporary
exception to the 35-Mark gate. Grants are keyed to the student user, have one
future expiry timestamp, and are evaluated on every eligibility/file request;
no scheduler is needed to revoke expired access. Admin create/update/remove
operations are audit-logged, and removing a grant deletes only the live
exception while preserving the audit record. The web form searches the bounded
admin `admin.searchUsers` identity projection and accepts the email only after
an operator selects a student result. Expiry entry composes the shared Selia
calendar with the cross-browser minute time picker; new grants default to
23:59 local time thirty days from today. Its table uses a padded filter region
and an overflow-contained data region so wide rows remain inside the Selia card.

## Competition Calendar agenda list (2026-09-18)

The web calendar derives its agenda projection locally from the protected
`content.listCompetitions` result. For the selected 30-day period it keeps
competitions that overlap the period, de-duplicates by competition id, and
sorts by the first event date before rendering one flat list item per
competition. Multi-day date ranges remain visible in the item and the details
drawer. No service, repository, event key, or business rule changed.

## Achievement summary presentation (2026-09-09)

The student achievement page composes its Total, Approved, and Pending values
inside one Selia card with three persistent columns, preventing the summary
from stacking into three card rows on narrow screens. Its source uses the
correctly spelled `AchievementsPage` / `achievements-page.tsx` names. No
service, event key, or business rule changed.

## Dashboard greeting presentation (2026-09-08)

`apps/web/src/components/dashboard/dashboard-greetings.ts` owns the four local
time bands and the phrase pools for `student`, `tutor`, and `admin`.
`createDashboardGreeting` is a pure selector: callers supply role, name, hour,
random value, and optional workload context. `DashboardWelcomeCard` owns the
minute-level clock refresh and a mount-stable random value. The greeting is a
frontend presentation concern; it adds no service, event key, or business
rule. The selector hardcodes `Admin` for the admin role, while student and tutor
roles derive the first name from the supplied account name.

## Booking-detail action ownership (2026-09-08)

`BookingLifecycleActions` remains the owner of lifecycle mutations, pending
state, and dialogs, but its action controls now compose into the shared booking
detail header. `getBookingLifecycleContext` derives the summary copy for
reschedule, invitation, reconfirmation, pending-invite, and lateness cases. The
report action is icon-only with an accessible name and native tooltip. This is
presentation-only and supersedes older references below to a separate sticky
Booking actions card.

## Competition field presentation

Competition colors are a frontend presentation concern shared through `packages/ui/src/styles/globals.css`. Each field has `competition-{field}` and `competition-{field}-foreground` Tailwind tokens. `apps/web/src/lib/competition-colors.ts` is the canonical mapping from academy `coreCategory` slugs (`mun`, `olimpiade`, `wsc`, `kti`, `debat`, `business`, `pidato`), current taxonomy parent slugs, and archived legacy slugs to `soft` and `solid` class sets. Unknown slugs deliberately use the KTI/Research fallback. Tutor-card, tutor-drawer, onboarding, and calendar-detail competition badges use the solid mapping; their foreground is white except for Business Plan's dark foreground. Calendar event surfaces intentionally use the soft mapping. Child specializations inherit the field of their parent category.

## Server-backed table pagination (2026-09-04)

Data-table pagination is owned by the module that reads the collection. The
achievement and room repositories apply `limit`/`offset` directly to their
ordered SQL queries; admin booking and ledger repositories continue to expose
cursor pages; and admin tutor lists keep their offset pages. Manage Tutors and
Tutor Payouts own independent page state for their respective collections. Its
custom date range uses the shared Selia `DatePicker`, not native browser date
inputs. Web
components render a bounded page plus a one-row sentinel where needed, use
`keepPreviousData` during transitions, and reset pagination after filter or
selection changes. Aggregate achievement counts come from dedicated stats
queries rather than counting the current page. Fixed pricing/economy matrices
are finite configuration previews and are not collection tables.

## Student dashboard balance widget (2026-09-04)

The student dashboard balance widget is a frontend projection of the existing
wallet snapshot: available balance is primary, with held and total balances as
context. Its Knowledge Bank shortcut follows the wallet module's canonical
35-total-Mark eligibility rule on the Balance page, where the access card sits
beside the widget on desktop. No service, repository, event key, or business
beside the widget on desktop. The widget exposes a route/label-configurable CTA
so Balance uses **Find a tutor** and the dashboard uses **Top up**. No service,
repository, event key, or business rule changed.

## Card title info preview (2026-09-04)

The shared Selia card module exposes `CardInfoPreview` as an inline title slot
for the app's icon-triggered `InfoPreview` popover. Its first use moves the admin
Booking activity explanation into the title row, and the popover trigger now
accepts a caller-provided icon. Booking-detail cards and their admin extensions
use the same composition for explanatory header copy. Dashboard, admin, tutor
availability, onboarding, profile, notification, and wallet headers use it as
well, while sign-in/sign-up use title-only headers and primary content and
metadata stay inline. Their initial session loader reserves the authentication
content height to prevent the legal notice from shifting. No service, repository,
event key, or business rule changed.

## Sidebar logo contrast (2026-09-04)

The authenticated sidebar applies a dark-mode-only filter to the existing
Cogito Academy logo so the full wordmark renders white. This is client-side
presentation behavior and adds no service, repository, event-key, or business
rule.

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

## Production UI and E2E audit (2026-09-04)

The audit hardens browser workflows and shared Selia composition only. No API
module, service, repository, event key, authentication rule, or business rule
was added or changed. The CI browser job uses the existing module boundaries
and deterministic seed data to verify the user-visible booking, privacy, and
economy workflows.

The 2026-09-05 E2E workflow correction resolves and installs Chromium from the
`packages/e2e` workspace so the browser revision matches its locked
Playwright dependency. This changes CI setup only; module boundaries, event
keys, services, repositories, and business rules remain unchanged.

The 2026-09-02 Lefthook lint-gate alignment changes repository tooling only;
services, modules, event keys, and business rules are unchanged.

Production release orchestration is outside module contracts. Its workflow
and deploy script are restored to the last known successful `bb1ccb9a` state;
the VPS runner no longer pulls application images directly. No service, event
key, or business rule is changed.

The 2026-09-02 admin booking-detail consolidation is presentation-only; room,
wallet, ledger, and state-history services and event keys are unchanged.
Room assignment additionally permits a `scheduled` offline booking only when
it has no active room, enabling re-assignment after an admin removes a room.

## Selia field-context invariant (2026-08-31)

The profile and tutor-onboarding compositions place every `FieldLabel`,
`FieldDescription`, and `FieldError` under a Selia `Field` root. This includes
the profile contact-privacy checkbox, the tutor payout disclaimer, and
section-level achievement errors. Violating this invariant triggers Base UI
error #28 during rendering; the fix is frontend-only and adds no service,
repository, event-key, or API contract.

## CI test and coverage pipeline (2026-09-02)

The CI workflow restores the shared Bun install cache before installing
dependencies. Pull-request typecheck and build tasks use Turbo `--affected`
with full history; manual dispatches run the full graph. The web typecheck
task is TypeScript-only, so it does not repeat the production Vite build.

Test + Coverage starts independently of lint and typecheck. It runs one
lcov-producing API/env/auth/db suite, then the server suite in a separate
process because the webhook test uses `mock.module`. The old duplicate
uninstrumented API pass is not run. The coverage comment reads the generated
lcov artifact and enforces 100% for `packages/api` lines, overall lines,
functions, and branches. A 0/0 branch total is treated as 100%; coverage test
command failures are explicitly propagated after the comment/gate step. The
gate is configured by `.github/workflows/ci.yml` and implemented in
`.github/scripts/coverage-comment.ts`. The renderer separates the gate
blockquote and tables with blank lines required by GitHub Markdown.

## Collection transition behavior (2026-08-28)

The web collection layer uses `keepPreviousData` for server-backed admin tutor
pagination, tutor discovery search/filter changes, and admin booking-queue
filter changes. Admin tutor pagination uses per-card DOM anchors and
`scrollIntoView` after a click; it keeps the current table visible during the
request and disables the controls until the next page arrives. Cursor-loaded
notifications already preserve prior pages by design. User-specific wallet
lookup and student search do not retain stale results across a changed query.
Manage Tutors requests three invitations and five tutor profiles per page; the
two collections keep independent page size, offset, and next-page state. Tutor
Payouts requests ten tutor profiles per page and loads each visible tutor's
pending honorarium summary for its operational table.

The shared booking list uses Needs action, Upcoming, Series, History, and All tabs. Admins default to All; students and tutors default to Upcoming unless an explicit URL tab is present. The page sends the selected view to `booking.listMine`; repository predicates apply the tab semantics before cursor pagination, and a separate role-scoped aggregate returns exact counts for every tab. Changing views loads a new first page, while **Load more bookings** appends the selected view's cursor. Recommended, Soonest, and Latest sorting remains client-side within the loaded filtered pages.

For tutors, Needs action also includes a `scheduled` single/group booking after
its scheduled end and a `series` parent when any scheduled child session has
ended. This is a correlated `booking_session` existence check, so a series can
surface one ended session while a later session remains upcoming. Students and
admins retain the pending-decision action predicate; completion tasks are not
exposed as student actions.

`BookingListCard` derives one contextual time chip from server facts: pending states read `deadlineAt`, confirmed/scheduled states read the scheduled window, and terminal states render none. A module-level external clock store updates all mounted cards from one 30-second interval rather than allocating one timer per row.
The reusable card exposes `showFinancialInfo`; booking lists keep it enabled and place the time chip after it, while dashboard next-lesson cards disable it.

The authenticated sidebar requests `booking.listMine` with `view: "action"` and
shows a compact `99+`-capped badge beside `/bookings` when role-visible action
rows exist. It therefore includes tutor completion tasks as well as pending
decisions and stays aligned with the server-filtered **Needs action** tab.

Tutor invitations use the shared email provider: create sends once, **Generate & copy link** only rotates the token, and the separate **Send again** procedure rotates then explicitly delivers through Resend. Delivery failure does not roll back the valid invite.

The invite form performs an admin-only account preflight by exact normalized email. Provider facts come from Better Auth `account.providerId` rows (`google`, `credential`, or both); admin-role accounts are shown as ineligible and cannot be submitted from the UI.

Google OAuth is enabled only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured; a partial configuration disables the provider rather than creating an empty provider entry. Redis access goes through the adapter boundary in `packages/api/src/lib/redis.ts`, so the in-memory fallback exposes the same command surface for tests and defensive runtime degradation while production remains Redis-backed.

## Admin wallet lookup search (2026-09-02)

Admin Operations searches user identity before loading wallet data. The
`admin.searchUsers` read matches name, email, or ID case-insensitively and
returns at most 20 safe identity rows; exact email/ID matches sort first and
user-entered wildcard characters are escaped. The UI selects one result, then
calls `admin.getWallet` and `admin.listLedgerEntries` with that user's internal
ID. No wallet is created by the search or lookup reads.

## Overview

The `packages/api` package implements business logic using a 4-layer architecture: **Router → Handler → Service → Repository**. Each module lives in `packages/api/src/modules/{module}/` with these files:

Production runtime URL configuration is intentionally separate from module
contracts: API modules are served from `api.cogitoacademy.id`, frontend links
and CORS use `app.cogitoacademy.id`, and the apex `cogitoacademy.id` remains
the external company profile. Services that generate user-facing links use
`CORS_ORIGIN`, so they point to the frontend host rather than the API host.

Database bootstrap uses `SELECT 1` before the API starts serving traffic. The
Coolify private PostgreSQL service is non-TLS, so that deployment sets
`DB_SSL_ENABLED=false`; `DB_SSL_REJECT_UNAUTHORIZED` applies only to TLS-backed
managed or external PostgreSQL services.

The server then runs `apps/server/src/admin-bootstrap.ts` in production-like
environments. It reads the comma-separated `ADMIN_EMAILS` allowlist (default
`itcogitoacademy01@gmail.com`), matches email addresses case-insensitively, and
promotes matching existing users without demoting other admins. Better Auth
applies the same rule to a matching signup after boot. The guarded
production/staging review seed is deliberately separate: it uses
`SEED_REVIEW_ADMIN_EMAIL`, rejects any address also present in `ADMIN_EMAILS`,
and creates local-login student/tutor/admin review identities without touching
the Google Calendar operator account. Defaults create Diego by Cogito at
`cogito.diego@yopmail.com` and three students, Andre, Argya, and Athena by
Cogito, at matching `cogito.<name>@yopmail.com` addresses.

Recommended-tutor summaries place the starting Marks price below the avatar on
narrow screens and keep it inline with subject metadata on wider screens. This
is a responsive presentation rule only and does not change tutor discovery data
or API contracts.

The frontend form-control refactor remains outside this service boundary. Selia controls provide consistent date, time, number, and multiline-input UX while retaining semantic HTML behavior and the existing API contracts. Shared text-entry controls use an explicit 16px font size below the `lg` breakpoint to prevent mobile focus zoom, then use the tokenized `text-base` size from `lg` upward. Tutor availability keeps compact, equal-width minute-time fields with a visual range separator and content-sized suggestions, and modality triggers render icons beside labels. Its date-override editor validates the selected dates and shared ranges locally before calling the atomic batch procedure, while its calendar preview uses a seven-day selector plus selected-day detail, presents the published source/modality metadata, and gates slot removal behind a confirmation dialog without changing the delete service contract. Portal-based date/select popups are layered above dialogs so the shared controls remain usable inside modal forms.

Frontend dashboard integration is intentionally read-only and role-scoped: student data comes from booking/discovery/wallet, tutor data from tutor actions/profile/availability/payouts, and admin data from booking operations/tutor moderation/achievement moderation. The shared booking list keeps financial/status metadata beside participant avatars, uses the Cogito mark icon plus status-badge tooltips for compact row presentation, orders active/all rows by nearest scheduled start while keeping past/cancelled history newest-first, and defaults by role to Upcoming (student), Pending when tutor requests exist (tutor), or All (admin); an explicit `tab` query parameter wins. Its page-local semantic button tablist uses Selia's tabs color and elevation tokens but changes active background directly without the shared sliding indicator. On narrow screens, sorting moves into the wrapping header action row and the rounded tab strip directly precedes the content while only the inner list scrolls horizontally. On larger screens, sorting remains beside the tabs. Student and tutor dashboards derive their next lesson from the same non-terminal, non-pending upcoming set and render the shared `BookingListCard`, so visual changes to the booking card apply to all three surfaces. They also render the shared `DashboardWelcomeCard` with role-specific copy and destinations, keeping the SVG illustration, minimum height, spacing, and CTA structure aligned. The tutor dashboard presents welcome/setup first and keeps the review queue and next lesson in the next visible row, with a stable empty/loading review card; its payout details card uses shared `InfoPreview` popovers for the unpaid-honorarium and transfer-fee explanations. Booking detail activity uses transition-specific icons and a single destination-state badge for scanability. Dashboard cards link to the existing feature routes where mutations and detailed workflows live.

The authenticated frontend guide is a read-only, code-managed journey map at `/guide`. Its content lives in `apps/web/src/components/guide/guide-content.ts`, while `guide-page.tsx` composes a role switcher, Selia `Card` hero and highlights, a sticky left desktop chapter index, a horizontally scrollable snap index on mobile, and numbered disclosure cards for each step. Details open by default and can be toggled globally or per step; each card can also show statuses, exception branches, and feature CTAs. Visibility is role-scoped: student → Student; tutor → Tutor + Student; admin → Admin + Tutor + Student. Important timing rules are rendered as bold copy from the typed content, including 7-day tutor invites, 12-hour response and room windows, H-2 (2 hours before start) self-service cutoffs, 24-hour reschedule proposals, 15-minute lateness, 5-minute meeting retries with 3 attempts, and the 30-minute / 4-hour support SLA. The guide is documentation of existing behavior and does not create a service module or API contract.

The shared frontend pending state is rendered by `apps/web/src/components/loader.tsx` as the default loading component: a token-based loading ring with the local Selia `Spinner` primary arc in `cogito-orange`, a visible loading label, and reduced-motion support. Feature loading placeholders that previously used bespoke pulse skeletons reuse this component as well. The reusable `Spinner` source lives at `packages/ui/components/selia/spinner.tsx`; this is presentation-only and does not introduce a service module.

The shared frontend empty-state presentation is rendered by `apps/web/src/components/empty-state.tsx`. `EmptyStateCard` wraps page/card collection states, and `EmptyState` provides `default`, `compact`, and `inline` densities for embedded contexts such as menus, dialogs, fields, calendars, and detail sections. This module owns visual hierarchy and copy treatment only; it has no service, repository, event-key, or API contract.

Theme selection is also frontend-only. `apps/web/src/components/mode-toggle.tsx` composes the `next-themes` provider with Light/Dark/System menu items and a `D` keydown handler that toggles the currently rendered light/dark mode outside editable fields. Theme preference persistence stays in `next-themes`; there is no service module, repository, event key, or API contract.

The booking-detail overview keeps format/access and participant profile/name/status information together for quick scanning. Role-appropriate primary actions, including propose, cancel, review, and complete, sit directly below the status badge, while contextual actions remain in the sticky desktop rail or main flow. The desktop overview/activity flow uses an independent left column from the sticky Actions/financial rail so rail height cannot create a blank row before Activity; narrow layouts keep actions/financial information before Activity. Tutors see IDR honorarium, students see Marks, and admins see operational wallet impact plus review context through explicit slots on the same shared detail page. Admin override, room, participant-wallet/ledger, and state-history controls remain admin-only. Dashboard cards link to the existing feature routes where mutations and detailed workflows live. This layout refinement is presentation-only and does not add a service module, event key, or API contract.
Editorial content integration is also read-only: Sanity remains the source of truth, while the app's API enforces session/role/Marks access before returning content or streaming Knowledge Bank files. The academy's bilingual presentation is resolved to English in the server projection; the authenticated app does not carry a locale selector for these surfaces.

| File                  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `{module}.types.ts`   | Zod input/output schemas                                 |
| `{module}.errors.ts`  | DomainError subclasses + ORPCError mapper                |
| `{module}.repo.ts`    | Data access (SQL queries via Drizzle + postgres.js)      |
| `{module}.service.ts` | Pure business logic + consumer port interfaces           |
| `{module}.handler.ts` | DI factory: adapts `{ context, input }` to service calls |
| `{module}.router.ts`  | oRPC route definitions with auth middleware              |
| `index.ts`            | `createModule()` factory, exports public API             |

---

## Public Content Module

**Purpose:** Provide the marketing site a public tutor read from the app's published tutor profiles without returning private profile or account data.

**Files:**

- `public-content.repo.ts` — published-only query with positive profile, account, and catalog column allowlists; inactive subject or parent categories are filtered out
- `public-content.service.ts` — strict DTO mapper for public identity, profile copy, structured education/achievements/experience, subject catalog labels, and teaching modality
- `public-content.handler.ts` and `public-content.router.ts` — anonymous `publicContent.tutors.list` procedure with a strict empty-object input
- `index.ts` — module composition factory

**Service method:**

- `listTutors()` — returns the public DTO list; an empty database result remains `[]`, while database/mapping failures propagate as RPC errors

The DTO exposes only `id` (tutor profile ID), `name`, `profileImageUrl`, `shortBio`, `affiliation`, `education`, `achievements`, `experiences`, `subjects`, and `modality`. Subject rows expose app-catalog `id`, `slug`, English `name`, nullable `nameId`, and a parent with the same identity/name fields plus the four explicit light/dark text/background palette values; each child receives its parent's palette. Inactive child or parent categories are filtered from the query and checked again by the mapper; activity flags are never public. JSON profile entries and related catalog rows are mapped field by field, so new database or JSON properties do not flow through. The repository selects only the fields used by that DTO. `modality` describes teaching format; the tutor schema has no physical city/location field. `tutors.listPublished` remains student-authenticated and retains its existing booking-discovery projection.

## FAQ Module

`/faq` is the single app entry point. Admins use the admin list, including inactive
entries, with All/Active/Inactive filters and add/edit controls. Editing opens a
split panel at 1024px and above, or a modal drawer below that width. Switching or
closing a dirty draft offers Discard/Keep editing; navigation and reload are
guarded. Saves retain version checks and invalidate admin/public FAQ caches.
The old `/admin-faq` route and duplicate sidebar item are removed.

The app read-only FAQ uses a single medium heading and full-width booking-style
layout. Each rounded accordion row has a plus/close control; answer padding is
inside the animated panel to keep its 250 ms closing transition smooth.

The read-only app view presents questions as rounded Selia accordion rows with
circular plus/close indicators and inline expanded answers. It preserves the
existing headings, public projection, and loading/error/empty states.

**Purpose:** Manage bilingual FAQ content in the app and provide backward-compatible, request-time public projections with localized rich documents while keeping admin fields private.

**Files:**

- `faq.types.ts` — strict rich-document inputs, public/admin DTOs, and the six-entry landing limit
- `faq-rich-text.ts` — rich-document validation, safe-link allowlist, and legacy plain-text/list projections
- `faq.repo.ts` — alphabetized admin/public reads, create, version-checked update, and serialized landing-selection writes
- `faq.service.ts` — locale fallback/sorting and strict admin/public DTO mapping
- `faq.handler.ts` and `faq.router.ts` — anonymous `publicContent.faq.list` and admin-only `adminFaq.list/create/update` RPC procedures
- `packages/db/src/schema/faq.ts`, migration `0058_faq_entries.sql`, and migration `0059_faq_rich_text.sql` — localized legacy fields, rich JSONB documents, visibility, and optimistic version
- `apps/web/src/components/admin/faq-page.tsx`, `faq-rich-text-editor.tsx`, and `/faq` — admin-only Selia editor with optional Indonesian fields and modified dates
- `apps/web/src/components/admin/faq-read-only-page.tsx`, `/faq`, and `packages/ui/components/selia/accordion.tsx` — authenticated student/tutor/admin read-only FAQ view using the public DTO and Selia accordion

English question and answer documents are required; Indonesian documents are optional and fall back independently to English. Rich documents support paragraphs, bold/italic text, safe links (`http:`, `https:`, `mailto:`, same-origin paths, and anchors), and ordered/unordered lists. Raw HTML is rejected. Migration 0059 backfills the rich JSONB columns while keeping the legacy question/answer columns for existing consumers. Public entries retain `{ id, question, answer, sortOrder }` and add locale-selected `questionRich` and `answerRich`; the marketing adapter accepts their absence from older APIs and falls back to legacy rendering. Public entries are alphabetized by the displayed localized question. Admin entries are alphabetized by English question and include `modifiedAt`. The landing projection includes active rows marked `showOnLanding`; create/update serialize selection changes with a transaction advisory lock and reject more than six active selections. Deactivating an entry clears its landing selection and hides it publicly while retaining it for editing. The marketing site fetches both surfaces server-side with no-store caching, requires the response `json` field, accepts omitted or array-valued `meta`, and validates rich documents and safe links; question links remain non-interactive inside button triggers, and FAQ JSON-LD continues to use the plain projection. Migrations 0058/0059 are applied to local `cogito-test`; 0059 is also applied to local development `cogito-app`. Shared/production migration remains a release operation.

## Content Module

**Purpose:** Deliver published Competition Calendar and Knowledge Bank content from Sanity to authenticated app users without duplicating editorial documents into PostgreSQL.

**Files:**

- `content.types.ts` — normalized competition/resource/file projections and the resource-id input shape
- `content.service.ts` — server-side Sanity client, published-perspective GROQ queries, English localization fallback, and asset metadata lookup
- `content.handler.ts` — protected competition read and role-aware Knowledge Bank access gate
- `content.router.ts` — `content.listCompetitions` and `content.listStudentResources`
- `index.ts` — `createContentModule({ wallet, client? })` composition factory
- `apps/server/src/routes.ts` — authenticated `/content/knowledge-bank/:resourceId/file` PDF streaming proxy for resource files

**Service Methods:**

- `listCompetitions()` — returns published competitions ordered by start date with English title/description/location projections
- `listStudentResources()` — returns resource metadata without asset URLs
- `getStudentResourceFile(resourceId)` — resolves the published asset URL and file metadata for the already-authorized proxy

The calendar frontend consumes `listCompetitions()` as a read-only projection. It mirrors the academy's month interaction model (multi-day spans and overflow popup) and uses a flat 30-day agenda list that renders each overlapping competition once in first-event-date order, plus an event-details modal, while using Cogito App Selia components, design tokens, and Tabler icons. The type filter derives its options from loaded competition categories, keys each option by the parent `coreCategory` slug, and uses the category's English `name` with the seven legacy labels as missing-name fallbacks. All current types are selected by default; new types become selected after data refresh unless explicitly excluded; uncategorized events stay visible with no active filter; Reset selects all current options. The filter applies to both calendar views. Month-view event lanes are allocated per week and remain stable for every day an event spans; an ended event's lane may be reused by the next non-overlapping event. Its authenticated route is viewport-contained: the calendar card body owns vertical scrolling, while the month grid owns horizontal scrolling so the page shell and calendar toolbar do not scroll with the grid. The month view always keeps the standard grid visible, including for an event-free selected month; the page-level empty state remains reserved for a response with no competitions at all. The Knowledge Bank frontend is available at the authenticated `/knowledge-bank` route and renders resource category slugs as mapped or title-cased labels while keeping raw slugs for filtering. Its unsandboxed browser-native PDF iframe targets the protected API file route and sits in a responsive Selia drawer: bottom on mobile, right-side on desktop. The production web CSP allows the API origin in `frame-src`; the file route separately permits `frame-ancestors` from configured app origin and omits `X-Frame-Options`, while all other API routes deny framing. Admins get `Edit resources` (`studentResource`) and `Edit competitions` (`competition`) buttons on the Knowledge Bank and calendar pages; both open the matching document-type list in Sanity Studio in a new tab.

When the page-level no-competition state is rendered, its calendar glyph uses
the Cogito orange token; this accent is scoped to the Competition Calendar and
does not change the shared empty-state tone defaults.

**Business Rules:**

- Sanity is queried with `perspective: "published"`; the API token, if used, stays server-side.
- Competition Calendar requires an authenticated session but is not Marks-gated.
- Knowledge Bank is available to students, tutors, and admins through `wallet.knowledgeBankEligible`. Students must meet the existing 35-Mark total-balance rule, including held Marks, unless an active admin grant exists; tutors and admins bypass that wallet threshold. An active grant exposes its expiry through `overrideExpiresAt` and is checked on every request.
- Resource files are streamed through the app with private/no-store headers. Raw Sanity asset URLs are never returned by the list procedure.

---

## Admin Knowledge Bank Access Module

**Purpose:** Give admins a controlled, auditable way to grant a student temporary
Knowledge Bank access by email when the student should not currently need the
35-Mark threshold.

**Files:**

- `admin-knowledge-bank.types.ts` — list/create/update/remove input schemas
- `admin-knowledge-bank.errors.ts` — student, role, duplicate, expiry, and missing-grant domain errors
- `admin-knowledge-bank.repo.ts` — grant CRUD, case-insensitive student email lookup, active-expiry query, and status/search listing
- `admin-knowledge-bank.service.ts` — future-expiry validation, one-grant-per-student rule, audit events, and view mapping
- `admin-knowledge-bank.handler.ts` — session-admin delegation and domain-error mapping
- `admin-knowledge-bank.router.ts` — admin-only list/create/update/remove routes
- `index.ts` — module factory and the `KnowledgeBankAccessPort` consumed by Wallet

**Service Methods:**

- `list(input)` — returns active, expired, or all grants with optional student name/email search
- `create(adminId, input)` — resolves a student by email, creates a future-dated grant, and records `knowledge_bank_access_grant_created`
- `update(adminId, input)` — changes expiry/note and records before/after state in `knowledge_bank_access_grant_updated`
- `remove(adminId, id)` — deletes the live exception and records `knowledge_bank_access_grant_removed`
- `getActiveByUserId(userId, now?)` — returns only an unexpired grant for the wallet/content access gate

**Business Rules:**

- Only users whose current role is `student` may receive a grant; lookup is case-insensitive by email.
- A student can have one live grant. The unique `user_id` index and duplicate-error mapping protect concurrent creates.
- Create and update require a strictly future ISO datetime. Expired rows stay visible to admins but never bypass the threshold.
- Removal is a hard delete of the live grant; audit history remains in `audit_log`.
- The admin UI lives at `/admin-knowledge-bank` and supports active/expired/all filtering, edit, and confirmation-gated removal.
- The create dialog searches by student name or email through `admin.searchUsers`, requires a selected student result, and uses a Selia date picker plus minute time control instead of native `datetime-local`; new grants default to 23:59 local time thirty days out.

**Dependencies:** `AdminKnowledgeBankRepo`, `AuditPort`

**Consumer:** Wallet uses the exported `KnowledgeBankAccessPort` to apply the
active-grant override to `knowledgeBankEligible`.

---

## Achievement Module

**Purpose:** Manage student achievements (competitions, certifications, awards). Students CRUD their own; admins review and approve/reject.

**Files:**

- `achievement.types.ts` — Zod schemas for student create/update, admin correction, list/admin filters
- `achievement.errors.ts` — `AchievementNotFoundError`, `AchievementNotOwnedError`, `AchievementNotEditableError`, `OptimisticLockError`
- `achievement.repo.ts` — CRUD with optimistic locking (`updateWithVersion`, `updateByIdWithVersion`, `deleteWithVersion`), soft-delete/restore, and active-row aggregates
- `achievement.service.ts` — Ownership checks, admin correction/review/delete/restore workflow, audit and optimistic lock handling
- `achievement.handler.ts` — `list`, `stats`, `listApproved`, `create`, `update`, `remove`, `adminList`, `adminStats`, `adminUpdate`, `adminDelete`, `adminRestore`, `adminReview`
- `achievement.router.ts` — Protected list/stats routes, admin list/stats/correction/review routes, public `listApproved` route

**Service Methods:**

- `list(userId, input?)` — Returns a server-paginated user page with optional category/status filters; `pending` includes `pending_review`
- `stats(userId)` — Returns total/approved/pending/rejected/archived counts, with pending statuses combined
- `listApprovedPublic()` — Returns the allowlisted approved + visible achievement projection with the owner's display name for the public `cogito-acad` homepage and archive (F16)
- `create(userId, input)` — Creates achievement in `pending` status
- `update(userId, input)` — Updates with optimistic lock check (`input.version` + `input.data`)
- `remove(userId, id, expectedVersion)` — Deletes with optimistic lock check
- `adminList(input)` — Server-paginated list with optional status filter; `pending` includes `pending_review`
- `adminStats()` — Returns aggregate moderation counts for non-deleted rows without a page limit
- `adminUpdate(adminId, input)` — Corrects a `pending`/`pending_review` submission with optimistic locking, before/after audit content, and no status change; admins can also set or clear `documentationUrl`
- `adminDelete(adminId, achievementId)` / `adminRestore(adminId, achievementId)` — Soft-delete or restore an achievement and write its audit record in the same transaction
- `adminReview(id, status, adminNote?)` — Moderation action. **F12:** transition table — `pending`/`pending_review` → `approved`/`rejected`/`archived`; `approved`/`rejected` → `archived`; `archived` → `approved`/`rejected` (restore). Other transitions throw `AchievementNotEditableError`. Reads and updates inside one transaction using the current status/version as a compare-and-swap; a lost race throws `OptimisticLockError` before notification/audit side effects. Notifies the owner and writes an `achievement_{status}` audit record after success

**Dependencies:** `AchievementRepo`

**Business Rules:**

- Achievements start in `pending` status
- Only the owning student can create/update/delete their achievements
- `awardingDate` is the canonical award date; `evidenceUrl` is private verification material available to the owning student and admin workflows, while `documentationUrl` is optional public-safe documentation controlled by admins. Both accept only HTTP(S) URLs up to 2048 characters
- Student create/update schemas exclude `documentationUrl`; the student form presents the level options in `International`, `National`, `Province/State`, `City/Regency`, `School` order and instructs students to share Google Drive proof with “Anyone with the link can view” + Viewer
- The student form uses one explicit location value such as `Jakarta, Indonesia`, `Geneva, Switzerland`, or `Online`, and a long-answer `Brief Description` field with a ranked-result example
- `listApprovedPublic()` must select only public-safe fields. It must not return `userId` or `evidenceUrl`; the public site uses `displayName` and `documentationUrl` when rendering an approved record.
- The student and admin achievement forms use a responsive Selia drawer: bottom with downward dismissal below `sm`, right-side with rightward dismissal at `sm` and above. Shared portal controls for Category, Level, and Awarding Date must remain above the drawer layer.
- Optimistic locking prevents lost updates (`version` field)
- Admin correction is allowed only for `pending`/`pending_review`, can update every submission field plus public documentation, writes an audit snapshot, and does not change status; admin review changes status to `approved` or `rejected`
- Admin soft-delete/restore commits its row mutation and audit record atomically; aggregate moderation counts exclude soft-deleted rows unless an admin explicitly requests deleted rows
- Student and admin list pages use database pagination; the UI may request one extra row as a `hasNext` sentinel, but never loads the complete achievement collection into the browser.

**Web presentation:**

- The student `/achievements` list and admin `/admin-achievements` queue use compact minimum-width Selia tables with status/date/identity columns and a **View details** entry point. A shared detail drawer holds the full submission metadata as consistent label/value fields with a semantic badge reserved for status, plus attachments, moderator notes, and the relevant pending edit/delete or correct/approve/reject actions. It renders as a bottom sheet with downward dismissal on mobile and switches to a right-side drawer from the `sm` breakpoint. Evidence and public-documentation links open in a simple image dialog; unsupported image URLs retain an **Open original** escape hatch. Student summary counts use the same compact label-and-pill card treatment as the admin queue counts. Page/card wrappers remain constrained to the viewport, so only the table content scrolls horizontally. These layouts do not change service behavior, RPC inputs/outputs, or stored data.

---

## Admin Module

**Purpose:** System administration — user management, role assignment, wallet/ledger lookup, operational tutor payout processing, active economy schedule management, and aggregate business analytics.

**Admin UI workflow:** `/admin-tutors` owns tutor invitations, profile review,
publication, and moderation. `/admin-tutor-payouts` is the separate operational
payout workspace: it lists unpaid tutor honorarium, shows the completed sessions
included in each unpaid amount, verifies private destination-account details,
prepares a versioned immutable snapshot for selected session sources, and records
the exact actual net only after an external bank transfer. A reasoned void keeps
history/evidence and requires audited transfer reconciliation before released
sources can be prepared again. The report supports status/sorting views and a
monthly CSV using saved snapshots, actual Asia/Jakarta paid dates, and a separate
void/reconciliation section. The unpaid amount does not reset automatically each
calendar week.

**Files:**

- `admin.types.ts` — `dashboardAnalyticsInput`, `listUsersInput`, `adminSearchUsersInput`, `setRoleInput`, `adminGetWalletInput`, `adminListLedgerEntriesInput`, payout report/preview/prepare/record/void/reconciliation inputs, versioned tax default and override inputs
- `admin.errors.ts` — `UserNotFoundError`, `LastAdminError`, `OptimisticLockError`, `WalletNotFoundError`, `InvalidLedgerFilterError`, `EconomyConfigConflictError`, payout stale/profile/tax/amount/reconciliation errors
- `admin.repo.ts` — `getById`, `listUsers`, `searchUsers`, `getDashboardAnalytics`, `updateRoleWithExpected`
- `admin.service.ts` — `getDashboardAnalytics`, `listUsers`, `searchUsers`, `setRole`, `getWallet`, `listLedgerEntries`, payout report/preview/prepare/record/void/reconciliation/config/override methods, economy methods
- `admin.handler.ts` — corresponding admin-only payout procedures and the existing admin services
- `admin.router.ts` — Admin-only routes

**Service Methods:**

- `getDashboardAnalytics(input?)` — Returns normalized preset/custom-range booking and signup trends, current/rolling account activity, student Marks ownership, lifetime paid conversion, selected-range payment/refund revenue, live booking-state portfolio, period modality/category breakdowns, and selected-period booking-record counts by saved pricing engine (`v3`, `legacy`, `other`, `missing`); trend dates are filled with zero rows using WIB boundaries
- `listUsers(opts)` — Paginated user list
- `searchUsers({ query, limit? })` — Returns a bounded identity projection for admin lookup, matching name, email, or user ID
- `setRole(userId, role, adminId)` — Changes user role; throws `LastAdminError` if removing last admin; optimistic lock via `expectedRole`; records audit log
- `getWallet({ userId })` — Returns any user's wallet balances; throws `WalletNotFoundError`
- `listLedgerEntries(input)` — Paginated ledger filtered by wallet/user, entry type, date range, or booking; `walletId` and `userId` are mutually exclusive
- `getTutorPayouts({ tutorId, dateFrom?, dateTo? })` — Compatibility aggregate for completed tutor sessions → `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }`; persisted `tutor_session_fee` events are authoritative and legacy booking/session snapshots remain a read-only fallback for sources without an event. Stable source keys prevent event/legacy double counting and expose a completed series child before its parent completes. Fee events use `earnedAt`; legacy sources retain completion-time/scheduled-time cutoff behavior. New admin batches persist selected source allocations; legacy paid aggregates remain unchanged and unallocated. `totalMarks` reports the internal split basis (`priceSnapshot.baseline`).
- `getPendingTutorPayouts({ tutorId })` — Returns unpaid honorarium using per-session allocations for new selected batches and the historical cutoff only for pre-T03 aggregate payout rows; an unresolved allocationless legacy void keeps its cutoff until audited reconciliation resolves
- `previewTutorPayout(adminId, { tutorId, sourceKeys })` — Builds a versioned whole-IDR gross/tax/fee/net preview from selected fee and legacy sources plus the current tax/bank profile
- `prepareTutorPayout(adminId, { tutorId, sourceKeys, previewVersion, operationId })` — Revalidates and atomically saves the immutable profile/rate/bank/fee snapshot and active per-source allocations; a stable lock and idempotency key serialize competing admins
- `recordTutorPayoutTransfer(adminId, { payoutId, previewVersion, actualAmountIdr, paidAt, reference?, proofUrl? })` — Records only an externally performed transfer when its actual amount equals saved net; an identical normalized replay returns the saved result without a second audit or notification, while conflicting replays fail; audit and tutor notification/outbox commit in the same transaction
- `voidTutorPayout(adminId, { payoutId, reason })` and `resolveTutorPayoutReconciliation(adminId, { payoutId, reason })` — Keep voided history/evidence, release allocations and block repayment when an external transfer remains unreconciled
- `updateTutorTaxConfig(adminId, input)` and `setTutorTaxRateOverride(adminId, input)` — Versioned defaults and tutor-specific overrides require audit reasons; defaults are configurable and not legal validation
- `getTutorPayoutFinance(tutorId)` — Returns only that tutor's pending gross/tax/fee/net/session summary and own payout history with booking number/type/date for each covered allocation, without identity or bank details

**Dependencies:** `AdminRepo`, `AuditPort`, `AdminWalletPort`, `BookingPayoutPort`, `EconomyService`

**Business Rules:**

- Dashboard period metrics are based on booking/user creation time; the live state portfolio is intentionally all-time so it reflects current admin workload
- The completion rate is `completed / (completed + terminal exception bookings)` for bookings created in the selected period. The pricing-snapshot breakdown counts parent booking records created in the selected period and includes every booking state. It classifies V3 by engine tag, legacy by the known untagged numeric shape, unknown/malformed non-null snapshots as other, and SQL `NULL` as missing; it does not represent sessions or financial value. Booking-derived Marks, IDR, and platform-share totals remain omitted until their population, participant, session, and date basis is defined; top-up cash totals come from successful payment and refund records instead of booking snapshots
- Cannot remove the last admin role from the system
- Role changes are audit-logged
- User lookup is case-insensitive and bounded; exact email/ID matches rank first, and wildcard characters are treated literally
- Ledger filters must target exactly one wallet (`walletId` or `userId`, not both)
- Economy writes require the current `version`; stale writes fail with `ECONOMY_CONFIG_CONFLICT`
- Economy base and increment values are validated in Rp5,000 increments; increments are non-negative
- Existing booking price snapshots are immutable when the active schedule changes
- Rate changes affect only future booking/repricing snapshots; they do not create tutor notifications
- Re-saving the same four schedule values is a no-op and does not increment the economy version or write an audit row

---

## Admin-Mark-Package Module

**Purpose:** Admin management of the purchasable Marks catalog while keeping
payment package codes stable.

**Files:**

- `admin-mark-package.types.ts` — Zod schemas for create, update, and activation inputs
- `admin-mark-package.errors.ts` — `MarkPackageNotFoundError`, `MarkPackageCodeConflictError`
- `admin-mark-package.repo.ts` — full-catalog read, insert, detail update, and active-state update queries
- `admin-mark-package.service.ts` — transactional catalog mutations and audit records
- `admin-mark-package.handler.ts` — admin session adaptation and domain-error mapping
- `admin-mark-package.router.ts` — Admin-only catalog routes

**Service Methods:**

- `list()` — Returns all packages, including inactive rows, ordered by Marks and code
- `create(adminId, input)` — Inserts a package with an application-generated UUID id; duplicate codes become `MARK_PACKAGE_CODE_CONFLICT`
- `update(adminId, input)` — Updates name, Marks, and IDR price while keeping `code` immutable
- `setActive(adminId, input)` — Soft-enables or soft-disables a package; repeated state is a no-op

**Dependencies:** `DbType`, `AuditPort`

**Business Rules:**

- Package `code` is the stable business key passed to `payment.createPurchase`; existing payment records also keep the package id and amount/Marks snapshots
- Packages are never hard-deleted; inactive rows remain available for audit and historical references and are hidden only from `wallet.listPackages`
- Every create/update/activation transition is written to the audit log inside the same database transaction
- Default catalog values are installed by the versioned, idempotent data migration `0041_seed_mark_packages.sql`, not by the server boot path or every deployment seed
- The migration updates the default name/Marks/price when the code already exists but preserves an operator's explicit `is_active` choice

---

## Admin-Booking Module

**Purpose:** Admin operations console for bookings — filtered override queue with urgency/SLA projection, a dedicated admin-only booking detail/history page, hydrated participant wallet/ledger inspection, before/after override preview, state history, and admin refunds. Each booking has an immutable global human-readable `bookingNumber`; the queue displays it as `#N` and supports exact `N`/`#N` lookup while keeping the UUID as the internal route/relationship key. Queue rows navigate to `/admin-operations/bookings/:bookingId`; the page resolves its own queue item with the exact `bookingId` filter instead of relying on modal state. The override form reads the booking roster through protected `booking.get` and uses a read-only student/tutor impact roster. Its responsive drawer opens from the bottom on mobile and the right on desktop; its body scrolls independently from the action footer.

**Files:**

- `admin-booking.types.ts` — Zod schemas for override/list (including booking-number search)/state-history/admin-refund inputs
- `admin-booking.errors.ts` — `BookingNotFoundError`
- `admin-booking.repo.ts` — booking lookup, override state application, state history
- `admin-booking.service.ts` — `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`, `setMeetingLink`, `cancelSeriesSession`; exports `OVERRIDE_CATEGORIES` and `MARKS_ACTIONS`
- `admin-booking.handler.ts` — `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`, `setMeetingLink`, `cancelSeriesSession`
- `admin-booking.router.ts` — Admin-only routes

**Service Methods:**

- `listBookings(opts)` — Paginated booking list sorted by urgency, filterable by exact human-readable booking number, category/urgency/escalated; an exact `bookingId` lookup returns zero or one item for the admin detail route. Each item includes the immutable `bookingNumber` reference and projects `reportedAt`, the OQ-04 business-hours `slaDeadline`, and `escalated` from `overrideMeta.overriddenAt`. `escalated=true` walks bounded keyset windows (at most `MAX_ESCALATED_WINDOWS = 5` fetches of `MAX_PAGE_LIMIT` rows) until the page fills with escalated rows — it never returns an empty page with a non-null `nextCursor`, so the admin queue cannot infinite-loop on a sparse escalated set
- `applyOverride(adminId, input)` — Force state transition by `category` (tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel) and automatically resolve both sides of the financial outcome. `student_no_show` forfeits non-tutor holds and sets `tutorPayoutEligible: true`; all other categories release non-tutor holds and set it to `false`. Notification recipients are deduplicated from participant user ids plus the booking's assigned `tutorId`, so the tutor is notified even when no tutor participant row exists. Explicit `marksAction`/`affectedParticipants` remain a legacy compatibility path. Records audit log + state history.
- `previewOverride(input)` — Returns the projected booking state, resolved student wallet impact, and `tutorPayoutEligible` without persisting anything. **F24:** every explicitly supplied `affectedParticipants` id must be a participant of the booking — unknown ids throw `OVERRIDE_PARTICIPANT_NOT_IN_BOOKING` instead of being silently filtered.
- `getBookingStateHistory(bookingId)` — Returns full state transition history for a booking
- `adminRefund(adminId, { paymentId, reason })` — Creates a compensating ledger entry for a payment error. **In-app Marks credit only (N1, PRD §677):** no provider call, `refundRecord.amountIdr = 0`, no `providerEventId` — purchased Marks are never convertible back to rupiah. **Per-payment FIFO attribution (F11):** spend is attributed to the user's credit-state payments oldest-first, so a fully-spent payment rejects (`REFUND_SPEND_EXHAUSTED`) while an unspent one refunds its remaining Marks (capped at current available balance) — refunding one payment can never credit Marks that belonged to another payment.
- `setMeetingLink(adminId, { bookingId, url })` — Records or replaces a manual meeting URL on an online `SCHEDULED`/`CONFIRMED` booking (U1/FR-21); rejects offline bookings, notifies confirmed participants, and records an `admin_set_meeting_link` audit record. **F10:** the manual-link row is written inside the booking transaction (`setManualLink(bookingId, url, tx)`) so a tx rollback leaves no orphan meetingEvent row
- `cancelSeriesSession(adminId, { sessionId, marksAction, amount? })` — Cancels one `scheduled` series session; it shares the booking reschedule advisory lock, then locks the booking, child session, and participants in user-id order before settling holds. It recomputes the parent hold from remaining confirmed/reconfirmed participant holds (proposer for solo series; every confirmed seat for group series), excluding pending invitees. The scheduled-to-cancelled update is conditional; if completion commits first, cancellation rejects without changing wallet/holds. Records audit + participant notifications (U6/TC-31)

**Dependencies:** `AdminBookingRepo`, `AuditPort`, wallet port

**Business Rules:**

- Admin overrides bypass the state machine — any state can be set
- All overrides require a reason and are audit-logged
- `previewOverride` never persists
- Override categories map to target states (`tutor_no_show`/`student_no_show` → `no_show`; the rest → `cancelled`)

---

## Admin-Tutor Module

**Purpose:** Admin management of tutor invites and profile review.

**Files:**

- `admin-tutor.types.ts` — Zod schemas for invite creation, profile review, and structured achievement editing
- `admin-tutor.errors.ts` — `InviteNotFoundError`, `TutorProfileNotFoundError`, `TutorProfileOptimisticLockError`, `InvalidInviteActionError`, `DuplicateInviteError`
- `admin-tutor.repo.ts` — Invite CRUD, tutor profile listing/review, and version-checked achievement updates
- `admin-tutor.service.ts` — `createInvite`, `resendInvite`, `revokeInvite`, `listInvites`, `listTutorProfiles`, `reviewTutorProfile`, `updateTutorAchievements`
- `admin-tutor.handler.ts` — Maps handler input to service calls
- `admin-tutor.router.ts` — Admin-only routes

**Service Methods:**

- `createInvite(adminId, email)` — Creates tutor invite with unique token
- `resendInvite(inviteId)` — Regenerates token and sends email
- `revokeInvite(inviteId, adminId, reason?)` — Marks invite as revoked
- `listInvites(opts)` — Paginated invite list
- `listTutorProfiles(opts)` — Paginated tutor profiles with status filter
- `reviewTutorProfile(profileId, status, adminNote?, profileImageUrl?)` — Approve/reject tutor profile and optionally install the final background-standardized asset into the single canonical tutor profile image. Tutor-submitted published changes remain in `pendingProfileChanges` until approved; `profileImageUrl` accepts bounded HTTP(S) URLs or a generated local `/uploads/...` storage path. The profile status/version and image update are handled in one transaction, and a lost moderation race throws `TutorProfileOptimisticLockError` before image, subject, notification, or audit writes. **F25 state machine (`validateReviewAction`):** each action is only allowed from specific onboarding statuses — `request_changes`/`approve_unpublished`/`publish` from `pending_review`/`changes_requested` (publish also from `approved_unpublished`); `request_changes` and `approve_unpublished` also support `suspended` for explicit admin restoration; `unpublish`/`suspend`/`approve_edits`/`request_edit_changes` only from `published`.
- `updateTutorAchievements(adminId, input)` — Replaces structured education and achievements with optimistic locking, mirrors matching pending edit fields, and records the before/after values in the audit log.
- `listTutorProfileHistory(profileId)` — Returns newest profile audit entries. Changed tutor saves contain complete profile `beforeState`/`afterState` snapshots plus `details.changedFields`; pending-proposal revisions use the prior proposal as `beforeState`, and `approve_edits` snapshots the complete post-promotion profile.

**Dependencies:** `AdminTutorRepo`, `EmailPort`

**Business Rules:**

- Tutor invitation email copy has one primary action: accept the invitation and set up the tutor profile
- The email states the exact account email required for claiming, shows expiry in UTC, and includes a plain fallback URL
- Invitee-controlled display names, email addresses, and URLs are escaped before rendering into HTML
- The Manage Tutors invitation table maps `invited` to a warning badge, `accepted` to success, and `expired`/`revoked` to danger; unknown status values use the secondary fallback
- Admin review labels pending comparisons **Fields awaiting approval** and renders exact changed-field before/after values from complete snapshots for direct-live edits, pending proposals, approvals, and photo changes.
- Approving published profile edits validates and applies pending `subjectIds` to the normalized tutor-subject join table in the same transaction as the profile update
- The admin tutor review card maps pending `subjectIds` to active category/specialization labels and wraps long pending values; this is presentation-only and does not change the admin API payload
- The focused admin tutor review card derives normalized added/changed/removed/filled/empty statuses, shows summary counts with composable search/status filters, expands each pending field into current/proposed panes, and marks each profile section as changed or empty when applicable; profile photos remain in the dedicated side-by-side comparison
- Structured achievement corrections are limited to 2 education entries and 5 competition entries; a stale `version` returns `OPTIMISTIC_LOCK` and no audit record is written.

---

## Audit Module

**Purpose:** Append-only audit log for tracking state changes and admin actions.

**Files:**

- `audit.repo.ts` — `insert`, `listByTarget`, `listByActor`
- `audit.service.ts` — `record(entry)`, `listByTarget(targetId, targetType)`, `listByActor(actorId)`

**Service Methods:**

- `record(entry)` — Inserts audit log entry with actor, action, target, before/after state
- `listByTarget(targetId, targetType)` — Lists audit entries for a specific entity
- `listByActor(actorId)` — Lists audit entries by actor

**Dependencies:** `AuditRepo`

**Business Rules:**

- Audit logs are append-only — never updated or deleted
- Every admin action and state transition should be logged

---

## Auth Module

**Purpose:** User authentication via Better Auth with session management and wallet initialization.

**Files:**

- `auth.types.ts` — `updateProfileInput`, `searchStudentsInput`
- `auth.errors.ts` — `ProfileNotFoundError`
- `auth.repo.ts` — `findUserWithProfile`, `updateProfile`, `searchStudents`
- `auth.service.ts` — `me`, `getProfile`, `updateProfile`, `searchStudents` (lazy-creates wallet)
- `auth.handler.ts` — Maps session context to service calls
- `auth.router.ts` — Protected routes for `me`, `getProfile`, `updateProfile`; `searchStudents` is **student-only** (`studentProcedure`, F16)

**Service Methods:**

- `me(userId)` — Returns user + profile + tutorProfile + wallet (creates wallet if missing); used by role-aware aggregate surfaces
- `getProfile(userId)` — Returns only the authenticated student's profile and raises `ProfileNotFoundError` when the row does not exist; the student `/profile` page treats that state as an empty form
- `updateProfile(userId, input)` — Creates or updates student profile fields (phone, school, grade, parent contacts, and `allowContactRequests`)
- Student account `name` and optional `image` are edited from the same UI through Better Auth `updateUser`; email is displayed read-only and is not part of `auth.updateProfile`. The compact identity header makes the avatar a keyboard-accessible photo picker trigger and marks it with a pencil badge. The picker validates JPG/PNG/WebP files in the browser, provides circular drag/zoom cropping, uploads a 512px square JPEG through the protected Upload Module, and saves the returned public URL with the account identity update.
- `searchStudents(requesterId, query, limit)` — ILIKE search of `student`-role users by name/email, excluding the requester, up to 10 safe identity results (`id`, `name`, `image`); email is a repository-only lookup key. Exposed via `studentProcedure` so tutors/admins get FORBIDDEN (F16 — the lookup exists for the group-booking invite UI)

**Dependencies:** `AuthRepo`, `WalletPort` (for lazy wallet creation)

**Business Rules:**

- Wallet is lazily created on first `me` call
- Better Auth handles session management, password hashing, and session cookies
- **Pre-account signup OTP (REQ-AUTH-01):** public `POST /api/auth/sign-up/email-otp` stores a five-minute HMAC proof in Better Auth's existing `verification` table, scoped to normalized email and a signup-attempt UUID. A PostgreSQL advisory lock serializes the proof/cooldown transaction per email, enforces the 60-second resend cooldown across attempt IDs, and replaces the old proof on resend; the mail provider is called only after that transaction commits. If delivery fails, cleanup deletes only the proof row created by that send request, leaving a newer resend untouched. Three bad codes exhaust that proof. A cooldown echoes the caller's attempt ID only when it matches the stored proof. Custom signup, OTP-send, and outcome POST routes require a trusted `Origin` or `Referer`. Auth routing and the 10/minute/IP auth limiter share path canonicalization, including repeated encoding, separator normalization, case, and trailing slashes. The browser stores its attempt ID per normalized email in session storage, while an email edit clears the visible code/proof state. Auth logs omit OTP values, attempt IDs, passwords, and reset URLs/tokens. Public `POST /api/auth/sign-up/email` rejects requests without the matching proof. Account/session creation, proof consumption, and a 24-hour attempt outcome record share one transaction, so a failed create keeps the proof and concurrent consumers create at most one account. The winning request attempts welcome email once after commit; a provider failure is logged without rolling back the account. The outcome read reveals only whether that exact email/attempt completed, allowing the browser to recover from a lost response without replaying signup.
- The HTTP signup route is the public boundary. Only the server-owned `completePreAccountSignup` transaction supplies Better Auth's verified-email scope after OTP validation. Direct `auth.api.signUpEmail` calls are internal-only for trusted seed, test, and provisioning code; they must not be exposed as an unauthenticated HTTP bypass or generalized with a public bypass flag.
- Google OAuth starts on the API and returns through `/api/auth/callback/google`; the frontend callback route is the post-login destination. The web client passes separate Better Auth `callbackURL` and `newUserCallbackURL` values, then stores the resolved outcome until `PostHogIdentity` has identified the session; this yields `account_signed_in` or `account_created` with the correct `authentication_method` for Google or email without anonymous attribution. The configured provider sends `prompt=consent` so the Google permission screen is available for verification runs, including when the account has a previous grant. The login flow requests identity scopes only; the broader Calendar scope used by the server-side Meet integration is a separate operator OAuth flow. Production session cookies remain `SameSite=Strict`, while Better Auth's short-lived signed OAuth state cookie uses `SameSite=Lax` so the provider's top-level callback GET can return it. The state cookie remains `Secure`/`HttpOnly`, and Better Auth verifies it against the database-backed verification record before creating a session.
- PostHog browser analytics is initialized once at the web root when its two public Vite values are configured. `PostHogIdentity` resets on logout or account switch, identifies with the stable Better Auth user ID, and captures auth outcomes only after identification. Browser exception capture and explicit `cogito-web` Logs records remain client-side; no server module, event key, or database rule depends on PostHog availability. Playwright starts Vite in `test` mode, which uses the disabled client when analytics values are absent.
- Production/staging startup and signup bootstrap matching `ADMIN_EMAILS` to the `admin` role is case-insensitive and additive: it never demotes existing admins; other admin addresses remain supported by the existing role-management procedures.
- The web email sign-in/sign-up handoff awaits the Better Auth result, performs a fresh session read, and chooses a validated return path or a role/onboarding-aware default: a tutor without a profile or with `draft`/`changes_requested` status goes to `/profile`, while tutors in review/approved/published/suspended states and admins go to `/dashboard`; students also default to `/dashboard`. The tutor status read uses the existing protected `tutor.getMyProfile` procedure. The client suppresses the overlapping session signal refresh so the login form does not flash back into the loader. When the fresh session has `emailVerified !== true`, email/password sign-in sends a verification OTP and routes to `/verify-email`; the Google callback applies the same rule, and the selected destination is carried through verification. Legacy accounts are not automatically marked verified. The authenticated shell uses the same fresh session source for its parent route guard. Tutor `/onboarding` links remain a compatibility redirect to `/profile`; this is frontend routing only and adds no auth/API contract.
- The `/login` email forms run field-level validation on change/blur after a field is touched, show Selia inline errors and danger outlines for invalid fields, and mirror the sign-up password requirements enforced by the server. These checks are client-only and do not add an auth endpoint or persistence rule.
- The server reads sign-up bodies through the request-size guard and safely parses the JSON before applying password policy. Malformed JSON returns HTTP 400 (`Invalid JSON request body`) rather than escaping as an internal error.
- Email verification (G2, REVIEW-FIXES-4 P4.4): the `emailOTP` plugin remains responsible for existing-account verification, sign-in OTPs, and password/change-email OTPs through `setVerificationEmailSender`; `sendVerificationOnSignUp: false` prevents duplicate signup mail and `disableSignUp: true` prevents plugin sign-in routes from provisioning unknown accounts. Public email/password signup proves email ownership before account creation through the REQ-AUTH-01 flow above. Unverified users, including legacy accounts, receive a new OTP after email/password or Google sign-in and are routed to `/verify-email`; `POST /api/auth/email-otp/verify-email` marks the user verified; the web `/verify-email` route collects the code. Existing password reset, tutor invitation claiming, and trusted admin/seed provisioning continue through their existing paths.

**Privacy boundary:** `auth.searchStudents` accepts an email query for an
existing group-invite workflow but returns only display identity. Account email
is not a public profile field and is released only by the Contact Module after
recipient consent.

---

## Booking Module

**Purpose:** Core booking lifecycle — solo, group, and series bookings with state machine transitions, reschedule approval, session notes, wallet holds, payouts, and meeting integration.

Invitation-phase `declineInvite` and proposer-side `withdrawInvite` lock the
parent booking row before mutating the participant and resolving the final
pending response. Concurrent final responses therefore serialize.

Reschedule proposals must include a non-blank reason, change the active booking or target-session start minute, and cannot repeat the pending proposal for the same target. `proposeReschedule` serializes replacements with a booking-scoped transaction advisory lock; `reschedule_booking_pending_uniq` independently guarantees at most one pending proposal per booking. The booking-detail proposal editor is presented in a height-constrained bottom Selia drawer on mobile and a right-side drawer on desktop. Tutors switch between published availability and a custom time through the shared two-option Selia Tabs component; availability windows are grouped by Jakarta calendar date and rendered as compact time chips, with four dates initially visible and an inline See more/Show less disclosure rather than nested scrolling. For series bookings (solo and group) the header-level reschedule action is hidden and each non-terminal session row exposes its own per-session `Propose new time` drawer that sends `sessionId`; solo/group single bookings keep the booking-level action. Tutor honorarium display sums across series sessions (`getTotalHonorariumIdr`, per-session snapshot fallback plus derived session-count fallback mirroring `aggregateTutorPayouts`), showing `Total honorarium (N sessions)` plus per-session breakdown; solo/group single bookings show the single-session honorarium.

The create-booking module keeps all submit state in the parent form while presenting it through two responsive surfaces: a desktop right-rail summary and a mobile bottom summary drawer. Its single scheduling card starts with shared Selia Tabs for Online/Offline, paginates in seven consecutive Jakarta-local calendar dates on desktop and three on mobile with no-slot dates visible and disabled, then derives every valid 15-minute start within the selected availability window while preserving the fixed 90-minute duration. Starts are grouped into Morning, Afternoon, and Evening; selection is communicated by the button variant and `aria-pressed`, without a duplicate check icon. Each selection uses a composite availability-slot-and-start key, enabling multiple non-overlapping sessions on the same day while disabling choices that overlap an already selected 90-minute session. The separate Selected sessions tray summarizes and removes up to four choices without a second time-adjustment control. Card explanations use `CardInfoPreview` plus `InfoPreview`; Specialization and the optional focus prompt are grouped in one semantic Session details fieldset. The drawer button uses the form `id`, so there is no duplicate mutation path.
The Participants fieldset owns the derived Solo/Group badge; summaries represent participant scope separately from Single session/Series cadence and list every series occurrence. They show the student's price, required reserve, available balance, and post-reserve balance with `CogitoMarks`. One-session groups reserve the target headcount total, while group series reserve only the proposer's package. Booking dates use the shared compact `formatBookingDateOnly` formatter.

**Files:**

- `booking-state.types.ts` — Booking state enum and terminal states
- `booking-transitions.ts` — `canTransition()` state machine logic
- `booking.types.ts` — Zod schemas for all booking operations
- `booking.errors.ts` — error classes for the booking domain
- `booking-event-title.ts` — shared Calendar/Meet and booking-surface event-title formatter
- `booking.repo.ts` — data access for bookings, participants, sessions, notes, reschedules, payouts
- `booking.service.ts` — service methods below; consumer ports for wallet, pricing, audit, notification, meeting
- `booking.handler.ts` — `createBookingHandler` (student/proposer) and `createTutorActionsHandler` (tutor)
- `booking.router.ts` — Student-owned booking mutations use `studentProcedure` (the four **create** procedures use `verifiedStudentProcedure`, which additionally requires `emailVerified: true` — PRD paid actions); shared booking/detail/session reads stay protected and outside the 30/minute booking mutation limiter; `booking.proposeReschedule` is the student-proposer route, while `tutorActions.*` (including `proposeReschedule`) uses `tutorProcedure`

**Service Methods:**

- `getById(bookingId, userId, userRole?)` — Returns booking with access check; admins may inspect any booking. The read model derives `meetingStatus`/`meetingUrl` and includes participant profile images plus state-history fields used by the booking-detail timeline.
- `listAccessible(userId, userRole, opts)` — Shared role-aware list: proposer/participant visibility for students, assigned bookings for tutors, and all bookings for admins; cursor-paginated. Returns exact role-scoped `action`, `upcoming`, `recurring`, `history`, `completed`, `problem`, and `all` counts alongside the page.
- `listMine(userId, opts)` — Paginated list of user's bookings (proposer)
- `listForTutor(tutorId, opts)` — Paginated list of bookings assigned to a tutor
- `createSolo(proposerId, input)` — Creates solo booking with wallet hold, overlap check, and notification
- `createGroup(proposerId, input)` — Creates group booking with invitees and temporarily holds the target headcount total from the proposer; rejects a target above the tutor's online/offline maximum before any hold or write, and releases excess hold as invitees confirm
- `createSeries(proposerId, input)` — Creates a solo series booking with sessions (2-4 sessions, each checked for overlaps)
- `createGroupSeries(proposerId, input)` — Creates a group series (targetGroupSize 2-6, inviteeUserIds) with upfront per-participant holds for all sessions; rejects targets above the tutor's modality-specific capacity (FR-20, landed #46). Active V3 requires a supported topic, prices at target headcount and pins the revision on the booking and session snapshots. A viable partial group is repriced from that pinned revision at confirmed headcount; each participant's remaining hold is per-session Marks times scheduled sessions, and booking/scheduled-session snapshots update before reconfirmation. A null activation pointer preserves legacy behavior.
- `confirmInvite(userId, bookingId)` — Invitee confirms participation; holds marks
- `declineInvite(userId, bookingId, reason?)` — Locks the parent booking, then declines. If this consumes the last pending invitation, resolve from confirmed participants: `<2` expires and releases holds; `>=2` but below target reprices a one-off group and opens reconfirmation; full target advances to tutor review. Active V3 group-series uses its pinned revision at confirmed headcount and adjusts holds/snapshots before reconfirmation.
- `withdrawInvite(proposerId, bookingId, inviteeUserId, reason?)` — Locks the parent booking, then withdraws one pending group invite; marks the invitee `withdrawn_pre_h2`, leaves confirmed headcount unchanged, notifies the invitee, and runs the same last-pending-invite resolution used by `declineInvite`. Active V3 group-series repricing uses the pinned revision at confirmed headcount. Expired group-series sessions are cancelled. The user-supplied `reason` is HTML-escaped (`escapeHtml`) before interpolation into the notification/email body (F5 convention — user-supplied text must not inject markup)
- `reconfirm(userId, bookingId, accept)` — Participant accepts/rejects the repriced offer after repricing. **F3 (headcount-change reprice):** when an accept lands and the confirmed headcount no longer matches the headcount the current snapshot was priced for (a participant declined or withdrew mid-cycle, e.g. withdrawing from `awaiting_reconfirmation` decrements the headcount without repricing), the booking does **not** finalize — all reconfirmed participants are reset to plain `confirmed` (`resetReconfirmedParticipants`), the group is repriced for the current headcount, every survivor gets a fresh 12h window, and a `reissue_reconfirm` notification is sent. For active V3 group-series, the snapshot headcount comes from its pinned price snapshot; recalculation also updates remaining scheduled-session holds and snapshots. The booking only moves to `AWAITING_TUTOR_REVIEW` when all confirmed participants reconfirm against the current snapshot. **N1:** when a flat or rounded price map produces the same per-student rate at two headcounts, `repriceGroupForHeadcount` still synchronizes `holdAmount` to the sum of participant-held amounts, preventing the reconfirmation mismatch from re-firing forever.
- `withdraw(userId, bookingId, reason?)` — Participant withdrawal closes at `scheduledStartAt`; before then, pre-H2 releases hold and post-H2 forfeits it, with group survival/repricing rules unchanged. At/after start it throws `BOOKING_CANCELLATION_DEADLINE_PASSED`; group-series (`type === "series" && targetGroupSize > 1`) remains rejected with `BOOKING_SERIES_NO_OPT_OUT` (U4 no-opt-out rule).
- `cancel(userId, bookingId, reason)` — Requires a non-blank student reason, then cancels a booking only before `scheduledStartAt`; releases holds before H-2, while a pre-start late cancel becomes `late_cancelled` and forfeits holds. At/after start it throws `BOOKING_CANCELLATION_DEADLINE_PASSED`, preserving the live booking for tutor completion and routing delivery disputes through support/admin review.
- `tutorAccept(bookingId, tutorId)` — Tutor accepts booking; attempts meeting creation for online bookings and schedules on success, while a provider failure leaves the booking `CONFIRMED` for scheduler retry; sets room approval for offline. **F6:** whenever meeting creation fails (provider throw or `status === "failed"`), `finalizeMeetingSchedule` bumps `deadlineAt` to `scheduledEndAt + 24h` so the 5-minute retry window is respected — the old tutor-review `now+12h` deadline can never expire the booking (release holds) or no-show the session while a meeting retry is pending. The proposer notification distinguishes `scheduled` from `confirmed`/meeting-setup attention, so a provider failure is not presented as a scheduled session. The booking-detail UI confirms the scheduled date/time, modality, and attendance before invoking this method; cancel/complete actions use the same in-app confirmation pattern.
- `tutorDecline(bookingId, tutorId, reason)` — Requires a non-blank tutor reason, declines the request, and releases all holds
- `tutorSetMeetingLink(bookingId, tutorId, url)` — Assigned tutor adds or replaces a manual URL for an online `CONFIRMED`/`SCHEDULED` booking when automatic meeting setup is unavailable; updates the active meeting row, notifies confirmed participants, and records `tutor_set_meeting_link`
- `completeSession(bookingId, tutorId, sessionId?, feedback, requestKey?)` — Marks a session complete; deducts held marks (sessionId for series children). Requires nonempty `feedback { discussion[], strengths[], improvements[] }` with 600 normalized Unicode code points per field including separators; content is HTML-escaped. It saves version 1 in `session_completion_feedback`, appends immutable actor/status/text history, and appends one `tutor_session_fee` event in the same transaction. An optional UUID request key replays an identical submission. A prior series no-show ledger entry suppresses a second deduction for that participant/session without reducing future holds; only a submitted delivery report earns the fee. Concurrent tutor/admin initial submission shares the booking and payout locks. A series parent completes and releases residual confirmed holds once every child is completed or cancelled. Fee identity is the booking for solo/group and the child session for series; the event pins the assigned tutor, delivery times, price snapshot, and gross IDR honorarium. Missing/malformed V3 honorarium fails before wallet writes; explicit zero is valid. Throws `BOOKING_COMPLETION_FEEDBACK_REQUIRED` when missing/empty
- `submitAdminCompletionReport({ bookingId, sessionId?, adminId, feedback, deliveryConfirmed, reason, expectedVersion?, requestKey })` — Admin-only report submission/correction for the assigned tutor. Requires delivery confirmation, a non-blank audit reason (max 600 Unicode code points), shared normalized report validation, and a UUID request key. Initial submission on an ended scheduled session uses normal completion settlement once; an already delivered session with no report is recorded without financial backfill. Corrections require the current version and append a new immutable snapshot with actual admin actor/time/status; only report text/version changes, never wallet, fee, referral, or reward facts. Identical key/payload returns its saved event; changed payload, stale version, or key reuse conflicts. Every admin submit/correction writes an in-app tutor notification in the transaction.
- `listCompletionFeedback(bookingId, userId, userRole?)` — Assigned tutor/admin can read reports for their authorized booking. A student sees each report only when the corresponding booking/session is delivered and that participant has the exact chargeable `deduct` wallet-ledger event; chargeable no-shows qualify, while pending, withdrawn, unpaid, and unfunded seats do not. A completed series child stays readable after parent cancellation.
- `listCompletionFeedbackHistory(bookingId, userId, userRole?)` — Admin-only history projection; excludes private idempotency request payloads and includes report snapshots, version/status, actor, delivery confirmation, audit reason, and creation time. Existing report IDs/content/creation times are preserved; unknown legacy actors remain null/legacy.
- `cancelSession(userId, sessionId)` — Student cancels an individual series session only before that session starts; pre-H2 releases its hold, a pre-start post-H2 cancellation forfeits it, and at/after start the call throws `BOOKING_CANCELLATION_DEADLINE_PASSED`. The booking, child, and proposer hold are refreshed under locks; the conditional child transition prevents a completion that wins the race from being overwritten. Cancellation uses the same booking reschedule advisory lock as proposal changes.
- `proposeReschedule(actorId, actorRole, bookingId, sessionId, start, reason)` — Shared service used by the student-proposer and tutor RPC routes; requires a non-blank reason and proposes a fixed 90-minute replacement for one session
- `acceptReschedule(actorId, bookingId, proposalId?)` / `rejectReschedule(...)` — Records a required tutor/student vote against the active, unexpired proposal under a booking advisory lock; `proposalId` prevents stale UI actions from deciding a superseded proposal. Final acceptance additionally locks the tutor and rechecks booking overlap, target-series ownership/state, and sibling-session overlap before applying the schedule. Only unanimous acceptance applies the schedule, then the booking returns to its pre-proposal state; any rejection keeps the old schedule and also returns to that state. For booking-level offline proposals, the confirmed room assignment is synchronized with the new time on acceptance and restored to the original time on rejection/expiry. A missing or conflicting room returns the booking to `awaiting_admin_room_approval`, and the rollback path uses `roomPort.resyncRoomBookingToSchedule` so the room never stays blocked for the wrong window.
- `addSessionNote(userId, bookingId, content)` — Adds a server-sanitized HTML note to a completed session for protected API clients; the web UI no longer exposes the rich-text editor or mutation control
- `getSessionNotes(userId, bookingId)` — Lists every party's legacy notes for a completed session for protected API compatibility; the web client no longer queries or renders the Session notes card
- `markTutorAttendance(bookingId, tutorId, attendance)` — Marks tutor present/late; allowed only within `[scheduledStartAt ± 15 min]` (LATENESS_TOLERANCE_MS). Marking suppresses the lateness flag — unmarked sessions are surfaced to the admin queue (`tutor_lateness_pending`), never auto-cancelled. **F8:** the attendance row is inserted with `role='tutor'` and `confirmationState=confirmed`; `findConfirmedParticipants` excludes `role='tutor'` so the tutor row never inflates group repricing headcounts, hold recomputation, or no-show forfeit math
- `markParticipantNoShow(bookingId, tutorId, participantUserId, sessionId?)` — Marks a participant as no-show 15 minutes after the session starts (U5/TC-30); a series `sessionId` is first required to belong to `bookingId`, preventing cross-booking wallet/attendance mutation. It forfeits the target's (per-session) hold and notifies them. Repeated series marks are rejected using the existing session-specific ledger event. Solo transitions to `no_show`; group stays live with only the target's hold forfeited and `holdAmount` recomputed (C1); series sessions keep their state so other participants are unaffected. The no-show event alone does not earn a tutor fee
- `listSessions(bookingId, userId)` — Lists sessions for a series booking
- `getTutorPayouts({ tutorId, dateFrom?, dateTo? })` — Aggregates completed sessions → `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }`; new IDR bookings sum tutor honorarium snapshots and legacy bookings use a compatibility fallback. Payout summaries consume `tutor_session_fee` events for recorded deliveries and use legacy payout-eligible booking/session snapshots only for sources without a fee event, including explicit no-show eligibility. Stable source keys suppress duplicate counting and expose a completed series child before its parent completes. Pending summaries filter new events by `earnedAt` after the latest payout cutoff while retaining the legacy completion-time fallback. This does not allocate individual fee events to paid batches, and there is no historical fee-event backfill. `totalMarks` reports the **split basis** (`priceSnapshot.baseline`) so the ledger columns reconcile: `totalMarks = cogitoTake + tutorPayout`. Students may be charged `actualMarksPooled ≥ baseline` due to per-student rounding (surplus ≤ headcount marks per booking); the surplus is currently unallocated — flagged for product decision (documentation only, per lead decision 2026-08-25). The pending-payout path uses explicit completion timestamps (with a migration fallback for legacy completed rows), and completion is serialized with payout cutoff creation.
- `expireBookings()` — Batch expiry job; routes to correct terminal state based on current state
- `releaseExpiredHolds()` — Transition-or-skip (M4): transitions past-deadline bookings to their terminal target (shared `EXPIRY_TARGET` with `expireBookings`) FIRST, then releases holds (or forfeits for NO_SHOW); version conflicts / terminal / RESCHEDULE_PROPOSED bookings are skipped without touching the wallet
- `checkTutorLateness()` — Flags scheduled bookings where the tutor never marked attendance past the 15-min lateness tolerance: keeps the booking SCHEDULED with holds intact, sets `overrideMeta.category = "tutor_lateness_pending"` (admin-queue surface), writes a `tutor_lateness_pending_review` audit record, and notifies proposer + tutor; returns `{ flagged, failed }` (no auto-cancel, no hold release). **F9:** applies to **offline and online** bookings alike — `findBookingsWithTutorLateness` has no modality filter, so an absent offline tutor is flagged too
- `retryFailedMeetings()` — Re-creates Google Meet for CONFIRMED online bookings with a failed meetingEvent (up to 3 attempts, driven by the `retry-failed-meetings` job); successful retry moves the booking to `SCHEDULED`, while exhausted attempts remain available for the assigned tutor or `adminBooking.setMeetingLink`

**Dependencies:** `BookingRepo`, `BookingWalletPort`, `BookingPricingPort`, `BookingAuditPort`, `BookingNotificationPort`, `BookingMeetingPort`

**Business Rules:**

- State machine enforces valid transitions via `canTransition()`
- All state transitions are recorded in `bookingStateHistory`
- Online meeting creation starts when the tutor accepts the booking after required participant confirmations. A successful provider response creates the meeting event and moves the booking to `SCHEDULED`; a failed response leaves it `CONFIRMED` until retry or authorized tutor/admin manual-link intervention.
- The booking detail read model reports a meeting as `ready` only when `meetingUrl` is non-null, so a URL-less provider row is never presented as an openable link.
- Group bookings require minimum 2 participants (MIN_GROUP_HEADCOUNT)
- Series bookings require 2-4 sessions (MIN_SERIES_SESSIONS to MAX_SERIES_SESSIONS)
- Deadline is set to `now + 12 hours` for new bookings (RESPONSE_WINDOW_MS)
- Late cancellation within H-2 threshold results in `late_cancelled` state
- Series cancel cascades to all `bookingSession` rows
- Wallet holds are released on cancel, decline, and expiry
- Report visibility is scoped to chargeable delivered seats per Q06; admin correction history is append-only and corrections never replay settlement.
- Overlap detection prevents double-booking tutor slots
- Availability is stored as a free-time window; students may choose any minute-level start that keeps the server-fixed 90-minute session inside it. Terminal bookings do not keep the window blocked.
- Rescheduling is per session, may iterate until accepted, expires after 24 hours, and requires the tutor plus every active student. The booking proposer may propose or counter in the eligible pre-terminal states, including `confirmed` and `scheduled`; student proposals remain subject to current/new H-2 checks. Proposal expiry reverts to the pre-proposal state without cancelling the booking, releasing its hold, or changing its original schedule. For offline booking-level proposals, room assignment timing is kept in sync on accept/reject/expiry, with a room-approval fallback on conflict. Only the tutor may propose outside the original availability window. Force-majeure exceptions are handled by support/admin operations with an auditable reason and an admin override decision rather than an automatic H-2 bypass.
- Optimistic locking via `version` field prevents concurrent state changes
- Dashboard facet counts are computed from the full role-visible booking relation, not the requested page. `completed` means `currentState = completed`; `problem` means `cancelled`, `late_cancelled`, `no_show`, or `expired`.
- Calendar/Meet event summaries and the authenticated booking list/detail title use the same `formatBookingEventTitle` formatter: `Cogito - {Competition} | {Tutor} x {Student}`, with `& Friends` for group/group-series bookings. This is presentation metadata only and does not add a database column or RPC response field.
- New IDR booking snapshots copy the active economy version, tutor base/increment, tutor honorarium, Cogito take, total IDR, total Marks, and rounded pooled Marks. Later economy updates do not mutate those snapshots.
- Only `student` accounts can create bookings or perform student participant actions; tutor/admin attempts fail with `FORBIDDEN` before handlers run. The protected booking list/detail/session reads are available to authenticated parties, while admins can inspect the full booking set; tutor fulfillment remains under `tutorActions.*`.
- Booking list/detail relations use a safe user projection (`id`, `name`, `image`, `role`). Meeting attendee email arrays remain server-only for calendar/notification work and are not returned through booking reads.
- Group deadline repricing (B3): `expireBookings` reprices partial groups (confirmed ≥ 2 but < target) to `AWAITING_RECONFIRMATION` with a fresh 12h deadline instead of expiring (#46)
- Group-series creation (B8) and per-session post-H2 forfeit (B9) landed in #46
- Follow-ups (reconfirmation-deadline reprice, per-participant no-show, admin per-session cancel, per-session reschedule) are **implemented** — U3/U5–U7 closed by REVIEW-FIXES-3 P3.8/P5 (see `docs/plans/active/PRD-GAPS-PHASE3.md`, all U-items closed); group-series full-series withdrawal block (U4) **implemented** in REVIEW-FIXES-2 PR F (`BOOKING_SERIES_NO_OPT_OUT`)

---

## Report Export Module

**Purpose:** Build private student report PDFs from the booking and academy
session report sources without adding report data to a public DTO.

**Files:**

- `report-export.access.ts` — student-self/admin-selected authorization policy;
  tutors and other roles are denied
- `report-export.window.ts` — WIB calendar-month start and inclusive generation
  cutoff calculation
- `report-export.service.ts` — repeatable-read report lookup, exact private
  booking/class entitlement, live student/tutor/class metadata and stable order
- `report-export.pdf.ts` — paginated PDF layout using a bundled DejaVu Sans font
  from `font.json`; no runtime font or logo fetch
- `index.ts` — `createReportExportModule({ db })`
- `apps/server/src/routes/report-export-routes.ts` — authenticated summary and
  PDF HTTP handlers, private cache headers and generic attachment name

**Service Methods:**

- `getSummary(studentId)` — returns eligible report count, the WIB period start,
  generation instant and timezone without student-identifying report details
- `generatePdf(studentId)` — returns a PDF or `null` when the student has no
  eligible reports

**Eligibility and ordering:** The read-only repeatable-read transaction captures
its generation cutoff after the student read establishes its snapshot. Completed
solo/group booking reports require the selected student's exact chargeable
feedback entitlement through the Q06 ledger helper; completed series children
remain eligible after parent cancellation. Cohort/masterclass reports require a
completed session and that student's funded allocation with a positive funded
and spent amount. Both use the scheduled start in WIB from the same calendar day
three months before generation through the inclusive cutoff. Rows sort by
scheduled start descending, then report ID ascending. Known escaped legacy
booking feedback is decoded from its history status once; legacy text is never
truncated. Every report has live student name, competition, mode, tutor, date,
time, type, topic, cohort/class and session metadata plus discussion, strengths
and improvement bullets. Long content flows to numbered continuation pages.

---

## Contact Module

**Purpose:** Provide a lightweight, consent-based way for students to exchange
contact details after a completed shared session without introducing a general
chat directory.

**Files:**

- `contact.types.ts` — booking/request/response Zod inputs; optional request note is capped at 200 characters
- `contact.errors.ts` — domain errors for booking eligibility, opt-out, duplicate, recipient, and response-state failures
- `contact.repo.ts` — completed-booking participant and contact-request persistence; email is an internal repository field
- `contact.service.ts` — eligibility, safe projections, consent transition, notification, and audit orchestration
- `contact.handler.ts` — maps session identity and domain errors
- `contact.router.ts` — student-only routes for list/request/respond
- `index.ts` — `createContactModule({ db, notification, audit })`

**Service Methods:**

- `listForBooking(userId, bookingId)` — lists other eligible student participants by name/photo and current request state
- `requestContact(userId, input)` — creates one pending request and an in-app notification without copying an email
- `respondToRequest(userId, input)` — recipient chooses `accept_share_email`, `accept_without_email`, or `decline`

**Business Rules:**

- Eligibility requires the same booking to be `completed`, a confirmed/reconfirmed student participant, and attendance not marked `absent`; tutors and non-participants are excluded.
- The recipient's `studentProfile.allowContactRequests` defaults to `true`; `false` blocks new requests server-side.
- The requester sees the recipient's account email only when the recipient explicitly selects `accept_share_email`. Pending, declined, and incoming projections return `email: null`; the recipient never receives a second copy of their own email through this API.
- Contact request notifications and audit records contain IDs, names, decisions, and notes only. They never include account email and never opt into notification email dispatch.
- One request per booking and direction is enforced by a unique database index; the UI offers no full-chat channel.

**Dependencies:** `ContactRepo`, `ContactNotificationPort`, `ContactAuditPort`

---

## Email Module

**Purpose:** Email delivery abstraction with Resend (production) and stub (development) providers.

**Files:**

- `email.service.ts` — `EmailPort` interface + `createEmailService()`
- `resend-email.provider.ts` — Production provider using Resend API with 30s timeout and circuit breaker
- `stub-email.provider.ts` — Development stub that logs but doesn't send

**Service Methods:**

- `send(message)` — Sends an email; `message` is `{ to, subject, html, category }` where `category` is `booking`/`payment`/`refund`/`schedule`/`override`/`auth`; returns `{ messageId }` or `{ skipped: true }`

**Business Rules:**

- Circuit breaker on Resend: 3 failures → open for 120s
- 30-second timeout per email send request
- Emails are dispatched via the **outbox**: `notification.write` only queues `notificationDispatch` rows (`status='queued'`) inside the DB transaction; the `send-notification-email` scheduler job (60s) calls `notification.dispatchQueuedEmails()` to send and mark rows `sent`/`failed`/`suppressed` (landed #46). `claimPendingDispatches` parenthesizes the reclaim disjunct (F7): the stale-`sending` reclaim (`created_at < now() - 10 min`) is `OR`-joined with an explicit grouping `(status IN ('queued','failed') AND attempts < 3) OR (status = 'sending' AND attempts < 3 AND ...)` so a `sending` row past the 3-attempt budget is never claimed (regression-tested)

---

## Invite Module

**Purpose:** Tutor invite flow — verify token, claim invite to create tutor profile.

**Files:**

- `invite.types.ts` — Zod schemas
- `invite.errors.ts` — `InviteNotFoundError`, `InviteEmailMismatchError`, `ProfileAlreadyExistsError`, `InvalidRoleForClaimError`
- `invite.repo.ts` — `findInviteByToken`, `findTutorProfileByUserId`, `getUserRoleById`, `updateInviteStatus`, `insertTutorProfile`, `updateUserRole`
- `invite.service.ts` — `verify(token)`, `claim(userId, userEmail, token)`
- `invite.handler.ts` — Maps to service calls
- `invite.router.ts` — `verify` is public, `claim` is protected

**Service Methods:**

- `verify(token)` — Returns invite details without claiming
- `claim(userId, userEmail, token)` — Validates the signed-in user's email matches the invited email; creates tutor profile in `onboarding` status

**Dependencies:** `InviteRepo`, `TutorPort` (for profile creation)

**Business Rules:**

- Tokens are single-use; claimed tokens are marked `used`
- Email must match the invited email exactly
- Claim is blocked for **admin-role accounts** — `validateClaim` fetches the user's role (`getUserRoleById`) and throws `InvalidRoleForClaimError` (409 CONFLICT) when `role === "admin"`, so an admin can never be silently demoted to tutor via invite claim. Only student/tutor accounts may claim (F2).

---

## Meeting Module

**Purpose:** Meeting link creation via Google Calendar API with circuit breaker and fallback.

**Files:**

- `meeting.types.ts` — `MeetingEvent`, attendee, and provider-calendar metadata interfaces
- `google-meeting.provider.ts` — Production provider with 30s timeout and circuit breaker (5 failures → open for 60s)
- `fallback.provider.ts` — Manual link fallback when Google Meet fails
- `index.ts` — Exports `createGoogleMeetingProvider` and `createGoogleMeetingProviderWithFallback`

**Service Methods:**

- `createEvent(bookingId, scheduledStartAt?, scheduledEndAt?, attendees?, conn?, details?)` — Creates a Google Calendar event with optional title/description/location metadata. `details.createConference` defaults to true for the unchanged online Meet flow; offline scheduling passes false, producing no conference data or Meet URL. Offline descriptions start with `Site: {room.location}` and `Room: {room.name}`. Repeated offline creation reuses the live provider row.
- `updateAcademyClassEvent(externalEventId, sessionId, startAt, endAt)` — Internal class-worker update of the saved Calendar event, with a stable session-ID fallback when no external ID was stored.
- `updateEvent(bookingId, changes) — Best-effort updates provider-side start/end, physical location, and/or description while preserving the rest of the event resource. Updates use `conferenceDataVersion=1`so the existing online Meet conference survives the full-resource update, with attendee emails controlled by`GOOGLE_CALENDAR_SEND_UPDATES` (`none`by default,`all` in production) (OQ-05, #46). Cogito always sends its own booking notifications; Calendar attendee emails stay suppressed outside production to avoid duplicate mail and DSN bounces to undeliverable seed addresses.
- `cancelEvent(bookingId)` — Idempotently cancels the Google event on terminal online or offline booking states (cancel/late-cancel/decline/expire; best-effort via circuit breaker) (#46)
- `probe()` — Boot-time connectivity probe (P4.2/X3): `calendarList.get` with a 10s timeout, logs loudly on failure (wired into the server bootstrap so a broken Google Meet swap is visible at boot, not only at the first booking; the server keeps manual fallback available)
- Falls back to manual link URL format when circuit breaker is open

**Business Rules:**

- Google Meet calls have 30-second timeout
- OAuth refresh-token mode uses `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET`, and `GOOGLE_MEET_REFRESH_TOKEN` to call Google Calendar API v3; `GOOGLE_CALENDAR_ID` defaults to `primary`. When the dedicated client variables are absent, the resolver falls back to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, but the Calendar refresh token is still required.
- Service-account mode uses `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_IMPERSONATED_USER`; the impersonated user is required for Workspace domain-wide delegation. `GOOGLE_MEET_ENABLED=true` requires either the complete OAuth set or the complete service-account set.
- OAuth setup and token rotation instructions live in [`docs/GOOGLE-MEET-SETUP.md`](GOOGLE-MEET-SETUP.md).
- Booking creation validates `subjectId` against the tutor's active specializations and stores an immutable category/specialization snapshot in `booking.session_topic`. Scheduling uses `Cogito - {Competition} | {Tutor} x {Student}` and appends `& Friends` for group/group-series events; MUN/WSC use abbreviations. Descriptions include Session Topic, all resolved students, Session Notes/reference links, and the booking deep link; offline descriptions prepend the assigned Site and Room. The metadata reaches service-account and OAuth paths; `learning_goal` remains the Session Notes compatibility carrier.
- Circuit breaker: 5 failures → open for 60 seconds
- On failure, creates a `meetingEvent` record with `status: "failed"` and `errorReason`; the booking scheduler retries failed Google attempts every 5 minutes up to the configured retry budget
- Manual-link entry updates the newest meeting-attempt row, matching the booking read model's newest-row selection after multiple provider attempts
- Offline bookings skip meeting creation entirely (go to `awaiting_admin_room_approval`)
- The booking detail surface maps online-link states to compact Selia `IconInfoSquareRounded` info/warning popovers; failed attempts expose the retry status and manual-provider rows expose the manual setup status, while an available URL exposes the meeting-room action inside the same popover instead of a `Ready` badge or standalone CTA. Missing offline-room details and tutor completion timing use the same hover/focus/click/touch disclosure pattern without changing meeting data or RPC contracts
- The booking detail overview merges the date and session hours into one `Date & time` field and places Format & access beside it in a responsive two-column grid that stacks on narrow screens

---

## Notification Module

**Purpose:** In-app notification creation and email dispatch.

**Files:**

- `notification.types.ts` — Zod schemas for notification input
- `notification.errors.ts` — `NotificationNotFoundError`
- `notification.repo.ts` — `insert`, `listByUserId`, `updateReadStatus`, `updateReadStatusForUser`, `markAllRead`, `countUnread`
- `notification.service.ts` — `write(params)`, `writeBestEffort(params)`, `list(userId, opts)`, `getUnreadCount(userId)`, `markAsRead(id, userId)`, `updateReadStatus(userId, ids, isRead)`, `markAllAsRead(userId)`
- `notification.handler.ts` — Maps handler context/input
- `notification.router.ts` — Protected routes

**Service Methods:**

- `write(params)` — Creates notification + queues email dispatch row; throws on failure
- `writeBestEffort(params)` — Creates notification + queues email dispatch row; swallows errors
- `dispatchQueuedEmails(limit = 50)` — Outbox consumer: sends queued dispatch rows via `EmailPort`, marks `sent`/`failed`/`suppressed` (called by the `send-notification-email` scheduler job)
- `list(userId, opts)` — Paginated list with `unreadOnly` filter
- `getUnreadCount(userId)` — Returns the number of unread notifications
- `markAsRead(id, userId)` — Marks single notification as read
- `updateReadStatus(userId, ids, isRead)` — Marks up to 100 selected notifications as read or unread, scoped to the owning user
- `markAllAsRead(userId)` — Marks all unread notifications as read

**Dependencies:** `NotificationRepo`, `EmailPort` (+ `db` for the outbox consumer)

**Business Rules:**

- Every notification has a unique `eventKey` for idempotency
- Retired `economy_config_updated:*` rate-change rows remain stored for history but are excluded from the user inbox and unread count
- Selected read-status updates only affect notification IDs owned by the authenticated user
- `write` throws — used for critical notifications
- `writeBestEffort` swallows errors — used for non-critical notifications
- Email dispatch is outbox-based: rows are queued inside the DB transaction and sent by the scheduler job; no email I/O inside open transactions (#46)
- The active `traceId` (see `packages/api/src/lib/trace.ts`) is persisted on notification `metadata` at write time, so dispatch rows correlate via their parent notification

---

## Payment Module

**Purpose:** Mark package purchases via the active payment provider (Midtrans Snap or development stub) with webhook confirmation, idempotency, and wallet crediting.

**Files:**

- `payment.types.ts` — purchase, Test Mode simulation, and lookup schemas
- `payment.errors.ts` — `PackageNotFoundError`, `PaymentNotFoundError`, `PackageAlreadyPurchasedError` (legacy), `PaymentProviderError`
- `payment.repo.ts` — `findPackageByCode`, `insertPayment`, `findPaymentByProviderReference`, `findLatestPaymentByUserAndPackage`, `findPaymentByProviderEventId`, `findPaymentById`, `updatePaymentStatus`
- `payment.service.ts` — `createIntent`, `confirmFromWebhook`, `getPurchase`; exposes `provider`
- `payment.handler.ts` — `getConfig`, `createPurchase`, Test Mode `simulatePurchase`, `getPurchase`; config `providerMode` (test/live) + `simulationEnabled`
- `payment.router.ts` — `createPurchase` and `simulatePurchase` use `verifiedStudentProcedure` (student role + verified email; `getConfig` and `getPurchase` stay protected)
- `midtrans-payment.provider.ts` — Midtrans Snap integration (`POST /snap/v1/transactions` → `redirect_url`; webhook `signature_key` = `SHA512(order_id + status_code + gross_amount + key)` verified in the body; status mapping `capture`→PAID / `settlement`→SETTLED / `pending`→PENDING / `deny|cancel|failure`→FAILED / `expire`→EXPIRED / `refund|partial_refund`→REFUNDED; non-card settlement timestamps come from authenticated `settlement_time`; card `transaction_time` is initiation and no `capture_time` is exposed, so card KOL ordering is unresolved while verified payments still credit; refunds without exact success time are also unresolved; `order_id` = payment UUID resolved back to the stored provider reference; circuit breaker + retry; `refund()` port)
- `stub-payment.provider.ts` — Development stub
- Webhook route lives in `apps/server/src/webhooks/payments.ts` (`POST /webhooks/payments/:provider`)

**Service Methods:**

- `createIntent(userId, walletId, packageCode)` — Creates a purchase intent; reconciles the latest PENDING intent against providers that support status lookup before deciding whether to reuse its persisted `checkoutUrl` (H4, migration 0026). Remote terminal status produces a fresh payment row and unique provider reference; provider lookup failure conservatively reuses the PENDING intent to avoid duplicate charges. Earlier attempts remain history; returns `{ paymentId, providerReference, checkoutUrl }`.
- `confirmFromWebhook({ provider, providerReference, providerEventId, status, ... })` — Enforces the `ALLOWED_TRANSITIONS` state machine (PENDING/FAILED/EXPIRED → PAID/SETTLED/REFUNDED; PAID → SETTLED/REFUNDED), credits the wallet on first PAID/SETTLED, idempotent via provider event ID + DB UNIQUE; writes `payment.{id}.credited` notification (B6, #46). Each repeat purchase has its own provider reference and row, so webhooks are resolved to the matching attempt and cannot mutate a different attempt or suppress its wallet credit. Legacy rows that were reset in an older deployment may still use the stale provider-event marker protection for a late FAILED/EXPIRED event. A REFUNDED payment received before local success is stored without a Marks credit and calls the KOL decision port in the same transaction to reserve the first event at zero commission; if success time is unavailable, the decision remains unresolved and blocks later purchases until an authoritative exact provider time becomes available. A verified card capture still credits Marks even while its KOL decision is unresolved. For refunds after credit, it reads the wallet through the transaction (`getByUserId`, N4) and reverses the credited Marks from the **total balance** (`held + available`): held Marks are released (`refund.{id}.release`) then the full payment Marks are reversed via `compensate_deduct` (`refund.{id}.reverse`); when the total is below the payment marks (spent all, H4) it marks the payment REFUNDED, writes a `refund_webhook_reconciliation` audit + `refund_record` row for admin, and skips the reversal + refund notification (P2.7/H4, M1/N4 wave-6b)
- `getPurchase(paymentId, userId)` — Returns the payment record if owned by the user

**Dependencies:** `PaymentRepo`, `PaymentWalletPort`, `PaymentProvider`, `NotificationPort`, `AuditPort`, `RefundRecordPort`

**Business Rules:**

- Webhook signature verified via `verifyWebhook` (provider-specific) + applicable timestamp window (5 min) + IP allowlist (honors `TRUST_PROXY`); Midtrans uses the body `signature_key` and skips timestamp validation
- Webhook idempotency is atomic — `IdempotencyStore.claim` keys lifecycle events by provider + verified payment/event id (or provider reference fallback) + normalized status. This prevents a PENDING event from suppressing a later PAID event for the same payment while still deduplicating provider retries of the same state; transient processing failures release the claim (#46)
- Circuit breaker prevents cascading failures to the provider
- Payment statuses: `PENDING` → `PAID`/`SETTLED`/`EXPIRED`/`FAILED`/`REFUNDED`
- Package purchases are repeatable: the latest PENDING attempt is provider-reconciled before reuse, while terminal attempts remain immutable history and do not block a new payment row/provider reference.
- `getConfig` exposes only `{ testMode }`, allowing the Balance page to label a sandbox checkout without leaking payment credentials or the UAT allowlist.
- Payment/refund notifications are written per the PRD matrix (B6, #46); `PAYMENT_PROVIDER=midtrans` requires `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY`/`MIDTRANS_MERCHANT_ID`/`MIDTRANS_MODE` (no silent stub fallback)
- Midtrans selects the actual environment from the Server Key (Sandbox vs Production). `MIDTRANS_MODE` is the explicit deployment assertion. Snap returns a hosted `redirect_url` as `checkoutUrl`; `order_id` is the payment UUID (unique per repurchase attempt) and is resolved back to the stored provider reference for webhook/status matching. Midtrans Sandbox has **no simulation endpoint** — `canSimulate` is false and `simulatePurchase` returns `PAYMENT_SIMULATION_UNAVAILABLE` in Midtrans mode; sandbox test payments use the Snap test cards.
- `simulatePurchase` never credits Marks directly; provider-confirmed status must pass through the transactional confirmation service.
- Structured provider non-2xx responses are reduced to a single-line, bounded `status + error_code + message` diagnostic. That detail is safe to return as the `PAYMENT_PROVIDER_ERROR` message; arbitrary response bodies and credentials are never echoed.
- Test-mode status polling is a recovery path: `getPurchase` checks the active provider's authoritative status for approved UAT users. If the provider reports a terminal status, it delegates to the same transactional/idempotent `confirmFromWebhook` logic, so a missing sandbox webhook cannot leave a completed payment stuck forever.
- Payment integrity checks are money-movement gated (2026-10-01): provider identity is always verified, but currency/amount checks run only when the remote status is PAID/SETTLED (the only path that credits). Provider grosses include channel fees (Midtrans echannel reports gross = package + fee), so enforcing equality on EXPIRED/FAILED/REFUNDED stranded rows in PENDING with a per-retry `amount_mismatch`. On PAID/SETTLED the gross must match within channel-fee tolerance (`max(Rp10k, 3%)` — covers VA Rp4,440/outlet Rp5k/QRIS 0.7%/wallets ~2%/cards 2.9%+2k): any underpayment throws, overpayment beyond the cap throws, and the credit always uses stored package Marks (tolerance gates acceptance, never payout size). Mismatch errors carry `{ expectedAmountIdr, receivedAmountIdr, overpaidAmountIdr?, feeToleranceIdr? }` / `{ receivedCurrency }` details for Loki diagnosis.
- `reconcilePendingPayments` only attempts created within the last 7 days (`RECONCILE_ATTEMPT_LOOKBACK_MS`): provider checkouts expire on their own, so older rows are never going to settle and need manual disposition to EXPIRED instead of infinite 15m retries.

---

## Economy Module

**Purpose:** Persistent singleton for the active Marks and IDR economy parameters used by pricing and admin controls.

**Files:**

- `economy.types.ts` — `EconomyParameters`, `EconomyConfigUpdate`, defaults, and singleton id
- `economy.repo.ts` — `getOrCreate`, `updateWithVersion`
- `economy.service.ts` — `getConfig`, `updateConfig`
- `economy/index.ts` — module wiring and exports

**Service Methods:**

- `getConfig(conn)` — Reads the singleton, creating the client-approved defaults if missing
- `updateConfig(conn, input)` — Validates the version and writes the active schedule with `updatedBy`

**Business Rules:**

- Computational value defaults to Rp5,000 per Mark
- Tutor minimum base defaults to Rp50,000; online/offline tutor increments default to Rp30,000/Rp40,000
- Cogito take defaults to online Rp50,000 + Rp20,000 per additional student and offline Rp90,000 + Rp40,000 per additional student
- Admin may edit only the active Cogito take fields through `admin.*`; every update is audit-logged
- The config version is copied into new economic snapshots; existing snapshots do not change

**Dependencies:** `DbType`

---

## Pricing Module

**Purpose:** Pricing validation plus IDR-to-Marks calculations; the calculation functions are pure while active configuration is read through the Economy port.

**Files:**

- `pricing.service.ts` — `computeSplit`, `validatePrices`, `validateBaseRates`, `computeEconomics`, `getEconomyConfig`

**Service Methods:**

- `computeSplit(modality, tutorPricePerStudent, headcount)` — Legacy compatibility split for profiles that still use the old Marks pricing map
- `computeEconomics(modality, baseRateIdr, headcount, config)` — Returns the IDR honorarium, IDR Cogito take, total IDR, total Marks, rounded per-student Marks, and immutable snapshot fields
- `validatePrices(prices, modality)` — Validates floor prices by modality; returns error string or null
- `validateBaseRates(baseRatesIdr, modality, config?)` — Validates minimum IDR base honorarium, supported modalities, and Rp5,000 increments

**Dependencies:** None (pure functions)

**Business Rules:**

- New IDR economics use the active Economy config and calculate tutor honorarium and Cogito take separately
- Total IDR is converted at the configured Mark value, then Marks per student is rounded up
- `both` profile modality still requires both IDR base rates; a booking always selects online or offline
- Group sizes 1-6 only

---

## Refund Module

**Purpose:** Admin wallet corrections — compensating credit/deduct ledger entries and correction listing.

**Files:**

- `refund.types.ts` — `createCorrectionInput`, `listCorrectionsInput`
- `refund.errors.ts` — `RefundNotFoundError`, `WalletNotFoundError`
- `refund.repo.ts` — `insertRefundRecord`
- `refund.service.ts` — `createCorrection`, `listCorrections`, `createRefundRecord`
- `refund.handler.ts` — `createCorrection`, `listCorrections`
- `refund.router.ts` — Admin-only routes

**Service Methods:**

- `createCorrection(adminId, { walletId, amount, type, reason, bookingId? })` — Compensates a wallet (`compensate_credit`/`compensate_deduct`), writes a `refund_record`, and records an audit log with before/after balances; throws `WalletNotFoundError` if the wallet is missing
- `listCorrections({ walletId, limit?, cursor? })` — Returns only `compensate_credit`/`compensate_deduct` ledger entries for a wallet
- `createRefundRecord(db, params)` — Internal helper used by other modules to persist a refund/correction record

**Dependencies:** `RefundRepo`, `RefundWalletPort`, `RefundAuditPort`

**Business Rules:**

- Corrections can be positive (credit) or negative (deduct)
- Event keys use a deterministic format `correction.{type}.{walletId}.{sha256(payload)[:32]}` — derived from the payload so a retried request can never double-apply (idempotent via the ledger unique index)
- Every correction is audit-logged with before/after wallet state

---

## Room Module

**Purpose:** Room management for offline bookings — room CRUD, availability checks, assignment, relocation, and un-assignment.

**Admin UI workflow:** The Operations → Room approvals tab now starts with an
Active rooms catalog. Admins can use **Add room** to create an active physical
room with its name, location, and learner capacity; **Edit** updates those
details, and **Deactivate** removes a room from new assignments without
deleting its history. The list refreshes after each successful mutation so the
active catalog and offline-booking selectors stay current. The same tab remains
the cross-booking work queue: a requested room can be assigned inline, while
choosing a room or a different room opens the admin-only booking detail page,
where the Offline room card performs assignment, relocation, or room removal
with the booking's schedule already attached. The UI does not ask admins to
type booking UUIDs, and this workflow does not change the existing booking RPC
contracts.

**Files:**

- `room.types.ts` — Zod schemas for list/pending-approval/create/update/deactivate/assign/check-availability/relocate/cancel inputs
- `room.errors.ts` — `RoomNotFoundError`, `RoomBookingConflictError`
- `room.repo.ts` — room queries, pending approval lookup, room-booking insert/update/find
- `room.service.ts` — `listActive`, `listPendingApprovals`, `createRoom`, `updateRoom`, `deactivateRoom`, `assignRoom`, `checkAvailability`, `relocateRoom`, `cancelRoomBooking`, `syncRoomBookingScheduleForBooking`, `resyncRoomBookingToSchedule`
- `room.handler.ts` — `list`, `listPendingApprovals`, `create`, `update`, `deactivate`, `assign`, `checkAvailability`, `relocate`, `cancelBooking`
- `room.router.ts` — `list`/`checkAvailability` protected; `listPendingApprovals`/`create`/`update`/`deactivate`/`assign`/`relocate`/`cancelBooking` admin-only

**Service Methods:**

- `listActive(input?)` — Returns active rooms; `{ limit, offset }` applies deterministic server pagination, while omitted input preserves the full selector-compatible list
- `listPendingApprovals(input?)` — Returns a server-paginated page of offline bookings in `AWAITING_ADMIN_ROOM_APPROVAL`, including bookings with no requested room row after a requested-room conflict
- `createRoom({ name, location, capacity })` — Creates a room
- `updateRoom({ id, name, location, capacity })` — Updates an active or inactive room's editable catalog details
- `deactivateRoom(id)` — Soft-deactivates a room so it cannot be selected for new offline bookings while historical assignments remain intact; repeated deactivation is a no-op
- `assignRoom(bookingId, roomId, startAt, endAt)` — Confirms a room for a booking with conflict check; transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED`, then best-effort creates/refreshes its non-Meet Calendar event after commit, including the `Site: {location}` / `Room: {name}` description heading, and notifies tutor + confirmed students (#46, G14). **F22 state guard:** the booking must be `AWAITING_ADMIN_ROOM_APPROVAL` (or `RESCHEDULE_PROPOSED`, the H3 pre-assignment carve-out) — any other state throws `ROOM_BOOKING_STATE` before the roomBooking row is inserted (no orphan CONFIRMED rows)
- `checkAvailability(roomId, startAt, endAt)` — Returns whether the room is free for the slot
- `relocateRoom(bookingId, roomId, startAt, endAt, actorId?)` — Moves a booking to a different room, freeing the previous one; transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED` (mirroring `assignRoom`, safe no-op otherwise), then best-effort refreshes the non-Meet Calendar location and Site/Room description heading after commit, and notifies tutor + confirmed students (#46, H3/REVIEW-FIXES-4 P2.6). **F22 state guard:** allowed from `AWAITING_ADMIN_ROOM_APPROVAL`/`SCHEDULED`/`RESCHEDULE_PROPOSED` only
- `cancelRoomBooking(bookingId, actorId?)` — Cancels the booking's room assignment; while awaiting approval it also delegates the booking cancellation/hold release/audit through `RoomBookingPort`, including the no-requested-room conflict case; notifies tutor + confirmed students (#46)
- `syncRoomBookingScheduleForBooking(bookingId, startAt, endAt)` — Updates the active confirmed room assignment when the target window is free; returns `missing` without an active assignment or `conflict` after cancelling the assignment when another confirmed room booking overlaps
- `resyncRoomBookingToSchedule(conn, bookingId, { startAt, endAt })` — **N3:** moves a booking's confirmed roomBooking row back to a schedule (no-op when the times already match or no confirmed row exists). Called by the booking module when a reschedule proposal is rejected or expires so a pre-assigned room cannot remain blocked for the cancelled proposal window

**Dependencies:** `RoomRepo`, `RoomNotificationPort`, `RoomBookingPort` (transition to scheduled)

**Business Rules:**

- Room bookings have status `requested`/`confirmed`/`relocated`/`cancelled`
- Room conflict-check/write paths take a transaction-scoped advisory lock keyed by `roomId`. Both normal and `FOR UPDATE` repository checks use strict half-open overlap (`existing.start < requested.end AND existing.end > requested.start`). Migration `0038_room_booking_overlap_guard.sql` adds the matching database backstop: a partial GiST exclusion constraint rejects overlapping `[startAt,endAt)` ranges for `confirmed` rows in the same room while allowing adjacent sessions.
- The admin pending-approval queue is sourced from offline bookings in `awaiting_admin_room_approval`; the requested room is optional because room creation can report a conflict and let the booking continue to admin review
- Room catalog and pending-approval tables use ordered `limit`/`offset` queries and a one-row sentinel in the web UI; room selectors intentionally use the unpaginated compatibility path.
- G14 (assign → scheduled + notifications) fixed in #46
- Offline booking-level reschedules keep the room assignment aligned with the booking schedule; conflict/missing results remain in the admin room-approval queue rather than reserving a room at a stale time
- Remaining gap G13: `checkAvailability` is not yet integrated into booking creation — tracked U14 in `docs/plans/active/PRD-GAPS-PHASE3.md`

---

## Scheduler Module

**Purpose:** Background job scheduling using BullMQ for booking expiry, hold release, tutor-lateness admin-queue flagging, email outbox dispatch, support-ticket SLA escalation, failed-meeting retry, and Midtrans payment reconciliation.

**Files:**

- `scheduler.service.ts` — `createSchedulerService()`, `start()`, `shutdown()`, job handlers
- `jobs/expire-bookings.job.ts` — repeatable job (5 min)
- `jobs/release-holds.job.ts` — repeatable job (10 min)
- `jobs/check-tutor-lateness.job.ts` — repeatable job (5 min)
- `jobs/send-notification-email.job.ts` — repeatable job (60 s) — consumes the email outbox (queued + failed-with-retries-left rows, max 3 attempts per dispatch)
- `jobs/escalate-support-tickets.job.ts` — repeatable job (15 min) — SLA escalation
- `jobs/retry-failed-meetings.job.ts` — repeatable job (5 min) — re-creates Google Meet for CONFIRMED online bookings whose meeting creation failed (max 3 attempts; afterwards left for assigned-tutor or admin manual link, U1)
- `jobs/reconcile-payments.job.ts` — repeatable job (15 min) — checks stale Midtrans payment requests and confirms terminal provider status
- Wiring: `apps/server/src/scheduler.ts` — `initScheduler()` gates on `SCHEDULER_ENABLED=true` + `REDIS_URL`

**Service Methods:**

- `start()` — Registers BullMQ repeatable jobs
- `shutdown()` — Graceful shutdown with 10s timeout (forced close after timeout)
- `onExpireBookings()` — Calls `bookingService.expireBookings()`
- `onReleaseHolds()` — Calls `bookingService.releaseExpiredHolds()`
- `onCheckTutorLateness()` — Calls `bookingService.checkTutorLateness()` (flags unmarked tutor-attendance sessions for admin review past the 15-min lateness tolerance, G3)
- `onSendNotificationEmail()` — Calls `notificationService.dispatchQueuedEmails(50)` (outbox consumer; #46; failed rows retried up to 3 attempts)
- `onEscalateSupportTickets()` — Calls `supportService.escalatePastSlaTickets()` (marks overdue tickets in_progress + escalated + audit; #46)
- `onRetryFailedMeetings()` — Calls `bookingService.retryFailedMeetings()` (re-schedules CONFIRMED online bookings with a failed meeting)
- `onReconcilePayments()` — Calls `paymentService.reconcilePendingPayments(50)` (confirms stale Midtrans provider requests and records reconciliation outcomes)

**Dependencies:** `BookingService`, `NotificationService`, `SupportService`, BullMQ queue

**Business Rules:**

- Expiry job every 5 min; hold-release every 10 min; lateness every 5 min; email every 60 s; SLA escalation every 15 min; failed-meeting retry every 5 min; payment reconciliation every 15 min
- Jobs use retry with exponential backoff (3 attempts); the failed-event handler compares `attemptsMade` with the job's configured `opts.attempts`, and only after that budget is exhausted copies the job to `cogito-jobs-dlq`. Intermediate failures remain eligible for BullMQ retry. The DLQ worker logs the entry and keeps a bounded Redis list (`cogito:dlq`, max 100 entries) for inspection (M4)
- Every repeatable payload carries the scheduling scope's `{ traceId, userId }` (`traceJobData()`; `{}` when scheduled outside a request); the worker re-enters that scope via `runWithTrace` (minting a fresh `req_*` id for unstamped system ticks) and logs both on start/complete/fail
- Circuit breaker state persisted in Redis (when available)

---

## Support Module

**Purpose:** Support/lateness tickets (G1) — students report tutoring lateness/no-show or other issues; admins triage by SLA urgency and resolve.

**Files:**

- `support.types.ts` — `createTicketInput`, `listTicketsInput`, `adminListTicketsInput`, `adminResolveTicketInput`; `SUPPORT_CATEGORIES`, `SUPPORT_STATUSES`
- `support.errors.ts` — `SupportTicketNotFoundError`, `SupportBookingAccessError`, `LatenessReportTooEarlyError`, `SupportTicketAlreadyResolvedError`
- `support.repo.ts` — `findBookingForReporter`, `insert`, `listByReporter`, `adminList`, `findById`, `updateResolution`
- `support.service.ts` — `createTicket`, `listTickets`, `adminList`, `adminResolveTicket`
- `support.handler.ts` — Maps handler context/input
- `support.router.ts` — `createTicket`/`listTickets` protected; `adminListTickets`/`adminResolveTicket` admin-only

**Service Methods:**

- `createTicket(userId, { category, bookingId?, description })` — Lateness/no-show categories (`tutor_late`/`tutor_no_show`) require the reporter to be a participant and the booking to have started > 15 min ago (`LATENESS_TOLERANCE_MS`); sets `slaDeadline` via `computeSlaDeadline` (OQ-04: 30 min Mon–Sat 09:00–21:00 WIB, else 4h) and auto-acknowledges the ticket to the reporter (`support.{id}.acknowledged` notification)
- `listTickets(userId, { status?, limit? })` — The user's own tickets
- `adminList({ status?, limit?, offset? })` — All tickets sorted by SLA urgency (earliest deadline first)
- `adminResolveTicket(adminId, { ticketId, resolution })` — Sets `resolved` + assignee, notifies the reporter, records an audit log; throws `SupportTicketAlreadyResolvedError` if already resolved/closed
- `escalatePastSlaTickets()` — Called by the `escalate-support-tickets` scheduler job; marks open tickets past `slaDeadline` as `in_progress` + escalated, records an audit log, and emits a `support.{id}.escalated` notification row (metadata `whatsappTarget: +62881011990195`, `escalate: true`) as the hook point a future WhatsApp adapter consumes (OQ-04; #46, P2.8)

**Dependencies:** `SupportRepo`, `SupportNotificationPort`, `SupportAuditPort`

**Business Rules:**

- Tickets start `open`; statuses `open`/`in_progress`/`resolved`/`closed`
- SLA deadline per OQ-04 (REVIEW-FIXES-4 P2.8): 30 min during business hours (Mon–Sat 09:00–21:00 WIB, UTC+7), 4 h otherwise — wall-clock rule computed by `computeSlaDeadline`
- Auto-acknowledgement notification on ticket creation (OQ-04)
- Escalation emits a `support.{id}.escalated` notification row that a future WhatsApp adapter consumes; WhatsApp itself is out of scope until an integration is approved (OQ-04)
- Web support actions display a confirmation dialog with `+62 881-0119-90195` before opening the support conversation in a new tab.
- Lateness reports are time-gated (15 min after scheduled start)

---

## Tutor Module

**Purpose:** Tutor profile management — create, update, submit for review, availability management, and payout summaries.

The web tutor profile editor groups Education, Achievements, and Experiences into one combined section with consistent full-width, border-light subsections. Typography, whitespace, thin rules, and row-based entries establish hierarchy without nested cards; each subsection retains its own private proof-link list. Its live preview labels draft versus published-profile edit state and names the structured sections that differ from the current public profile. The profile-photo field lives inside the Public profile section and only presents the current/proposed photo, while audit history remains an admin review concern. Dynamic entry delete actions use a dedicated right-aligned row instead of overlapping fields. Affiliation is required on review and supports a study program/university or professional role/organization.

The tutor onboarding form uses a shared responsive field composition: labels and
descriptions stay in the left column while inputs, selectors, textareas,
validation messages, and dynamic add-entry controls stay in the right column;
mobile layouts stack those columns. Teaching setup and payout account render in
one full-width sequence, and specialization choices use one vertical list.
Teaching-capacity selectors and base-honorarium steppers fill the available
control-column width.
This is presentation-only and does not change tutor RPC inputs or persisted
profile data.

Compact student and tutor profile-photo pickers use a native screen-reader-only file input instead of Selia's visible full-width Input. The dashboard shell therefore retains a single contained content scroller without document-level overflow.

The authenticated dashboard shell is viewport-fixed. Its content pane exclusively owns vertical page scrolling and contains overscroll, so long tutor forms do not create a second document scrollbar; non-dashboard public and authentication routes continue using document scrolling.

**Files:**

- `tutor.types.ts` — Zod schemas for profile fields and structured achievements/experiences, `submitForReviewInput`, the `2026-09` Terms of Service version, and `getMyPayoutsInput`
- `tutor-experiences.ts` — Structured experience entry validation and limits
- `availability.types.ts` — Availability slot types (`upsert`, atomic date-override batch create, weekly-create, weekly-replace, delete)
- `tutor.errors.ts` — `TutorProfileNotFoundError`, `TutorNotAvailableError`, `AvailabilitySlotOverlapError`, `InvalidTutorPricingError`, `TutorTermsNotAcceptedError`, `OptimisticLockError`, `InvalidDateRangeError`, `WeeklyAvailabilityRangeError`
- `tutor.repo.ts` — `findByUserId`, `create`, `update`, `listProfileHistory`, `upsertAvailability`
- `tutor-profile-audit.ts` — canonical full profile snapshots and deterministic changed-path extraction
- `tutor.service.ts` — `getMyProfile`, `getMyProfileHistory`, `updateMyProfile`, `submitForReview`, `listAvailability`, `upsertAvailability`, `createDateOverrides`, `createWeeklyAvailability`, `replaceWeeklyAvailability`, `deleteAvailability`, `getMyPayouts`
- `tutor.handler.ts` — Maps handler context/input
- `tutor.router.ts` — Tutor-guarded routes (`tutorProcedure`)

**Service Methods:**

- `getMyProfile(userId)` — Returns tutor profile
- `getMyProfileHistory(userId)` — Returns the newest profile/review audit entries for the tutor; changed saves include complete before/after snapshots, and actor identity is limited to id and display name so account emails are not exposed to tutors
- `updateMyProfile(userId, input)` — Updates canonical account name and profile fields with optimistic locking (`version`) and records one full before/after snapshot pair when state changes. Profile, account-name, subject, photo, and audit writes share one transaction. Reverting the final pending proposal clears both `pendingProfileChanges` and `profileEditStatus`. Canonical structured fields are `education`, `achievements`, and `experiences`. `affiliation` describes current study program/university or professional role/organization. Draft saves permit omission; review submission requires affiliation and non-empty achievements/experiences. Published-profile changes to affiliation and structured credentials enter pending admin review.
- `onlineMaxClassSize` / `offlineMaxClassSize` — Immediate operational preferences from 1–6. Size 1 disables group requests for that modality; changes constrain new discovery/booking flows without rewriting existing bookings.
- `submitForReview(userId, input = {})` — Reads the active V3 pointer and profile in the status-update transaction. Requires affiliation, canonical achievements/experiences, complete profile fields, and first-submit Terms acceptance; legacy fee fields are required/validated only while V3 is inactive. Then sets `onboardingStatus` to `pending_review` and records audit log.
- `listAvailability(userId)` — Lists the tutor's active future availability slots
- `upsertAvailability(userId, input)` — Creates/updates a slot, rejecting overlaps
- `createDateOverrides(userId, input)` — Atomically creates up to 56 one-off windows across selected dates, including today when each start is still in the future; deactivates conflicting recurring occurrences and rejects the whole batch on an intra-batch or existing one-off conflict
- `createWeeklyAvailability(userId, input)` — Materializes weekly slots through `repeatUntil` (≤ 53 occurrences), rejecting overlaps
- `replaceWeeklyAvailability(userId, input)` — Atomically replaces recurring occurrences within the inclusive tutor-selected `effectiveFrom`–`repeatUntil` date range from weekday/time ranges; preserves one-off overrides and skips generated occurrences they supersede. The web availability form constrains the two Selia date pickers to tomorrow or later and the existing 52-week maximum.
- `deleteAvailability(userId, slotId)` — Deactivates a slot (soft delete)
- `getMyPayouts(userId, { dateFrom?, dateTo? })` — Delegates to the booking module's pending-cutoff payout path when no date filters are provided; explicit date filters use the reporting path. The tutor presentation is IDR-only even though internal split fields remain in the compatibility response.

**Dependencies:** `TutorRepo`, `TutorPricingPort`, `TutorAuditPort`, `BookingPayoutPort`

**Business Rules:**

- Only tutors with `published` status are visible in discovery
- Availability slots must be in the future and non-overlapping
- A one-off slot deactivates a conflicting recurring occurrence, making date overrides authoritative without changing other weeks
- The tutor date-override editor applies one `online`, `offline`, or `both` modality and up to four time ranges to as many as 14 selected dates. The generated slots commit atomically so a conflict never leaves a partially saved batch.
- `submitForReview` can only be called from `draft`/`changes_requested` status
- A complete first tutor submission requires bilingual Terms of Service acceptance; the profile action area owns one **I agree to the Tutor Terms of Service** checkbox and opens the document through a read-only **Read terms** action. **Submit for review** and **Submit changes for review** remain disabled until the checkbox is checked, while draft/profile saving remains available. The acceptance timestamp/version is immutable after the first write and is not included in public tutor discovery. After acceptance the checkbox is checked/disabled and **Review Tutor Terms** remains available; the consent row and action controls wrap responsively without changing the service contract
- Profile updates use optimistic locking (`version`)
- Profile, account-name, subject, photo, and audit writes commit atomically; final pending-proposal reversion clears both pending payload and edit-review status
- With the V3 activation pointer unset, tutor fee projection is `null` and legacy IDR base honoraria remain writable/required for review submission; writes use the economy minimum and Rp5,000 increments. With an active pointer, profile reads project read-only IDR fees by assigned parent competition and headcount 1–6, changed legacy `baseRatesIdr`/`prices` writes fail, and review submission does not require legacy fee fields. Unchanged stale client values are ignored. Admin approval always drops queued legacy `baseRatesIdr`, including when approving unrelated edits. Existing booking snapshots remain authoritative for payout.
- The tutor profile editor at `/profile` renders selected modalities in one combined six-row IDR group-size matrix using the same table structure as the student discovery drawer; this is presentation-only. The legacy `/onboarding` path redirects to `/profile` for tutors.
- The tutor profile editor places the profile-photo upload first and uses a clickable avatar with the shared circular crop flow. Compact Selia `InfoPreview` popovers reveal the full submitted/current/proposed image on demand. For a published tutor it labels `user.image` as the current public photo and a differing `pendingProfileChanges.profileImageUrl` as the proposed photo. The admin review page compares both assets side by side; `approve_edits` remains the only operation that promotes the proposal into `user.image`.
- The admin tutor index derives the status badge from `onboardingStatus` plus `profileEditStatus`; published tutors with `pending_review` edits show **Edit review**, and edits returned with `changes_requested` show **Revision requested**, making review-needed rows visible before opening the full-page review workspace.
- The tutor profile editor exposes canonical Education, Achievements, and Experiences sections. Education supports two entries; achievements and experiences support five entries each. Optional proof URL lists are protected by profile review and never enter public discovery. No legacy profile-text fallback remains.
- The tutor profile editor uses the authenticated shell's page-level vertical scroll container, matching the student profile and avoiding a nested form scrollbar. Direct page children cannot flex-shrink, so the tutor wrapper and onboarding content share one natural height; specialization-category fieldsets keep their natural height and the final action card stays in normal document flow without trailing scroll space. This is presentation-only and does not change the tutor RPC contract.
- The tutor profile editor keeps draft/save and submit-for-review as distinct actions. Missing required fields are allowed during draft/save, while submit requires the complete profile; malformed fields are surfaced beside their controls and in a validation summary. A published tutor can continue editing while a profile-change proposal is under review; saving updates the pending proposal and the explicit submit action queues the latest validated version.
- Every role uses Better Auth `user.name` as the canonical visible name. Tutor onboarding sends a changed account name through the transport-only `displayName` input on `tutor.updateMyProfile`; the service updates `user.name` and its audit entry atomically without persisting a second `tutorProfile.displayName` value. Discovery search matches `user.name`, its backward-compatible `displayName` projection is populated from `user.name`, and tutor/sidebar/booking/admin surfaces render `user.name`. The tutor-profile column remains legacy compatibility data.
- Tutor payout calculations retain the internal split fields for accounting compatibility, but tutor-facing finance shows only that tutor's own IDR honoraria and saved payout history. The private payout form collects bank details and tax identity; tax identity is required before a new payout can be prepared, but incomplete published tutors may continue teaching. Admins prepare immutable selected-source batches and record externally completed transfers; historical aggregate payouts remain unchanged and unbackfilled.
- New tutor submissions must select at least one active specialization from the normalized catalog; categories cannot be selected directly
- A normalized subject update replaces the tutor's join rows atomically and never accepts arbitrary legacy `expertise` strings as category ids
- Structured tutor achievements are stored in `tutor_profile.education` and `tutor_profile.achievements` as JSONB arrays. Education has at most 2 entries; achievements has at most 5 entries, each with a 1900–2100 year and at least one award.
- Structured tutor experiences are stored in `tutor_profile.experiences` as a JSONB array with at most 5 entries. Each entry has role, organization, 1900–2100 start year, nullable end year, and brief description; end year cannot precede start year.

## Tutor Specialization Taxonomy Module

**Purpose:** Maintain the editable category/specialization catalog and normalized tutor selections.

**Files:**

- `tutor-subject.ts` (database schema) — `subject_category` hierarchy and `tutor_profile_subject` join table
- `tutor-subjects/subject-selection.ts` — selection limits, active-specialization validation, and public projection helpers
- `0027_subject_taxonomy.sql` — schema migration and initial catalog schema
- `0029_competition_taxonomy.sql` — current competition catalog and legacy-row archival

**Business Rules:**

- Categories are the seven competition areas: Model United Nations, World Scholar’s Cup, Essay & Writing, Debate, Business, Olympiad, and Public Speaking
- The current catalog contains 34 selectable specializations in the exact order defined by `0029_competition_taxonomy.sql` plus `0047_debate_law_specialization.sql`; Debate ends with Law Debate
- Only active specialization rows are selectable by tutors; archived legacy rows remain readable for existing profiles and are not offered for new selection
- Tutors may select at most 7 active specializations; the web selector communicates the cap and disables additional choices, while the API validates the same limit
- The legacy `expertise` JSON remains for compatibility with existing rows and clients, but normalized `subjectIds` drives new onboarding and discovery filters
- The onboarding selector renders every current category with keyboard-accessible checkboxes, keeps normalized IDs for persistence/filtering, and shows archived profile subjects as read-only labels; raw UUIDs are an implementation detail and must not appear in user-facing controls
- The onboarding selector uses one vertical column for category cards and specialization options at every viewport width, keeping long labels readable. This is presentation-only and does not change taxonomy or selection contracts

---

## Tutor Discovery Module

**Purpose:** Public taxonomy discovery plus student-only tutor search and profile viewing.

**Files:**

- `discovery.types.ts` — Zod schemas for taxonomy listing and search filters
- `discovery.errors.ts` — `TutorNotFoundError`
- `discovery.repo.ts` — `listSubjects`, `listPublished`, `findByUserId`
- `discovery.service.ts` — `listSubjects()`, `listPublished(filters)`, `getProfile(userId)`, active Marks price projection
- `discovery.handler.ts` — Maps handler context/input
- `discovery.router.ts` — Public `listSubjects` plus student-only tutor routes

**Service Methods:**

- `listSubjects()` — Returns the active competition categories grouped with their active specializations; archived legacy rows are excluded
- `listPublished(filters)` — Paginated list of published tutor profiles with category, specialization, legacy expertise, and modality filters; `categoryIds` and `subjectIds` are ORed within each facet, combined as an AND across facets, and enforced through one correlated normalized specialization-existence check that returns no rows when there is no match
- `getProfile(userId)` — Returns full tutor profile and future availability
- IDR profiles receive `pricesByModality` Marks maps computed from the active economy config and truncated at `onlineMaxClassSize`/`offlineMaxClassSize`; legacy profiles keep their stored Marks map, similarly truncated for the preferred modality, and no student discovery response exposes the tutor's IDR base honorarium
- Frontend filter selects normalize displayed objects back to primitive category/specialization ID arrays or modality values before calling `listPublished`; empty arrays represent the corresponding “All” option, specialization options are the union of the selected categories, and the query is debounced by 300 ms.
- The student discovery search row and collapsible filter panel use shrinkable, viewport-bounded containers; shared Selia select positioners and popups cap at Base UI's `--available-width` boundary so multi-select options remain inside narrow viewports. This is presentation-only and does not change discovery inputs or outputs.
- The student tutor drawer combines the available modality maps into one group-size pricing matrix with separate Online and Offline Marks columns, prefixing populated values with the Cogito Marks icon; missing modality/size combinations are display-only em dashes and do not change the response contract. The profile opens as a bottom sheet with downward dismissal on mobile and switches to a right-side drawer from the `sm` breakpoint.
- Published tutor projections include the structured education and competition achievement arrays. The student drawer renders each first line in a semibold hierarchy, separates achievement bullets with breathing room, and joins multiple awards with commas.
- Published tutor projections include `user.image`, nullable `affiliation`, `education`, `achievements`, and `experiences`; student drawer presents canonical fields without text fallbacks.
- Tutor discovery cards use natural-width child specialization labels without repeating the parent category, keep desktop metadata on one line, reveal additional specialization badges at wider breakpoints, and retain the `From [Marks icon] #` starting-price treatment. This is presentation-only and does not change discovery filters or response fields.
- Long student tutor profiles scroll inside the drawer content area while the header/action regions stay outside that scroll area; local body overscroll is contained and cannot move the fixed regions. Admin tutor review uses the focused full-page workspace and keeps its action area usable at narrow widths. This is presentation-only and does not change the discovery or review contracts.

The student booking route `/tutors/:tutorId/book` reuses the published tutor
drawer through a **View tutor profile** header action. It preserves the
booking form state while open and swaps the drawer CTA to **Back to booking**;
no discovery input, output, or RPC contract changes.

**Dependencies:** `DiscoveryRepo`, `PricingPort`

---

## Upload Module

**Purpose:** Secure file uploads for achievement proofs and avatars — signed PUT uploads via Cloudflare R2 (production) or an authenticated local-disk fallback (dev).

**Files:**

- `upload.types.ts` — `createUploadUrlInput` (filename sanitized + bounded, `contentType` allowlist: `ALLOWED_IMAGE_TYPES` png/jpeg/webp/gif — photo flows are image-only; `ALLOWED_DOCUMENT_TYPES` (pdf) is exported but unreferenced until a flow needs it, `contentLength` bounded to `MAX_UPLOAD_BYTES`); `MAX_UPLOAD_BYTES` = 5 MB
- `upload.errors.ts` — `InvalidContentTypeError`, `InvalidFilenameError`
- `upload.service.ts` — `createUploadUrl`, `resolvePublicUrl`
- `upload.handler.ts` — `createUploadUrl`
- `upload.router.ts` — `protectedProcedure`, path `/upload/create-url`
- `index.ts` — `createUploadModule({ storage })`
- Storage abstraction: `packages/api/src/lib/storage.ts` — `StoragePort` (`put`, `getSignedUploadUrl`), `createR2Storage` (`@aws-sdk/client-s3` + presigner), `createLocalStorage` (writes `UPLOAD_DIR`), `createStorage(envLike)` factory
- Magic-byte sniff: `packages/api/src/lib/request-id.ts` — `sniffImageKind(bytes)` (PNG/JPEG/WebP/GIF signatures, null otherwise) + `readBodyBytesWithLimit(request, limit)`; the local `POST /uploads/*` route (`apps/server/src/routes/upload-routes.ts`) rejects non-image bytes with 415 before writing
- Nightly audit: `infra/r2-upload-audit.sh` — lists the upload bucket, HEADs each object's ContentType, compares it against the key's extension class (image exts → `image/*`, `.pdf` → `application/pdf`), posts mismatches to Discord, exits 1 on mismatch (read-only: list + HEAD, never writes)

**Service Methods:**

- `createUploadUrl(userId, { filename, contentType, contentLength })` — Returns `{ uploadUrl, key, publicUrl, contentType, maxBytes, method, fields }`; key = `{userId}/{uuid}-{sanitizedFilename}`. R2 signs a PUT request for the exact content type and declared length; local mode returns the authenticated raw-body POST route. The student profile photo flow sends a client-cropped square JPEG through this method before calling Better Auth `updateUser`.
- `resolvePublicUrl(key)` — Key → public URL helper (used by `createUploadUrl` output)

**Business Rules:**

- When all `R2_*` vars are set → R2 presigned PUT uploads; otherwise local storage served via `GET /uploads/*` (with path-traversal guard) when `R2_PUBLIC_URL` is unset
- Content types restricted to the image allowlist (PDF rejected on photo flows at both the input schema and the service); declared content length is 1 byte–5 MB and is signed for R2; filenames sanitized (no `..`, no leading `/`)
- Local `POST /uploads/*` magic-byte-sniffs the body before writing: any recognized image kind is accepted regardless of key extension (PNG bytes under a `.jpg` key are fine); non-image bytes (HTML/PDF polyglots) get 415
- Browser R2 uploads require bucket CORS allowing the app origin, `PUT`, and the request's `Content-Type` header. U3 CORS verified 2026-09-05 (read-only: RUNBOOK CORS JSON + Terraform): the bucket allows `https://app.cogitoacademy.id` plus local dev origins (`http://localhost:3000`, `http://127.0.0.1:3000`), methods `GET`/`PUT`/`HEAD`, headers `Content-Type` — app-origin-only; there is no Terraform CORS resource (console-managed like the R2 custom domain); no console change was made

---

## Wallet Module

**Purpose:** Marks (currency) management — balances, holds, ledger entries, and package purchases.

**Files:**

- `wallet.types.ts` — Zod schemas for ledger listing + outputs (`walletOutput`, `knowledgeBankOutput`)
- `wallet.errors.ts` — `WalletNotFoundError`, `InsufficientBalanceError`
- `wallet.repo.ts` — Atomic operations: `atomicHold`, `atomicRelease`, `atomicDeduct`, `atomicCredit`, `atomicCompensateCredit`, `atomicCompensateDeduct`, plus `insertLedger`, `findLedgerEntries`
- `wallet.service.ts` — `getOrCreate`, `hold`, `release`, `deduct`, `credit`, `compensate`, `listLedger`, `knowledgeBankEligible`, `listActivePackages`
- `wallet.handler.ts` — `get`, `listLedger`, `listPackages`, `knowledgeBankEligible`
- `wallet.router.ts` — Protected routes

**Service Methods:**

- `getOrCreate(userId)` — Gets or lazily creates wallet with 0 balance
- `hold(db, params)` — Atomically holds marks from available balance
- `release(db, params)` — Atomatically releases held marks back to available
- `deduct(db, params)` — Atomically deducts from held balance (session completion)
- `credit(db, params)` — Atomically credits available balance (payment received)
- `compensate(db, params)` — Compensation operation (positive or negative)
- `listLedger(walletId, opts)` — Paginated ledger with `bookingId` and `eventKey` filters
- `knowledgeBankEligible(userId, viewerRole?)` — Returns `{ eligible, balance, threshold }`; students use the **total balance** (held Marks count toward the 35-Mark threshold, PRD DL-16 / U13), while tutors and admins are eligible without a wallet threshold. The optional role is supplied by authenticated handlers and the file proxy.
- `listActivePackages()` — Returns active mark packages

**Dependencies:** `WalletRepo`

**Business Rules:**

- All balance modifications are atomic (UPDATE with WHERE balance = expected)
- Every operation creates a ledger entry with unique `eventKey`
- Wallet invariant: `totalBalance = heldBalance + availableBalance`
- Idempotency via `eventKey` on ledger entries
- Insufficient available balance throws `InsufficientBalanceError`
- `hold`/`release`/`deduct`/`credit`/`compensate` are service-layer only — consumed via ports, not exposed over RPC

## Tutor payout presentation (2026-10-21)

Tutor financial presentation is denominated in IDR and must not expose Marks. The tutor dashboard shows only that tutor's unpaid session count, gross, tax rate/status, withholding, one transfer fee, estimated net and saved payout history. It never returns NIK/NPWP or bank account values from the finance endpoint. New payout preparation requires a legal name, 16-digit NIK, and complete payout bank profile; published tutors without tax identity may keep teaching.

Admin payout processing is a two-step external-transfer workflow. An admin selects unpaid source keys and reviews a versioned preview containing current fee identities, profile/config versions, tax snapshot, bank destination and net. Preparation atomically saves that snapshot and one allocation per source; profile, rate or fee changes make the preview stale. Whole-IDR withholding uses basis points and half-up rounding. Configurable defaults are 250 bps for NIK+NPWP and 300 bps for NIK-only or missing identity; a tutor override is audited. Exact bank name `BCA` has no transfer fee and other bank names incur Rp2,500 once per batch. Only truly allocationless historical aggregate rows use the legacy cutoff: a T02 row with source allocations is scoped by those allocations even when its later preview fields are NULL. A source released from a void payout remains unavailable while external-transfer reconciliation is required. Admin CSV, tutor history and payout notifications call legacy coverage/tax snapshots unavailable when those facts were never saved. These are configured implementation defaults and do not represent tax-adviser or legal validation (OPS01 remains open).

Only after the operator performs the bank transfer externally may an admin record the exact saved net amount, actual payment date and optional HTTP(S) proof/reference. The payout, audit, tutor notification and email outbox row commit together; the application does not move money. A reasoned void retains the original snapshot and any transfer evidence while releasing allocations. If transfer evidence exists, the sessions remain blocked from repayment until an audited reconciliation resolution is recorded. Admin monthly CSVs use saved payout snapshots, group by actual paid date in Asia/Jakarta, keep mixed rates per payout, and place void/reconciliation rows in a separate section. No tax, bank, fee, or historical paid aggregate is backfilled from current profiles.

The admin operational payout workflow lives at `/admin-tutor-payouts`, separate
from Manage Tutors profile review. It previews and prepares a versioned batch
from selected unpaid source keys, then records the exact saved net only after
the operator performs the transfer externally. New payout rows snapshot the
bank destination, tax identity, tax/rate configuration and fee sources. Legacy
aggregate-only payout rows retain nullable snapshots and are never repopulated
from the current profile.

Migration `0065_tutor_payout_tax.sql` adds the saved tax/payout snapshot and
reconciliation fields. It was generated from parent-integrated snapshot `0064`
at journal timestamp `1792525224597` (SHA-256
`876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939`). Parent
SQL review and the assigned database/browser verification window remain
pending; this worktree has not applied `0065`.

Numeric Marks amounts in the web UI are rendered through `apps/web/src/components/cogito-marks.tsx`. The component owns the Cogito mark-symbol prefix, supported icon sizes, whitespace behavior, and accessible `value + Marks` label; feature components should not duplicate that markup.

The admin Invite Tutor form card opts out of CSS Grid cross-axis stretching. Keep it content-height so `CardFooter` remains flush with the card's rounded bottom boundary. The neighboring Invitations card follows the grid parent's stretched height as a flex column, and its body pushes `TablePagination` to the bottom whenever the table content is shorter than that space. These layout rules do not affect invitation service behavior.

### KOL responsive polish checkpoint

KOL settlement frontend (2026-10-25): KolSettlementPanel wraps long history identifiers and allows multiline transfer/adjustment/retry actions; AdminKolCommissionsPage allows the monthly export action to grow. All operation identity, retry locking, amount/date/reason submission and financial rules are unchanged. Synthetic render/wire coverage is not database accounting proof.

### Economy/payout frontend layout (25 October 2026)

`V3EconomySettings.AmountInput` retains Selia numeric behavior and applies a 14rem minimum control width; package and competition tables retain local horizontal scrolling. Tutor payout rendering required no production change in this bounded slice. The synthetic harness covers prepared-transfer, unpaid-preview and reconciliation drawers and rejects write requests; tax conversion, immutable snapshots, payout identities and services remain unchanged.

### KB/calendar page composition (25 October 2026)

The canonical Knowledge Bank/calendar route components select the existing read-only view for non-admin sessions. Admin sessions wrap that view in `ContentPage` with a fixed `resource` or `event` kind and a local View/Manage switch. Resource and event editors reuse the existing field parsing, private upload, expectedVersion/reason, conflict and delete paths. Manage queries are deferred until requested; leaving an open draft for View asks before discarding, and switching is disabled during writes. Successful saves/deletes invalidate the corresponding public reader cache. The old combined sidebar item is removed; its route is a compatibility redirect. No change to Marks eligibility, file access or server-side permissions.

## Activities website consumer (2026-10-26)

`academy-class.public.ts` explicitly projects nullable class `titleId` and
`descriptionId` alongside its existing public fields. No service transitions,
financial rules, events or database schema change. Marketing's
`lib/activities-api.ts` validates public class responses, preserves postponed
status, orders sessions; cover URL resolution was removed with the image-free class-row
follow-up. `components/activities/activities-content.tsx` combines cohort/masterclass
rows without cover/placeholder images and a single article-style Others list, with independent empty/error states.
Others still reads the published Sanity `event` inventory with existing localized
content/detail behavior; no activity-type labels or subsections are rendered.
This is the T10 website presentation slice, not the Other-content migration or
admin CRUD implementation.

Activities class rows now follow My Bookings text hierarchy: compact title,
icon-led time/mode/tutor metadata, competition/session/price line and compact
type/status badge. The description remains in the API but is not rendered in
the row; class detail remains available through its existing app link.

### Academy capacity policy (2026-10-29)

Academy draft and publish validation does not apply tutor private teaching limits (`onlineMaxClassSize` / `offlineMaxClassSize`). Session capacity is admin-controlled; enrollment quota enforcement, room capacity, tutor delivery mode/status, and scheduling checks remain in force. Private booking validation is unchanged.

Academy public projection explicitly allowlists the four competition palette fields on competition and parent; unrelated private competition fields remain excluded.

<!-- Student referral dashboard, 2026-10-29 -->

Student referrals: `/rpc/referral/getMine` now includes `friends` scoped to the authenticated referrer (name, signup date, first completed paid session date, credited Marks). The page shows an invitation panel, inline semester summary and full-width invited-friends table with account-created/completed-session states; zero credited Marks remains visible when no reward was granted. No migration or environment changes required.

Shared UI Radio/RadioGroup components in packages/ui/components/selia/radio.tsx wrap Base UI primitives with Selia tokens, data-slot attributes and keyboard selection. Class enrollment composes them for the single-session selector; this changes no enrollment eligibility or payment API contract.

CardBody table edges: first-child TableContainer removes body top padding; last-child TableContainer removes body bottom padding independently. Pagination and control siblings retain their content inset.

### Tutor honorarium in booking detail (2026-10-29)

Booking detail tutor honorarium uses immutable tutor_session_fee facts and active tutor_payout_allocation links. Only a linked payout with status paid is labeled Paid; other recorded fees await payment. Missing fee facts mean honorarium not yet recorded, never zero. Amounts are gross, before payout-level tax/transfer fees.

Academy class scheduling (2026-10-29): the admin session form accepts start date/time and duration in minutes (default 60). Editing derives duration from existing timestamps; saving computes endAt as startAt plus duration. The API and stored startAt/endAt contract remain unchanged; no migration or environment change is required.

Academic class references (2026-10-30): academy_class.class_number is a database-generated serial with a unique constraint (migration 0076_academy_class_number). Admin class reads, public catalog responses and class session report rows expose classNumber. Session Reports displays/searches CLS-{classNumber}; UUIDs remain the relational identifiers. Applying 0076 and restarting API processes is required before running this schema. Migration has not been applied by this change.

Tutor pricing (V3 only): Cogito admins own all honorarium rates. Tutor profile updates reject changed `prices` or `baseRatesIdr` even before an economy revision is active. Tutor onboarding does not require legacy rates; without active pricing, the UI shows an admin-configuration message instead of editable inputs. Configure pricing through admin economy settings before new sales.

Referral empty states (30 October): reuse the shared EmptyState with contextual icons and copy. Student invites offer a copy-message action; filtered admin results offer Clear filters; unfiltered activity explains when records appear; an empty KOL list opens the existing create form. No new API or reward rules.

Admin referral detail refinement (30 October): table prioritizes student identity, source, split date/time, outcome and right-aligned welcome credit. Compact chevron actions have student-specific accessible labels. Drawer remains mounted with selected content retained during closing so Selia enter/exit transitions can run. Detail sections separate identity/source, rewards/outcome, and collapsible technical evidence; null technical fields are omitted. No RPC or reward-rule changes.

## Bulk report selection (30 October 2026)

reportExport.listReports uses loadStudentReports, the same repeatable-read entitlement/date loader as generatePdf. Catalog IDs are private:<feedback UUID> or class:<class report UUID>; PDF renderer entry IDs remain stored UUIDs. References use BKG-{bookingNumber} (series add -S{session position}) and CLS-{classNumber}-S{sequenceNumber}; references and feedback appear in the selected PDF. selectReports rejects empty, duplicate, more than 100, unknown, expired or unauthorized IDs before rendering, preserving server date order. No settlement/financial write occurs. The catalog contains eligible recorded reports only; pending class sessions remain available through Session Reporting.

Admin referral density (30 October): activity records now use a single text line with centered alignment and compact vertical padding. Student email, source owner, reward breakdown and verification remain in the detail drawer; date/time is inline. No API or business-rule changes.

### Private reporting catalog and editor

`booking.listReportSessions` delegates to `listPrivateReportSessions`, scopes tutors in both single-booking and series-child SQL queries, and excludes future/cancelled sessions. Series references use the chronological position among all children, matching exports. Admin solo no-show report recovery is exposed; group no-shows are excluded. The shared reporting drawer reuses existing class submission and private completion/admin correction mutations. Private correction requires delivery confirmation, audit reason and expected version; version conflicts keep the draft and require explicit reconciliation. Submission request keys are retained for retries. Pending submissions prevent drawer dismissal; dirty drafts require discard confirmation.

## Activity articles (2026-10-30)

`activity` owns its validated structured input, admin CRUD and positive public
projection. `activity_article` has localized text/rich documents, cover URL,
location, UTC instants, draft/publication state and optimistic version. Writes
are admin-only, update/delete use atomic id/version predicates; completed is a
read-time display status, never evidence that an event was delivered. FAQ rich
text validation/editor is reused; registration links are regular body links.
Marketing `other-activities.ts` validates the wrapped response; the new article
modal renders typed text/list/link nodes without raw HTML. Old Sanity Others
queries, event transforms and event modal/grid are removed. Existing class
catalog behavior is unaffected.

Competition catalog admin directory excludes the stable migration-0027 seed IDs (10000000/20000000 UUID families), superseded by migration 0029. Newly authored entries remain visible regardless of slug prefix. This is a directory presentation rule, not deletion or a change to booking eligibility.

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

KB/calendar management refinement: compact rows, shared TablePagination (10 records per page over the loaded admin collection), search resets pagination, no active/archive filter or manual reload control. Existing TanStack Query refresh and mutation invalidation remain. Calendar create/update/delete accept an omitted reason and generate an operation-specific audit reason; Knowledge Bank changes still require a reason. Deploy matching API and web changes together; no environment or database migration changes.

### Booking exact top-up (2026-10-30)

Private booking summaries now quote the current Marks shortfall using the existing payment quote and purchase RPCs. A drawer confirms the exact IDR price and opens hosted payment in a separate tab so booking selections remain available. Returning to the booking tab refreshes the wallet; Check balance also refreshes it. Continue booking becomes available when the wallet has sufficient available Marks. Booking submission still validates current availability and price; payment does not reserve a slot. Same-tab redirect restoration and automatic booking submission are not implemented. Provider/browser acceptance remains pending.

Classes exact top-up now uses a confirmation drawer and opens hosted payment in a separate tab. Returning refreshes wallet and enrollment state. Check balance and Continue class checkout allow explicit refresh and return to the existing installment funding controls. Payment still does not extend seat reservation expiry; funding continues through existing server validation. Browser/provider acceptance is pending.

Migration 0078_remove_superseded_competition_seeds removes only the seven parent and 21 specialization seed IDs from migration 0027. It aborts atomically if pending tutor selections, booking snapshots/topics, economy revisions or foreign-key references still use them; clean up those references explicitly before retrying. Canonical migration 0029 rows and audit history remain. Migration authored but not applied or database-tested.

Seed competition taxonomy: seed.ts now inserts the seven canonical parent competitions and 34 specializations (including Law Debate), with migration-0056 parent palettes, before assigning review tutor subjects. Missing rows are inserted by slug in one transaction; existing catalog edits and archive status are preserved. Seed code updated only; database seed not executed.

Initial data ownership (2026-10-30): migration 0027/0028 retain schema creation only; 0029/0041/0047 retain no-op journal slots. Competition taxonomy (7 parents, 34 specializations including Law Debate), Marks packages and default economy config are inserted only by apps/server/src/seed/seed.ts. Non-test seed preserves existing config/catalog values; test seed retains its explicit economy reset. Existing databases are not retroactively changed by editing these migrations; 0078 remains the cleanup for obsolete 0027 seeds. Migration 0056/0057 palette backfills remain for existing rows; they create no records. For a fresh database, run schema migrations then the server seed. No migration or seed was executed for this change.

V3 seed alignment (2026-10-30): server seed and standalone seed-packages derive package defaults from DEFAULT_V3_ECONOMY_CONFIG (50/350000, 150/975000, 250/1500000, 500/2750000). After canonical taxonomy and review admin creation, server seed transactionally initializes and activates a new PRD-default V3 revision only when no revision is active; it preserves and validates an existing active revision and does not activate an unrelated saved draft. Review tutor seed no longer writes legacy prices/baseRatesIdr and clears those fields on its existing demo profile. New presentation bookings use an assigned active specialization, active V3 revision, V3 snapshots and quote-derived Marks holds. Existing legacy presentation bookings cause an explicit reset-required error. This supersedes earlier notes describing seedEconomyConfig and legacy seed pricing. Runtime compatibility removal is still pending. No database migrate, seed or reset was executed. Focused package-default test passed (1 test, 4 assertions); server typecheck remains blocked by the existing unused MODALITY import in tutor.service.ts; live seeding is unverified.

FAQ ordering: admin FAQ entries support drag ordering (or ArrowUp/ArrowDown on Move). POST `/rpc/adminFaq/reorder` accepts `{"json":{"ids":["faq-id"]}}` and returns the ordered admin list. Order is persisted in the existing sortOrder column and shared by full/landing public lists across locales. New entries append after the largest saved position; ties use creation time then ID. No database migration or environment change is required.

## Admin retry for failed Google Meet creation

Admin booking detail exposes an icon-only retry action when an online booking is confirmed, has no meeting URL, and its meeting status is failed. The admin procedure verifies those conditions under a booking row lock, retries using the existing meeting finalization flow, records the state transition as admin when successful, and audits the retry result. Academy Classes retains its class-level failed-meeting retry action, now shown as an accessible retry icon.
