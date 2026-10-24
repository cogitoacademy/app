# Release v3 - SDD execution and acceptance plan

## Google referral error feedback (24 October 2026)

Failed Google referral saves show a Selia error toast and retain the inline
message/input. The existing synthetic browser workflow checks toast visibility.
RPC and attribution rules remain unchanged.

## Google referral keyboard submission (24 October 2026)

Referral code entry uses native form submission: Enter applies a nonblank code.
Blank or in-flight submission is ignored; no-code remains an explicit button.
The existing Google referral synthetic workflow covers Enter and blank input.
No RPC contract or referral business-rule change.

## AUTH02 Google first-registration correction — 24 October 2026

Source fix and scoped isolated regressions complete: new Google callback role
is absent before adapter defaults; normalize before pending check. Preserve safe
return destination through referral choice. Existing-account reuse policy unchanged.
Red: actual Better Auth 1.6.11 memory-adapter callback persisted pending=false.
Green: 13 auth tests / 34 assertions; 3 synthetic Edge UI/wire cases; serial auth,
web and e2e typechecks. Redirect negative control also failed as expected.
Pending: real Google consent/cookie journey, PostgreSQL attribution/reward acceptance,
and owner decision for already-created affected accounts. No DB writes, migrations,
provider actions, deployment, parent-server changes, push or PR in this task.


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

## Account email design approved (24 October 2026)

Owner approved report banner, orange/blue and full Cogito Academy naming, with
the orange rule below the header removed. Source is integrated locally into
the shared OTP/welcome/reset email shell and server sender callbacks. No other
transactional templates changed. Escaping, safe URL schemes, dynamic OTP/expiry,
and banner fallback are covered by focused checks. Actual provider sends and
inbox-client rendering remain unrun; production asset deployment is separate.

## Admin referral usage checkpoint (24 October 2026)

Admin usage page/procedure now list saved friend/KOL/no-code choices, filtered
and paged with ledger-backed summary credits and per-choice reward evidence.
Five focused tests / 18 assertions, three synthetic Edge browser cases, focused
lint and four serial production typechecks pass. Read-only live dev verification
matches the Yopmail signup attribution/15-Mark welcome credit; wildcard escaping
returns no unintended matches. Live student session receives 403 from the new
admin procedure after API restart. Synthetic browser checks are not real admin login
or full PostgreSQL fixture/concurrency acceptance. No schema/provider/DB writes.
Account email branding is a separate user-reviewed slice; current review asks
for report banner, orange/blue palette and full Cogito Academy naming.

## Auth draft focus repair (24 October 2026)

Signup and sign-in drafts now survive background session refetch on tab return.
The public LoginPage pending loader was removed; it previously unmounted forms
when Better Auth refetched a null session. Two synthetic Edge cases fail before
and pass after the fix; live dev repro retains node/value afterward. Focused
lint passes. Session refresh, protected access and auth handoff are unchanged.
This UI regression does not establish real Google OAuth completion acceptance.

## Owner follow-up TODO (24 October 2026)

- [x] Update student report PDF to the supplied reference layout and header:
  two-column inline metadata, left-aligned feedback labels, compact footer,
  preserved class/session details and continuation pagination. Six focused
  PDF tests pass (20 assertions); regenerated short/normal/mixed/long examples
  are under local `output/pdf/student-report-examples/`. Visual review of
  normal and final continuation pages completed. Release UAT remains open.
  Focused lint, four-task serial production typecheck and full server build pass;
  extracted text blocks from all four sample PDFs stay within page boundaries.
  Owner follow-up: hanging bullet indent aligns continuation lines with text;
  dense items remain separate and paginate instead of flowing inline.

- [x] KB/CC migration preparation: one language-neutral input per text field,
  as clarified by owner; no required English or bilingual entry. Audit and
  dry-run manifests prepared for 3 KB resources and 63 competitions. All three
  PDFs verify against source size/hash; source refs and timestamp ranges pass.
  Eighty differing legacy locale fields retain selection/archive evidence.
  Six focused Python tests pass. See `migration/sanity-content/README.md`.
- [x] KB/CC source implementation: additive destination schema/migration 0075,
  separate private PDF storage, version-checked live-save CRUD, admin editor,
  deterministic dry-run/import and explicit independent consumer source flags.
  Default runtime still reads Sanity; Activities remain deferred.
  Validation: 56 focused Bun tests, 6 Python audit tests and 4 mocked browser
  cases pass. Serial production server/web and E2E typechecks plus importer/
  authored-test typecheck pass. Browser uses installed Edge, isolated web 3316
  and mocked API 3317; no API/DB/seed/provider process. Desktop/mobile screenshots
  reviewed; source hashes/IDs reconciled read-only. Bun is the locally installed
  1.4.0-canary.1, not pinned CI runtime. PostgreSQL tests remain authored/unrun.
- [ ] Apply migration/import/upload only in separately approved windows; verify
  private bucket denial, PostgreSQL races/audit rollback, role/file gates,
  website redirects, source activation/rollback and client acceptance.
  Extracted source data/assets/manifests remain local and must not reach GitHub.

- [ ] T10/T12 content migration: published Sanity snapshot extracted read-only
  on 24 October from project `skfmwuke`, dataset `development`, into ignored
  `tmp/v3-content/20261024-123211/`. Inventory: 63 competitions, 11 competition
  categories, 3 student resources, 6 events, 10 tutors, 1 education level,
  1 event scale, 2 locations, 4 file assets and 12 image assets. Raw document
  IDs, references, rich text and locale fields are retained. This is a
  published-only working snapshot, not a full draft/history backup. Next:
  review explicit source-category mappings and text selections, authorize a DB
  window and reconcile destination data before any website/source cutover.

- [x] Shorten newly generated friend referral codes to the six-character pattern
  `XXX000`: three uppercase letters derived from the user's name or another
  suitable identity attribute, followed by three digits (for example `AND482`).
  Handle normalization, short/non-Latin names and collisions within the shared
  referral-code namespace. Preserve existing codes, referral attribution and
  shared links; confirm compatibility with KOL campaign codes. Owner requested;
  source implementation is integrated at `57855d3`. Focused tests, lint and
  serial root typechecks pass; PostgreSQL races and live auth/provider/browser
  acceptance remain open.

## Short FRIEND code implementation checkpoint (24 October 2026)

XXX000 source implementation is complete: new codes only, normalized name/identity
letters, leading-zero suffixes, shared KOL uniqueness, bounded collision retries,
and explicit full-prefix conflict. Existing codes/attribution remain stable.
Focused DB-free tests cover policy and getMine wiring; PostgreSQL race and browser
acceptance remain parent gates. No migrations or dev/provider writes were made.
Grill verdict: **Good idea, but needs constraints**. The strongest compatible
version changes only first allocation. Code tracing disproved the need to narrow
signup validation or add a new uniqueness migration: `referral_code_format`,
`referral_code_value_uniq` and the owner index already enforce the shared uppercase
namespace. `completePreAccountSignup` writes choice/credit in its transaction;
Google choice and existing-account reuse do not allocate codes. The surviving
capacity risk is 1,000 slots per prefix and up to 1,000 contended insert attempts.
No silent alternate-prefix or longer-code policy is introduced.

Validation: 22 requested tests / 63 assertions pass across the four focused
files; Bun also collected the same three signup-body cases from ignored
`tmp/v3-checkpoint-check` (25 tests / 71 assertions total). Focused Oxlint and
diff whitespace checks pass. Root `bun run check-types` passes all four tasks
with Turbo `--concurrency=1` and TypeScript-Go `--checkers 1`. Service wiring
uses a scripted DB double, not PostgreSQL proof. Broad suites, PostgreSQL races,
live signup/provider and browser checks remain unrun.

Integration must retain the parent's separate owner TODO and Sanity extraction
checkpoint; this checkpoint does not close those notes or full T09 acceptance.


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

## T09 KOL settlement source handoff (23 October 2026)

Implemented source for REQ-KOL-02/03 / AC-K03: decision-bound external transfers,
partial/overpaid balances, immutable entries, idempotent retry and decision-row
serialization, reasoned signed obligation adjustments with expected balance and
atomic before/after audit, existing admin-page history/forms and monthly current
reconciliation CSV. No automatic allocation/offset, proration, cash refund,
provider execution or workers. PR312 eligibility/order/manual-refund rules remain.
0073 metadata is generated/reviewed only, not applied. DB-free focused checks
are the source evidence; T09 and AC-K03 acceptance remain IN PROGRESS until parent
isolated PostgreSQL/concurrency and admin browser acceptance. The runbook lists
required cases and export semantics. This supersedes earlier settlement-TODO
source checkpoints without promoting historical tests to current-head proof.


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

## Combined report/referral/reminder integration (23 October 2026)

Private student PDF export and AUTH-02/friend rewards are now integrated into
release through PRs #310 and #309. Legacy solo/group/series reminders preserve
exact PostgreSQL eligibility precision and millisecond cursor fairness. Prior
checkpoint text below describes its original authoring scope, not missing PDF
or referral implementations. Current reminder PostgreSQL precision evidence is
3 / 32; browser and actual email delivery remain release UAT gates.

## Reminder precision review correction (23 October 2026)

The PR #313 follow-up keeps millisecond normalization only in the SQL keyset
cursor. Eligibility, elapsed-day period, and locked schedule rechecks use the
full stored PostgreSQL timestamp precision, projected as exact epoch text and a
typed SQL period. The focused unit suite passes 10 tests / 44 expectations,
including a pg-proxy case where JavaScript's millisecond `Date` would produce
day 1 while SQL correctly returns day 0. Guarded PostgreSQL regressions for
101-row microsecond cursor progress, single and series-child 24-hour
boundaries, exact-end eligibility, and same-millisecond reschedule rejection
passed **3 tests / 32 expectations** against `127.0.0.1:6769/cogito-test` using
the production finder and locked writer. The test-only epoch formatter now
matches PostgreSQL's six-digit fractional precision, and year-0100 fixtures
avoid Bun's year-0001 parsing quirk. No migration, reset, or seed ran. The
normal pre-push typecheck passed 4/4 tasks in 14.961s (2 cached). Browser
acceptance and actual email delivery remain unverified.

## Booking reminder verification checkpoint (23 October 2026)

Parent verification at `c328d6ad` passes 7 reminder unit tests / 27 assertions
and all four workspace typecheck tasks uncached in 8.002 seconds. The local
dependency-integrity blocker is resolved; database concurrency and actual email
delivery remain acceptance gates. No database migration or reset was performed.

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


## KOL first commission checkpoint (23 October 2026)

The current slice records the first eligible IDR top-up by verified provider
success time. A late earlier callback updates the current commission decision
and appends an immutable before/after audit event; payment ID breaks equal-time
ties. Provider time is persisted on the payment row, and the commission uses
the saved signup terms and payment-record base price, excluding provider fees.
Midtrans success time comes from authenticated status lookup because its webhook
signature does not cover timestamp fields.
The admin page is read-only. Migration 0072 is generated but unapplied; the
guarded PostgreSQL scenarios are authored but were not run, so DB acceptance is
pending the parent-provided exact test target. The initial pre-review checkpoint
had focused tests and four workspace typecheck tasks pass, but those checks predate
the refund/time corrections below and are not evidence for the current diff.
The user selected earliest provider success time on 23 October 2026.

### Provider-time and refund-order correction (23 October 2026)

Authenticated Midtrans status confirms payment state. The notification docs
define `transaction_time` as transaction initiation; the status API exposes no
documented card `capture_time`. Thus `transaction_time` is not used as proof of
capture success. A verified card capture still credits Marks, but its KOL
decision is held at zero as unresolved, blocking later purchases from taking
first place. Non-card settlement time comes from authenticated
`settlement_time`. A confirmed full refund arriving before local success stores
REFUNDED without crediting Marks and reserves the first KOL event at zero
commission. If original success time is unavailable, the decision remains
unresolved until an authoritative provider time permits audited re-evaluation.
A late earlier callback re-evaluates by provider time and payment ID and audits
old/new state. No settled transfer is rewritten.

### Refund evidence, decision audit, and admin pagination review fixes (23 October 2026)

Webhook claims hash bounded authenticated decision evidence, so Midtrans partial
and full refunds sharing one transaction ID/status can both be evaluated, and
a later verified success time can resolve without repeating wallet effects.
Refund history is read from authenticated status lookup, not unsigned webhook
detail fields. A partial refund stores provider facts separately, preserves the
historical commission, writes audit evidence, and marks the admin decision for
manual reconciliation. If its status arrives before local success, it confirms
the original charge: the payment advances to SETTLED and saved package Marks
are credited exactly once. This does not prorate or reverse Marks for the
partial cash refund. Its authenticated cumulative amount updates one transaction
reconciliation row monotonically. A later full refund can use the existing
one-time reversal. Zero
commission decisions audit PAID/REFUNDED status changes once. Admin decisions
use bounded keyset pages by creation time and stable ID. Migration 0072 is
extended and remains unapplied. Database acceptance is authored but unrun.

Focused regressions for webhook evidence, partial/full replay, improved verified
time, cursor validation, refund snapshots, and >100-row admin pagination are
authored. The current DB-free focused run passes 140 tests / 355 expectations
across the Midtrans provider, payment service, webhook idempotency, and cursor
codec unit files. DB-backed cases are not run in this slice. The current
server build typecheck and web no-emit typecheck pass with one checker after
aligning the snapshot status type with the source payment column (the database
status constraint is retained). A direct API-project check also includes test
files and fails on test typing errors; it is not a passing acceptance gate.
Changed TypeScript formatting and whitespace checks pass; lint has warnings but
no errors. The four-workspace check and normal pre-push hook remain unrun.

Cash settlement/accounting, partial-refund proration, external transfer records,
CSV, overpayment adjustment, and settled-transfer correction/reversal adjustment
remain deferred; the existing one-time wallet Marks reversal is the only full
refund movement in this slice.

`git diff --check` is clean. PostgreSQL acceptance is authored but unrun;
migration 0072 remains unapplied. Transfer settlement, partial-refund
proration/accounting, overpayment, CSV, and settled-transfer correction/reversal
adjustments remain deferred; the existing one-time wallet reversal is in scope.

## Referral review correction checkpoint (22 October 2026)

Deadlock-safe report transaction retry, locked current-role validation and
audited solo student-no-show delivery are implemented. Migration 0071 is applied
only to test 6769/cogito-test. PostgreSQL deadlock/cap/role/replay plus helper
checks plus saved-term/no-code regressions pass 5 / 26; complete admin
booking-report regressions pass 12 / 118,
including no second charge and one fee/reward for confirmed solo delivery.
Guarded class enrollment/lifecycle/report regressions pass 44 / 354; web and
server typechecks pass after the fixes.
The read-only review against `356c352c..dfd8a2a0` closed its three original
findings with no remaining spec/behavior findings. Its P2 migration-status
documentation finding is corrected in this follow-up; the reviewer did not
rerun tests. OAuth/browser journeys, development/deployment migration, and KOL
commission/transfer implementation remain open. Main is unchanged.

## Referral parent checkpoint (historical source-only status, 22 October 2026)

AUTH-02/friend source is implemented in its feature branch. Parent-generated
additive 0071 follows 0070; this checkpoint predates its guarded test-only
application. It is now applied only to 6769/cogito-test (journal 72); development
and production remain unmigrated. Snapshot lineage and the six new tables plus
one user column are verified. Focused units pass 46 / 101; web and server
typechecks pass after parent fixes. At this checkpoint, source review and
database reward/concurrency acceptance were still open. Google/browser UAT and
KOL commission and transfer implementation remain open. This is not an
integration/release gate.
## Report PDF parent checkpoint (22 October 2026)

Placeholder-header PDF is implemented. Long metadata clipping and student-search
group semantics are repaired; dense 600-character bullet lists fit one page,
while legacy text retains continuation pages. Focused checks pass 29 / 104;
guarded non-reset PostgreSQL eligibility passes 1 / 16, covering private and
academy adapters. Web/server typechecks and full server tsdown build pass.
Three synthetic Chromium download/role/empty-state journeys pass. Final
branding/deployment and release UAT remain separate acceptance gates; broader
legacy reminders remain open.

## Classes presentation checkpoint (22 October 2026)

Implemented the searchable single-card student catalog, curriculum/enrollment
layout, published-first admin studio with retained draft tabs and grouped class
management, and accessible mobile report selection for student/tutor/admin.
Eleven synthetic Chromium cases pass at 320/390/768/1440px, including dark mode
and page overflow/focus checks. Existing role/API/financial rules remain unchanged.
Real publish/enrollment/cancellation helper navigation is updated; broad write-flow
UAT remains separate from these synthetic UI checks.


Final integrated verification: 11 Chromium cases pass in 19.5s after merging
PR #305. Full workspace typechecking and lint baseline pass. Luna Max source
review found missing tab-panel semantics in the catalog filters; these now use
pressed-state filter buttons. No other concrete finding remained in that review.

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
retained under run-scoped identities. PDF and broader legacy reminders remain open.
This acceptance supersedes older source-only/unapplied/pending-browser notes below.

## Owner priority and checkpoint workflow (22 October 2026)

The owner prioritizes all remaining core V3 work. Feature showcase/video and
Sanity Knowledge Bank/Competition Calendar migration are tertiary; do not spend
the next core implementation cycles on them. This changes execution order, not
client scope or release acceptance: any release deferral still needs explicit
client agreement under Q14.

Use one short-lived feature branch and one GitHub PR into `f/release-v3` per
independently reviewable feature. Commit meaningful changes with focused checks
and affected docs; publish a PR checkpoint before moving to the next feature.
This repository permits squash merge only, giving one integration commit per PR.
Never combine unrelated local edits or client PDF build artifacts into a feature
checkpoint. Keep `main` unchanged until final release acceptance.

Core order: finish report PDF and
remaining legacy reminders; then AUTH-02/referrals/KOL and remaining pricing,
analytics/provider/financial acceptance, core content, end-to-end UAT and release
readiness. Apply approved policy gates to dependent behavior; do not invent
ordinary-reschedule or analytics policy.

## Ongoing experience UX checkpoint (22 October 2026)

Implemented an explicit ongoing-role checkbox and stable, top-aligned date
controls in tutor Experiences. Existing `endYear: null` data is preserved;
focused synthetic browser coverage checks initial state, toggling and layout.
The section heading/info alignment is repaired and its desktop/mobile geometry
check passes. Real-account persistence acceptance remains separate.

## Compact tutor profile status checkpoint (22 October 2026)

Implemented: remove the duplicate status card, place one lifecycle badge beside
the heading and keep conditional review/action guidance plus admin feedback.
Synthetic desktop/mobile render coverage checks the published, edit-review,
revision, draft, initial-review, approved and suspended states. A standalone
public-profile link is omitted because public details currently use a drawer.
Profile saving and broader release acceptance remain separate.

## Tutor profile render checkpoint (22 October 2026)

Completed the `/profile` tax-section render repair: standalone section guidance
uses Selia `Text` instead of context-dependent `FieldDescription`. The focused
synthetic authenticated Chromium regression fails before and passes after the
fix. This checks rendering only; real-account saving and broader release
acceptance remain pending.

## UI repair checkpoint (22 October 2026)

Admin tax defaults/custom tutor rates now use percentage inputs and plain copy,
with a rupiah deduction example. API basis-point storage is unchanged. Conversion
regression and authenticated browser edit checks passed without saving rates.

Follow-up authenticated route checks are complete for the routes/states listed
in the UI audit plan. The user-reported Academy counter clipping is repaired:
prices now use an independent auto-fit grid and pass rendered text-fit checks at
390/1024/1440px. DB-backed publish, payout and tutor workflow acceptance remain
open; the local runtime is available.

Shared Selia controls and Card/Table repairs are implemented; see
[UI controls and layout audit](UI-CONTROLS-AND-LAYOUT-AUDIT.md). Source audit,
UI/web/E2E typechecks and focused component/browser checks passed. The Academy
publish test now uses the custom calendar. The DB-backed publish rerun remains
pending; authenticated route smoke coverage is recorded above. This checkpoint does
not close those release gates or the separate report worker's integration work.

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
exposed a duplicate class-card React key during list refresh. The admin page now
keeps the highest-version row per class ID across its published/postponed query
snapshots. Its focused helper regression passes 2 tests / 4 expectations in the
implementation worktree. Parent integrated `ede98094`; the root regression
passes 2 / 4 and lifecycle Chromium passes (35.1s, exit 0), with zero
duplicate-key warnings in the captured server/browser logs.
Ordinary rescheduling policy, broader V3 acceptance and previously recorded
API/web full-compiler limitations remain open.

## T07 pending-report reminder implementation (2026-10-21)

This isolated T07 reminder slice adds tutor-only reminders for ended, scheduled cohort/masterclass sessions without a report. The existing one-minute class-enrollment job queues at most 100 current-period reminders; the first is due at session end and the next after each 24 elapsed hours. Stable notification event keys plus the existing email outbox make scheduler replay/restart idempotent, with no schema migration. Report arrival and stale schedule/tutor candidates are rechecked under locks; a cancelled parent class keeps a retained past scheduled session eligible, while cancelled/completed sessions and completed classes stop. The worker does not mutate report, delivery, wallet, allocation, or tutor-fee state and does not infer delivery from no-show expiry. At this 21 October checkpoint, legacy solo/group/series report-reminder coverage remained pending; the 23 October continuation below records its implementation and verification state. Focused unit/DB verification and remaining release gates are recorded in docs/RUNBOOK.md; PDF and the dedicated on-demand admin correction workflow remain pending.

## T07 legacy on-demand missing-report reminders (2026-10-23)

This continuation adds the legacy solo/group/series reminder path to the existing
one-minute scheduler. A solo/group booking has one reminder identity; each
series child has its own. Only ended, still-scheduled items with no matching
report qualify. Whole-session cancellation, completion and no-show outcomes are
excluded, while an individual group/series participant no-show does not establish
that the remaining session was undelivered. The tutor-facing message requests a
report only when delivery occurred.

The bounded worker repeats at session end and every 24 elapsed hours and writes
only the current period after a late scheduler run. It locks the booking and
series child in completion lock order, then rechecks tutor, state, exact
schedule, report and event key before writing the notification and email outbox
row in one transaction. It changes no report, delivery, settlement, wallet or
fee state and requires no schema migration. SQL eligibility and day-period
calculation retain the full stored timestamp precision; only the pagination
cursor is normalized to milliseconds. The latest focused unit suite passes 10
tests / 44 expectations. Parent's normal pre-push typecheck passed 4/4 tasks in
14.961s (2 cached). The guarded non-reset PostgreSQL suite passed 3 tests / 32
expectations on loopback `6769/cogito-test`, including production finder
progress, report/state rechecks, duplicate-job outbox identity, exact 24-hour
boundaries, and sub-millisecond series-child precision. No migration, reset,
seed, or provider operation ran. Browser acceptance and actual email delivery
remain open; PDF export and the dedicated on-demand admin correction workflow
remain open.

### T07 reminder review follow-up (2026-10-23)

Independent PR #313 review found that a persistent notification/outbox write
failure left the oldest 100 due rows at the head of every minute's query. The
worker now advances a process-local keyset cursor after each attempted row and
wraps to retry earlier rows when later candidates are exhausted. Restart resets
the cursor to the oldest due row; event-key/outbox idempotency remains durable,
but cursor fairness is volatile and adds no migration. A focused unit regression
covers 100 persistent failures, progress to a later healthy booking, and
wraparound retry. A guarded non-reset PostgreSQL integration test now covers
report, cancellation and reschedule rechecks plus duplicate-job notification and
email outbox identity. Later precision regressions exercise the production SQL
finder and locked writer at microsecond boundaries, including a series-child
day boundary, a due-at-end row, and same-millisecond reschedule rejection.
Parent ran the guarded non-reset PostgreSQL suite against exact loopback
`127.0.0.1:6769/cogito-test`; **3 tests / 32 expectations passed**. The focused
unit suite passes 10 tests / 44 expectations, and normal pre-push typecheck
passed 4/4 tasks in 14.961s (2 cached). No migration, reset, seed, or provider
call ran. Browser acceptance and actual email delivery remain open.

Review clarification: the reviewer questioned whether the first reminder must
wait 24 hours. The accepted `RELEASE-V3-SPEC.md` and T07 task contract say the
first reminder is due at `endAt`, followed by 24-hour elapsed periods; the
exact-end / period-0 case is intentional and covered by the passing PostgreSQL
test.

## Test database reset incident and guard (2026-10-21)

`academy-class.test.ts` invoked API `resetDatabase()` against loopback
`cogito-test:6767` at about 13:17:59 UTC. Its broad truncate with `CASCADE`
ran before test setup failed on missing `tax_legal_name`. Development
`cogito-app` was read back intact and was not truncated; no test-data recovery,
restore or reseed has been verified. The source guard now denies 6767/6768 resets unconditionally;
only exact local `cogito-test:6769` and `cogito-test-payout:6770` targets may
reset with both `TEST_DATABASE_ALLOW_RESET=true` and an exact matching
`TEST_DATABASE_RESET_TARGET`. Reset-based API suites using older 6767 env files
will now fail closed. The standalone guard suite passed 6 tests / 40
expectations; no DB-backed verification was run. The non-reset T05 per-run E2E
identity flow is unchanged.

T06 core lifecycle is integrated and DB-verified; class-card refresh deduplication is integrated and passes the focused regression plus integrated Chromium. Broader release acceptance remains open. This is not
completion of all T06 policy or Release V3.

Prior T07 implementation checkpoint (21 October, before the current T06 slice): schema migration 0067,
class-session report submission/listing, immutable correction history, atomic
remaining-funded-Mark settlement, fixed tutor fee creation, genuine class identity
in payout selection, and the role-based `/class-reports` workspace are implemented.
Focused API/DB evidence, browser acceptance and typechecks are recorded in the
runbook. PDF, repeated reminders, the dedicated on-demand admin correction
workflow, visual QA and broader acceptance remain pending. Migration 0067 is now
applied to guarded development 6767; journal id 88 and SQL hash match. The API
was restarted and its health/protected report route were checked. Main is unchanged.

Prior local integration checkpoint (21 October, before T07 implementation):
f/release-v3 includes admin cancellation
446e2cd0 and student cancellation a7065443, alongside signup and payout. Migration
0066 applied through the standard runner to guarded loopback cogito-app/6767.
Dev readback: journal id 87, timestamp 1792559482042, hash
70a47d6cbd1f7539d4af45071eaf643ca99ec73c7046c033108d7e1475d54afd.
The owned API restarted; web 3000 and API 3001 return HTTP 200. No dev reset/seed
or live-provider test ran. At this baseline checkpoint T07 class reports/completion/settlement was next; lifecycle
follow-ups, AUTH-02/referrals and full release acceptance remain open. Main is unchanged.

T05 reset safety follow-up (21 October): every 6769 run now seeds a unique student identity and leaves earlier enrollment, cancellation, ledger and payment facts intact; the T05 6769 fixture path is a no-op for the shared seed student. The API broad reset helper now rejects 6767/6768 and requires explicit opt-in plus an exact configured target for 6769/6770. Guard/identity coverage passes 7 tests / 19 expectations; the exact-6769 transactional preservation regression now passes 1 test / 7 assertions. This does not complete T07.

Prior T06 whole-class cancellation checkpoint (before the current lifecycle slice): admin cancellation had preview/confirm UI and transactional
future-hold return, no withdrawal fee, protected past liabilities, receipt replay,
notifications and durable calendar deletion. Postgres 22/140 and provider fakes
46/148 pass, including expired-lease create/cancel race. Migration 0066 expands
only the meeting status check; test applied, dev pending final validation.
Web and E2E typechecks pass; two Chromium real-RPC journeys pass in 59.2s. T06 minimum/postponement,
individual admin session cancellation, rescheduling and rate settings remain open.

Prior T06 student cancellation checkpoint (before the current lifecycle slice):
the student cancellation slice was implemented with real Postgres evidence:
15 enrollment/cancellation cases / 101 assertions and web typecheck pass.
Quote/confirm is atomic and replay-safe; withdrawal stops the unpaid half and
preserves late/past funded delivery liability. Chromium acceptance passes (1 integrated journey / 1.2m), with real RPC and wallet readback; E2E typecheck passes.
Admin cancellation, minimum/postponement/rescheduling, configurable withdrawal
fee and T07 remain outstanding; this checkpoint does not complete T06 or V3.

Local dev checkpoint (21 October): f/release-v3 includes signup 3055ba54 and
payout 2482d7ec. The standard migration runner applied 0065 only after the exact
loopback cogito-app/6767 guard. Dev readback: journal id 86, timestamp 1792525224597,
hash 876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939,
and tutor_tax_config exists. The owned API was restarted; no dev reset or seed ran.
T06 cancellation and T07 completion/report remain next, and main is unchanged.

Prior parent checkpoint (before the current T06/T07 implementation work):
signup is integrated at 3055ba54. T03 now passes
11 Postgres tests / 105 assertions, 11 tax/profile/target units / 32 assertions,
7 payout service cases / 13 assertions, and 3 Chromium payout UI journeys (1.3m).
E2E typecheck passes. Browser payout RPCs are mocked; actual financial behavior
is covered by the Postgres suite. Broad compiler acceptance and OPS01 remain open.
The parent is implementing directly; the earlier three-worker description is historical.
T06/T07, AUTH-02, referrals and complete release acceptance remain outstanding.

Final parent web typecheck could not complete: Windows VirtualAlloc errno 1455 (virtual memory exhausted); no successful final compiler result is claimed.

Date: 19 October 2026. Status: **T00A catalog CRUD/palette and T01 dynamic draft rates are implemented with focused isolated-DB and browser evidence; the non-video T11 landing slice is in progress; customer activation and full release acceptance remain pending**. Specs: [PRD](RELEASE-V3-PRD.md), [SPEC](RELEASE-V3-SPEC.md), [decisions](../../client/RELEASE-V3-DECISIONS.md), [audit](../../client/RELEASE-V3-AUDIT.md).

## Execution priority — 21 October 2026

Parent AUTH-01 follow-up: actual DB checks pass 15 / 73, path and reset safety
checks pass 19 / 69, and both Edge signup/recovery journeys pass (1.4m).
This closes the previously unrun final browser/DB regressions; AUTH-02 and
referral economics remain separate unfinished work.

Enrollment source and direct parent fixes are integrated through `bd123ce4`.
The integrated root Chromium journey passes (1 spec / 1.6m), complementing the
9 Postgres cases / 69 expectations and the parent web typecheck. Local dev
3000/3001 is healthy. Signup/payout integration, T06/T07 and full acceptance
remain open; do not treat this checkpoint as completion of Release V3.

Parent T05 verification follow-up: web typecheck passes after resolving the
Drizzle link mismatch and source type errors. The guarded enrollment Postgres
suite passes 9 tests / 69 expectations, including expiry after DB waits and
started-session checkout rejection; pure pricing/funding/public DTO checks pass
12 / 37. These checks supplement the author's prior Chromium journey. Broader
T06/T07 and final release acceptance remain open.

The owner prioritizes booking and core app flows over content migration. The
three active implementation workers cover enrollment/booking (T05), signup
proof and security (T08/AUTH-01), and tutor tax/payout (T03). Follow enrollment
with its cancellation, completion/report, and settlement integration; serialize
heavy database/browser/compiler checks and migration generation. Knowledge Bank
and Competition Calendar migration (T12) is tertiary: a read-only Sanity inventory
found 63 published competitions, 3 resources with file references, and 8 related
categories, but no destination import or cutover has run. Resume T12 after core
app work; this priority does not remove its release acceptance requirements.

## Integration checkpoint — 20 October 2026

21 October schema update: `385fc959` integrates enrollment schema `2f9786d0`.
Parent reviewed additive `0064`, confirmed previous snapshot tables unchanged,
applied it to guarded local dev, and verified four tables plus its journal
hash/timestamp. T05 service/UI/DB/browser acceptance remains in progress;
payout idx65 generation is now allowed from this lineage. No test DB reset or
migration was performed in this checkpoint.

- Baseline `10a733cd` is now fast-forwarded into `f/release-v3`. The prior
  dirty source is retained in the named `v3 pre-integration source backup
20261020` stash. Dev web and API health return HTTP 200 on ports 3000/3001.
  Public-read commit `0a0ce408` fixes class-router wiring, the detail route ID
  and the repository-factory call. Web typecheck and the public DTO allowlist
  unit test pass. Publish and its review fixes are integrated through
  `42e8358f`/`b353cb1d`; author class browser, 9 Postgres cases / 51
  expectations and typechecks pass. Parent room/tutor checks pass 113 cases;
  the full API unit suite passes 2,486 cases / 5,845 expectations. Enrollment
  and downstream class flows remain open. Migration `0063` is applied to dev
  and class test, with parent dev hash/table readback verified.
  Settlement through `de76a5b9` is merged. Independent integration-branch checks
  pass: 375 core unit tests / 949 expectations, 7 no-show Postgres tests / 69
  expectations, and web typecheck. Those database writes target only
  `cogito-test-settlement`; browser settlement coverage remains open. Heavy
  compiler/browser runs are serialized after virtual-memory allocation failures.
- Commit `22c5ffb3` integrates the existing B fee/payout and class-draft work,
  its dirty source changes, and A's FAQ rich-text, calendar, palette and
  documentation changes. The migration journal/snapshot chain keeps both
  existing `0059` SQL files and their applied timestamps/hashes intact. Routes
  were regenerated after combining the competing route changes.
- Parent readback confirms the local dev and test journals now share all four
  migration hashes and both schemas contain FAQ, fee, payout, class and
  class-session tables. Parent applied only the class-draft migration to local
  dev; no test database write, reset, or data-history rewrite occurred in this
  checkpoint. See [RUNBOOK](../../RUNBOOK.md#v3-local-integration-database-state-2026-10-20).
- Cherry-picked E2E guard commit `ad290158` from `2e424c4e`. Parent reports its
  focused guard checks passed (7 tests / 32 expectations) and E2E typecheck
  passed. `29` FAQ/calendar/color/fee unit tests passed with `48` expectations;
  route generation found 39 route files; `git diff --check` passed. No class
  DB integration or browser E2E was run here because its setup resets/seeds the
  shared `cogito-test` database. Full web typecheck/build remain unverified for
  this integration checkpoint.
- Client TeX/PDF/font and generated output artifacts from A were excluded from
  the import and remain preserved in the source checkout. Both source
  worktrees remain untouched. This checkpoint is not the full V3 release or
  client acceptance.

## Implementation evidence — 18–19 October 2026

### T00A catalog browser checkpoint

- Local admin browser QA passed at 1280×900 and 390×844: create an English
  parent with optional Indonesian name and four opaque OKLCH values; create a
  child with no palette inputs; update one parent color and verify the child
  inherits the new value. New unpriced entries remain drafts, and delete shows
  a zero-reference impact preview before the unused child/parent can be removed.
- Mobile QA found the catalog grid expanding past its container; the grid now
  uses a constrained single-column track below desktop. Recheck confirmed the
  card fits 390 px in light and dark themes with no horizontal document
  overflow. Browser console had no errors. Temporary QA rows were deleted via
  the audited flow; their audit history remains by design.
- This is a UI smoke slice, not full T00A acceptance. The guarded Postgres
  catalog suite now covers delete-first assignment, both booking/archive JSON
  orderings, and stale concurrent admin edits (evidence below). The focused
  Chromium journey in `packages/e2e/src/specs/competition-catalog.spec.ts`
  passes child-slug search, archive impact preview and
  confirmation, restore confirmation, and moving an unused specialization
  while checking the inherited destination palette. The browser test exposed
  child-only search results disappearing from the parent-grouped tree; the
  admin catalog now retains the matching child's parent as context. Full app
  regression and marketing-site projections remain open.
- The calendar consumer now builds its filter from categories on loaded events,
  using parent slugs as keys and English category names as labels with legacy
  fallbacks. New slugs default to selected after refresh while explicit
  exclusions persist; uncategorized events stay visible without an active
  filter, and Reset restores all current options. Focused utility coverage is
  added: 17 calendar utility tests pass, as do the web typecheck, changed-file
  lint/format checks and `git diff --check`. Browser QA remains pending because
  no local app/browser session was available.
- `bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/competition-catalog.test.ts`
  passed **6 tests/72 expectations**. Row-lock gates verified that deletion
  commits before a queued tutor assignment (which then fails selection
  validation), booking-first archive impact sees the persisted session topic,
  archive-first booking fails with `BOOKING_NOT_EDITABLE`, and only the first
  stale concurrent admin edit commits/audits. No service fix was needed.
- Sequentially, `bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/v3-dynamic-competition.test.ts`
  passed **1 test/5 expectations** and confirmed draft-rate save leaves the V3
  activation pointer null. Both suites reset only guarded `cogito-test`.

### T11 non-video landing checkpoint — 19 October 2026

- The landing page no longer renders the Activities section. Activities links
  and the Start Learning CTA were removed from desktop and mobile navigation;
  existing `/events/[category]` pages still build and remain reachable pending
  the T10 URL/content mapping.
- Per owner request on 19 October, the hero LogoCloud was reverted to its
  pre-change implementation. The manually controlled horizontal strip and its
  previous/next, keyboard and touch interactions are not part of the current
  landing page.
- Per owner request on 19 October, the testimonials section and its dedicated
  Carousel implementation were also restored to their pre-change versions. The
  responsive single-carousel/autoplay/swipe changes are not part of the current
  landing page. The reduced-motion pulse on the methods card remains.
- Earlier typecheck/build and headless Edge checks passed on the prior T11 UI;
  they do not verify the restored logo and testimonial sections. The dev server
  is running for owner review; rerun final checks after the desired direction is
  selected. Mobile menus were checked in `/en` and `/id` before the reverts.
  Physical-device, screen-reader and client visual acceptance remain pending.
- Requested Why Cogito spacing/polish and the approved feature showcase remain
  open; the showcase depends on M02/Q14. This checkpoint does not complete T11
  or authorize release.

### Checkout and booking checkpoint

- Separate nullable activation pointer and migration 0055 implemented; no
  activation UI/RPC and no production activation. Draft configuration is separate.
- Durable owned 15-minute quotes, explicit custom/recommended choice, immutable
  payment terms, commit-before-provider and uncertainty recovery are implemented.
  Legacy inactive checkout remains compatible; resume uses stored IDR amount.
- Booking snapshot union, exact historical V3 repricing, server category pricing
  for solo/group/solo-series and V3 honorarium reads are implemented. Discovery
  and booking previews now use active rates by parent slug; a new unconfigured
  slug cannot fall back to legacy tutor base rates. Active V3 group-series prices
  at target size and pins the revision; viable partial groups recalculate from
  that revision at confirmed headcount, updating participant package holds and
  booking/scheduled-session snapshots before reconfirmation. Activation-null
  legacy group-series and target-size-one solo-series remain unchanged.
- Latest targeted verification: **487 unit tests, 0 failures, 1,391
  expectations** across seven files; **14 PostgreSQL integration tests, 0
  failures, 93 expectations** across economy roles, catalog CRUD, top-up and
  dynamic-parent admin. Web typecheck and web build pass. Balance UI browser QA
  remains pending.
- T01/T02 remain incomplete: analytics interpretation, website catalog
  projection/cutover, payment/provider
  acceptance and pricing activation remain required. Tutor fee projection and
  legacy-rate guards are implemented in the checkpoint below. Do not activate.

### Admin analytics correction — 18 October 2026

- Admin analytics no longer sums parent booking Marks/IDR/platform take as one
  financial measure. Solo/group/series records have different package and
  per-session units, group-series parent Marks cover the proposer, and V3 does
  not snapshot total service IDR/platform take. The endpoint now returns
  selected-period booking counts by V3, legacy, other, or missing snapshot.
- The dashboard's net top-up revenue remains sourced from successful payment
  rows less refunds. No current Marks rate is used to estimate V3 IDR.
- Q15 is open in the decision register for any future booked-service totals:
  population and status basis, group participant scope, date basis, and whether
  V3 should show Marks only. This safe count view does not resolve those choices.
- Added guarded PostgreSQL coverage with V3, known legacy, missing, unknown
  future-engine, and malformed empty snapshots; the test asserts every bucket
  plus the total booking count. The guarded analytics suite passes
  **1 test/5 expectations**. The full API unit command
  `bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/unit`
  passes **2,455 tests/5,727 expectations**. Web typecheck/build and server build
  pass; scoped oxlint has no errors and oxfmt/diff checks pass. No migration,
  activation-pointer write, or provider operation was made. Browser visual
  verification still requires an available browser surface.

- Luna executors stopped at account usage limit; root stabilized their checkpoint.
  The requested Sol coordinator never initialized. No commit/push/deploy performed.

- Project owner authorized starting V3. This does not resolve open commercial
  decisions or confirm acceptance of the proposed price/date options.
- App baseline `14dc4486` equals freshly fetched `origin/main`; implementation
  branch `f/release-v3`. Pre-existing video/setup/docs changes were preserved.
- T01 started: pure default session/top-up calculators in
  `packages/api/src/modules/pricing/v3-rate-card.ts`, exported from the module.
  Canonical competition slugs match migration 0029. All seven competitions ×
  two modes × six headcounts have literal golden Marks/fee tables. Top-up tests
  cover package exceptions, tier edges, advisory recommendation including equality,
  invalid inputs and safe-integer overflow. No live price activation yet.
- `bun test packages/api/src/tests/unit/v3-rate-card.test.ts packages/api/src/tests/unit/pricing.service.test.ts`:
  **132 passed, 0 failed, 536 expectations**. Changed TypeScript files pass oxlint
  and oxfmt. Runtime is local Bun 1.4.0-canary.1; repository pins 1.3.14.
- Remaining T01: persisted/versioned configuration, admin preview/edit, tutor
  read-only rates, discovery/booking snapshot wiring, quote/purchase persistence,
  Midtrans replay/compatibility and migrations. Q13 is now resolved for editable tiers
  and custom/recommended choice; the implementation update below supersedes this initial groundwork checkpoint.
- Full package `tsc --noEmit --composite false --incremental false` fails with
  diagnostics in existing test fixtures/helpers (e.g. test-client.ts generic
  arguments, nullable integration results, wallet fixture shapes). This is not
  a green package typecheck; baseline diagnostic equivalence was not measured.
  New calculator/test files pass a narrow typecheck extending the repository base config (tmp/v3-pricing-tsconfig.json).
- No production database, website cutover, live provider operation or deployment
  was performed. No task is marked fully complete from arithmetic tests alone.

## How to develop from this package

### V3 branch workflow

`f/release-v3` is the v3 integration branch. Create a short-lived branch from its latest commit for each independently reviewable development slice, then merge it back by PR after focused tests and affected documentation are updated. Keep `main` as the production baseline; merge `f/release-v3` into `main` by PR only after the v3 acceptance and release gates pass. Do not base v3 feature branches directly on `main` unless explicitly coordinating a production hotfix.

### Report validation slice — 18 October

REQ-REPORT-01 implemented for current solo/group/series report input: shared
normalization + 600-code-point aggregate limits, UI counters and submit gating,
server schema/direct-service rejection before settlement, no silent truncation.
295 focused report/booking tests pass (717 expectations) and web typecheck passes.
Browser QA verified the three per-field counters and submit gating at exact 600
and over-limit 601 code points; no report was submitted. No report migration or
historical read constraint was introduced. T07 remains incomplete: PDF, reminders,
admin correction and cohort completion depend on the remaining contracts.

### Follow-on implementation evidence — 18 October

- Q13 closed by direct owner reply: keep custom and recommended choices;
  tier thresholds follow package Marks/unit prices + surcharge. Configuration
  validation, custom arithmetic (rational unit prices rounded once to whole IDR),
  immutable draft revision schema/repository, transaction lock/CAS/audit, admin
  get/preview/save procedures and Selia editor/preview are implemented.
- Migration 0054 was applied only to isolated `cogito-test`; production and
  development databases were not migrated. Existing active economy and all
  customer booking/payment callers remain on legacy pricing.
- Five focused unit files: **187 pass, 0 fail, 648 expectations**. Web typecheck
  passes with `GOMAXPROCS=2 GOMEMLIMIT=768MiB`; default parallel run hit Windows OOM.
- Added real-Postgres race/immutable-history/audit-rollback cases in
  `economy-roles.test.ts` and new-table cleanup in the safe test reset helper.
  The isolated Postgres suite passed **7 tests, 26 expectations**, including
  single-winner CAS, immutable prior revision, audit rollback, unchanged legacy
  active pricing and role denial.
- Browser QA passed: admin draft load/save/reload, missing-reason and invalid-rate
  save gating, stale-version conflict recovery, custom 440 Marks equality with the
  500-Mark recommendation, and 390px mobile card fit with internal table scrolling.
  Report UI exact 600 enables completion while 601 is rejected and retained.
  Screenshots: `tmp/v3-admin-440.png`, `tmp/v3-admin-mobile-fixed.png`,
  `tmp/v3-report-600.png`, `tmp/v3-report-601.png`.
- The earlier Docker-unavailable/browser-pending checkpoint is superseded by this
  verification. Do not activate V3 customer pricing before persisted booking and
  payment snapshots, transactional checkout and remaining acceptance cases pass.
- At this checkpoint, remaining T01: saved pricing activation/version pointer,
  discovery/booking snapshots and quote/custom purchase integration with
  authoritative Midtrans credit/replay tests. The tutor projection/guard status
  is recorded in the following checkpoint.

### Tutor fee projection and legacy-rate guard — 18 October

- Tutor profile reads return `v3FeeProjection: null` while the activation pointer
  is unset. An active revision projects online/offline IDR fees for headcounts
  1–6 for each assigned parent competition; the English profile editor shows
  these tables read-only and omits legacy base-rate writes.
- With V3 active, changed `baseRatesIdr` and legacy `prices` inputs fail with
  `INVALID_TUTOR_PRICING`; unchanged legacy values from stale clients are ignored.
  With a null pointer, legacy base-rate updates continue to validate and persist.
  Review submission reads the active pointer in its status-update transaction:
  active V3 does not require legacy rates, while null activation retains the
  legacy requirement. The English form skips legacy fee validation when V3 rates
  are projected. Admin `approve_edits` discards stale queued `baseRatesIdr` even
  when approving unrelated profile edits, covered by its focused service test.
- Focused tutor/admin service tests: **136 pass, 0 fail, 212 expectations**.
  No schema change, migration, activation-pointer write, production operation or
  commit/push was made. Browser review of the active profile table remains open.
- T01 group-series slice: active creation prices at target N and pins the
  revision; partial groups reprice at confirmed N from that revision and adjust
  each survivor's remaining scheduled-session hold plus booking/session
  snapshots before reconfirmation. Increased holds are preflighted before writes.
  Focused booking service tests: **303 pass, 0 fail, 755 expectations**. The
  guarded group-series integration suite passes **9 tests, 0 fail, 55
  expectations**, including a scheduled-session-only repository update check.
  Neither suite sets the activation pointer; no production database, commit or
  push was touched.
- T01 still requires analytics interpretation, website projection/cutover,
  provider acceptance and release activation gates. The active profile table
  still needs browser review.
- Verification refresh, 18 October: the combined focused V3 unit run passes
  **642 tests, 0 failures, 1,667 expectations across 10 files**. The guarded
  group-series integration suite passes **9 tests, 0 failures, 55 expectations**.
  The narrow pricing TypeScript check and web typecheck pass. The full API
  package typecheck remains unverified because test-fixture diagnostics remain
  outside that narrow project; no activation pointer was written.

SDD here means **spec-driven development**: requirement -> decision -> design/contract -> small implementation slice -> acceptance evidence. It does not mean a particular installed framework or permission to implement every proposal without review.

Before a slice: read linked REQ/Q IDs and callers; resolve its commercial blockers; freeze its narrow API/data/state choices. Implement one end-to-end slice with migrations, server validation, UI, notification and appropriate tests. Review money/permission failure paths, update the affected existing docs and record PR/commit/test evidence. A checkbox becomes done only with evidence. Do not start by scaffolding every proposed module, creating generic workflow engines or rewriting legacy booking.

Plan lifecycle follows repository policy: active one-shot plans are removed when their work is completed/merged, and permanent behavior/decisions live in merged PR plus CONTEXT/API-REFERENCE/MODULE-REFERENCE/RUNBOOK. This package remains active until its tracked scope is finished or explicitly replaced. No branch/commit/PR was created in the audit turn.

### Series no-show settlement follow-on — 20 October

- Series no-show charges are keyed by participant and child session. Repeating
  the no-show is rejected, and a later submitted delivery report skips that
  already-charged allocation while preserving Marks held for future sessions.
  Group attendees without a no-show marker still settle their session share.
- No-show alone does not earn a tutor fee; the completion report, fee event,
  deduction/hold updates, and child completion remain transactional. Missing or
  invalid V3 `tutorHonorariumIdr` is rejected before money writes; explicit zero
  remains valid. Existing on-demand cancellation/no-show behavior is unchanged.
- Student and admin per-session cancellation now share the booking reschedule
  advisory lock and lock/refetch booking, child, and participant rows in order.
  Cancellation only transitions a scheduled child; if completion wins, the
  stale cancel cannot move wallet/holds or overwrite the delivered report.
  Admin cancellation recomputes the parent hold from remaining confirmed
  participants only (the solo proposer or all confirmed group-series seats;
  pending invitees are excluded). Series completion treats cancelled children
  as settled and releases residual holds once every child is completed/cancelled.
- The initial real-Postgres suite passed twice (**6 tests / 56 expectations per
  run**). Review follow-up now passes **7 tests / 69 expectations**, including
  full-series completion after no-show and a lock-gated cancellation/completion
  race. Booking/admin service and repo unit suites pass **447/447 tests / 1,153
  expectations**; admin U6 passes **7/7 / 70**, student M4 **1/1 / 4**, and
  series lifecycle G18 **8/8 / 29**. U6 covers solo release, forfeit, partial
  release, and group-series release followed by completion, asserting wallet,
  participant, booking holds, and terminal parent state. All Postgres checks
  used local `cogito-test-settlement` on loopback port 6767 with the manual
  meeting adapter; no external provider was called. Browser E2E and TypeScript
  checks were not run for this follow-up. T02 remains in progress for class
  report/expiry integration and broader release acceptance.

## Dependency graph

```
T00 decisions + baseline
  -> T00A competition catalog -> T01 dynamic economy/payment -> T02 shared session fees -> T03 tax/payout
                         -> T04 classes -> T05 enrollment -> T06 cancellation/exceptions
T02 + T04/05 -> T07 reports
T01 + T02 -> T08 signup -> T09 friend/KOL
T04 + T05 public data -> T10 Activities/tutors/FAQ -> T11 landing
T10 -> T12 KB/calendar cutover (last)
all relevant slices -> T13 integrated acceptance -> T14 release
```

Some work is independent: branding input, schema design review, English content form behavior, rate math tests, inventory and public privacy tests can start while decisions are pending. A dependency arrow denotes readiness of the integration contract, not mandatory completion of every UI detail in the preceding slice.

### Updated next-work order — parent/child CRUD addition

Owner clarification S05 adds REQ-COMP-07 to T00A: four configurable parent
colors, inherited by children, validated/audited, backfilled from current tokens
and previewed in both themes. Include schema/API/admin form, projected palettes,
tutor/discovery chips and calendar/booking appearance in consumer integration.
No financial snapshot rewriting or new-root color heuristic is permitted.

Keep already verified quote/payment/report work. Before continuing customer
pricing activation: (1) inventory all catalog/slug consumers and references;
(2) additive catalog/localization/version migration and legacy fixtures;
(3) transactional CRUD/impact/archive/delete API with hierarchy/permission/race
tests; (4) Selia admin tree/forms and API-backed tutor selection; (5) dynamic
parent rate-card revisions plus legacy slug adapter; (6) discovery, booking
preview/server, tutor rate guards and class/website projections; (7) pinned
booking/group-series/analytics acceptance and cross-app QA; then resume T02+
and release gates. Pricing math/payment tests can continue independently, but
no customer activation bypasses catalog integration. Do not rebuild completed
work or change quotation/dates merely because the dependency order changed.

## Work breakdown

| Task / initial status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Requirements                                                   | Concrete deliverable and acceptance evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Decisions/dependencies                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T00A / IN PROGRESS: catalog API/guards, 0056/0057 test-DB migrations, focused CRUD suite and app consumer/admin UI integration implemented; focused browser journeys passed; website cutover pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | REQ-COMP-01..07                                                | Reuse the parent/child catalog; stable IDs/slugs, English/optional Indonesian fields, four parent theme colors inherited by children, hierarchy/version constraints; admin CRUD, impact preview, archive/restore and safe unused delete/move; audited transactional writes. Postgres verifies all 14 legacy palette rows, assignment removal still blocks move/delete, both assignment/delete orderings, both booking/archive JSON orderings with impact snapshots, stale concurrent admin-edit conflict, admin denial and audit rollback. Basic parent/child/color-inheritance/delete-preview browser flows passed at desktop and 390 px mobile after fixing grid overflow. A focused Chromium journey now covers child-slug search, archive preview/confirmation, restore confirmation, and moving an unused child with inherited destination palette. Direct child search retains its parent as tree context. Full app regression and all consumers remain open; marketing-site calendar/tutor projections remain downstream T10/T12 release gates.                                                                        | After T00 inventory; before remaining T01 dynamic pricing, T04 classification and T10 public catalog consumers; no new client policy question required for basic CRUD                                                                                      |
| T00 / IN PROGRESS: audit/package done; core owner policies resolved, with Q04 partial and Q14/Q15 open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | All                                                            | Record decision source/status, resolve remaining Q04 ordinary-reschedule and Q14/Q15 gates, then deliver M01/M02; verify both remote baselines before actual implementation; inventory pending payments/wallet/legacy payouts/report lengths in authorized environment. Separate verified data from assumptions. Size slices after answers; checkpoint launch feasibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Q04 ordinary reschedules, Q14/Q15, M01/M02; no global implementation block                                                                                                                                                                                 |
| T01 / IN PROGRESS: versioned rate card, dynamic parent editor, discovery/booking reads, tutor fee projection and legacy-rate guards implemented; active group-series pricing implemented; analytics, provider acceptance and activation remain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | REQ-ECON-01..04, REQ-PAY-01..02, REQ-WALLET-01                 | Versioned competition rate card/admin preview; dynamic active rates flow into discovery, tutor fee tables, new booking snapshots and pinned-revision repricing; quote/custom top-up + Midtrans purchase with amount/Marks snapshots. Golden matrices and package/surcharge boundary tests. Active group-series prices at target headcount, pins the revision and reprices viable partial groups at confirmed N, adjusting participant holds and booking/scheduled-session snapshots before reconfirmation. Remaining acceptance includes analytics fields, provider replay/credit and activation gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Q13 RESOLVED; T00A dynamic catalog integration is implemented; website cutover and final activation acceptance remain downstream                                                                                                                           |
| T02 / IN PROGRESS: atomic earned-fee events, payout-summary visibility, source-level legacy dedup, and per-session allocations for new manual tutor payouts implemented; series booking reports are one-time; session-scoped no-show ledger entries prevent duplicate charges and future-hold consumption on later report completion; malformed V3 honoraria fail before settlement writes; student/admin cancellation uses the same booking reschedule lock and conditional scheduled-child transition; latest settlement suite passes 7 Postgres cases / 69 expectations, service/repo units 447/447 tests / 1,153 expectations, admin U6 7/7 / 70, student M4 1/1 / 4, and G18 8/8 / 29; admin cancellation reconciles the parent hold from confirmed participants only and series completion finalizes after completed/cancelled children; class report/expiry integration remains open; completed-source cutoff and two-admin duplicate-batch behavior are tested; owner waived historical partial-series reconciliation for this release because V3 is not yet in use; no backfill or deletion was performed | REQ-REPORT-02, REQ-PAYOUT-01, REQ-AUDIT-01                     | Minimal delivery identity and per-session earned-fee contract, legacy solo/group/series adapter, stable event IDs, and payout summaries that read fee facts without legacy double counting. Prove a completed child is visible before its parent finishes. G16 covers cutoff behavior for completed sources; owner confirms no historical pre-0059 reconciliation or backfill is required because V3 is not yet in use; integrate the approved class fee-after-delivery/report gate with T04/T07 report and expiry flows; AC-T02 two-admin no-duplicate-batch behavior is covered; pending session sources and new paid-batch allocations are visible in admin details; historical paid batches remain aggregate and unbackfilled.                                                                                                                                                                                                                                                                                                                                                                                            | T01 snapshot contract; Q03/Q06/Q07 resolved 19 Oct; Q04 minimum/postponement rules partially resolved; Q05 both modes/room/fee parity resolved; historical per-session reconciliation waived for unused V3; Q08 batch/mismatch/void policy resolved 20 Oct |
| T03 / IMPLEMENTED: integrated, local dev migration 0065 applied; OPS01 pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | REQ-TAX-01, REQ-PAYOUT-01..03, REQ-ACCESS-01                   | Selected-session tax preview/prepare, exact-net transfer replay, void/reconciliation, allocation-aware legacy cutoffs, tutor finance and CSV. Parent Postgres 11/105, focused units 11/32, service 7/13, browser 3/3 (UI RPCs mocked). Current combined source web typecheck passes. Dev 0065 hash verified; no historical backfill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | OPS01 tax-adviser confirmation; integrated financial acceptance                                                                                                                                                                                            |
| T04 / IN PROGRESS: audited drafts, publish validation, durable Meet retry, admin controls, and published-only public reads implemented; API race suite passes 9 tests/51 expectations, meeting-provider units pass 42/146, and the admin-to-student browser journey passes 1 Chromium spec including accepted-event/pending-link retry; T05 enrollment, T06 cancellation, and T07 settlement backend are integrated; absence/expiry acceptance, T07 PDF DB/browser/deployment acceptance, T02 fee integration, and approved M01 content remain open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | REQ-CLASS-01..05, REQ-LANG-01                                  | Class/session draft/publish/admin pages, per-session tutor/fee/Meet, absence and minimum check. Published class catalog/detail read model; English required/Indonesian optional in shared website content admin. Publish retry meeting-once and authorized tutor assignment tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | T00A for classification; Q04 minimum/postponement accepted (ordinary reschedules open); Q05 both modes, existing rooms and same flat fees resolved; class-cover/curriculum M01; basic content shell independent                                            |
| T05 / IN REVIEW: enrollment service, student UI, scheduler, migration 0064, DB and Chromium journeys implemented; pricing/funding 11/36, DB 7/64 and DTO 1/1 prior evidence; the focused E2E passed before identity isolation and needs rerun. Per-run T05 student identity preserves prior financial history; guard/identity tests 7/19 pass. Exact-6769 rollback regression authored but not run; no DB reset, browser E2E or typecheck in this slice; parent review pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | REQ-ENROLL-01..04, REQ-PAY-02                                  | Plan quote, atomic seat allocation/hold, 15m reservation, installments/due/reminder/default, late join/rejoin. Raw API duplicate/last-seat tests against Postgres. Paid-after-expiry returns credited wallet but no promised enrollment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | T01/T04; Q01/Q02 policy resolved 20 Oct                                                                                                                                                                                                                    |
| T06 / IN PROGRESS: core lifecycle integrated and DB-verified; class-card refresh deduplication integrated and unit/browser-verified; broader release gates remain open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | REQ-CANCEL-01..03, REQ-CLASS-04, REQ-ACCESS-01                 | Admin future-session cancellation uses version/hash/reason/idempotency and returns only the target unspent funded Marks at zero fee; delivered fees/reports and original snapshots remain. Minimum counts unique paid full/half students, continues or postpones once, enforces strictly-after-72h replacements and inclusive free exit, preserves rates/funding and updates unpaid dueAt/reminders. Postponed classes stay visible to existing students; new enrollments are blocked. Meeting updates target the saved event ID, retry transient failures, durably requeue stale lease results and persist a creation generation for 404/410 recreation. Latest focused evidence: provider 52/196, cancellation 8/16, guard 6/40; cached format/lint exit 0. Parent refreshed non-reset Postgres evidence: 41/319, exit 0; migrations 0068/0069 applied to dev without reset or seed. First integrated browser run passed 2 journeys; lifecycle login and exact-locator corrections passed the focused lifecycle rerun (1 Chromium test, 32.4s); web/E2E typechecks passed. Follow-up source fix deduplicates the admin published/postponed query snapshots by ID, retaining the highest class version; focused helper regression passes 2 tests / 4 expectations, with no integrated Chromium rerun in this worktree. Migration 0069 SQL hash: A6A442562692E34CEA132CBD4BB20DE6561906FB45AD9441ADD19DBF8B8C2617. Ordinary rescheduling is out of scope. | T05/T02; Q04 ordinary rescheduling remains open; dev through 0069, journal id 90; lifecycle browser acceptance passed; query-overlap unit regression passed; integrated rerun pending                                                                                                                               |
| T07 / IN PROGRESS: report, correction, settlement, private PDF and class/legacy reminder source integrated through #305/#310/#313; combined PostgreSQL and synthetic UI checks pass; real email/provider, final branding and release UAT remain open | REQ-REPORT-01..04 | Versioned tutor/admin reports and audited corrections, student entitlement, private PDF export, settlement and recurring missing-report reminders are implemented. Combined DB regressions pass 34 / 365 and synthetic browser cases 14 / 14; see current checkpoint for scope. | T01/T02/T04/T05/T06; Q06/Q07 resolved |
| T08 / IN PROGRESS: AUTH-01 and AUTH-02 source integrated; real Google referral choice/save/resume acceptance remains | REQ-AUTH-01..02, REQ-ACCESS-01 | Pre-account email OTP, cooldown/proof-before-delivery, atomic account/session/proof/outcome commit, recovery and path/CSRF guards are implemented. Google new-student pending-choice save/resume is integrated through #309; existing-account reuse preserves attribution. Prior AUTH-01 DB 15/73 and browser 2/2 evidence remains scoped; real AUTH-02 Google browser acceptance is pending. | T09 registration contract; provider/browser acceptance |
| T09 / IN PROGRESS: friend choice/reward/UI and KOL first-IDR-top-up decision/admin read source implemented; KOL settlement/admin/CSV source implemented; parent 0073 DB/browser acceptance remains open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | REQ-FRIEND-01..03, REQ-KOL-01..03                              | Friend code choice, signup reward snapshot, first chargeable completion decision/cap, student referral UI, settings history, and KOL campaign-code/term validation snapshots are implemented. The KOL decision uses saved terms, server purchase base price, earliest verified provider time and audited late-earlier corrections. Current fixes distinguish partial/full Midtrans refund evidence, preserve partial-refund history for manual reconciliation, audit zero-decision status changes, and paginate the admin read. Migration 0072 is applied only to test 6769/cogito-test; KOL PostgreSQL acceptance passes 15 / 180. Dev/production migration and real browser/provider acceptance remain pending. Transfer settlement, overpayment history, reasoned obligation adjustments and monthly current reconciliation CSV are source-implemented; 0073 and parent DB/browser acceptance remain pending. Partial-refund proration and transfer-edit/reallocation policy remain undefined.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | T08/T01/T02; Q09-Q12 policy resolved 20 Oct; Q06 reward eligibility resolved 19 Oct                                                                                                                                                                        |
| T10 / IN PROGRESS: public tutor API/site consumer and FAQ APIs implemented; FAQ admin editor and marketing full/landing consumer implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | REQ-CONTENT-01..02, REQ-FAQ-01, REQ-LANG-01..02, REQ-ACCESS-01 | Published-only tutor allowlist and app catalog projection; marketing list/landing use the no-store DTO with Online/Offline filters (`both` matches either), active parent-category filters, inherited palette badges, Indonesian category-name fallback, and unavailable/error state without Sanity fallback. FAQ database, anonymous full/landing reads, EN-required/ID-optional admin CRUD, English app chrome, localization fallback, version-checked updates and strict marketing server adapter implemented. FAQ and tutor API-adapter/filter tests, rich public FAQ rendering with legacy fallback, API/browser checks, app build/typecheck, and marketing build/typecheck pass; see T10 FAQ and public tutor checkpoints. Activities/Other content, approved initial FAQ copy, app tutor-roster reconciliation, tutor browser acceptance and full release acceptance remain open.                                                                                                                                                                                                                                      | T00A for catalog projections; T04/T05 and approved FAQ/Other content M01; tutor modality behavior follows the currently agreed app structure; public DTO and FAQ CRUD were independent                                                                     |
| T11 / IN PROGRESS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | REQ-LANDING-01..02                                             | Landing Activities/Start Learning removed; hero LogoCloud and testimonials section restored to their pre-change implementations per owner request; reduced-motion pulse remains. Why Cogito spacing is refined to 16px label-to-heading and 32px heading-to-cards; earlier headless checks covered the prior landing state, not these reverts. Owner review of restored sections, physical-device/screen-reader checks and client visual acceptance remain; the approved showcase brief is gated on M02/Q14. Rerun final browser/build checks after the desired logo/testimonial direction is selected. No full redesign.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | T10 where data used, M02/Q14 for video; non-video polish independent                                                                                                                                                                                       |
| T12 / TODO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | REQ-CONTENT-03, REQ-CALENDAR-01                                | Inventory/export/mapping/import or re-entry, KB and calendar admin/DB/API, same event/date dedupe, preserve multi-day distinct events/locales/files/access/redirect. Counts+link/access comparison and rollback rehearsal before final Sanity removal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | T10, actual content inventory; runs last, not assumed trivial                                                                                                                                                                                              |
| T13 / TODO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | All plus success criteria PRD §10                              | Real DB integration, browser journeys, security/role tests, old on-demand regression, notification recovery, migration/rollback, provider sandbox tests and authorized live smoke, report visual QA, approved English content. Client UAT evidence with named approver and exception list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Qs closed for shipped paths, M inputs/approved deferrals, all relevant slices                                                                                                                                                                              |
| T14 / TODO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Release readiness                                              | Backup/restore readiness, deploy-compatible schema/API/app/website order, pricing activation, payment webhook/Meet/email smoke, financial reconciliation, launch approval and monitoring/rollback owner. Document exact deployed SHAs and known deferred items.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | T13, Q14, OPS01                                                                                                                                                                                                                                            |

## T07 private report PDF CI follow-up (22 October 2026)

PR #310 (`f/v3-private-report-pdf` -> `f/release-v3`) is ready for review.
Manual run [#39782309325](https://github.com/cogitoacademy/app/actions/runs/39782309325)
on `f9ce4ac` had Build, Type Check and Lint pass; Test + Coverage and E2E failed.
Its ~71% coverage reading included 82 failed tests and 3 errors, mostly because
the workflow used `localhost:5432`, rejected by the shared DB guard. It was not
evidence of a 100% baseline or a coverage regression. The workflow now maps the
main disposable Postgres container to `6769:5432` and a separate payout
container to `6770:5432`. Coverage migrates both databases separately, runs
`booking-payout-g16.test.ts` only on exact `cogito-test-payout:6770`, and keeps
reset overrides absent for the fixture-owned report suites. Reset consent is
limited to matching per-run disposable databases. Their LCOV reports are merged
before the unchanged 100% coverage gate. The merger test checks
line/function/branch unions and rejects missing, empty, or recordless profiles.
E2E also maps Redis to `6381:6379` and sets the full T05 target tuple for its
run-scoped student.

Run [#39791177764](https://github.com/cogitoacademy/app/actions/runs/39791177764)
on `a78528e` completed with Build, Type Check and Lint passing. The LCOV merger
unit test passed, but the coverage collection step had 3,020 passes and 10
signup-OTP failures. Each failed in `makeOtpDigest`: `createHmac` received an
undefined key even though the job environment contained `BETTER_AUTH_SECRET`.
The same process runs `packages/db/src/tests/unit/db.test.ts`; its documented
shared `@cogito-app/env/server` mock omitted that field. The mock now has a
test-only secret; the next CI run must confirm this fixes the OTP failures.
The missing resettable profile made `merge-lcov.ts` stop before writing merged
coverage. The old comment step then read `coverage/lcov.info` and printed 29.3%
API lines, 29.8% overall lines and 30.4% overall functions; those numbers are
not verified merged coverage. No coverage artifacts were uploaded, so the raw
profiles and exact source of that fallback file remain unavailable. The 100%
thresholds and test set are unchanged. The merger now writes
`coverage/lcov.merged.info`, leaves raw profiles untouched, and the comment
step runs only after successful collection and merge. E2E failed before test
discovery: strict Turbo filtering removed ambient `WEB_URL`, while `.env.test`
loaded `WEB_PORT=3200`; the resolver correctly rejected the default-URL/port
mismatch. `packages/e2e/turbo.json` now allowlists the E2E task's runtime
environment without loosening the resolver. After pushing, dispatch the
workflow once manually because the PR base does not start it.
No local database, seed, reset, migration, provider or browser test is part of
this config fix.

## T07 private report CI continuation (23 October 2026)

Run [#39893686432](https://github.com/cogitoacademy/app/actions/runs/39893686432)
on `d87ffd386130313749868f51cd56ebf3bd1b0220` completed with Build, Lint,
Type Check and Detect passing. The coverage step had 3,029 passes and one
failure: the stale-mail resend test received `null` instead of its replacement
OTP capture. The missing resettable profile made the merger fail closed, so no
coverage comment was posted; the earlier fallback percentages remain
unverified and are not coverage-debt evidence. The stale OTP capture is
guarded by `NODE_ENV=test`. The DB unit file shares a mocked server env module
with integration tests and changes it to `development` for an SSL-redaction
case without restoring it. The DB unit test now restores the initial mock
after each case and asserts that cleanup; the next resettable run must confirm
this caused the null OTP.

The same run's E2E job had 43 passes and 11 failures. Two report journeys
rejected the absent T07 opt-ins, the three payout journeys rejected the
6769/cogito-test target, and sign-in-heavy cases hit the 10-per-minute auth
limiter. The pending CI update enables the T06/T07 role-state flags, runs all
three payout tests against disposable `6770/cogito-test-payout` and Redis
6382, and explicitly resets only auth limiter keys before seeded sign-ins on
those exact loopback pairs. It does not alter the production rate limit or set
database-reset overrides for report fixtures. The 54-test Playwright inventory
is split into 51 regular and 3 payout tests; both partitions still run, and
the E2E report artifact includes both result directories.

The new E2E reset consent is `E2E_AUTH_RATE_LIMIT_RESET=true`; without it the
helper is a no-op, and with it only exact loopback 6769/6381 or 6770/6382 pairs
are accepted. No local database, Redis, seed, reset, migration, browser or
provider operation was performed. The next manually dispatched run is pending
after the scoped changes are pushed.

### PR310 CI remediation (23 October 2026)

Run [#39896841727](https://github.com/cogitoacademy/app/actions/runs/39896841727)
passed Build, Lint and Type Check. Test + Coverage stopped on two server guard
unit assertions that expected obsolete denial text; the coverage threshold step
was skipped, so this run does not establish a coverage failure. The regular E2E
partition had eight failures: outdated empty-state copy, a seeded wallet with an
earlier 126-Mark booking hold, stale pre-V3 pricing assertions, and report
fixtures with overlapping fixed schedule times. The payout partition failed
during setup because nested Bun children loaded the regular env file instead of
the selected payout file.

The scoped fixes preserve both strict limiter guards and the production auth
limit, give the exact 6769 T05 booking/lifecycle student 326 Marks for its
booking hold and create a second run-scoped 200-Mark class student, assert
current student Marks pricing and the
read-only tutor honorarium table, use retry-stable class session dates, and pass
the resolved absolute E2E env file into child Bun commands. Both browser
partitions, all tests, and the 100% coverage thresholds remain enabled. Focused
local pure guard/environment checks pass 15 tests / 50 expectations under
available Bun 1.4.0-canary.1. Playwright test discovery lists all 54 tests in
14 files without starting a browser. The remaining validation is the normal
pre-commit and serial pre-push hooks followed by one manual CI run on the pushed
head; that run must cover the profile merge, unchanged 100% gate, regular E2E,
and payout E2E. No local database, Redis, seed, migration or provider action is
part of this remediation.

Run [#39909560681](https://github.com/cogitoacademy/app/actions/runs/39909560681)
on `6ef0b948` passed Build, Lint and Type Check. The server unit suite finished
with 152 passes, one skip, and no failures; the resettable, fixture, and payout
coverage partitions finished with 3,031, 56, and 11 passes respectively. The
merger failed before writing merged coverage because
`coverage/api-resettable/lcov.info` was missing, so the 100% gate did not run
and this run does not establish a threshold failure. The CI log shows Bun 1.3.14
printing the resettable coverage table without creating the requested custom
directory. Under the available Bun 1.4.0-canary.1, a focused pure test likewise
wrote LCOV to configured `coverage/lcov.info` despite a custom
`--coverage-dir`. The workflow now removes that default profile before each
partition, requires a fresh non-empty file, and snapshots it to the partition
path before the next Bun process. The fail-closed merger and thresholds are
unchanged. E2E completed with the payout partition successful and the regular
partition at 45 passed, 5 failed, and 1 flaky. Three enrollment/report failures
were a shared-wallet race: the multi-plan journey spends 149 Marks while other
parallel class journeys need 127 after the booking-flow hold. The multi-plan
case now uses a second run-scoped 200-Mark student in its own authenticated
browser context; the T05 326-Mark account and the 80/44/25 and insufficient-funds
assertions remain intact. The class-publish test now has a 90-second timeout
for its existing multi-step assertions. The FAQ validation passed on retry;
the uppercase auth `NOT_FOUND` was the deliberate route-case rejection. Focused
pure guard/environment and LCOV tests pass 17 tests / 63 expectations, and
Playwright discovery still lists 54 tests across 14 files. One manual CI run on
the pushed head must verify the profile merge, unchanged 100% gate, regular E2E,
and payout E2E before this remediation is accepted.

Run [#39913840116](https://github.com/cogitoacademy/app/actions/runs/39913840116)
passed Build, Lint, Type Check and all server/coverage test partitions, but the
LCOV merger failed because Bun 1.3.14 emitted `FNF`/`FNH` without `FN`/`FNDA`
identities for some files. The 100% threshold step did not run. The regular E2E
partition had 48 passes and 3 failures; the payout partition passed all 3 tests.
The bounded E2E fixes use the Selia date picker and minute-time control for
class and replacement schedules, isolate the class-report student's 200 Marks
wallet, and match the report-version badge exactly. Future dates remain within
the calendar's 100-year navigation range. The existing 326-Mark
booking/lifecycle account, the multi-plan 200-Mark account, all 80/44/25 pricing
assertions, and insufficient-funds assertions remain intact. The LCOV merger
now keeps summary counts as maximum lower bounds, preserves exact named unions
and raw profiles, and records identity-incomplete sources in a sidecar; the
100% thresholds are unchanged.

Run [#39934748543](https://github.com/cogitoacademy/app/actions/runs/39934748543)
on `8945d6b` passed Build, Lint and Type Check. The test assertions in all three
coverage partitions passed, but coverage collection exited nonzero because the
root Bun 80% per-file threshold was checked against the reset-free fixture and
payout profiles before merging. LCOV merge produced 270 source records; the
100% merged gate did not run. Regular E2E had 48 passes and 3 failures; payout
E2E passed 3/3. The follow-up removes only the partition-local threshold with a
temporary Bun config and keeps the merged gate at 100%. The focused LCOV suite passes 11 tests / 145 expectations under available
Bun 1.4.0-canary.1; changed TypeScript formatting passes, and focused lint
exits successfully with existing `no-await-in-loop` warnings. Normal pre-push passed on `90863a22` (serial typecheck 4/4 tasks, 25.04 seconds). Full hosted CI [run 39939287307](https://github.com/cogitoacademy/app/actions/runs/39939287307) is in progress on this code commit.

## T07 on-demand booking report continuation (2026-10-22)

**Status:** The source milestone is in isolated worktree `t3/admin-report-review-fixes`
at `9bc960ed`; the parent `f/release-v3` and `main` remain untouched. Solo,
group, and series admin first submissions/corrections use the existing booking
detail surface, require delivery confirmation and an audit reason, retain the
assigned tutor as fee owner, and notify that tutor. Corrections are text/history
only. Already-completed legacy bookings/sessions without a report receive a
report without a second settlement.

Review fixes use canonical plaintext for new reports, decode exactly one known
legacy HTML-escape layer based on report-history status, and serialize request
UUIDs before business locks in both tutor/admin paths. Cross-booking request-key
reuse conflicts; Q06 coverage includes chargeable group-series no-shows. Focused
pure feedback checks pass 12 tests / 33 expectations; focused admin-service checks pass 4 / 21 and completeSession mock regressions pass 15 / 58 (exit 0). Cached format and lint pass; lint reports existing warnings.

Migration `0070_on_demand_report_admin_audit.sql` is additive after 0069,
unchanged in this continuation, and unapplied. Its SQL SHA-256 is
`EACFA97B013F23FA2E74BE6D6D8E410B2B9C0F354B1D9AE6BB121370F40FC0F4`.
Guarded DB coverage and the solo Chromium journey are authored but unrun;
parent SQL review/application to exact loopback `6769/cogito-test`, DB suite,
browser journey, and broader release acceptance remain pending. No reset, DB
write, browser, migration, full typecheck, or external provider call ran here.

History cascades with its current feedback and booking, and feedback's session
reference also cascades. The history session ID is text and does not guarantee
retention after a booking/current-feedback hard delete. No current application
hard-delete path was found; this records the existing retention boundary and
does not add a release gate. Historical rows are not backfilled and unknown
actors remain unknown.

## Required acceptance scenario catalog

These are tests to implement, **not tests already passed**. Maintain IDs in test names or case metadata so review can connect PRD to code. A small unit suite cannot establish capacity/ledger concurrency; use isolated real test Postgres for those cases.

| Case ID   | Setup / action                                                                                                                   | Required result                                                                                                                                                                                                                                                                                                                                  | Requirement                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| AC-COMP01 | Create parent and child; missing English, duplicate code, self/child parent or third level                                       | Valid two-level CRUD only; EN required/ID optional; admin-only raw API; no partial write                                                                                                                                                                                                                                                         | REQ-COMP-01/02                |
| AC-COMP02 | Add eighth competition with custom rate; select its child in preview/booking                                                     | Dynamic editor/filter/selection; inherited correct parent rate; no fixed-list rejection or cheapest fallback; unpriced draft not sold                                                                                                                                                                                                            | REQ-COMP-03/06                |
| AC-COMP03 | Archive parent/child with tutor assignments, accepted booking, pending quote and class enrollment                                | New selections/sales hidden/rejected; old labels, terms, continuation/report/payout preserved; impact preview; no cancellation                                                                                                                                                                                                                   | REQ-COMP-04/06                |
| AC-COMP04 | Delete unused row vs used row/parent with children; move used child; concurrent assignment                                       | Only eligible unused delete/move succeeds; no dangling JSON/FK reference, cascade or historical reclassification                                                                                                                                                                                                                                 | REQ-COMP-05                   |
| AC-COMP05 | Concurrent admin edits; rename/order/restore; profile edit retaining archived selection                                          | Version conflict; audited change; app English/website optional Indonesian/cache refresh; history labels and identity unchanged; valid unrelated profile edit succeeds                                                                                                                                                                            | REQ-COMP-01/02/04/06          |
| AC-COMP06 | Create eighth parent with four colors; patch one color; render inherited child in light/dark; submit CSS/alpha or child override | All four required at creation; omitted edit values retained; theme-correct shared palette across admin and app tutor/discovery/calendar surfaces; marketing-site calendar/tutor projections use the shared palette after T10/T12 cutover; unsafe colors rejected; seven stored legacy palette values preserved; financial/name history unchanged | REQ-COMP-07                   |
| AC-E01    | Each package exact Marks plus 31/176/320/600                                                                                     | Exact prices in PRD, no surcharge on exact package                                                                                                                                                                                                                                                                                               | REQ-ECON-02                   |
| AC-E02    | Custom 48/49/50,134/135/149/150,222/223/249/250,439/440/499/500                                                                  | Correct tier/package boundary and recommendation at/above next package price; equality 440 recommends500                                                                                                                                                                                                                                         | REQ-ECON-02; Q13              |
| AC-E03    | All competition groups x online/offline x N1-6                                                                                   | Golden per-person/pooled/tutor fee matches independent fixture table; MUN N3 25/38 and260000/375000                                                                                                                                                                                                                                              | REQ-ECON-03                   |
| AC-E04    | Quote/create old booking; admin updates; confirm/reprice headcount                                                               | Existing terms retain old version; new quote new version; tutor API cannot mutate new rate card                                                                                                                                                                                                                                                  | REQ-ECON-01/04                |
| AC-E05    | Create active V3 group series at target N3; one invite declines; N2 reconfirms; one survivor cannot fund a top-up                | Creation/session snapshots pin active revision; viable partial group reprices at confirmed N from that revision; each participant's remaining scheduled-session hold and booking/session snapshots agree before reconfirmation; underfunded increase commits no partial reprice. Activation-null series and N1 solo-series preserve legacy paths | REQ-ECON-03/04; REQ-WALLET-01 |
| AC-P01    | Replay PAID then SETTLED then reconciliation including retry restart                                                             | Exactly one credit, correct snapshotted amount/Marks                                                                                                                                                                                                                                                                                             | REQ-PAY-01                    |
| AC-P02    | Payment succeeds after reservation expiry and seat sold                                                                          | Wallet credited once; no seat/hold promised; clear recovery action                                                                                                                                                                                                                                                                               | REQ-PAY-02                    |
| AC-N01    | Two buyers contend final seat, duplicate full/single for same student                                                            | At most one capacity winner; no overlapping entitlement; loser has no leftover hold                                                                                                                                                                                                                                                              | REQ-ENROLL-02                 |
| AC-N02    | Full16/half16/odd15 and latejoin7/rejoin                                                                                         | 320 /176+176 /first8+second7; persisted selected future sessions; agreed Q02 rates/boundary                                                                                                                                                                                                                                                      | REQ-ENROLL-01/04              |
| AC-N03    | Second half paid vs unpaid at due; worker restarts late                                                                          | All selected half-plan sessions stay reserved through the installment deadline; unpaid future seats release once; reminders are idempotent; no retrospective charges                                                                                                                                                                             | REQ-ENROLL-03                 |
| AC-C01    | Cancel at24h exactly and24h minus1ms                                                                                             | Early fee/release versus late rule; no double settlement from racing completion                                                                                                                                                                                                                                                                  | REQ-CANCEL-01/02              |
| AC-C02    | Withdraw220; cancel half session22; cancel masterclass5                                                                          | 44+176;4+18;1+4; unrelated future allocations untouched                                                                                                                                                                                                                                                                                          | REQ-CANCEL-01/02              |
| AC-C03    | Postpone once, exit within72h; second postpone request                                                                           | Penalty-free applicable release; second postponement rejected/handled per approved policy; no next-half debit                                                                                                                                                                                                                                    | REQ-CLASS-04; Q04             |
| AC-C04    | Tutor replacement after earlier session earned                                                                                   | Past fee keeps original tutor; new session tutor/fee assigned prospectively                                                                                                                                                                                                                                                                      | REQ-CLASS-05                  |
| AC-R01    | 600/601 normalized chars, multiline/emoji/blank fields                                                                           | Consistent UI/API total limit; no per-bullet loophole, empty rejected                                                                                                                                                                                                                                                                            | REQ-REPORT-01                 |
| AC-R02    | Missing report past deadline; old/new scheduler ticks                                                                            | No new report-pending forfeiture/earned fee; reminders continue; legitimate legacy policies still tested                                                                                                                                                                                                                                         | REQ-REPORT-02                 |
| AC-R03    | Duplicate submit and admin correction after completion                                                                           | One deduction/fee/reward decision; report revision/audit/tutor notification                                                                                                                                                                                                                                                                      | REQ-REPORT-02/03              |
| AC-R04    | Student X requests Y export; tutor arbitrary export; released/no-show entitlement                                                | Ownership denial; agreed Q06 access; no PII in PDF/private URLs                                                                                                                                                                                                                                                                                  | REQ-REPORT-03/04              |
| AC-R05    | 3-calendar-month boundary, 3x600 + long metadata, legacy long report                                                             | Correct date/order/student name/header/footer/count; no clipping/data truncation; Q07 legacy handling                                                                                                                                                                                                                                            | REQ-REPORT-04                 |
| AC-T01    | Tax2.50/3.00/custom, BCA/nonBCA, profile changes after record                                                                    | Correct whole-IDR arithmetic, single transfer fee, immutable saved values                                                                                                                                                                                                                                                                        | REQ-TAX-01/PAYOUT-01          |
| AC-T02    | Parent still running with completed child; two admin pay requests                                                                | Child fee visible now, active allocation once; no duplicate batch                                                                                                                                                                                                                                                                                | REQ-PAYOUT-01                 |
| AC-T03    | Actual transfer mismatch, stale preview, paid record void                                                                        | The recorded external amount must equal net; no partial payout; void retains evidence and requires reconciliation before repayment                                                                                                                                                                                                               | REQ-PAYOUT-02                 |
| AC-T04    | Mixed tax rates/voids/month-end transfer                                                                                         | CSV sums original nonvoid snapshots by paidAt; rates shown; leading zeros and formula-safe values                                                                                                                                                                                                                                                | REQ-PAYOUT-03                 |
| AC-A01    | Signup raw API bypass, bad/resend OTP, email change, failed create, network retry                                                | No account without valid proof; one consumption only after success; resend old code invalid; one welcome                                                                                                                                                                                                                                         | REQ-AUTH-01                   |
| AC-A02    | Google interrupted choice and existing email account                                                                             | Resume required new choice once; no extra OTP, no re-attribution/new reward on existing account                                                                                                                                                                                                                                                  | REQ-AUTH-02                   |
| AC-F01    | Two referred completions with cap remaining10                                                                                    | Total credit at most10; unique first decision per referred user, including zero; no rollover or retry                                                                                                                                                                                                                                            | REQ-FRIEND-01..03             |
| AC-F02    | Signup15 then setting20 then completion across Jun30/Jul1                                                                        | Saved15, cap/time at completion semester; job delay does not select wrong semester/config                                                                                                                                                                                                                                                        | REQ-FRIEND-02/03              |
| AC-K01    | Saved10%/90d then15%/30d,350000 purchase day45, provider fee present                                                             | 35000 per accepted Q11 base; no change to original terms; no repeated purchase commission                                                                                                                                                                                                                                                        | REQ-KOL-01/02                 |
| AC-K02    | B then earlier A versus A then B; equal-time tie; expiry instant; replay; partial then full refund on same transaction; refund before delayed success; unresolved refund time | Callback orders converge to earliest provider time; late correction records immutable old/new audit once; exact expiry is excluded; ties use payment ID; replay adds no correction; partial refund retains its historical commission with a manual-reconciliation flag; if it is the first success evidence, the original purchase credits saved Marks once, without partial-refund proration/reversal; full refund can advance the same transaction and reverse wallet once, while a full refund before local success does not credit Marks; zero unresolved PAID->REFUNDED snapshot audits once; first-event eligibility never resets. Settled-transfer changes and proration remain deferred. | REQ-KOL-01..03                |
| AC-K03    | Commission35000, transfer10000 then30000, correction                                                                             | Outstanding25000 then overpayment5000; explicit partial/overpaid, audit, no automatic offset                                                                                                                                                                                                                                                     | REQ-KOL-02/03                 |
| AC-W01    | FAQ inactive+landing=true; change order; malicious answer; EN only/ID only                                                       | Inactive hidden both; same order; safe paragraphs/lists; EN required, ID fallback, app English                                                                                                                                                                                                                                                   | REQ-FAQ-01/LANG-01..02        |
| AC-W02    | Public tutor before/after tax schema, empty list, API outage                                                                     | Published-only, no bank/tax/internal fields, no legacy fallback; empty and failure distinct                                                                                                                                                                                                                                                      | REQ-CONTENT-02/ACCESS-01      |
| AC-W03    | Duplicate same event/day vs same-title different IDs vs multiday                                                                 | Only exact duplicate identity/day removed; other valid appearances preserved                                                                                                                                                                                                                                                                     | REQ-CALENDAR-01               |
| AC-W04    | Mouse/touch/keyboard and prefers-reduced-motion                                                                                  | Manual logo navigation, testimonial pause/manual, readable static content, FAQ no inner scroll                                                                                                                                                                                                                                                   | REQ-LANDING-01/FAQ-01         |
| AC-M01    | Old packages/pending checkout/payout cutoff/long reports/content URLs                                                            | Baseline balances/past terms/paid totals preserved; documented backfill exceptions; no unintended public KB access                                                                                                                                                                                                                               | REQ-ECON-04/CONTENT-03        |

## Ready-now versus gated work

Ready to start after normal implementation review: default price golden tables, versioned economy design, content EN/ID validation, public tutor DTO/privacy tests, inventory/redirect map, report-limit design/brand asset request, finance/session contract prototype and existing regression baseline. Q13 remains resolved. Q01/Q02 seat and installment policies, Q03/Q06 charge/report/reward outcomes, Q07 legacy handling, Q08 payout batch/mismatch/void rules, and Q09-Q12 referral/campaign rules are resolved; implementation and acceptance work remains in T02-T09. OPS01 tax-adviser confirmation remains operational follow-up. Q04 ordinary-reschedule rights and Q14/Q15 remain gates for their dependent behavior. Q05 online/in-person mode, managed room and fee parity is resolved. Q14/M02 gate final showcase/release split, not ordinary landing spacing.

## Release gates - all initially unchecked

- [ ] REQ-COMP-01..07: dynamic parent/child CRUD, historical compatibility and all catalog consumers verified; eighth-competition and archive/delete races pass before pricing activation.

- [ ] Open decisions for all shipped behavior answered and linked to authoritative approval; no unresolved financial/seat assumption deployed.
- [ ] Appropriate unit, Postgres integration, browser and provider tests pass on pinned supported runtime/CI; baseline audit's101 passing tests alone are insufficient.
- [ ] Existing solo/group/series booking, cancellation, verification/login/recovery, wallet ledger and old payout history pass regression checks.
- [ ] Migrations/backfill reconciled against snapshots; restore/cutover/rollback rehearsed; previous live payment terms preserved.
- [ ] Report PDF rendered at bounds, brand assets approved, private access checks pass, legacy policy accepted.
- [ ] Public DTO privacy and KB access preserved, content/locale/link/file inventory reconciled, no Sanity tutor fallback.
- [ ] Tax defaults and Marks-only wording approved by Cogito; bank transfers remain external and auditable.
- [ ] FAQ/Activities/cover/video content supplied or explicit scope deferral recorded; English reviewed, Indonesian optional.
- [ ] Notifications/Meet/payment reconciliation/durable completion events observed through retry/process-restart cases; monitoring owner knows failure recovery.
- [ ] Client UAT accepted by named owner; launch date confirmed after end-of-development review; deployed SHAs and rollback owner recorded.

## Documentation and evidence per PR

Update affected `docs/CONTEXT.md`, `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md`, `docs/RUNBOOK.md`, and this active plan with actual behavior/status. Do not publish proposed RPCs as implemented reference. API docs must use actual slash-separated oRPC keys and JSON envelopes. For each task record implementation PR/commit, requirement/case IDs passed, exact test command/environment, migration effects and unresolved material dependency. No credentials, NIK/NPWP or real student report data in evidence artifacts.
