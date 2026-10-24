# Cogito Runbook

## Approved account email shell (24 October 2026)

Account email branding is shared in `packages/auth/src/auth-email-layout.ts`.
Edit that shell once to update OTP/welcome/reset header/footer; edit the separate
builders for body-specific copy. The supplied report banner is copied byte-for-byte
to `apps/web/public/auth-email-header.png`; deploy that asset with the web app
before deploying sender code. CORS_ORIGIN must be the public HTTPS frontend
origin in production. External mail clients cannot load a localhost image URL;
local previews resolve the local asset, and text/alt content remains readable
when remote images are blocked. No data URI or attachment is required.
Run `bun test ./packages/auth/src/verification-email.test.ts ./packages/api/src/tests/unit/reset-password-email.test.ts`.
No provider send or real Gmail/Outlook rendering is part of these checks.

## Auth form focus regression (24 October 2026)

From `packages/e2e`, run
`bunx playwright test --config playwright.auth-form-focus.config.ts`.
This uses installed Microsoft Edge and an isolated Vite on 3300, mocked
anonymous session responses, and no DB/API/seed/provider setup. Two cases fill
signup/sign-in, trigger visibilitychange, verify session refetches occurred,
then assert drafts remain. The pre-fix failure was email becoming empty after
the pending loader unmounted forms. The dev app receives the UI fix via Vite;
no DB migration or API restart is required.

## Student report banner and layout QA (24 October 2026)

The report banner source is
`packages/api/src/modules/report-export/assets/student-report-header.png`.
Its adjacent JSON stores the exact image bytes as a base64 JSON string for
bundling, following the existing embedded-font approach. When replacing the PNG,
regenerate its JSON before build; do not introduce a cwd-dependent runtime read.
Run `bun test packages/api/src/tests/unit/report-export.pdf.test.ts` for header
embedding, dense bullets, long metadata, Unicode/legacy and pagination coverage.
Visual QA should include short, populated, long continuation and mixed reports.
The reference layout uses narrower feedback text; long reports can use more
pages. Bullets have a hanging indent and remain separate even in dense lists.
Empty eligible sets still return 204, without creating a blank PDF.

## Short FRIEND allocation operations (24 October 2026)

This source change needs no schema migration, reset, seed or code rotation.
Previously shared codes remain valid. `REFERRAL_CODE_EXHAUSTED` (HTTP 409) means
all 1,000 values under an identity/name prefix are occupied, including KOL codes.
Do not delete attribution or rotate issued codes to free slots. Support should
escalate the prefix-capacity decision to the product owner: explicitly authorize
an alternate identity prefix or a larger format before changing allocation policy.
A typical new allocation reads occupied values and inserts once; a fully contended
allocation is bounded by 1,000 insert attempts plus owner rereads. Existing-owner
requests do not scan the namespace. DB concurrency/provider/browser acceptance
has not been run for this source slice.


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

## KOL settlement source handoff (23 October 2026)

0073_kol_external_settlement is additive (one table, two restrictive FKs, operation
unique index, decision index and entry-shape check). SQL, snapshot and journal are
generated/reviewed only; no DB migration, provider, seed/reset or worker ran.
Generation used ENV_FILE pointing to a nonexistent path and an unused loopback
port-1 URL; drizzle-kit generate does not connect. Parent must own application
and verification on the guarded test DB before exposing settlement routes/UI.

Parent: apply 0073 to isolated test 6769/cogito-test, run only the existing guarded
non-reset `referral-kol-commission.test.ts` acceptance with NODE_ENV=test and no
reset flags. New cases cover AC-K03, concurrent same/distinct-key transfers,
conflicting/stale adjustments, cross-decision operation reuse, audit rollback,
refund after/concurrent with transfer, retained choice/history. Existing PR312
cases must continue passing. Also verify actual partial-refund reconciliation,
earlier-provider correction after settled transfers, schema FK/CHECK/unique
constraints, CSV month-end/backdated transfer and snapshot consistency, and admin
versus non-admin access in browser/RPC. No parent acceptance is claimed here.

UI: existing admin KOL commission page -> View settlement -> record actual amount,
WIB date and reference after external transfer. Record signed obligation correction
only with approved amount and reason; negative reduces liability, positive adds.
No proration is supplied. On uncertain request, retry same operation; review
history before starting a new record. Do not edit/delete cash history or offset
future commissions. Full refund shows zero obligation and retained cash as
overpayment; partial refund remains flagged even after a manual adjustment.
Export selects a WIB activity month but reports current lifetime balances;
sum only summary rows. This is reconciliation, not historical closing/tax reporting.

DB-free checks: 19 focused settlement/referral units / 47 expectations, normal
check-types (4 tasks; 2 cached), changed-file lint and formatting. Raw API-project
typecheck includes pre-existing test typing errors;
use normal project hook checks for the source gate. Browser and DB proof remain
parent-owned. Earlier transfer-deferred source notes below are historical.


## DB-free referral/KOL browser regression

From `packages/e2e`, run:

```powershell
bun run test --config=playwright.v3-referral-kol.config.ts
bun run check-types
```

The isolated config starts only Vite on 3304, refuses an existing server, and
uses its own cache/output directory. API origin 3305 is intercepted by synthetic
session/RPC fixtures; no API process or global setup runs. Do not substitute the
main Playwright config: its setup can seed retained DB state. Ten Chromium
cases pass; these cover UI contracts only, not OAuth, DB or provider acceptance.
Development ports 3000/3001 and the sidebar test port 3302 are untouched.

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

## Reminder SQL cursor precision correction (23 October 2026)

The cursor projection, SQL ordering, and keyset predicates now use the same
millisecond precision. Computed timestamp projections use Drizzle's timestamp
decoder, and cursor parameters are explicit ISO timestamptz values. The focused
suite passes 9 tests / 40 assertions, including database-free Drizzle adapter
decoding/binding and the 100-failure rotation regression. A guarded PostgreSQL
case now exercises the production SQL finder against 101 owned rows with
sub-millisecond timestamps; that DB case remains unrun. No DB, migration, reset,
seed, browser, or provider operation ran for this correction.

Parent verification also passes all four workspace typecheck tasks uncached in
34.469 seconds with one checker, serial execution, and a local 1 GiB Go heap
target. That resource setting is local tooling configuration, not an app limit.

## Booking reminder parent verification (23 October 2026)

At source commit `c328d6ad`, the parent reran the reminder unit suite: 7 tests
and 27 assertions pass. All four workspace typecheck tasks pass uncached in
8.002 seconds with serial execution and the repo-pinned single checker.
The earlier broad type errors were caused by an incomplete local Zod 4.4.3
package; restoring its missing declarations resolved the errors without source
changes. PostgreSQL concurrency, actual email delivery, and browser acceptance
remain unverified. No database, Redis, provider, reset, seed, or migration ran.

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


## KOL first commission source checkpoint (23 October 2026)

The branch contains additive Drizzle migration
`0072_kol_first_successful_topup_commission`; it has not been applied to any
database. Do not use `db:push`, reset, seed, or migration commands as part of this
source checkpoint. Apply it only through the normal reviewed deployment
migration process after PR integration and the assigned DB acceptance window.
The migration adds `payment_record.provider_success_at` and authenticated refund
facts, the KOL decision table, provider-time and refund-reconciliation snapshots,
payment/refund integrity checks, and an index for the admin cursor order.

Every successful Midtrans notification now triggers an authenticated status API
lookup; the webhook signature does not cover timestamps. The notification docs
define `transaction_time` as transaction initiation, and the status API exposes
no `capture_time`. A card `capture` is still treated as a successful payment and
credits Marks, but its KOL decision is held at zero as unresolved because the
exact capture success time cannot be proven. Non-card settlement uses
authenticated `settlement_time`. Provider/API failure keeps the notification
retryable. Never substitute webhook or local receipt time.

An authenticated REFUNDED status received before local success reserves the
first KOL event without a Marks credit. If its original success time is not
available, the decision stays unresolved at zero and later purchases remain
held until the provider supplies an authoritative exact time. A later exact
time re-evaluates ordering with an audit correction. Do not rewrite any settled
external transfer; transfer settlement, CSV, and settled-transfer reversal
adjustments remain deferred. The existing one-time wallet Marks reversal for a
full refund remains in this slice.

Midtrans `refund` and `partial_refund` both normalize to provider status
`REFUNDED`; the authenticated status API's `transaction_status` distinguishes
full `refund` from `partial_refund`. Check
`payment_record.provider_refund_kind` and the KOL admin row's
`refundReconciliationState` to distinguish an authenticated partial refund. If
partial-refund status is the first local success evidence, the payment advances
to `SETTLED` and saved package Marks are credited once. It also writes
`partial_refund_reconciliation` audit evidence and keeps the KOL decision flagged
for manual reconciliation. The partial cash refund does not prorate or reverse
Marks. The status API returns cumulative `refund_amount`; successive snapshots
update one `refund_record` by transaction event ID with a monotonic maximum, so
an older response cannot reduce the reported total. See [Midtrans refund
details](https://docs.midtrans.com/docs/get-status-api-requests#refund-details).
A calculated commission remains historical; this slice defines no prorated
amount or automatic cash refund.
If a later full refund arrives for the same Midtrans transaction ID, it advances
the payment to REFUNDED and uses the existing one-time wallet reversal. The
partial-refund manual-reconciliation record remains idempotent by provider
event ID. The later full-refund transition and wallet reversal use the payment
state and wallet event key, so they still run once for the shared transaction.

The admin endpoint `adminReferral.listKolCommissions` takes `limit` (1..100,
default 50) and an optional keyset cursor. Page order is decision creation time
descending then decision ID descending. Invalid cursor payloads are rejected;
the admin route remains protected by `adminProcedure`.

Current review-fix focused proof passes 140 tests / 355 expectations across
the Midtrans provider, payment service, webhook idempotency, and cursor codec
unit files; `git diff --check` is clean. Provider network calls are mocked and
the PostgreSQL integration scenarios are not part of this run. The serial
four-workspace typecheck and normal Lefthook pre-push hook have not been rerun
for this review-fix delta; the earlier checkpoint results do not validate the
current diff. Guarded PostgreSQL acceptance is authored but remains pending the
parent-provided exact test target. Migration 0072 remains unapplied. No database
migration, reset, seed, or real provider webhook ran in this worktree.
Transfer settlement, partial-refund proration/accounting, overpayment, CSV,
settled-transfer corrections, and reversal adjustment workflows remain
deferred.

## Referral parent PostgreSQL acceptance (22 October 2026)

Migration 0071 was applied using the Drizzle PostgreSQL migration runner after
checking NODE_ENV=test, exact loopback 6769/cogito-test, absent reset flags and
current_database(). Six referral tables are present. No dev/production migration,
reset, seed or provider call ran. The existing isolated test containers were
started without recreating their volumes.

```powershell
bun --smol --env-file=C:/.Projects/cogito-app/tmp/v3-dev/.env.signup-parent test --timeout 30000 packages/api/src/tests/integration/referral-completion.test.ts packages/api/src/tests/unit/settlement-transaction.test.ts
bun --smol --env-file=C:/.Projects/cogito-app/tmp/v3-dev/.env.signup-parent test --timeout 30000 packages/api/src/tests/integration/booking-admin-reports.test.ts
```

The first command passes 5 tests / 26 assertions: saved signup terms survive a
15-to-20 Mark revision and no code grants no welcome; a forced real wallet/usage
deadlock is retried, both completions stay within the cap, exhausted zero-credit
decisions do not replay in another semester, and promoted participants receive
no new reward. Retry-unit coverage bounds repeated deadlocks and rejects retries
for uniqueness errors. The on-demand suite passes 12 / 118, including audited
solo no-show delivery, one charge/fee/reward, report entitlement and receipt replay.
Fixtures use run-owned identities and targeted cleanup. Test settings use a
future effective date and are removed; ordinary current settings are preserved.
The guarded class enrollment/lifecycle/report suite also passes 44 tests / 354
assertions (14.32s) with controlled provider adapters. Web and server typechecks
pass after the review corrections. No development database was migrated.
Real Google/browser and full client release acceptance remain open.

## AUTH-02 and friend referral handoff (22 October 2026)

The feature source branch contains Google pending-choice resume, email signup
attribution, friend welcome/completion credits, student referral display, and
KOL signup campaign validation/snapshots. Parent generated
`0071_referral_registration_rewards` after 0070 without a database connection.
Snapshot comparison verifies its predecessor ID, six new tables, and only
`user.referral_choice_pending` added to prior tables. It is now applied to the
guarded test target as recorded above; dev/production remain unmigrated. Do not start this schema
against an unmigrated database or reset/seed a database for unit checks.

Parent reran the focused suite below: 46 tests / 101 expectations pass. Web
`bun run check-types` and server `bun run check-types` both pass after repairing
the sidebar icon import, Marks props, referral form schema, session nullability,
and wallet upsert transaction type. These are source/compiler checks, not
financial or OAuth integration acceptance.

Focused database-free regression commands:

```powershell
bun test --timeout 30000 apps/server/src/signup-body.test.ts packages/api/src/tests/unit/referral.policy.test.ts packages/api/src/tests/unit/procedures.test.ts packages/api/src/tests/unit/context.test.ts packages/auth/src/index.test.ts
bun test --timeout 30000 --test-name-pattern Q06 packages/api/src/tests/unit/booking.service.test.ts
```

The first command passed 46 tests / 101 expectations; the Q06-filtered booking
command passed 2 tests / 4 expectations. The run used process-scoped dummy auth,
database and Redis settings pointing at loopback port 1; no DB or Redis
connection was made. A broader combined run of the whole booking service file
observed one unrelated failure at `booking.service.test.ts:9547`: an existing
payout projection expectation wanted bank account `00456`, while the fixture
returned null. The referral changes do not touch that payout path. The existing
guarded signup integration suite resets its local test database in `beforeAll`;
it was not run in this source slice and must wait for parent migration/application
and the assigned guarded test window. Do not run it with the source-only referral
schema.

At the 22 October source milestone, KOL first-IDR-top-up decisions and transfer
history were still outstanding. The 23 October source checkpoint above now
records first-purchase commissions and audited late-earlier corrections. Transfer
settlement, partial/overpayment history, CSV, settled-transfer correction, and
reversal adjustment remain separate work. Referral choice/code/term snapshots
remain the attribution source.

## Report PDF parent checks (22 October 2026)

Focused route/access/window/layout/rate-limit checks pass 29 tests / 104
assertions. Web and server typechecks pass; a full server `bun run build`
(tsdown) passes with the embedded font. The layout regression rerun after
preserving ordinary/legacy line breaks passes 4 tests / 8 assertions. Rendered
normal, dense-bullet and long-metadata samples were visually inspected.

The non-reset test command below passed 1 test / 16 assertions after starting
the existing isolated PostgreSQL container. Its runtime preflight requires
`NODE_ENV=test`, exact loopback `6769/cogito-test`, no reset flags and a matching
database readback. Fixtures are run-owned and removed individually; no reset,
seed, migration or production/provider call occurred.

```powershell
bun --smol --env-file=C:/.Projects/cogito-app/tmp/v3-dev/.env.signup-parent test --timeout 30000 packages/api/src/tests/integration/report-export.test.ts
```

Synthetic Chromium download checks pass 3 journeys (11.7s): student self,
admin student selection, empty state and tutor UI denial. Auth and API responses
are mocked, so these complement the PostgreSQL and HTTP authorization tests.
Run from `packages/e2e`:

```powershell
bun run test --config=playwright.classes-layout.config.ts --grep 'private report|explicit empty'
```

The cold first run timed out on initial Vite load; its retry used the warmed
cache and bounded 60-second navigation budget. A filename expectation was fixed
to match the UI's dated download name. Final brand approval, deployed/runtime
and client acceptance remain open.

## E2E strict-mode environment (22 October 2026)

`bun run test:e2e` runs Playwright through Turbo's strict environment filtering.
`packages/e2e/turbo.json` allowlists the E2E runtime variables for that package;
keep `WEB_URL` and `WEB_PORT` together. CI's generated `apps/server/.env.test`
contains `WEB_PORT=3200` but omits `WEB_URL`, so dotenv cannot restore the URL
if Turbo has filtered it from the parent environment. The resolver must keep
rejecting non-loopback URLs and URL/port mismatches. `playwright test --list`
loads the configuration and discovers tests without starting servers or
running global setup. With the CI loopback environment set, check the same
Turbo task from the repository root without starting a database or browser:

```powershell
.\node_modules\.bin\turbo.exe run test --filter=@cogito-app/e2e --env-mode=strict -- --list
```

## Report PDF and admin picker rereview (22 October 2026)

The admin report picker passes `role: "student"` to the search RPC, which
filters before applying the result limit. Private PDF legacy layout follows the
current report version's history actor; short legacy feedback keeps line breaks
and can use labelled continuation pages.

The focused unit run passes 81 tests / 208 assertions. Server and web typechecks
pass with one checker each:

```powershell
bun test --timeout 30000 packages/api/src/tests/unit/admin.repo.test.ts packages/api/src/tests/unit/admin.service.test.ts packages/api/src/tests/unit/admin.handler.test.ts packages/api/src/tests/unit/admin.types.test.ts packages/api/src/tests/unit/report-export.access.test.ts packages/api/src/tests/unit/report-export.pdf.test.ts packages/api/src/tests/unit/report-export.service.test.ts packages/api/src/tests/unit/report-export.window.test.ts apps/server/src/routes/report-export-routes.test.ts
bun run --filter=server check-types --checkers 1
bun run --filter=web check-types --checkers 1
```

This continuation did not rerun the parent's PostgreSQL or Chromium checks and
used no database, browser, migration, reset, seed, or provider. The saved PDF
sample was left unchanged.

## Windows workspace typecheck memory

Run the workspace check with `bun run check-types`. Package scripts limit
TypeScript-Go to one checker, and the root Turbo command runs package tasks one
at a time. The pre-push hook also runs its typecheck and lint baseline in
sequence. This is the supported Windows memory-pressure path; `NODE_OPTIONS`
does not set TypeScript-Go's Go checker count. The current workspace check
passed 4/4 tasks in 12.832 seconds.

## Classes UI acceptance (22 October 2026)

Run the synthetic, database-free UI suite from `packages/e2e`:

```powershell
bun run test --config=playwright.classes-layout.config.ts
```

It starts only web 3300 with synthetic session/RPC responses; no API, seed or
provider runs. The test Vite config allows linked package/font assets and uses a
separate cache. Eleven Chromium cases pass: catalog/filter/enrollment and admin
draft/management at 320/390/768/1440px, plus student/tutor/admin mobile reports.
The 768px student case uses dark mode. Geometry assertions check page overflow;
mobile report selection checks focus and visibility. Real enrollment, publish and
cancellation E2E helpers now open the new tabs/accordion; their full DB-backed
journeys were not rerun for this presentation-only change.

Manual check: browse/search classes, open details, review enrollment; in Class
studio switch Drafts & editor, change a draft, switch tabs and return without
losing edits. Open Manage class to review the existing audited lifecycle controls.
In reports, select a session on mobile and verify its report comes into view.


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
retained under run-scoped identities. PDF source and local evidence are recorded
below; parent DB/browser/deployment acceptance and broader legacy reminders remain open.
This acceptance supersedes older source-only/unapplied/pending-browser notes below.

## Private report PDF source and local evidence (22 October 2026)

The isolated source adds `/reports/student/summary` and `/reports/student/pdf`.
Student requests resolve to the authenticated student; admins must choose a
student from the existing search; tutors are denied. The summary is metadata
only and the PDF response is private/no-store. The report query uses a read-only
repeatable-read snapshot, Q06 private-booking entitlement, the charged funded
class allocation, and WIB calendar-month boundaries. The header uses the
authorized placeholder while branding assets are unavailable.

Focused source checks run from the worktree root:

```powershell
bun test --timeout 30000 packages/api/src/tests/unit/report-export.access.test.ts packages/api/src/tests/unit/report-export.pdf.test.ts packages/api/src/tests/unit/report-export.window.test.ts apps/server/src/routes/report-export-routes.test.ts
bun test --timeout 30000 apps/server/src/rpc-rate-limit.test.ts
```

The export suite passes 9 tests / 31 expectations, the rate-limit routing suite
passes 18 / 67, and the combined focused run passes 27 / 98. A seven-page
fictional-data PDF at `output/pdf/report-export-sample.pdf` was rendered with
`pdftoppm` and inspected page-by-page. The sample covers solo, group, series,
cohort and masterclass metadata, a one-page 3 × 600-character feedback report,
and long Unicode/newline
legacy text across continuation pages. These are local source-slice results;
the focused `bun build packages/api/src/modules/report-export/report-export.pdf.ts
--target=bun --outdir tmp/pdfs/bundle-check` check emitted one 3.16 MB JavaScript
entry containing the 1,008,096-byte font and no separate JSON/font asset. This
does not replace the focused `tsdown` PDF-module bundle check below, which
emitted one 3.28 MB JavaScript entry with the complete 1,008,096-character font
embedded (tsdown 0.22.14, Rolldown 1.2.3):

```powershell
bunx tsdown packages/api/src/modules/report-export/report-export.pdf.ts --no-config --out-dir tmp/pdfs/tsdown-font-check --format esm --no-minify
```

The full server tsdown/Docker build remains parent-owned. The parent also owns
guarded database/entitlement coverage, authenticated student/admin browser
flows, and full web/API/server typechecks. No database, browser, migration,
reset, seed or provider call was run for the PDF slice.

## Ongoing experience smoke check (22 October 2026)

In tutor profile Experiences, verify Start year and End year align. Checking
"I currently work in this role" clears and disables End year while leaving the
control in place. Uncheck to enable it with the current/start-year default.
Existing ongoing entries start checked. The focused synthetic browser test
checks toggling, retained geometry, existing null values and mobile rendering;
it performs no database writes. No environment or migration changes apply.
At desktop and mobile widths, also verify the Education, Achievements &
Experiences info button stays beside the title when the text wraps; the
focused synthetic browser check asserts their relative geometry.

## Compact tutor status acceptance (22 October 2026)

Check `/profile` at desktop and mobile widths: one badge appears beside the
heading, with no Profile status card. Published/no-pending-edit profiles show
no notice. Pending edits explain that the profile is live while edits await
review; requested revisions preserve admin feedback. Draft, pending review,
approved/unpublished and suspended profiles keep their next-step guidance.
`tutor-profile-render.spec.ts` covers these states with synthetic session/RPC
responses and no database writes. No environment changes are required.

## Tutor profile render check (22 October 2026)

`tutor-profile-render.spec.ts` mocks session/RPC responses and performs no DB
writes. It checks `/profile` renders tax guidance and legal-name inputs without
browser errors. The focused local Chromium run against web 3000 passed after
replacing the standalone tax introduction's `FieldDescription` with `Text`.
For manual acceptance, sign in as a tutor and reload `/profile`; verify the tax
section renders. Saving profile changes and real-account acceptance were not
exercised by this synthetic rendering check.

## Local development restarted (22 October 2026)

Docker Desktop and the existing development Postgres/Redis containers are running.
Web `http://localhost:3000/login` returns 200; API `http://localhost:3001/health`
returns 200 with database, Redis, scheduler and DLQ checks all `ok`.
The API runs `bun --smol --env-file=apps/server/.env tmp/v3-dev/start-local-safe.ts`
from the repository root, using retained `6767/cogito-app` data, stub payments,
stub email and disabled Google Calendar. No migration, reset or seed was run.
Runtime logs are in `tmp/v3-dev/ui-dev-api.out.log` and `ui-dev-api.err.log`.
The earlier offline blocker is resolved; authenticated UI route acceptance is
still pending and is separate from this startup health check.

## UI control and table verification (22 October 2026)

Spacing regression: on `/admin-economy`, measure from the lower of the take and
preview Cards to the V3 rate card. It should be the normal 24px Stack gap, at
both mobile and desktop widths, not the 128–250px blank region seen with Card-root
inline-size containment. Confirm icon-header actions still use column 3 on wide
headers and wrap below the title on narrow headers. The E2E economy spec includes
this rendered-gap assertion.

Tax form follow-up: defaults and custom tutor rates use percentages, not bps.
Verify default 250 displays as 2.5, 300 as 3; typing 2.55 should show Rp10,200
tax on Rp400,000. Save payloads retain 255 basis points. Empty override restores
the default. Browser typing/stepping and the conversion regression passed without
saving a configuration; the temporary audit account was removed afterward.

Authenticated follow-up completed the admin route smoke checks at 390/1440px and
the student route smoke checks at 390px (balance also at 1440px). Academy's
user-reported rate clipping was reproduced with 0px available numeric text width,
then repaired and checked at 390/1024/1440px. Check all three 20/22/25 rate values,
not only the overall page scroll width. Temporary audit accounts were removed.
See the UI audit plan for the exact route/state coverage and remaining write flows.

Run package checks directly to avoid unrelated workspace builds:

```powershell
bun run --cwd packages/ui check-types
bun run --cwd apps/web check-types
bun run --cwd packages/e2e check-types
bun --smol test apps/web/src/lib/calendar-ui.test.tsx apps/web/src/components/booking/minute-time-input.test.ts apps/web/src/components/admin/academy-class-page-utils.test.ts
```

Verify Academy schedules/minimum checks, lifecycle replacement times, payout
amount/time/tax fields, V3 economy cells, competition order and custom Marks.
Check empty, min/max, read-only and disabled states. On narrow Cards, header
actions should wrap beneath the title. Wide tables must scroll inside the Card;
filters and pagination must not overlap rows. Confirm October displays as October
before opening the calendar month dropdown. Use 320/390/768/1440px widths.

This audit passed the three package typechecks and 7 focused tests / 13 assertions.
A temporary browser fixture passed control and layout smoke checks; it was removed
after verification. Authenticated routes/DB-backed Academy publish were not run:
API 3001 and DB 6767 were not listening during the initial pass. The authenticated
follow-up above supersedes that offline blocker. Do not treat component smoke evidence as
full route acceptance. No migration, reset, seed or external provider call is
needed for these UI changes. Full coverage is in the UI audit plan.

## Local runtime checkpoint (22 October)

The integrated reminder source and combined regression are on local
`f/release-v3` through `e5a7ec41`: 44 PostgreSQL cases / 354 expectations and
7 reminder units / 25 expectations passed. The session-owned API was restarted
on port 3001 using the ignored local helper `tmp/v3-dev/start-local-safe.ts`.
It retains the existing loopback `6767/cogito-app` database and overrides only
this process to stub email/payments and disable Google Calendar. The saved
server env file is unchanged; its normal launch still uses its configured
providers. `/health` reports database, Redis and scheduler healthy. No migration
or development seed was needed for reminders.

The additional post-reminder full web typecheck was deliberately stopped when
C: free space reached approximately 136 MiB. It has no passing result; the
previous T06 web typecheck does not verify the later notification UI changes.
Keep subsequent work bounded and avoid installs/browser downloads while storage
is constrained. On-demand report source remains isolated; migration 0070 is unapplied and guarded DB/Chromium acceptance is pending.

## On-demand booking report source verification (2026-10-22)

The isolated source worktree has migration
`0070_on_demand_report_admin_audit.sql` after 0069. Its SQL SHA-256 remains
`EACFA97B013F23FA2E74BE6D6D8E410B2B9C0F354B1D9AE6BB121370F40FC0F4`; do not
apply it until the parent has reviewed the SQL and confirmed the exact guarded
test target. It is unapplied here. Pure feedback validation passed 12 tests / 33
expectations, focused admin-service validation passed 4 / 21, and completeSession mock regressions passed 15 / 58 (exit 0 each). Cached
oxfmt passed; cached oxlint exited 0 with warnings. The guarded Postgres cases
and solo Chromium journey are authored but were not run; no database write,
migration, browser, full typecheck, or provider call occurred in this slice.

After parent review/application of 0070 to loopback `6769/cogito-test` through
the normal migration runner with no reset flags, keep the current directory at
the worktree root and run the guarded service suite there. The database helper
requires `NODE_ENV=test`, that exact target, and no reset override variables:

```powershell
bun test packages/api/src/tests/integration/booking-admin-reports.test.ts
```

For the authored solo admin-browser journey, keep the shell at the worktree root
and use the isolated T05 ports with one worker:

```powershell
$env:T07_ON_DEMAND_BOOKING_REPORTS_E2E = "1"
$env:T05_ENROLLMENT_TEST_DB_PORT = "6769"
$env:T05_ENROLLMENT_TEST_REDIS_PORT = "6381"
$env:T05_ENROLLMENT_TEST_SERVER_PORT = "3201"
$env:T05_ENROLLMENT_TEST_WEB_PORT = "3200"
$e2eWorktreePath = Join-Path (Get-Location) "packages/e2e"
bun --cwd $e2eWorktreePath run test src/specs/booking-admin-reports.spec.ts --config=playwright.booking-admin-reports.config.ts --workers=1
```

These commands are for the parent validation window only. Do not add reset flags.
The source integration fixture deletes only its own UUID-owned bookings/users;
the browser fixture advances and cleans up only its run-owned booking. The
browser journey covers solo; the authored guarded Postgres suite covers solo,
group, series, corrections, request-key races, and Q06 chargeable no-show reads.

History follows existing FK retention: its feedback and booking references
cascade; the current feedback's session reference also cascades. `history.session_id`
is text, so it does not retain history after booking/current-feedback hard
deletion. No current application hard-delete path was found; this records the
existing schema behavior and does not add a new release gate.

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

## Test database reset incident and current guard (2026-10-21)

At about 13:17:59 UTC, `academy-class.test.ts` called the API helper's
`resetDatabase()` with loopback `cogito-test` on port 6767. The helper truncated
its broad table list with `CASCADE`, then fixture setup failed because
`tax_legal_name` was missing. The separate development database `cogito-app`
on 6767 was read back intact and was not truncated. No test-data recovery,
restore or reseed has been verified.

API integration helpers now reject reset on 6767 and 6768 unconditionally.
The only resettable pairs are exact local `cogito-test:6769` and
`cogito-test-payout:6770`, and each needs both `TEST_DATABASE_ALLOW_RESET=true`
and `TEST_DATABASE_RESET_TARGET` exactly equal to `DATABASE_URL`. Developer
environments and examples remain opt-out. GitHub Actions grants reset consent
only to reset-based tests on that run's disposable 6769 service and to the
dedicated payout test command on its separate disposable 6770 service. The
three report fixture suites that assert reset overrides are absent run separately
on 6769 with both variables unset. Bun writes its LCOV report to the configured
`coverage/lcov.info`; CI clears that file before each coverage partition and
snapshots its fresh, non-empty output under `coverage/api-*` before the next
process runs. The workflow uses this configured output because CI did not
produce the requested custom `--coverage-dir` paths. Those three raw profiles
are merged before the existing gate. The merge rejects missing, empty, or
recordless LCOV profiles. For Bun profiles that include `FNF`/`FNH` but omit
function identities, the merger preserves maximum summary counts and the exact
named-function union, then writes a sidecar identifying sources whose function
identity is incomplete. The PR comment labels these counts as lower bounds and
the 100% gate fails if unidentified functions remain uncovered; configured
thresholds are unchanged. `.github/scripts/merge-lcov.test.ts` covers overlapping
summary-only profiles, mixed named/summary profiles, raw-profile preservation,
and invalid or incomplete details. The payout schema is migrated through a
separate `apps/server/.env.test-payout` file. `test-setup.ts` has no database URL fallback; provide a target
explicitly for DB-backed work. The retained 6769 run-scoped financial fixtures
were not reset in this task. The non-reset T05 per-run E2E identity path remains
unchanged. A source scan found 69 API test files calling the shared helper;
their call sites are unchanged, but old 6767/6768 env files now fail closed
before the helper issues SQL. The pure guard suite passed 6 tests / 40
expectations; no DB-backed verification was run.

## Earlier T06 worker checkpoint (superseded by parent verification above)

At the earlier worker handoff, `t3/finish-v3-t06` continued `f/release-v3`
from `dc1da96a` and was not yet integrated. It implements preview/confirm for cancelling
one future scheduled class session with a required reason, stable request UUID,
exact quote hash and class/session version checks. Cancellation returns only the
target session's unspent funded Marks with a zero fee, adjusts/cancels the
affected unpaid installment, and preserves original enrollment prices/session
history, delivered holds, reports and earned fees. Audit and student/tutor
notifications commit with the transaction; the meeting worker retries calendar
cleanup.

The minimum check runs once from the saved check date and counts unique active
paid full/half-plan students with funded scheduled allocations. Single-session
buyers, expired checkouts, cancelled enrollments and plans with a defaulted
installment do not count. Admin may continue or postpone once. Every replacement
session must start strictly after the authoritative 72-hour free-exit deadline;
session identity, order, duration, funding and rates remain unchanged. Tutor and
managed-room conflicts are checked. Pending installment due dates and reminder
markers follow the replacement schedule. Students can still see the postponed
cohort and their own enrollment, while `createEnrollment` rejects new
enrollments. Whole-enrollment withdrawal is fee-free through the inclusive
deadline; ordinary later rescheduling stays out of scope.

The existing meeting worker updates a class event using its stored Google event
ID, preserves event metadata, and retries transient provider errors such as 503.
If the saved event is deleted/tombstoned (404/410), a durable
`creationGeneration` advances before the next insert; an
accepted-but-response-lost attempt retries with the same generation key. A late
provider write after lease recovery leaves the latest schedule queued while
retaining a newer active lease and cancellation work. Additive migration
`0069_academy_class_meeting_creation_generation.sql` adds an integer defaulting
to 1 with a positive constraint. SQL SHA-256:
`A6A442562692E34CEA132CBD4BB20DE6561906FB45AD9441ADD19DBF8B8C2617`.

This continuation ran `bun --smol test
packages/api/src/tests/unit/google-meeting.provider.test.ts` (52 passed / 196
expectations), `.../class-enrollment.cancellation.test.ts` (8 / 16), and
`.../test-client.safety.test.ts` (6 / 40). Cached oxfmt 0.65.0 `--check` passed
on changed code/JSON files, and cached oxlint 1.80.0 exited 0 with warnings. The
integration file was inspected: it requires `NODE_ENV=test`, loopback
`6769/cogito-test`, no reset flags, and afterAll deletes only UUID-owned fixture
rows; it contains no `resetDatabase()` or `TRUNCATE` path.

The exact-target env preflight passed, but `6769` refused a read-only database
connection and Docker Desktop's daemon was unavailable. Therefore the non-reset
`class-enrollment.test.ts` suite, 0069 migration application, and migration
journal readback were not run. No database write, migration command, reset,
seed, Calendar/API provider traffic, email or payment call ran in this
continuation. Migration 0069 remains unapplied by this work; the earlier 0068
test readback is preserved as historical evidence, not reverified. A prior T06
checkpoint recorded 35 Postgres tests / 252 expectations and one Chromium
journey; those checks were not rerun against the latest provider/enrollment WIP.
Package-wide API typechecking and the full web compiler remain unverified due
the previously recorded baseline diagnostics/Windows memory limits. Parent
review/dev integration and full Release V3 acceptance remain pending.

## T06 class Calendar retry continuation (21 October)

The provider and worker changes in this continuation are the calendar
implementation above. Focused provider tests now pass; live Calendar behavior
has not been exercised. Preserve migration 0068 unchanged and apply only
additive 0069 to the exact approved test target after the DB is available and
the migration journal confirms the expected predecessor. Never run reset-based
suites for this work. The failure to connect to loopback `6769/cogito-test` is
the active validation blocker; restore the existing test database service, then
rerun the guarded suite and verify database identity plus migration journal
readback. No dev database action is authorized in this continuation.

## Prior T07 UI and browser acceptance checkpoint (21 October)

The role-based `/class-reports` page uses real `classes.listSessionReports` and
`classes.submitSessionReport` RPCs. Tutor/admin rows include a settlement preview
or persisted readback; student rows carry `settlement: null` and no peer identity.
The shared page supports versioned admin edits with a required reason, while a
dedicated on-demand admin correction workflow, PDF export, and repeated reminders
remain pending. Stale-version conflicts preserve the user's draft.

Validation used the guarded loopback test targets only: Postgres `cogito-test`
6769, Redis 6381, API 3201 and web 3200. The class-report Chromium journey passed
1 test in 52.7s with tutor submission, admin correction, student read/privacy,
settlement, replay/edit behavior and a stale-version conflict. The existing class
enrollment spec passed 2 Chromium tests twice (42.6s and 41.5s); the fresh T05
student ID differed between runs. Web and E2E no-emit typechecks passed with
reduced Go memory settings. Saved parent-run report evidence remains 29 focused
class-enrollment/report tests / 203 assertions, one reset-fixture test / 7
assertions, and 2 pure report-settlement cases; those database suites were not
rerun in this UI recovery.

The runs used one Playwright worker and the cached Playwright 1.62.1 CLI through
Bun. T07 role sessions were authenticated sequentially before Chromium launch
with real Better Auth and reused via storage state; no auth or RPC behavior was
mocked. Providers were stubs/fakes only; no email, payment, Calendar, or other
external provider was called. A final read-only query matched migration 0067
journal row 68, timestamp `1792572957418`, and SQL hash
`0510e3bd5f1fd36860b8f289c81db5034b4ba40a2f1527736ea280ea77651037`. Its
lineage/hash remains unchanged and test-only on 6769. No development migration or
development DB reset/seed ran; guarded test runs used their per-run synthetic
fixtures. The parent retains ownership of the development migration. Logs are in the ignored
`tmp/v3-dev/t07-recovery-*` files.

## T07 report and payout checkpoint (21 October)

Migration `0067_class-session-reports.sql` was reviewed against snapshot
0066 and applied with the standard Drizzle migration runner only to the guarded
loopback `cogito-test` database on port 6769. Readback shows migration journal
row 68, timestamp `1792572957418`, SQL hash
`0510e3bd5f1fd36860b8f289c81db5034b4ba40a2f1527736ea280ea77651037`, and both
report tables present. The focused class-report integration group passed 6 tests
and 53 assertions; report, revision, and class-fee row counts were zero after
fixture cleanup. Two pure report-settlement unit cases, direct formatting, and
focused oxlint passed. The run used provider fakes only and did not reset or seed
the database. No development migration, browser run, or broad typecheck was run;
the parent owns those checks and the development migration decision.

## T07 pending-report reminders (21 October)

### Parent integration verification (22 October)

The reminder worker is integrated into local `f/release-v3` at `1f9b6dd7`; the
existing production job remains global. From the repository root, the guarded
PostgreSQL `class-enrollment.test.ts` suite passed 44 tests / 354 expectations
(exit 0, 9.62s), and the pure report-reminder suite passed 7 tests / 25
expectations (exit 0, 0.15s). Reproduce sequentially from the repository root:

```sh
bun --smol --env-file=tmp/v3-dev/.env.signup-parent test --timeout 30000 packages/api/src/tests/integration/class-enrollment.test.ts
bun --smol test --timeout 30000 packages/api/src/tests/unit/class-enrollment.report-reminders.test.ts
```

The installment assertions require the exact
fixture-owned 7-day and 1-day event keys, recipient and enrollment; replay queues
no additional installment notice, and a late join receives only its 1-day
notice. The guard verified `NODE_ENV=test`, exact loopback `6769/cogito-test`, no
URL query/hash, both reset overrides absent, and `SELECT current_database()`
before fixture writes. Cleanup deletes only owned UUID fixtures. No reset,
truncate, development seed or migration ran; no live email, browser or external
provider ran. Focused oxfmt 0.65.0 `--check` and oxlint 1.80.0 exited 0 on the
changed integration test; lint reported only existing file warnings. The full
check was not a typecheck or browser acceptance run. PDF export, dedicated
At this 22 October checkpoint, dedicated on-demand admin correction and legacy
reminder coverage remained pending; see the 23 October continuation below.
Logs: `tmp/v3-dev/t07-reminders-integrated-db-final.log` and
`tmp/v3-dev/t07-reminders-pure-final.log`.

### Initial isolated implementation checkpoint

In this isolated T07 worktree, the existing `class-enrollment-check` scheduler
runs every minute and now queues
at most 100 pending report reminders per pass for ended scheduled sessions in
published/postponed cohorts and masterclasses, plus retained past scheduled
sessions on cancelled classes. The first reminder is due at the session `endAt`;
later reminders are due once per 24 elapsed hours. A late or restarted scheduler
emits only the current due period, not missed daily copies. Cancelled or completed
sessions, completed classes and sessions with a report are ineligible.
The key `academy-class-session:{sessionId}:missing-report:day:{period}` is
deduplicated by the existing unique notification event-key index. The existing
notification dispatch job sends the paired email from its durable outbox and
retries dispatch failures. Notifications go only to the assigned tutor and link
to the authenticated `/class-reports` workspace; no student identity is included.

The worker locks and rechecks the class/session before writing. A new report,
session cancellation, completion, or stale schedule/tutor candidate suppresses a
stale write; parent class cancellation preserves reminder eligibility for a past
session that remains scheduled. It does not mutate reports, session state, holds,
or tutor fees, and does not interpret a no-show expiry as delivery. No migration
or new environment variable is required. Observe `class_report_reminder_failed` and the
`class_enrollment_due_jobs_complete` `reportRemindersQueued`/
`reportRemindersFailed` fields; email sends still appear under the existing
notification dispatch logs. At this class-only checkpoint, legacy
solo/group/series reminder coverage remained pending; the 23 October section
below records its implementation and current verification state.

The focused fake-clock suite passed 7 tests / 25 expectations. Guarded PostgreSQL
tests passed 3 / 34 on exact loopback `6769/cogito-test`; the integration test
refuses URL query/hash, requires both reset override variables to be absent, and
checks `SELECT current_database()` before fixture writes. It creates and cleans
only its own UUID fixtures and never calls `resetDatabase()` or truncates tables.
The database cases verify the ISO-serialized timestamp query, concurrent/replay
dedupe with one queued outbox row per period, current/next-day/catch-up periods,
report and class-cancellation races, cancelled/completed exclusions, notification
failure rollback/retry, and unchanged wallet/allocation/ledger/fee/report/session
facts. No live email, browser, payment or Calendar provider was used. The initial isolated source slice did not include a broad typecheck or browser
acceptance.

Initial isolated source checks used cached oxfmt 0.65.0 `--check` on six source
files and focused oxlint 1.80.0 (exit 0; existing non-fatal loop/scoping
warnings). No broad typecheck or browser run was performed for that bounded
source slice.

PDF report export, the dedicated on-demand admin correction workflow and overall
release acceptance remain pending T07 work. Legacy on-demand reminder coverage
is recorded in the 23 October continuation below.

## T07 legacy on-demand missing-report reminders (23 October)

The existing `class-enrollment-check` scheduler invokes the legacy booking worker
after the class-enrollment due jobs. It scans at most 100 ended solo/group
bookings or series children per pass. Whole-booking/session cancel, completed
and no-show states are excluded; participant-level group/series no-show does
not by itself prove that no delivery occurred. A stable current-period event key
and the existing notification email outbox keep each tutor notification
idempotent. The first reminder is due at the scheduled end, then every 24 elapsed
hours; a delayed scheduler queues only the current period.

Before enqueue, the worker locks the booking and series child in completion lock
order and rechecks tutor ownership, scheduled state, exact schedule, matching
report absence and event key in the notification transaction. The message directs
the tutor to submit a report only if the session was delivered. The worker does
not write report, delivery, settlement, wallet, allocation or fee state, and it
needs no schema migration or environment variable. The job result adds
`bookingReportRemindersQueued` and `bookingReportRemindersFailed` counters; per-
candidate failures log `booking_report_reminder_failed`.

Elapsed periods and exact schedule fingerprints use the full stored PostgreSQL
timestamp precision; millisecond normalization is limited to keyset
pagination. The initial focused pure suite passed 7 tests / 27 expectations and
its fairness follow-up passed 8 / 33; the current suite passes 10 tests / 44
expectations, including a pg-proxy period regression. Normal pre-push lint and
serial typecheck passed on the current reminder head; typecheck was 4/4 tasks
in 14.961s (2 cached). Parent's guarded non-reset PostgreSQL suite then passed
3 tests / 32 expectations at 127.0.0.1:6769/cogito-test against the
production finder and locked writer. No migration, reset, seed, or provider
call ran. Browser acceptance and actual email delivery remain unverified.

The worker rotates through a stable keyset cursor after each candidate, including
failed writes, and wraps to retry older due items once it reaches the end. The
cursor is process-local and resets to the oldest due item on restart; event-key
dedupe and email outbox rows remain persistent. No retry state migration is
required. `packages/api/src/tests/integration/booking.report-reminders.test.ts`
adds guarded non-reset coverage for report/state rechecks, duplicate jobs and
notification/outbox identity. Later regressions exercise the production SQL
finder and locked writer at microsecond boundaries, including 101-row cursor
progress, single and series-child day boundaries, due-at-end, and same-
millisecond reschedule rejection. Parent ran the guarded tests only against
loopback 127.0.0.1:6769/cogito-test with reset overrides absent; all 3 tests /
32 expectations passed. The test-only epoch formatter now matches PostgreSQL's
six-digit fractional precision, and year-0100 fixtures avoid Bun's year-0001
date parsing quirk. The current focused
unit suite passes 10 tests / 44 expectations. Parent's serial workspace check
passed at `b0b80bec`; the current normal pre-push typecheck passed 4/4 tasks in
14.961s (2 cached). Guarded DB acceptance is complete; browser acceptance and
actual email delivery remain pending.

## Prior local integration checkpoint (21 October)

f/release-v3 includes admin cancellation
446e2cd0 and student cancellation a7065443, alongside signup and payout. Migration
0066 applied through the standard runner to guarded loopback cogito-app/6767.
Dev readback: journal id 87, timestamp 1792559482042, hash
70a47d6cbd1f7539d4af45071eaf643ca99ec73c7046c033108d7e1475d54afd.
The owned API restarted; web 3000 and API 3001 return HTTP 200. No dev reset/seed
or live-provider test ran. At this baseline checkpoint T07 class reports/completion/settlement was next; lifecycle
follow-ups, AUTH-02/referrals and full release acceptance remain open. Main is unchanged.

Admin class cancellation migration 0066 was generated from snapshot 0065;
only public.academy_class_meeting changes (terminal cancelled status check).
SQL SHA-256: 70a47d6cbd1f7539d4af45071eaf643ca99ec73c7046c033108d7e1475d54afd;
journal timestamp 1792559482042. It is applied only to the verified disposable
T05 DB on 6769. Dev still has 0065 until final integration. No old migration
SQL/snapshot was rewritten and no database was reset for this change.
The normal class meeting scheduler also retries deletion after cancellation;
restore Google credentials/configuration to clear failed deletes. Manual fallback
refuses to claim a known provider event deleted while Google is unavailable.
Creation and cancellation provider operations remain outside database transactions;
financial cancellation and notifications commit independently from provider retry.
Verification currently passes 22 Postgres cases / 140 assertions and 46 Google
provider fake tests / 148 assertions, including in-flight and expired-lease creates.
Web and E2E typechecks pass; two Chromium real-RPC journeys pass in 59.2s. No real Calendar or
email provider was contacted by these tests.

Cancellation browser command from packages/e2e: with the guarded T05 ENV_FILE,
run `bun run test src/specs/class-enrollment.spec.ts --config=playwright.class-enrollment.config.ts --workers=1`.
The wrapper runs Vite directly on Bun with native TypeScript config loading.
The Windows executable shim spawned Node and intermittently stalled before
startup; a direct Bun probe started in 901ms. Student and admin journeys use
separate tests to release browser renderers between roles. VITE_TEST_CACHE_DIR
can isolate the T05 dependency cache without deleting shared dev cache files.
The disposable T05 DB was migrated through existing 0065 before the integrated
browser seed (no schema was generated). Dev and T05 now both include payout tax
columns; no dev reset or seed was performed.

Student class cancellation requires no new migration beyond enrollment 0064.
The parent implementation is on f/v3-class-cancellation, based on integrated
f/release-v3. Verification uses only the disposable T05 target 6769/6381,
API/web 3201/3200. Its PostgreSQL enrollment/cancellation suite passes 15 tests /
101 assertions, including replay, pay/withdraw race, rollback after fee deduction,
24h boundary and late-seat retention. Web no-emit typecheck passes with one Go
worker and reduced GC memory settings. Seven focused policy units pass. Chromium acceptance passes (1 integrated journey / 1.2m) using real RPCs; E2E typecheck passes. Do not mark the full T06 complete. This slice returns available
Marks only; it performs no bank/cash refund and sends no real-provider test mail.

Local dev checkpoint (21 October): f/release-v3 includes signup 3055ba54 and
payout 2482d7ec. The standard migration runner applied 0065 only after the exact
loopback cogito-app/6767 guard. Dev readback: journal id 86, timestamp 1792525224597,
hash 876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939,
and tutor_tax_config exists. The owned API was restarted; no dev reset or seed ran.
T06 cancellation and T07 completion/report remain next, and main is unchanged.

T03 parent verification (21 October): reused only the dedicated payout container
cogito-app-postgres-test-payout / volume cogito-t03-payout-20261021-data at 6770,
with Redis 6382 and API/web 3111/3110. Its journal row 66 matches migration 0065,
timestamp 1792525224597 and hash 876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939.
Postgres 11/105, units 11/32, service 7/13, Chromium 3/3 and E2E typecheck pass.
Evidence is preserved locally in the root tmp/v3-dev/payout-parent-* logs.
Dev migration must use its normal runner with exact loopback cogito-app/6767 guard;
never point these reset/seed suites at development. Final broad compiler acceptance
is still unverified; the parent encountered Windows VirtualAlloc errno 1455.

Final parent web typecheck could not complete: Windows VirtualAlloc errno 1455 (virtual memory exhausted); no successful final compiler result is claimed.

Parent signup verification (21 October): after the enrollment browser pass,
the known disposable T05 volume at 6769/6381 was reused serially for signup,
without resetting dev or the preserved older signup volume. The combined
signup and existing-account OTP DB suites pass 15 tests / 73 assertions.
The local test OTP fixture/cleanup also accepts this exact port with the same
test-mode, loopback and database-name guards. Browser security probes consume
the real auth IP budget; the fixture resets only `cogito:rl:auth:*` between
test phases using a guarded paired test DB/Redis script and a 10-second child
timeout. Application rate limits remain enabled. The reset safety and path
matching checks pass 19 tests / 69 assertions.
The final Edge run passes both `pre-account-signup.spec.ts` journeys in 1.4m.
The fixture reset uses Bun's native Redis client and a bounded child timeout;
the earlier helper/client and shared-cache failures are superseded by this
completed run. Fonts from the shared package cache emitted a Vite allow-list
warning in this isolated worktree; the assertions and app journeys still passed.

Integrated parent checkpoint: `f/release-v3` fast-forwarded to `bd123ce4` and
the owned API process was restarted. Web port 3000 and API port 3001 returned
200; API DB/Redis/scheduler/DLQ checks were healthy. The parent reran
`src/specs/class-enrollment.spec.ts` from the integrated root against the exact
T05 target and observed 1 Chromium pass in 1.6m. No dev data was seeded/reset.
Parent evidence logs are local under `tmp/v3-dev/`; they contain synthetic test
identities and are not release/client artifacts.

Parent verification follow-up (21 October): the enrollment worktree's Drizzle
links were aligned, source-level allocation state and public tutor relation
query type errors were corrected, and web `check-types` passed with
`GOMAXPROCS=1`, `GOMEMLIMIT=256MiB`, `GOGC=20`. Earlier failed typecheck attempts
remain historical evidence; the parent pass supersedes the web blocker below.
Docker processes were restarted without resetting volumes after its CLI hung.
The parent then ran the complete guarded T05 Postgres suite on the verified
`cogito-t05-enrollment-pgdata` volume: 9 tests / 69 expectations passed, including
new regressions for expiry during database waits and sessions starting before
checkout confirmation. Pricing/funding/public DTO units passed 12 / 37.
The initial DB attempt used the example credentials and failed authentication;
the verified test container's credentials were loaded privately for the rerun.

## T05 enrollment isolated test target and evidence (2026-10-21)

Destructive seed/reset and enrollment integration work used only the newly
created disposable Docker resources `cogito-t05-enrollment-postgres` with named
volume `cogito-t05-enrollment-pgdata` at loopback port 6769, database
`cogito-test`, and `cogito-t05-enrollment-redis` at loopback port 6381. This
volume was created because the pre-existing `cogito-test` volume contained
signup fixtures and user data; it was preserved. Development Postgres
`localhost:6767/cogito-app`, signup Postgres `localhost:6768`, and the signup
volume were not reset or migrated by T05 testing. The T05 volume is the only
target used by this feature's guarded database tests; the current 6769 seed
reset path is a no-op.

The integration test asserts `NODE_ENV=test`, PostgreSQL, a loopback hostname,
port `6769`, and exact database path `/cogito-test` before its first database
write. The Playwright spec additionally checks T05 DB/Redis/server/web ports
`6769/6381/3201/3200`; its global setup uses the same exact DB guard before
seeding. Provider behavior is stubbed. The synthetic V3 economy revision used
to exercise the existing top-up quote path is appended/activated only inside
this exact guarded test database; no customer pricing pointer or external
provider is called. Vite uses `apps/web/node_modules/.vite-t05-enrollment` for
the T05 browser server to avoid contending with the existing app's Vite cache.

The Playwright global setup requires `NODE_ENV=test`, `T05_ENROLLMENT_TEST_DB_PORT=6769`, loopback PostgreSQL port 6769 and exact `/cogito-test`. It skips cleanup on 6767 and 6768. Each 6769 run gets fresh seeded student identities, including the familiar Andre display name; existing enrollment, cancellation, ledger, quote and payment history is left unchanged. This avoids rewriting financial history and gives the run independent wallets. The T05 booking/lifecycle student starts with 326 Marks: booking-flow reserves 126 Marks before class-enrollment coverage, which retains its established 200-Mark funding assertions. Global setup also creates a second run-scoped student with 200 Marks for the parallel multi-plan class journey, keeping its 149-Mark spend separate from the booking and lifecycle tests; its 80/44/25 pricing and insufficient-funds assertions remain active. With the T07 class-report opt-in, setup creates a third isolated 200-Mark report student and storage state so parallel enrollment journeys cannot consume report funding. Other seed targets keep the 200-Mark default. The test seed blanks Resend credentials. The disposable T05 database accumulates run-scoped accounts and their fixtures per run; volume cleanup remains a separately assigned lifecycle task. The separate payout target at 6770 keeps the legacy-only reset for the exact Andre seed identity.

Pure guard and identity regression commands: `bun --smol test --timeout 30000 apps/server/src/seed/reset-seed-student.guard.test.ts packages/e2e/src/fixtures/test-accounts.test.ts`. The 6769 integration guard is authored in `apps/server/src/seed/reset-seed-student.integration.test.ts`; run it only during the assigned database window. The current authoring slice did not run reset, database integration, migration, browser E2E or full typecheck.

The fresh T05 database was migrated through `0064_academy_class_enrollment.sql`
using the normal Drizzle runner. Latest journal readback is timestamp
`1792522475956`, hash
`a9bced856633d71b70d5bfe4f3bf4b7a78c41122aa92eeb98f3845a6f8119c8b`. The same
additive migration was applied to dev by the parent; T05 did not apply it to
dev. No existing migration, journal, snapshot, or test data outside the named
T05 volume was changed.

Focused evidence, with no dependency installation or browser download:

| Check                                           | Command / target                                                                                                                                                                                                                                        | Result                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Pricing + funding invariants                    | `bun --smol test --timeout 30000 packages/api/src/tests/unit/class-enrollment.pricing.test.ts packages/api/src/tests/unit/class-enrollment.funding.test.ts`                                                                                             | 11 tests / 36 expectations passed |
| PostgreSQL enrollment concurrency and lifecycle | `bun --smol --env-file=$env:ENV_FILE test --timeout 30000 packages/api/src/tests/integration/class-enrollment.test.ts`, with the guarded T05 env file and 6769 DB                                                                                       | 7 tests / 64 expectations passed  |
| Public class DTO allowlist                      | `bun --smol test --timeout 30000 packages/api/src/tests/unit/academy-class.public.test.ts`                                                                                                                                                              | 1 test / 1 expectation passed     |
| Student enrollment browser journey              | From `packages/e2e`, `bun --smol --env-file=$envPath C:\.Projects\cogito-app\node_modules\.bun\@playwright+test@1.62.1\node_modules\@playwright\test\cli.js test src/specs/class-enrollment.spec.ts --workers=1 --reporter=line`; exact T05 ports above | 1 Chromium spec passed in 58.7s   |

The API database cases cover request replay and last-seat contention, atomic
rollback, rate snapshot immutability, insufficient balance and expiry, late
join/rejoin, deadline default and reminder catch-up, and role/ownership denial.
The browser journey covers full, half and single enrollment, no-seat denial,
repeat request and reload, insufficient Marks/top-up quote, and concurrent
duplicate second-installment payment. Reload waits for navigation commit and
then asserts the reloaded enrollment state; this avoids waiting on Vite's full
`load` event, which stalled on unresolved dev-source requests in the isolated
test server. The E2E package typecheck passed before the final reload-wait
assertions. API/web typechecks were attempted but are blocked by the existing
worktree dependency links resolving two distinct Drizzle ORM 0.45.2 builds in
`packages/api` and `packages/db` (`shouldInlineParams` type conflicts across
unrelated modules); no dependency link or installation was changed. Focused
`oxlint` exited 0 with style warnings, and `oxfmt --check` passed 27 changed
source/doc files; the very wide task table was excluded to avoid reflow. No T05
browser/API process remains on 3200/3201; the T05 Postgres/Redis containers
remain on 6769/6381 for parent review.

## Enrollment dev migration (2026-10-21)

Parent reviewed and integrated additive `0064_academy_class_enrollment.sql`
(`385fc959`, source `2f9786d0`). The first runner attempt failed because the
Docker Linux engine was unavailable. After starting Docker Desktop hidden and
the existing dev Postgres/Redis containers, the standard `bun run db:migrate`
from `packages/db`, with `ENV_FILE` explicitly selecting `apps/server/.env`,
succeeded against guarded loopback port 6767, database `cogito-app`.
No volumes were reset and no prior migration SQL/snapshot tables were changed.

Readback verified all four `academy_class_enrollment*` tables and latest journal
timestamp `1792522475956`, hash
`a9bced856633d71b70d5bfe4f3bf4b7a78c41122aa92eeb98f3845a6f8119c8b`.
This operation did not migrate/reset a test database or validate enrollment
runtime behavior. Generate the next migration from snapshot/journal idx64.

## Local V3 development startup (2026-10-20)

`f/release-v3` contains integrated baseline `10a733cd`. The local web app at
`http://localhost:3000` and API health at `http://localhost:3001/health` returned
HTTP 200 after Docker restart and the pending class migration. API health
reported database, Redis and scheduler healthy. The background development
processes write logs under `tmp/v3-dev/`; these are development processes,
separate from the exclusive test servers on ports 3100/3101.

The pre-integration dirty source is retained in the named
`v3 pre-integration source backup 20261020` stash. Do not pop it over the
integrated branch: those changes are already incorporated. Client document
artifacts and the old fee worktree remain preserved.

## V3 local integration database state (2026-10-20)

Read-only inspection used loopback URLs from `apps/server/.env` and
`apps/server/.env.test`; secrets were not printed. Migration tracking is in
`drizzle.__drizzle_migrations`. The four migration files and recorded hashes
match exactly:

| Migration                           | Applied timestamp | SHA-256                                                            | `cogito-app` dev | `cogito-test` |
| ----------------------------------- | ----------------: | ------------------------------------------------------------------ | ---------------- | ------------- |
| `0059_massive_blindfold.sql`        |     1792383364835 | `b4e69c578c477f72069aad24914fa9cc7193e3f79fe070e9efa858b5fa9a4669` | Applied          | Applied       |
| `0059_faq_rich_text.sql`            |     1792385462859 | `7f330d2e9be702fa8da6e1b1d9fba89771fb74b121a3c5bf3507901e1bfd40d7` | Applied          | Applied       |
| `0060_tutor_payout_allocations.sql` |     1792388580581 | `728a44d0efd1517513120928147fdcef3776991c20d6f0b9b136cf03c8ab8bf3` | Applied          | Applied       |
| `0061_academy_class_drafts.sql`     |     1792394899225 | `db9f27f77c76201b609400077a530ca8d5141f79b904c6f9a7ef1595a4a366b8` | Applied          | Applied       |

Both local databases now have `faq_entry`, `tutor_session_fee`,
`tutor_payout_allocation`, `academy_class` and `academy_class_session`.
`question_en_rich` and `answer_en_rich` are required JSONB columns, while
`question_id_rich` and `answer_id_rich` are nullable. Existing SQL files,
timestamps, hashes and journal rows were preserved. The unified journal orders
the four entries by their recorded timestamps, so Drizzle does not skip an
earlier imported migration behind the latest applied timestamp. No
reconciliation migration or historical fee backfill is required for the
observed databases.

After SQL/hash review and confirming no other worker was using the shared dev
database, the parent applied only `0061_academy_class_drafts.sql` to local
development through the standard Drizzle migration command. The command was
run from the B worktree's `packages/db` with the local dev env explicitly
selected:

```powershell
Push-Location C:/.Projects/cogito-app/.worktrees/v3-session-fee-contract/packages/db
$env:ENV_FILE = 'C:/.Projects/cogito-app/apps/server/.env'
bun run db:migrate
Remove-Item Env:ENV_FILE
Pop-Location
```

Read-only post-migration verification confirmed both
`drizzle.__drizzle_migrations` journals end with timestamp `1792394899225`, hash
`db9f27f77c76201b609400077a530ca8d5141f79b904c6f9a7ef1595a4a366b8`; each also
contains the preceding three hashes above. Their row IDs differ as expected.
No migration in this four-file V3 integration set remains pending for these
two local databases. The Playwright setup below has its own seed-target guard.
Separately, API tests that call `resetDatabase()` can reset only the exact
dedicated 6769/6770 pairs with explicit consent; port 6767/6768 are always
rejected by that helper. Neither policy authorizes use of `cogito-app` or
production.

## Guarded Playwright E2E runs (2026-10-20)

The E2E config and global setup resolve and load the same env file with ambient
values preserved, then both validate the target. Set `NODE_ENV=test` exactly;
`DATABASE_URL` must use PostgreSQL and a loopback host (`localhost`,
`127.0.0.1` or `::1`) with one of the exact database/port pairs: `/cogito-test`
on 6767/6768/6769 or `/cogito-test-payout` on 6770. API and web URLs must be
loopback HTTP origins, and `PORT` / `WEB_PORT` must match those URLs. Optional
`BETTER_AUTH_URL` and `VITE_SERVER_URL` must resolve to the same local API.
Validation runs before seed setup. Global setup uses its own guarded seed path;
this does not authorize the API test helper's broad `resetDatabase()` call.
That helper has the stricter 6769/6770 reset policy documented above and below.

GitHub Actions keeps its E2E dependencies disposable per workflow run: Postgres
maps `6769` to `cogito-test` and `6770` to `cogito-test-payout`; Redis maps
`6381` and `6382` to separate services. The regular browser partition uses
`6769/6381`, API and web ports `3201/3200`, and the full
`T05_ENROLLMENT_TEST_*` tuple. Its generated `.env.test`, migration step,
Playwright config and global setup resolve that same target. T05 setup creates
a fresh UUID-scoped student and skips the legacy seed-student delete path. The
workflow opts in to the T06/T07 role states and keeps report fixture reset
overrides absent. It runs the three tutor payout specs separately against
`6770/cogito-test-payout` and Redis `6382`, with T05 variables unset.
`E2E_AUTH_RATE_LIMIT_RESET=true` is explicit consent for the helper to clear
only auth limiter keys on those exact disposable loopback pairs before seeded
sign-ins; it does not change the product limit. No `resetDatabase()` consent
flags are set. Never run this CI seed path against a retained local
6769/6770 fixture; its databases and Redis services are disposable for the
workflow run. Do not set this flag for the retained 6767/6768 development
targets.

Nested Bun seed, cleanup and fixture-update helpers resolve `ENV_FILE` from the
E2E package directory and pass its absolute path to Bun. Their working
directory is `apps/server`; passing the original relative path could select
the regular `.env.test` during the isolated payout run instead of
`.env.test-payout`. Keep the explicit target guards in place for both
6769/6381 and 6770/6382.

Playwright starts its own API and web servers with `reuseExistingServer: false`;
the default ports are 3101 and 3100. Keep both free, or configure different
free loopback origins and matching port variables. The specs run serially with
one worker. Traces use `retain-on-failure` even when retries are disabled.
Google Meet is explicitly disabled in both the test server and seed setup.

From the repository root in PowerShell, run a FAQ browser spec this way:

```powershell
Push-Location packages/e2e
$env:NODE_ENV = 'test'
$env:ENV_FILE = '../../apps/server/.env.test'
bun run test -- faq-admin.spec.ts --retries=0
Remove-Item Env:NODE_ENV, Env:ENV_FILE
Pop-Location
```

Keep credentials in the selected env file; do not print them in logs. The
2026-10-20 guard checkpoint (`ad290158`, cherry-picked from `2e424c4e`) passed
7 unit tests / 32 expectations and the E2E package typecheck, as reported by
the parent. No destructive/browser E2E was run during this integration
checkpoint. The local test DB guard does not replace the separate guarded test
database requirement for automated destructive tests.

## Series cancellation and settlement verification (2026-10-20)

Historical runs used the retained `cogito-test-settlement` database on port 6767. The API reset helper now refuses every 6767 target, so the commands below
will fail before truncation. Do not redirect them to the retained 6769 or 6770
databases: those contain preserved fixtures and are not disposable reset
targets for this incident follow-up. Reruns require a separately prepared
fresh target matching the current reset guard. The test counts and snapshot
below describe the prior run only.

```powershell
bun --env-file apps/server/.env.settlement.test -e "const u = new URL(Bun.env.DATABASE_URL ?? ''); if (Bun.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.port !== '6767' || u.pathname !== '/cogito-test-settlement') throw new Error('Settlement DB guard failed'); console.log(JSON.stringify({nodeEnv:Bun.env.NODE_ENV,host:u.hostname,port:u.port,database:u.pathname.slice(1)}));"
bun test --timeout 30000 --env-file apps/server/.env.settlement.test packages/api/src/tests/unit/booking.service.test.ts packages/api/src/tests/unit/admin-booking.service.test.ts packages/api/src/tests/unit/booking.repo.test.ts packages/api/src/tests/unit/admin-booking.repo.test.ts
bun test --timeout 30000 --env-file apps/server/.env.settlement.test packages/api/src/tests/integration/admin-series-cancel-u6.test.ts
bun test --timeout 30000 --env-file apps/server/.env.settlement.test packages/api/src/tests/integration/booking-series-noshow-complete.test.ts
bun test --timeout 30000 --env-file apps/server/.env.settlement.test packages/api/src/tests/integration/booking-series-g18.test.ts
bun test --timeout 30000 --env-file apps/server/.env.settlement.test packages/api/src/tests/integration/booking-series-cancel-m4.test.ts
```

The 20 October review follow-up passed: service/repository unit suites **447/447
tests, 1,153 expectations**; admin U6 **7/7 tests, 70 expectations**; student
M4 **1/1 test, 4 expectations**; no-show settlement **7/7 tests, 69
expectations**; and G18 series completion **8/8 tests, 29 expectations**. U6
uses real admin/tutor API clients to verify solo release, forfeit, partial
release, and group-series release followed by completion; all cases assert
wallet/participant/booking holds and the parent terminal state. Settlement also
covers a lock-gated cancellation/completion race, solo/group no-show allocation,
repeated and concurrent settlement, malformed V3 honorarium rejection, and
fee-insert rollback. Logs showed the manual meeting adapter; email delivery was
not configured. No Google/Meet, payment, or email provider call was made.
Browser E2E and TypeScript checks were not run for this follow-up.
The retained test database contains only local test data and remains available
for review. After the last run (M4), its snapshot was: `booking` 2,
`booking_session` 2, `booking_participant` 2, `ledger_entry` 3,
`tutor_session_fee` 0, and `session_completion_feedback` 0. Each integration
suite resets this database, so rerunning any suite changes the snapshot.

## Catalog migration/acceptance gate — implementation in progress

Migrations `0056_complex_ricochet.sql` and `0057_legacy_competition_palette_backfill.sql`
have been applied to the guarded local `cogito-test` database only. Migration 0056
adds localized labels, row versions, inactive-by-default behavior for new rows, and
four nullable color columns constrained to complete parent palettes/no child
overrides. It preserves existing IDs, slugs, flags, and backfills the seven current
competition palettes. Migration 0057 restores those same palettes for seven legacy
0027 root aliases. The focused Postgres CRUD suite passed after both migrations;
the exact cases and remaining acceptance gaps are in
[`RELEASE-V3-TASKS.md`](./plans/active/RELEASE-V3-TASKS.md).

The guarded Postgres catalog suite now passes assignment/delete in both orders,
booking/archive in both orders over `booking.sessionTopic`, and stale concurrent
admin edits in addition to historical-reference protection, non-admin denial and
audit rollback. Run it with
`bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/competition-catalog.test.ts`;
latest result: 6 tests/72 expectations. The next reset-based dynamic-rate suite
also passed 1 test/5 expectations and asserted that draft saving leaves the V3
activation pointer unset. Run these reset-based suites sequentially against the
guarded local `cogito-test` DB only. The move/archive/restore browser journey is
`packages/e2e/src/specs/competition-catalog.spec.ts`; on Windows PowerShell, run
it with dedicated local ports so Playwright starts its own test server rather
than reusing a dev server:

```powershell
Push-Location packages/e2e
$env:ENV_FILE = '../../apps/server/.env.test'
$env:WEB_URL = 'http://localhost:3170'
$env:SERVER_URL = 'http://localhost:3171'
$env:PORT = '3171'
$env:WEB_PORT = '3170'
$env:BETTER_AUTH_URL = 'http://localhost:3171'
$env:CORS_ORIGIN = 'http://localhost:3170'
$env:VITE_SERVER_URL = 'http://localhost:3171'
$env:CI = '1'
bunx playwright test src/specs/competition-catalog.spec.ts --retries=0
Pop-Location
```

Latest run passed 1 Chromium test, covering child-slug search, archive impact
preview and confirmation, restore confirmation, moving an unused child, and the
inherited destination palette. The E2E setup seeds test accounts; run it
sequentially against guarded `cogito-test` only, and keep its ports separate
from any running dev app. Before production rollout, complete all
tutor/booking/discovery/calendar consumers and broader regression. New parents
remain unsellable until a valid rate is configured through the dynamic economy
flow. Do not activate customer V3 pricing until catalog consumers and
app/website cache behavior pass. A local test migration does not authorize
production rollout or change the commercial delivery date.

New parent creation requires four bounded numeric opaque OKLCH values; a partial
parent update retains omitted values, and children inherit the parent palette.
Arbitrary CSS, variables, URLs, and alpha are rejected. Current and archived
catalog references resolve to their stored parent palette for appearance without
rewriting booking names, prices, or financial snapshots.

## Marketing landing T11 smoke check (2026-10-19)

The non-video landing work is in `C:\.Projects\cogito-acad` on branch
`f/release-v3-nonvideo`. Run `bun run dev` or `bun run build` from
`C:\.Projects\cogito-acad\apps\web`. The latest production build completed;
static generation logged connection-refused errors from the existing public
approved-achievements request, so confirm that endpoint before relying on
achievement data in a local preview.

In `/en` and `/id`, check desktop and mobile navigation for the removed
Activities links and Start Learning CTA, and verify that the homepage no longer
renders the Events section. Direct localized `/en/events/townhall-and-101-series`,
`/en/events/simulation-days`, and their `/id/` counterparts still exist; leave
route mapping/redirect decisions to T10. Check the school strip with mouse
controls, focused ArrowLeft/ArrowRight keys, touch swipes, and
`prefers-reduced-motion` (scroll should be instant). Check testimonials at
320px, 390px, 469px, 470px, 768px, 1023px, 1024px and 1280px widths: the visible
card surface fits its frame (including at 470px), with no horizontal page
overflow or overlapping controls; arrows, dots and touch swipe change the active
card; autoplay advances after 6.5 seconds; hover/focus and an active touch
gesture pause it; the visible Play/Pause control works; reduced motion disables
autoplay/transitions.
Confirm accessible names and keyboard focus rings. Confirm the refined Why
Cogito label-to-heading (16px) and heading-to-cards (32px) spacing with the
client; the approved feature showcase still requires M02/Q14. A headless Edge run on 2026-10-19 passed at 320, 390, 469, 470, 768,
1023, 1024 and 1280px widths, including mobile menu checks in `/en` and `/id`,
manual logo scrolling, carousel autoplay/pause/resume, touch hold and swipe, and
reduced-motion behavior. The testimonial surface stayed within its frame, its
controls remained below it, and the page had no horizontal overflow or client
errors after the FAQ viewport hydration fix. This did not cover a physical
device, screen reader, or client visual acceptance.

## V3 checkout verification and activation gate (2026-10-18)

Migrations `0054`–`0057` were exercised only against the guarded local
`cogito-test` database. A missing/null `economy_v3_activation.active_revision`
keeps customer pricing legacy; applying migrations or saving a draft does not
activate V3. Discovery and booking price projection now use the selected
catalog parent's rate from the active revision, and a new unconfigured parent
cannot fall back to a tutor's legacy base rate. Active V3 group-series prices
at target headcount, pins its revision and recalculates viable partial groups at
confirmed headcount before reconfirmation; each participant's remaining package
hold and the booking/scheduled-session snapshots are updated together. A null
pointer keeps legacy group-series behavior. Do not set a production pointer yet:
analytics interpretation, website cutover, balance UI browser QA, and
release/provider acceptance remain incomplete.

Tutor profile reads use the active V3 pointer for their fee projection. A null
pointer returns no V3 projection and keeps legacy base-rate writes available.
An active pointer makes changed legacy `baseRatesIdr`/`prices` writes fail with
`INVALID_TUTOR_PRICING`; admin edit approval ignores queued `baseRatesIdr`.
Review submission reads the activation pointer in the same transaction as the
status update: active V3 does not require legacy fee fields, while a null pointer
keeps the current legacy fee requirement. The web form also skips legacy fee
validation when it has an active V3 projection.
Admin Business insights expose booking pricing-snapshot counts by engine; they
do not convert V3 Marks to IDR or report booking platform take. Successful
payment and refund rows remain the source for net top-up revenue. Resolve Q15 in
the decision register before adding booked-service money totals. Snapshot counts
use booking creation time and include every booking state.
Verify the engine buckets against guarded PostgreSQL with
`bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/admin-dashboard-analytics.test.ts`.
Verify the guard and projection with:
`bun test packages/api/src/tests/unit/tutor.service.test.ts packages/api/src/tests/unit/admin-tutor.service.test.ts`.
No migration is required for this profile/API slice.

Verify V3 group-series target pricing, pinned-revision partial repricing,
reconfirmation and insufficient-funds preflight with:
`bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/unit/booking.service.test.ts`.
This focused unit suite does not write the activation pointer or use a production
database.

Verify that the repository updates only scheduled child-session snapshots and
holds with:
`bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/booking-group-series.test.ts`.
This suite resets only the guarded `cogito-test` database and does not set the
V3 activation pointer.

Run the isolated DB suite with:
`bun scripts/run-test-suite.mjs api --timeout 30000 packages/api/src/tests/integration/v3-top-up.test.ts`.
It resets only a guarded test DB, enables a fixture revision, proves concurrent
purchase uniqueness and late credit, then clears activation in teardown. Do not
run reset-based suites alongside browser fixtures or other database tests.

Dynamic catalog-rate admin integration is covered by
`bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/v3-dynamic-competition.test.ts`.
It creates a parent through admin RPC, verifies it starts unpriced, saves its
rate into a draft revision, and asserts the activation pointer remains unset.
The catalog CRUD and economy-role suites also reset the guarded test DB; run
those sequentially, never against development or production data.

V3 uncertain checkout retains one payment/order identity. Use authoritative
provider reconciliation on that record; an absent checkout URL or quote expiry
does not prove the provider failed. Do not manually issue another provider POST
or replace the payment ID to recover it. Live Midtrans operation, new balance UI
browser QA and production migration remain unverified.

## V3 report input smoke check (2026-10-18)

Run `bun test --env-file apps/server/.env.test packages/api/src/tests/unit/booking-completion-feedback.test.ts packages/api/src/tests/unit/booking.service.test.ts`.
Evidence: 295 tests pass, including aggregate 600/601 boundaries, emoji, CRLF,
prefixes, empty lines, more than 30 short bullets and direct-service rejection
before financial/report writes. No database migration is required for this slice.
In browser, open Complete session as the assigned tutor: check all three counters,
paste multiline text/emoji, exceed 600 and confirm completion is disabled without
losing the draft. This browser smoke passed at exact 600 and over-limit 601; the
exact-limit button enabled and the over-limit button disabled. No report was
submitted, so settlement is still unverified here. Historical reports must remain
readable.

## V3 class draft admin smoke check (2026-10-19)

Migration `0061_academy_class_drafts.sql` is additive and creates empty class/session tables; it does not backfill or publish records. It is applied to both local `cogito-app` and isolated `cogito-test`; the parent applied it to dev after SQL/hash review. The focused test command was:

```
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/academy-class.test.ts
```

It passed 4 tests / 18 expectations, including admin-only access, audit reason/snapshots, optimistic version conflicts, online + managed-room draft sessions, stable session IDs after reorder, room/tutor capacity and modality validation, and overlapping-session rejection. The guarded test helper truncates class/session tables only in `cogito-test`; never run it against development or production data.

Local UI smoke: sign in as admin, open `/admin-classes`, create/edit a cohort draft with at least one online and one in-person session, verify an active competition, published mode-compatible tutor and managed room are selectable, and save a reason. Reorder sessions and confirm their identities remain. Drafts are not public and do not reserve rooms; publication-time overlap checks, Meet creation, cover upload and notifications are implemented and browser-verified. Published-only public list/detail and the student enrollment flow are browser-verified. T02 delivery fees and T07 report/expiry settlement remain open. T06 lifecycle controls are implemented in the current worktree, with parent review/dev integration pending. Do not present the draft page as launch-ready; M01 class content/assets remain pending. The T05 API/web typecheck blocker and focused evidence are recorded above.

## V3 published class read contract (2026-10-20)

Pure DTO test:

```
bun test packages/api/src/tests/unit/academy-class.public.test.ts
```

It passed 1 test / 1 expectation and verified the response omits tutor payout/account fields, room details, and roster data. `bun run --cwd apps/web check-types` passed after linking the existing workspace dependencies from `C:\.Projects\cogito-app`; no dependencies were installed. Browser E2E and database tests were not run. `classes.list` and `classes.get` are public reads of published classes only; they do not enable enrollment.

## V3 class publish and Meet retry verification (2026-10-20)

`0063_academy_class_meetings.sql` is an additive migration for per-session provider work. The author first applied it to guarded loopback `cogito-test`. After reviewing the SQL and fixes, the parent applied it through the standard runner to guarded `localhost:6767/cogito-app` and verified `academy_class_meeting` plus journal timestamp `1792496861907`, hash `f3c0a5888c23dc94ef487f8e4d9aca7052e338705ab34c9c62b3be207ccfb41e`. Existing migration SQL, hashes, and timestamps were preserved.

Publish is version-checked under a class-row lock. Before commit the service rechecks active competition ancestry, tutor publication/mode/capacity, future sessions, approved flat class fees, cohort rules, managed-room capacity and conflicts. Publication, session scheduling, audit, one deduplicated notification per assigned tutor, and online-session meeting jobs commit atomically. Provider calls happen after commit; leased jobs retry with backoff and stable Google event identity. Test mode uses a controlled provider adapter and the E2E server disables Google credentials.

The guarded API integration suite passed 9 tests / 51 expectations, including deterministic gated races where room capacity changes from 10 to 4, a room is deactivated, and a competition is archived while publication waits. The focused meeting-provider unit files passed 42 tests / 146 expectations. The Playwright admin-to-student journey passed 1 Chromium spec (15.8s; about 1.2m including server startup and fixture seed), including the controlled case where Calendar accepts the event, Meet URL generation is pending, and retry resumes the same event. The test adapter is local-only; Google Meet is disabled. All database work targeted loopback `cogito-test`; dev and production were not touched.

Run provider unit tests with `bun test packages/api/src/tests/unit/google-meeting.provider.test.ts packages/api/src/tests/unit/academy-class.meeting-provider.test.ts`. Database-backed `academy-class.test.ts` callers of `resetDatabase()` now require a fresh approved target and explicit reset consent; the shared `.env.test.example` intentionally leaves `DATABASE_URL` unset. For the browser spec, provide an explicit E2E env file with `NODE_ENV=test`, `ENV_FILE`, `GOMAXPROCS=2`, and `GOMEMLIMIT=768MiB`, then run `bun scripts/run-test-suite.mjs e2e src/specs/academy-class-publish.spec.ts`. Playwright launches the Vite test server via Bun's `run --bun` mode. Migration `0063_academy_class_meetings.sql` is applied to both local dev and the class test database; parent dev table/hash readback passed.

## V3 draft economy editor (2026-10-18)

Migration `0054_v3_economy_revision.sql` was applied only to the isolated
`cogito-test` database. No production migration was run. The migration and suite
were exercised with:

```
bun scripts/run-test-suite.mjs api --timeout 30000 packages/api/src/tests/integration/economy-roles.test.ts
```

That file now includes two simultaneous same-version V3 saves (one winner),
immutable previous revision, transactional audit failure rollback and unchanged
active legacy settings. The suite passed 7 tests/26 expectations. The test reset
helper explicitly truncates the new table in the guarded dedicated test DB. Do
not run that reset against development data or production.

Open `/admin-economy` as admin after migration: edit package and surcharge
values, review every current parent, and enter both rates for any additional
parent that should be priced. Incomplete dynamic rates remain blank/unavailable;
children inherit their parent's rate. Verify the 1–6 student preview, custom
440 Marks recommendation at equal package price, invalid-rate/missing-reason
rejection, save/reload, and stale-version conflict. Student/tutor direct RPCs
must fail. Browser QA passed for draft controls and 390px mobile layout; the
Selia preview table scrolls inside its card. Draft saves do not change live
checkout while the activation pointer is unset.

The dynamic parent admin path passed one PostgreSQL integration test (5
expectations); catalog CRUD and concurrency passed 6 tests/72 expectations; economy roles passed
7 tests/26 expectations. Run each reset-based integration file sequentially
against the guarded `cogito-test` database only.
Screenshots are in `tmp/v3-admin-440.png` and `tmp/v3-admin-mobile-fixed.png`.

Unit check: `bun test --env-file apps/server/.env.test packages/api/src/tests/unit/v3-rate-card.test.ts packages/api/src/tests/unit/v3-economy-config.test.ts packages/api/src/tests/unit/v3-economy-service.test.ts packages/api/src/tests/unit/pricing.service.test.ts packages/api/src/tests/unit/admin.service.test.ts`.
For low-memory Windows typecheck, set child-process `GOMAXPROCS=2` and
`GOMEMLIMIT=768MiB` before `bunx --no-install tsgo --noEmit -p apps/web/tsconfig.json`.
Free disk space and start Docker before database verification; C: had ~250 MB.

## V3 rate-card groundwork (2026-10-18)

Run `bun test packages/api/src/tests/unit/v3-rate-card.test.ts packages/api/src/tests/unit/pricing.service.test.ts`
for the V3 default matrices/top-up boundaries and existing pricing regression.
This slice requires no database, secrets, migration or environment changes.
There is no V3 pricing activation command yet: do not seed new package amounts
or replace current economy defaults to simulate rollout. Activation must wait
for persisted config/quote/booking snapshots and compatibility checks in T01.

## SnapCN video tooling (2026-10-18)

Run `bun install`, then `bun run video:studio` from the repository root
(port 3002). `bun run video:still` writes `apps/video/out/cogito-intro.png`;
`bun run video:render` writes `apps/video/out/cogito-intro.mp4`.
Verify with `bunx turbo run check-types build --filter=@cogito-app/video`.
First render downloads Chromium; upstream font loaders need network access.
No backend services or application env files are required. Keep all Remotion
package versions aligned. Add registry components only from `apps/video`;
see its README for the command and alias configuration.
If the first render fails with `ENOSPC`, free disk space before retrying;
the Chromium download alone is about 120 MB, plus extraction and bundler caches.

Last updated: 2026-10-19

## Student dashboard balance CTA fit (2026-10-02)

Open `/dashboard` as a student at the desktop layout width. Confirm the balance
widget keeps **Find a tutor** on one line and renders the secondary **cash-plus**
icon at the same height as the primary CTA. Keyboard focus and assistive
technology must announce the icon-only link as **Top up**; hover should expose
the native tooltip. Confirm activating it opens `/balance`. On the Balance page,
confirm the reusable widget still renders its labeled **Find a tutor** CTA.
No environment, migration, job, or deployment configuration is required.

## Tutor profile history smoke check (2026-09-29)

Open `/profile` as a tutor, change the account name and one profile field, then
save. Open the admin tutor review page and confirm one newest history row shows
the complete before/after snapshots with `displayName` and the changed field in
`details.changedFields`. For a published tutor, submit a photo or structured
edit and confirm the pending proposal remains private until admin approval.
Revert the only pending specialization to its current public value and confirm
the edit-review status clears. Simulate an audit insert failure in integration
testing and confirm no profile/account mutation commits.

Submit the final two pending invitation decline/withdraw requests together and
confirm the booking reaches exactly one resolved state, never participant
confirmation with zero pending invitees. Impossible analytics dates such as
`2026-02-31` must fail validation. Soft-delete an achievement and confirm it
disappears from active moderation counts; restore it and confirm row plus audit
history return atomically.

## Dashboard timezone and empty-state smoke check (2026-09-25)

Open a booking list, booking detail, tutor dashboard, and admin operations page
with a booking in `Asia/Jakarta`. Date/deadline labels must end in `WIB`, never
`GMT+7`. Other test timezones may retain their native Intl short label. Confirm
empty states retain existing backgrounds and spacing; no dashed border is
expected because that visual trial was reverted.

## Tutor class-capacity smoke check (2026-09-22)

Apply migration `0050_tutor_class_capacity.sql`. Open `/profile` as a tutor,
set Online maximum to 3 and Offline maximum to Private only, then save. As a
student, confirm tutor discovery shows pricing only through size 3 online and
size 1 offline. On the booking page, Online must allow at most two invitees;
switching to Offline must remove invitees and disable student search. Bypass
the UI and call both `booking.createGroup` and `booking.createGroupSeries`
above the configured maximum; both must return `BOOKING_TUTOR_CAPACITY` before
holding Marks or creating a booking. Existing bookings are unaffected.

## Temporary Knowledge Bank access grants (2026-09-18)

Deploy the API/web build together with migrations
`0048_knowledge_bank_access_grant.sql` and `0049_abandoned_vertigo.sql`. After
the migrations, an admin can open
`/admin-knowledge-bank`, type at least two characters of an existing student's
name or email, select the matching student result, choose a future expiry, and
optionally add an operator note. New grants default to 30 days out at 23:59 in
the operator's local time. Active and expired grants remain visible in the
table. **Edit** can extend or shorten a future expiry; **Remove** immediately
restores the normal student Marks gate. Expiry is enforced on each Knowledge
Bank metadata and file request, so no scheduler or manual cleanup is required.
At narrow viewport widths, confirm the grant columns scroll horizontally
inside the card without causing page-level overflow or clipping the filters.

For a production smoke check, use a student below 35 total Marks: create a
grant from the selected search result, refresh `/knowledge-bank`, open a PDF,
then verify an expired grant locks both metadata and PDF access again. Remove
the test grant after verification. The API records create/update/remove audit
events under `knowledge_bank_access_grant`.

## Competition Calendar agenda list (2026-09-18)

In the `/calendar` smoke check, Agenda should show a flat list for the
selected 30-day period. A multi-day competition must appear once, its full
date range should remain visible, and entries should be ordered by the first
day of the competition. This is a frontend-only check; no environment,
migration, job, or deployment configuration is required.

## Bulk date-override smoke check (2026-09-09)

Open `/availability` as a tutor. In **Weekly hours**, verify Start date cannot
be earlier than tomorrow, End date cannot be earlier than Start date, and the
range cannot exceed 52 weeks. Save a short range and confirm generated slots
appear only between the two selected dates in Calendar preview. In **Date overrides**, verify the Online,
Offline, and Both tabs are keyboard-accessible. In the morning, select today
with an evening time and confirm it saves; then select a start minute that has
already passed and confirm inline validation disables Save. Add and remove several future
dates; add up to four non-overlapping time ranges; and save. The calendar
preview must show every selected date/range with the chosen modality. Repeat
with a past/duplicate date, malformed or reversed time, overlapping range, and
conflict against an existing one-off window: inline validation must explain the
problem, keep Save disabled, and prevent the request. Bypass the client check
with the API test or a second browser only for the conflict case; the server
must still fail without persisting any part of the batch. A
conflicting weekly-generated occurrence should be soft-deactivated and replaced
by the override. This feature adds no migration, environment variable, job, or
deployment-time configuration.

## Dynamic dashboard greeting smoke check (2026-09-08)

Open `/dashboard` as a student, tutor, and admin. Confirm the greeting uses the
account's first name for students and tutors, always uses the fixed label
`Admin` for admins, and contains role-appropriate language. Test browser-local
hours at 05:00, 11:00, 15:00, and 18:00 to cover morning, midday, afternoon,
and evening boundaries. Reloading may choose another phrase; background query
updates must not change the chosen phrase. Also verify an upcoming student
lesson, a tutor review queue, and a non-empty admin priority queue produce
relevant supporting copy.

## Unified booking-action smoke check (2026-09-08)

Open booking details for student, tutor, and admin roles. Verify every available
booking action appears in the header action group below the status badge and the
old sticky-rail Booking actions card never renders. Reschedule, invitation,
reconfirmation, and pending-invite states must show contextual copy in place of
the generic state description. After the 15-minute lateness threshold, the
report icon must expose `Report a tutor issue` to assistive technology and open
the existing report dialog. This check supersedes older action-placement steps
below; Student notes and tutor Session feedback remain in the Session overview, while support reports remain in the main flow.

## Competition field palette

Competition colors are catalog data rather than a fixed seven-slug UI map. Parent
rows own light text/background and dark text/background OKLCH values; child rows
inherit them. API projections resolve current and archived references by stable ID
first and exact stored slug second. Unknown legacy content receives the documented
neutral compatibility palette. UI consumers render the configured foreground and
background for the active theme, while event labels and financial snapshots retain
their stored identity and terms. Admin preview and consumer QA remain part of the
T00A acceptance gate in `RELEASE-V3-TASKS.md`.

For the authenticated `/calendar` filter smoke check, confirm each option uses the
loaded event category's parent `coreCategory` slug and English `name`; when a
category name is missing, the seven legacy slugs keep their familiar labels. Add
or publish an event for a new parent slug and refresh the data: its option should
appear selected while any previously excluded types stay excluded. Select only
the new type and confirm both month and agenda views show matching events. With
all current options selected, uncategorized events remain visible. Use **Reset**
after excluding types and confirm it restores every option currently in the
loaded event data.

> **Start here for ops:** [INFRA-PLAYBOOK.md](./INFRA-PLAYBOOK.md) is the entry
> point (scenario → command table). This document holds the detailed
> procedures behind it.

On the student dashboard, verify the balance widget shows available, held, and
total Marks from the wallet snapshot. **Top up** must open `/balance`. At 35 or
more total Marks, the Balance page's Knowledge Bank card must show access and
open `/knowledge-bank`; below the threshold it must offer a top-up path. Confirm
the Balance page places the widget beside Knowledge Bank Access on desktop and
stacks them cleanly on narrow screens. On the student dashboard, confirm the
widget's **Find a tutor** action opens `/tutors`; its dashboard counterpart keeps
the icon-only **Top up** action and opens `/balance`. Confirm the widget remains
contained beside the Competition Calendar card on the student dashboard. At 320
px and 390 px wide,
confirm the Balance page has no page-level horizontal clipping before and after
creating a QRIS purchase; the QR code must scale within its nested payment card.
Test with populated Marks history as well: mobile amounts should sit below their
descriptions, while desktop amounts remain right-aligned on the same row. Each
date must appear below its transaction reason, and both the amount and resulting
balance must use the shared Marks icon as a prefix.

The admin dashboard Booking activity card now opens its explanatory copy from a
compact info icon directly beside the title. Verify the popover opens with
hover, keyboard focus, click, and touch; remains readable in light and dark
themes; and does not displace the WIB badge. No environment or operational
change is required.

Repeat the interaction check on booking-detail cards with explanatory header
copy: Session overview, Series sessions, Activity, Honorarium/Marks, Booking
actions, Student notes, Session feedback, Support reports, Stay in touch, Room assignment, Admin
review context, Wallet impact, and State history. The trigger must sit directly
beside its title without leaving a blank description row.

The 2026-09-04 sidebar logo contrast polish is frontend-only. It adds no
environment variables, migrations, jobs, or operational steps.

On the authenticated student, tutor, and admin shells, create or seed pending
booking rows and verify the sidebar shows a compact badge beside **My Bookings**
or **Bookings**. The number must match the pending rows in the shared **Needs
action** view, disappear when there are none, and render `99+` when the result
exceeds the compact display limit. Confirm the link remains keyboard accessible
and the badge does not widen or overflow the sidebar.

Also verify the primary sidebar order: students see **Dashboard**, **Tutors**,
**My Bookings**, **Balance**, **Achievements**; tutors see **Dashboard**,
**Bookings**, **Availability**, **Tutor Profile**; and admins see **Dashboard**,
**Operations**, **Bookings**, **Tutors**, **Economy**, **Achievements**. The
shared Resources group and footer account menu should remain available, and the
**Tutor Profile** wording should remain unchanged. This is presentation-only;
no environment or operational change is required.

## Production UI and E2E audit (2026-09-04; reschedule follow-up 2026-09-05)

The full browser workflow now contains **14 tests across four specs**. The
booking spec passes 7/7 locally, covering the seeded student solo and group
booking flows, tutor acceptance/decline, accepted-online reschedule, and
cancellation. The other specs cover cross-student access denial, contact
privacy, all-role economy checks, and booking layout containment at 170px and
390px. The layout check is safe to run after state-changing tests because it
accepts either booking rows or the empty-state collection view.

The root `bun run check-types` gate also type-checks `packages/e2e` with the
browser DOM library enabled, so layout assertions cannot drift outside the
repository's normal typecheck coverage. CI retains both the HTML report and
failure screenshots/traces for diagnosis.
The migration step explicitly passes `ENV_FILE=../../apps/server/.env.test`
through the Turbo `db:migrate` task, keeping the browser database isolated.
Chromium installation runs with `packages/e2e` as its working directory so the
CLI resolves the locked `@playwright/test` version and installs the exact
headless-shell revision expected by the browser suite. If CI reports a missing
Playwright executable, verify this working directory before changing test code.

The authenticated shell has a skip link, accessible sidebar state, semantic
tutor-card buttons, explicit page headings, and production-only devtools
guards. Time-sensitive labels refresh through a shared 30-second clock hook;
reduced-motion and token-based overlay styles remain in effect.

The 2026-09-02 admin booking-detail layout consolidation adds no environment
variables, migrations, jobs, or operational steps.
The 2026-09-28 automatic override policy adds no environment variables,
migrations, or jobs. In the override dialog, choose only the category and
reason; verify the bordered header, category-sensitive info/warning outcome
notice, and read-only roster with each participant's avatar, role, and outcome
badge. The notification helper remains visually secondary. There must be no
separate Marks-action or participant selector.
For an offline scheduled booking, remove its room and verify the room selector
remains available; assigning a new room must succeed without changing the
scheduled session window.

> **Quick entry:** for "I want to change X → which commands do I run", use
> [INFRA-PLAYBOOK.md](./INFRA-PLAYBOOK.md) (scenario → command decision
> table, incl. deploy/migration/disaster-recovery flows). This document
> holds the detailed procedures behind it.

## Collection transition QA (2026-08-28)

The stable-pagination behavior requires no environment variable, migration, or
server rollout. When checking the web UI, verify that changing either admin
tutor table page keeps the old rows visible while loading, disables that table's
pagination controls during the request, and scrolls the owning card into view.
Changing tutor discovery search/filters and the admin booking-queue filters
should also retain the prior collection until the response arrives. Wallet
lookup and student search should continue to replace results only after their
own query completes; wallet lookup should search by visible user identity and
only load wallet data after an admin selects a result.

Started-session cancellation check: open a scheduled booking as its student before start and confirm Cancel booking is available. The confirmation dialog must require a non-blank reason, keep its submit action disabled for whitespace-only input, and share the saved reason in booking activity/notification. Tutor decline and both student/tutor reschedule APIs must also reject a missing or blank reason. At/after `scheduledStartAt`, reload the detail and confirm the action is absent. Calling `/rpc/booking/cancel`, participant withdrawal, or per-series-session cancellation directly must return `BOOKING_CANCELLATION_DEADLINE_PASSED`, must not deduct/release Marks or cancel the meeting, and the tutor must still be able to complete the booking. Route post-start delivery/attendance problems through support/admin review.

Booking-list smoke check: verify Needs action, Upcoming, Series, History, and All. Students and tutors default to Upcoming; admins default to All. Each selection must immediately update the active tab, show the content loader, and return only server-filtered rows for that view. Tab counts must remain exact before and after **Load more bookings** appends the next cursor. Recommended, Soonest, and Latest order the loaded filtered rows, `?tab=`/`?sort=` preserve choices, and History contains every terminal outcome.

For tutor coverage, use a scheduled booking whose `scheduledEndAt` is in the
past but whose state is still `scheduled`. It must appear in Needs action and
the sidebar badge, must not appear in tutor Upcoming or History, and must not
appear as a completion task in the student's Needs action view. For a series,
end one child session while leaving a later child scheduled and verify the
parent appears in the tutor action view. After **Complete session**, verify the
row leaves Needs action and the facet count refreshes.

Timing-chip check: pending rows with `deadlineAt` show Respond in, switch to warning within three hours and danger within 30 minutes, then say Response overdue without pretending the state is Expired. Confirmed/scheduled rows show Today, Starts in within three hours, Starting soon within 30 minutes, and In progress between start and end. Completed, declined, cancelled, expired, and other terminal rows show no chip. Leave the page open and confirm labels refresh without reloading.
On `/bookings`, verify the timing chip follows the role-appropriate financial summary (IDR Honorarium for tutors; Earns/Total or You pay for student/admin views) and has a vertical divider on its left. On student and tutor dashboards, verify the shared next-lesson card hides You pay/Earns/Total while retaining the timing chip.

On the student `/tutors` page, open **Filters** at a 320 px CSS viewport and
verify the filter card and category/specialization popups stay inside the
viewport. Select multiple categories and confirm the selected indicators and
the popup's right edge remain visible; the page itself must not gain horizontal
overflow. Repeat at 390 px.

For manual tutor-invite delivery, copy the visible latest link. After reloading the page, use **Generate & copy link** on a pending invitation history entry; this safely rotates the token instead of persisting plaintext secrets.

**Generate & copy link** never sends email. Use the separate **Send again** action when an admin intentionally wants Resend to deliver a replacement link.

Tutor invitation delivery should be smoke-tested in both desktop and mobile email clients. Verify the **Accept invitation & set up profile** button and fallback URL lead to `/invite?token=…`, the invited account email is correct, and the displayed expiry is explicitly labeled UTC.

On `/admin-tutors`, verify the Invitations table uses semantic status colors: invited is warning, accepted is success, and expired/revoked are danger. The invitation filter and row actions should remain unchanged.

Also verify the Invitations table shows up to 3 rows per page and Tutor Profiles shows up to 5 rows per page; each table's pagination advances independently.

## Starting the Server

### Production URL topology

- Company profile: `https://cogitoacademy.id` (kept on Hostinger)
- API/Auth/health/webhooks: `https://api.cogitoacademy.id`
- Frontend: `https://app.cogitoacademy.id`

Do not point the apex DNS record at the OVH VPS. Configure only the `api` and
`app` subdomains to the VPS; keep Coolify administration private through an
SSH tunnel rather than exposing port `8000`.

**Coolify API access (verified 2026-08-31):** the Coolify container publishes
`:8000` on `127.0.0.1` only (`127.0.0.1:8000->8080/tcp`), so the control node
must tunnel before running `coolify-resources.yml` / `drift-check.yml`:

```bash
ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@cogito-vps.tail674634.ts.net
```

The playbooks default to `http://localhost:8000/api/v1` (the tunnel). The
Coolify host server is registered as `localhost` (`ip=host.docker.internal`),
matched via `is_coolify_host` — not by IP.

For Terraform bootstrap, first-time provisioning, normal releases, and the
manual GHCR/Coolify fallback when CI quota is unavailable, see
[Setup and Deployment](./DEPLOYMENT.md).

The Coolify `localhost` server validates itself by SSH-ing to
`host.docker.internal` with Coolify's generated key. Root password login stays
disabled; only that key-based connection is allowed. The bootstrap exempts
Docker's private `10.0.0.0/8` range from fail2ban, which prevents repeated
Coolify checks from causing a false `Connection refused` status.

### Login/auth smoke check

Open `/login` in a clean browser and sign in as a student, an onboarding-incomplete tutor, an already-submitted tutor, and an admin. The email button may show progress while the auth request, fresh session read, and tutor-status read complete; it must then go directly to `/dashboard` for the student, submitted tutor, and admin, or `/profile` for a tutor with no profile or `draft`/`changes_requested` status, without an intermediate `/login` navigation. Verify a wrong password returns the form with an error and the button is usable again. For a return link such as `/login?redirect=/bookings`, verify it lands on the validated target after the same handoff.

Also verify the client validation feedback: blur an empty or malformed email, a short password, and (on sign-up) a short name or password missing uppercase/lowercase/digit requirements. Each invalid field should show its own Selia inline error and danger outline; submitting incomplete data should reveal the field errors and must not call `/api/auth`. Correcting the values should clear the errors and re-enable the normal auth request. An API-level malformed JSON request to `/api/auth/sign-up/email` must return 400, never 500.

### Profile and tutor-onboarding smoke check

After a web deployment, sign in as a student and open `/profile`; then sign in
as a tutor and open `/profile` to inspect the tutor-owned editor. A new or
incomplete tutor should arrive there after login, while a tutor whose profile
has already been submitted should arrive at `/dashboard` and can open
**Tutor Profile** from the sidebar when needed.
Submit incomplete forms and confirm validation messages remain inline, the page
does not fall into the generic error screen, and the browser console has no
`Base UI error #28`. A `500` shown by the client error page together with
`FieldRootContext is missing` means a `FieldLabel`, `FieldDescription`, or
`FieldError` has been rendered outside a Selia `Field` root; inspect the affected
form composition before checking the API or database.

For a complete draft or `changes_requested` tutor, verify the sticky profile
action area shows one **I agree to the Tutor Terms of Service** checkbox and a
**Read terms** action. While the tutor has not accepted the terms, the
applicable review action—**Submit for review** for onboarding or **Submit
changes for review** for a published tutor—must be disabled while the save
action remains available. Check the agreement and verify the review action
becomes enabled; submit and verify the profile moves to `pending_review` (or
queues the published profile edit). **Read terms** opens the bilingual
Indonesian/English document in Indonesian-then-English order; closing it
preserves the checkbox state, and the dialog has no second acceptance checkbox
or submit action. At narrow widths, confirm the consent copy wraps naturally
and the save/submit buttons stack without horizontal overflow. Reload the tutor
profile and submit again after a revision; the checkbox should remain
checked/disabled, the read-only action should still work, and the acceptance
timestamp/version should remain unchanged.

For Google sign-in, start from `https://app.cogitoacademy.id/login` in an incognito/clean browser and confirm the provider callback is `https://api.cogitoacademy.id/api/auth/callback/google`, followed by the frontend route `/auth/callback` and the role-appropriate destination. The Google authorization URL must contain `prompt=consent`; record the Google permission screen in the verification video and click **Show all services** so every requested identity scope is fully expanded and readable before accepting. In DevTools, the initial auth response must set `better-auth.state` with `Secure`, `HttpOnly`, and `SameSite=Lax`; the callback request must include that cookie and its `state` query parameter. Keep the Google Cloud OAuth client configured with the frontend origin `https://app.cogitoacademy.id` and the API redirect URI `https://api.cogitoacademy.id/api/auth/callback/google`. This login flow requests identity scopes only. For the separate Calendar scope used by automatic Meet creation, use the dedicated Meet OAuth client and the consent/refresh-token procedure in `docs/GOOGLE-MEET-SETUP.md`; do not add Calendar access to every user's login.

With PostHog config present, verify one `account_created` event for a new Google account and one `account_signed_in` event for a returning Google account. Both events must show the stable Cogito user identity and `authentication_method: "google"`; no duplicate anonymous auth event should appear. Repeat email sign-in and email signup; verify the matching auth event carries `authentication_method: "email"` and no anonymous auth event appears. Repeat booking creation and one booking lifecycle action; verify their planned event and the explicit `cogito-web` info log in PostHog. If no events arrive, inspect browser CSP errors first, then confirm `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` were supplied as web image build args by CD. Automated Playwright runs use Vite `test` mode and the disabled client when these values are absent; this is test isolation, not production analytics validation. Do not paste token values into logs or tickets.

### Dashboard smoke check

After a web deployment, sign in once as each supported role and open `/dashboard`. Verify the sidebar user menu shows the authenticated profile image when one is configured and uses initials when it is not:

- Student: learning welcome, next lesson, Knowledge Bank/calendar, and tutor recommendations. Confirm the welcome card shows the SVG illustration and shared spacing/sizing used by the tutor dashboard. If a booking exists, confirm the next-lesson card matches the booking-list date tile, participant metadata, Marks display, status tooltip, and detail action.
- Tutor: the first dashboard row shows the same SVG welcome card visual plus teaching setup, and the next visible row shows requests to review plus next lesson before metrics/payout; actions link to `/bookings`, `/availability`, and `/profile`. Verify the review card keeps its empty/loading slot when there are no requests, and that the Payout details info icons open their respective unpaid-honorarium and transfer-fee explanations and remain keyboard accessible. When a tutor submits the initial profile form, confirm the app redirects to `/dashboard` and the browser Back button does not return to the form. A later login for that tutor must also land on `/dashboard`; a `draft` or `changes_requested` tutor must land on `/profile` so the profile can be completed or corrected. Opening the legacy `/onboarding` URL should land on `/profile`.
- Admin: a normal login must land on `/dashboard`; open the admin workspace and verify the compact escalated-operation, tutor-review, and achievement-review counts above Business insights. Use the sidebar to open `/admin-operations`, `/admin-tutors`, `/admin-achievements`, and `/admin-economy`. In `/admin-operations`, verify category, urgency, and SLA-status filters; open a queue item and confirm its reported reason/source, affected-user count, OQ-04 deadline, time-since-report, escalated badge, and WhatsApp escalation action. Clicking the escalation action must show the confirmation modal; Cancel keeps the admin page in place, while Continue opens the Cogito support conversation at `+62 881-0119-90195` in a new tab. In the Wallet lookup tab, search a partial name and an email, select the intended user from the bounded identity results, and confirm the selected name/email/role, total/held/available Marks, and latest ledger entries load; verify a changed search does not leave the previous user's wallet visible. Confirm the hydrated participant wallet/booking-ledger cards and state-history timeline load, then use **Open override** to reach the existing preview/apply flow. Confirm the override opens as a bottom drawer below 640px and a width-constrained right-side drawer at 640px and above. Scroll long content independently while keeping Cancel, Preview, and Override visible in the footer. Confirm students show name/avatar, confirmation state, and held Marks; confirm the assigned tutor appears separately as payout-only. Change category and verify the policy explanation updates. Preview must show named student balance changes, booking-state change, and tutor payout eligibility without manual participant or Marks controls. Preview/Apply must succeed. In `/admin-economy`, verify the active schedule loads, edits persist after reload, and the preview updates.
- In `/admin-tutor-payouts`, verify that selecting unpaid source rows builds a versioned preview with current fee/profile/rate/bank details and the exact net. Confirm a stale profile/config/fee preview cannot prepare, tax-incomplete profiles cannot prepare while tutors can still teach, and two admin requests cannot reserve a source twice. Record an exact externally performed amount/date and optional reference/proof; a mismatch must be rejected and the app must never submit a bank transfer. Void a recorded transfer and confirm evidence stays in history, sessions remain blocked until reasoned reconciliation, then verify audited resolution allows repayment. Exercise actual-paid-date Asia/Jakarta month boundaries, mixed saved rates, formula-safe CSV cells, leading-zero bank/NIK/NPWP strings, and a separate void/reconciliation export section. On the tutor dashboard, verify own gross/rate/tax/fee/net/covered sessions and ensure no NIK/NPWP or another tutor financial data appears.
- Complete-session feedback: as tutor, open a scheduled booking past end time and verify the booking detail shows the read-only Student notes. Click **Complete session**, fill Session discussion / Strengths observed / Areas for improvement (each textarea line is one bullet and Enter adds another), confirm disabled until all 3 have ≥1 bullet, submit and verify success toast + booking completed. Confirm the same detail page refreshes and shows Session feedback directly below Student notes in the Session overview, with all 3 bullet sections (per-session rows for series). As student/admin, open the completed booking and verify the Student notes and Session feedback are both visible.
- In the admin dashboard's **Business insights** section, verify the default 30-day view loads booking KPIs plus Accounts & activity, top-up revenue, and pricing-snapshot count cards. Total accounts, rolling MAU/inactive/churn, current Marks ownership, and lifetime paid conversion must retain their labeled scopes when the date filter changes. Signups and gross/refund/net top-up revenue must follow the selected period. Switch among 7/30/90 days, then apply a custom start/end range; confirm inclusive WIB dates, a 366-day maximum, continuous trend labels, and matching signup/revenue changes. Cross-check successful payment totals against `payment_record.updated_at` for `PAID`/`SETTLED` rows and refunds against `refund_record.created_at`. Confirm booking activity, current booking portfolio, audience growth, session-format mix, and top categories still load; zero-data periods show intentional empty states and retry remains actionable. Pricing-snapshot buckets count booking records created in the selected period, include all states, and do not imply financial value: V3 is engine-tagged, legacy requires the known untagged numeric shape, unknown/malformed non-null snapshots are other, and SQL `NULL` is missing. Do not reintroduce booking-derived Marks, IDR, or platform-share totals until Q15 defines their population, participant, session, and date basis.
- In the Operations → Room approvals tab, verify the Active rooms catalog loads. Use **Add room**, enter a name, location, and positive whole-number capacity, submit, and confirm the new room appears in the list and in the Offline room selector. Use **Edit** to change the name, location, or capacity and confirm the active catalog and room selectors refresh. Use **Deactivate**, confirm the danger dialog, and verify the room disappears from the active catalog and new selectors while existing assignments remain intact. Confirm blank names/locations and invalid capacity stay in the dialog without an RPC request. Then verify the pending offline room-approval queue loads. Use **Assign** for a requested room. Use **Choose another** (or **Choose room** when the original request conflicted) to open the admin booking detail; confirm the Offline room card shows the booking schedule without a UUID/date-time form, lets the admin select a target room, and calls **Assign room** or **Relocate room**. Confirm **Cancel** opens a confirmation dialog explaining the booking/hold impact, then refreshes the queue after confirmation.
- In `/admin-tutors`, open a profile with pending edits and confirm the proposed specialization changes show readable category/specialization labels instead of raw UUIDs. Resize to a narrow viewport and verify specialization badges and other long pending values wrap without horizontal page overflow; use **Edit format** to correct structured education/competition entries, save, reload, and confirm the version-checked update and success toast. The review request/response payloads must remain unchanged.
- In the focused `/admin-tutors/:profileId` review workspace, open a profile with mixed pending values and verify the **Tutor profile → review** summary announces the added, changed, removed, and empty counts. Use the **All**, **Added**, **Changed**, **Removed**, and **Empty** chips together with field search; confirm the list and relevant section badges respond to both controls. Expand and collapse fields with mouse and keyboard, confirm `aria-expanded` changes, and verify the current/proposed panes use readable text plus symbols and labels. Confirm Profile, Teaching setup, Credentials, Proofs, Marks, Profile photo, and Payout account remain visible even when empty, with inline empty states and section badges; the photo panel continues to show current versus proposed assets separately. Resize to a narrow viewport and enable reduced motion; there must be no page-level horizontal overflow or custom animated diff transition. The review request/response payloads must remain unchanged.

### Theme shortcut smoke check

From any authenticated shell page, press `D` once and verify the UI switches between the rendered light and dark themes; press it again to switch back. In dark mode, confirm the complete Cogito Academy sidebar logo, including the wordmark and academy label, renders white rather than orange/purple; in light mode, confirm the original logo colors remain. Confirm the theme menu still supports Light, Dark, and System, and that the explicit selection survives a page reload. While focused in an input, textarea, or editable field, press `D` and confirm the field receives the character without changing the theme. Modifier-key combinations and holding the key should not cause extra toggles.

### Competition Calendar smoke check

As an authenticated user, open `/calendar` and confirm published Sanity competitions render in the month grid. Verify today, outside-month days, multi-day spans, and the `+N more` overflow popup; select an event from either the grid or popup and confirm the responsive details modal shows categories, level, scale, organizer, location, timeline, registration deadline, description, and the available external-link actions. Navigate to a month with no events and confirm the normal weekday headings, date cells, outside-month cells, and month navigation remain visible instead of an empty-state replacement. On a short viewport, verify the page heading and calendar toolbar remain in place while only the calendar body scrolls vertically; on a narrow viewport, verify only the month grid scrolls horizontally. Switch to **Agenda**, confirm the flat 30-day list and rich event cards, verify that each multi-day competition appears once with its full date range, and confirm the list is ordered by each competition's first day. Use `M`/`A` to switch views, and verify previous/next period plus **Today** navigation. The calendar remains read-only and the browser console should remain free of runtime errors.
If the API returns no competitions at all, verify the page-level empty state still shows the calendar glyph in Cogito orange.

The route selects the dashboard from the authenticated session role. A tutor or admin must never receive student-only wallet or booking queries from this page.

### Knowledge Bank smoke check

As an authenticated student, open `/knowledge-bank`. With at least 35 total Marks, confirm published Sanity resource metadata loads, category slugs render as human-readable labels in the filter dropdown, search/category filtering works, and the PDF preview opens through the authenticated `/content/knowledge-bank/:resourceId/file` proxy. At a width below `640px`, confirm preview opens as an 85dvh bottom drawer and can swipe down; at `640px` or wider, confirm it opens as a right-side drawer and can swipe right. In both layouts, confirm the PDF renders inside the iframe, Close works, and Open in new tab remains usable. Inspect the web response CSP: `frame-src` must allow `https://api.cogitoacademy.id`; inspect the file response: `Content-Security-Policy` must contain `frame-ancestors` with the configured app origin and `X-Frame-Options` must be absent; another API response must still use `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Below 35 Marks, confirm the page stays locked and offers the balance/top-up action. Then sign in as a tutor and an admin with no Marks balance and confirm each role sees Knowledge Bank in the sidebar, the route loads resources, and the PDF preview opens without a wallet threshold. Opening the Knowledge Bank as an eligible student, tutor, or admin must not create a Marks deduction.

For the admin exception flow, open `/admin-knowledge-bank` as an admin. Add a
student by email with a future expiry and verify the student below 35 Marks can
load both the metadata and PDF. Edit the expiry/note and confirm the row and
access state refresh. Use the Active, Expired, and All filters, then remove the
grant and verify the student is locked again. An expired grant must remain
visible as **Expired** but must not bypass the 35-Mark gate; this behavior is
read-time and does not depend on a scheduler.

### Role-based sidebar grouping smoke check

Run isolated synthetic Chromium checks (mocked auth/RPC, no backend or DB):
`cd packages/e2e; bun run test --config=playwright.sidebar.config.ts`.
This starts its own frontend on port 3302, refuses an existing server, and uses
an isolated Vite cache. The fixture follows `vite.classes-layout.config.ts`.
For each role at desktop/mobile widths, all sections start expanded. Use Enter
and Space on a section heading: only that section collapses, its links leave
the tab order, and the chevron/expanded state changes. Reopen it and check the
active link and booking badge. Collapse Resources and confirm the account menu
remains available; reopen it and check support. On mobile, section toggles keep
the sidebar open and following a link closes the overlay. No saved state is
expected after a fresh mount.


As an admin, confirm the sidebar shows Overview (Dashboard, Operations),
Teaching (Bookings, Classes, Session reports, Tutors), Finance (Tutor payouts,
Economy), Content & reviews (Competitions, Achievements, Knowledge access, FAQ,
Manage FAQs), then Resources. Verify every link opens its existing route,
selected links retain their active styling, and Bookings retains its action
badge when there are actionable bookings. At desktop and mobile widths, scroll
the sidebar to reach Resources and the account menu.

As a student, confirm Overview contains Dashboard and Balance, followed by
Learning with Tutors, Classes, My Bookings, Session reports, and Achievements.
As a tutor, confirm Overview contains Dashboard, followed by Teaching with
Bookings, Session reports, Availability, and Tutor Profile. Both roles show FAQ
in Resources after Knowledge Bank, exactly once. Check the booking action badge,
active-link styling, mobile sidebar scrolling, and account footer for both roles.
No environment or service changes are required.

### Empty-state consistency smoke check

With signed-in student, tutor, and admin sessions, exercise empty data and no-match states in the calendar, tutor discovery, Knowledge Bank, bookings, notifications, achievements, balance history, availability preview, booking detail, and admin operations surfaces. Confirm collection and event-free agenda states have the shared Selia icon/title/description treatment where applicable, while an event-free month keeps its normal calendar grid instead of an empty-state replacement. Confirm each state uses the right density for its context, distinguishes an empty collection from an active filter with no matches, and keeps its action usable when one exists. Check the notification menu, calendar popup, dialog sections, field-level specialization/proof-link states, and table/list sections for blank areas or orphaned headers. Repeat in light and dark themes and at narrow width; there should be no page-level horizontal overflow or duplicate empty copy, while intentional table containers may scroll horizontally when their minimum column widths exceed the viewport. This is frontend-only and must not change request payloads.

For admin operations, confirm the booking monitor keeps body text readable, aligns multi-line cells at the top, and keeps status/category badges on one line. At a narrow mobile viewport, verify the Operations page and monitor card do not exceed the viewport width; horizontal scrolling must be confined to the table contents. Open **View details** and verify navigation to `/admin-operations/bookings/:bookingId`; refresh that URL and confirm participant wallets, booking ledger activity, meeting fallback, report context, state history, and override controls still load. A student or tutor opening the URL must be redirected to `/dashboard`, and a missing booking must render the in-page not-found state with a route back to operations.

For local verification, run `bun .github/lint/check-baseline.ts` and
`bun run check-types` from the repository root. Lefthook runs those same two
checks before push. Use `bun run lint` when inspecting the complete raw lint
output, including documented legacy errors. The type check runs the web
production build before TypeScript checking, so a missing empty-state import
or invalid Selia variant is caught before review.

### How Cogito Works guide smoke check

Open `/guide` after signing in as each supported role. Verify the guide loads without API requests beyond the existing authenticated shell, presents the correct journey by default, and exposes the following views:

- Student: Student only.
- Tutor: Tutor and Student.
- Admin: Admin, Tutor, and Student.

Select each available role view from the full-width control at the top and confirm the URL updates with `?view=...`, all step details are open on first load, and a disallowed view falls back to the role's default. On desktop, verify the `max-w-7xl` guide shell uses a sticky chapter index on the left and that its selected chapter updates as the page scrolls or an item is clicked. On narrow screens, verify the chapter index becomes a horizontally scrollable, snap-aligned row above the content and the page has no horizontal overflow. Check that the hero highlights change with the selected role and reflow from three columns to one. Use the global and per-step disclosure controls with pointer and keyboard input; verify collapsed cards return to header height without blank space, animations respect reduced-motion preferences, and statuses, exception branches, and CTAs remain readable. Confirm the important timing callouts render as bold text and state the concrete rules: invite links expire after 7 days; booking response, participant confirmation, reconfirmation, and room approval allow 12 hours unless the session starts sooner; student self-service changes close at H-2 (2 hours before start); reschedule proposals expire after 24 hours; lateness/no-show reporting starts after 15 minutes; meeting retries run every 5 minutes for up to 3 attempts; and support exceptions use a 30-minute business-hours or 4-hour outside-hours SLA. Check that CTAs open the existing tutor, booking, profile, operations, achievement, economy, calendar, balance, and resource surfaces.

Guide copy is maintained in `apps/web/src/components/guide/guide-content.ts`. When a booking state, role responsibility, or linked route changes, update the corresponding typed step/branch and the guide content test in the same change. The guide is intentionally code-managed in v1; no admin editor, CMS publish step, or API migration is required.

The shared frontend pending state uses the default loading component from `apps/web/src/components/loader.tsx` and the local Selia `Spinner` from `packages/ui/components/selia/spinner.tsx`. If a navigation or feature smoke test catches a loading state, verify the `cogito-orange` primary progress arc and `Loading` label remain visible in both light and dark themes, and that the ring remains understandable without animation under reduced-motion preferences. No bespoke pulse skeleton should appear in the web app.

### Not-found and connection-error smoke check

Open a clearly invalid client route such as `/this-page-does-not-exist`. Verify the branded 404 state appears with the large outlined `404` visual, human-readable copy, and a single tertiary **Go back** action; confirm the page does not show the generic `Not Found` fallback. Trigger a route/render failure in a controlled test environment and verify the matching `500` state offers the same single **Go back** action without exposing the raw exception. During a controlled API outage or offline browser state, verify query/auth surfaces say that Cogito could not connect and suggest checking the internet connection and trying again—never expose raw `Failed to fetch` or similar browser exception text.

### Notification inbox smoke check

As a signed-in student or tutor, open `/notifications` and confirm the list shows the notification title/body, a human-readable category badge, an exact date/time, relative age, unread emphasis, and a booking link when the notification has a booking. Open the shell bell and click a notification; verify an unread item is marked read and navigation continues to its associated booking, balance, achievements, calendar, or notifications page instead of stopping at the read-state update. Select one row and verify **Mark as read** and **Mark as unread** both update the row and the shell bell count. Select multiple rows, use **Select all**, and verify both bulk actions update only the selected rows. Loading older notifications must keep the current selection model usable; changing read status must clear the selection after success. As another user, confirm a selected ID cannot change a notification owned by someone else.

### Economy rate-control smoke check

As an admin, open `/admin-economy`, confirm the Marks value, tutor minimum/increments,
and online/offline Cogito take schedule are visible and read-only by default. Select
**Edit schedule**, confirm the editing badge and cancel action appear, then change a Cogito base or increment
either by typing an IDR amount or using the Rp5,000 stepper controls, confirm the
shared class-size pricing table preview updates by a valid Rp5,000 step, then save,
reload, and verify the version increments and the
preview for class sizes 1–6 changes. The save is optimistic-lock protected and affects
only future booking/repricing snapshots; existing booking snapshots must remain unchanged.
After a successful change, verify no `Cogito rate updated` in-app notification appears
for tutors. Re-saving the same values should not increment the version, add an audit
row, or create another notification.
As a student or tutor, opening `/admin-economy` must redirect away and direct
`admin.getEconomySettings`/update calls must return FORBIDDEN.

The tutor profile at `/profile` should show IDR base honorarium fields (online/offline), enforce the
Rp50,000 minimum and Rp5,000 steps, show one combined six-row preview matrix for the
selected modalities, and must not describe Marks as cash-out. Student
tutor discovery and booking previews should show computed Marks per student for the
selected modality; legacy profiles without `baseRatesIdr` remain readable. Change a
published tutor's base honorarium, confirm it is available for a new booking, and
verify a booking created before the change still pays out using its original
`priceSnapshot` honorarium.

The tutor payout form must collect bank name, account number, account-holder name,
account-opening city/regency, account ownership (the tutor's own account or a
trusted person's account), and an acknowledgment that Cogito is not responsible
for issues after transfer to the provided account. Verify the copy identifies only
conventional BCA as fee-free; BCA Syariah and blu (BCA Digital) must be treated as
non-BCA and charged Rp2,500 per payout.

Tutor portrait operations use a staged source-to-final workflow. The tutor uploads one
source image through `upload.createUploadUrl`; draft/source profiles store it through
`user.image`, while a published tutor's replacement is staged in
`pendingProfileChanges.profileImageUrl`. In the admin review page, upload the edited
background-standardized asset (a hosted URL remains available as a fallback), then use
an approve/publish action to promote it to `user.image`. Requesting changes must leave
the current public photo untouched. On the tutor surface, verify the compact photo info
preview opens on demand instead of keeping a large preview card in the form. Verify the
profile/review history timeline in the admin review surface after submit, revision,
approval, and publication. The timeline should show actor names/types without
exposing account emails to tutor-facing API consumers; the admin timeline may
retain richer moderator identity context.

For profile-history verification, change at least one field from each path:
direct-live (for example `shortBio` or `baseRatesIdr`), review-gated (for example
`affiliation`, credentials, modality, proofs, prices, specializations, or photo),
and private payout/capacity data. Confirm one history event stores the complete
profile Before and After snapshots and renders every changed field with exact
values. Edit a pending proposal again and confirm Before is the prior proposal,
not the public value. Approve it and confirm approval history contains the
complete post-promotion snapshot and every promoted pending field.

Tutor-profile achievement and experience proof URLs are verification-only
tutor-profile data. All user/admin-supplied external links in tutor
proof/profile-image fields and manual meeting-link dialogs must use
`http://` or `https://`; generated local profile assets may use the bounded
`/uploads/...` storage path. Schemes such as `javascript:`, `data:`, and `file:`
must be rejected by the API even if client validation is bypassed.
Operators may open them from the admin tutor review card, but they must not be added
to public discovery projections, marketing exports, or student-facing interfaces.

Student achievement proof links are a separate workflow: the student owns the
submitted link and the achievement admin queue uses it for verification, while
the public projection omits it. The student form should explain how to upload
proof to Google Drive and set General access to “Anyone with the link” + Viewer.

### Shared booking list smoke check

Verify booking titles use `Cogito - {Competition} | {Tutor} x {Student}` and
group/group-series titles use `& Friends`, matching the Google Calendar/Meet
summary rather than listing participants with `+N`.

With seeded student, tutor, and admin sessions, open `/bookings` and verify the same list layout loads for each role. Students see proposer/participant bookings, tutors see assigned bookings with the Cogito mark icon before `Earns: X` and `Total: Y`, and admins see the full list with the icon before `Total X` and `Tutor Y`, with no lifecycle mutations. Verify the Needs action/Upcoming/Series/History/All button tabs update their active background and filtered content immediately, then synchronize the URL without showing a data loader or refetching. Verify that generic status badges are hidden outside All (except attention states), and that hovering/focusing a visible status badge shows its explanation. On a narrow viewport, confirm sorting appears beside or wraps below the header action without overflow, then the rounded tab strip directly precedes the content. Only the inner tab list should be swipeable horizontally, and the page must not create horizontal overflow or show a scrollbar. At the `sm` breakpoint and above, confirm sorting moves back beside the tabs. Confirm the empty-state outline and decorative glow remain visible inside the rounded card boundary without creating overflow. Confirm mobile rows keep date, location, and tutor name readable beside the booking summary, while desktop time/location/tutor metadata stays aligned and the action button remains at the far edge. For single-session group bookings, student `You pay` must show the per-student amount, and the participant avatar stack must not include the tutor. Open a row’s detail page to perform actions; list rows should not expose inline cancellation or reschedule mutations. `/tutor-bookings` should redirect to `/bookings`.

Verify the role-aware default tab: students and tutors open on Needs action when pending decisions exist and Upcoming otherwise; admins open on All. Explicit `?tab=` and `?sort=` selections must override the defaults. Recommended sorting must put pending decisions above active bookings and terminal outcomes at the bottom, using soonest dates within active groups and latest dates in History. Verify that Soonest and Latest order solely by scheduled date.

### Booking detail smoke check

Open an online booking detail as each role and verify the shared overview shows date/time first, then `Format & access` with the meeting CTA or pending/retry status, followed by participant rows with saved profile images (or initials), names, roles, and confirmation states. On desktop participants may use two columns; on narrow screens they stack without hiding names. When available, `Booking actions` appears above the role-appropriate financial or operational card in the sticky desktop rail and before Activity on narrow screens; Student notes and Session feedback remain in the Session overview, while support reports remain in the main flow. Tutors must see the IDR Honorarium card only; students see the Cogito Marks card; admins see the wallet-impact card and admin review context, plus their admin-only room, wallet/ledger, state-history, and override controls. Every student Marks amount has the Cogito mark prefix. The Activity card should read newest-first as a vertical timeline with a transition-specific icon, one destination-state badge, actor type, timestamp in the booking timezone, and any transition reason; the previous state is shown as muted context when available. After a tutor accepts an online booking, the link is generated immediately; a successful provider call moves the booking to `scheduled`. In Google Calendar, verify solo uses `Cogito - MUN | [Tutor] x [Student]` (or the selected competition label) and group/group-series appends `& Friends`. The description must list Tutor, Student, `Session Topic: [category] - [specialization]`, Student Notes with pasted links preserved, and a clickable `/bookings/{bookingId}` link. Accept an online reschedule and verify the same event moves to the new slot on both organizer and attendee calendars, and its Meet conference remains available. If provider creation fails, the booking remains `confirmed`, the detail overview says it is retrying, and the `retry-failed-meetings` scheduler retries every 5 minutes. If no link is available, the assigned tutor can use **Add meeting link** and an admin can use **Add/Replace link** in operations; verify the shared Selia dialog accepts a trusted `http`/`https` URL and that the student read becomes ready without a reload. Repeat after multiple failed provider rows to confirm the newest meeting-attempt row is updated. For an offline booking, assign a room and verify it becomes `scheduled` even if Calendar is unavailable. With Calendar configured, verify exactly one event is created with the same title/description/attendees, the assigned room name and location, and no conference data or Meet URL; the description must start with `Site: [location]` followed by `Room: [room]` before the existing tutor/student metadata. Relocate and reschedule it and verify location/time plus the Site/Room description heading update in place; cancel or expire the booking and verify the event is deleted. Repeat the assignment sync and confirm no duplicate event appears.

The overview row must show one `Date & time` field with the date and session hours merged beside `Format & access` in a two-column desktop grid; on narrow screens the two fields stack without horizontal overflow. The online `Format & access` section now shows only the compact info trigger; activate it with mouse, keyboard, and touch to verify the Selia popover exposes the pending/failed explanation plus retry or manual setup status, or the `Open meeting room` action when a URL is available. Available links must not render a `Ready` badge or standalone meeting CTA. Offline bookings without an assigned room should expose the same trigger beside `Offline`; tutors with an eligible `Complete session` action should find its completion-timing explanation beside the button. Confirm the Participants heading uses the matching Selia `IconBox`, and on desktop all eligible booking actions, including propose and complete, sit at the bottom of the right header column beneath the state badge. Also confirm Activity follows the left-column content with only the normal section gap even when the Actions/Marks rail is taller; on narrow layouts the order remains overview → actions/financial content → Activity.

### Meeting fallback and exception smoke check

Force the Google provider into an unavailable state or use the fallback test provider. After tutor acceptance, verify an online booking stays `confirmed` while retries remain, then use the tutor's **Add meeting link** action. The tutor action must succeed only for that tutor's own online `confirmed`/`scheduled` booking; offline, terminal, pre-confirmation, and another tutor's booking must be rejected. A student must not be able to call the tutor action. In `/admin`, verify an admin can add or replace the link for an eligible online booking, while offline bookings are rejected. The API-level regression command is:

```bash
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/admin-meeting-link.test.ts
```

For a force-majeure or other exceptional case, use the admin override flow with an auditable category and reason. Verify the preview automatically includes students and tutor. For `student_no_show`, student holds must be forfeited and the preview must show the tutor as payout-eligible. For every other category, student holds must be returned and the tutor must be ineligible. After apply, verify the booking is terminal, booking/participant holds reconcile to zero, ledger plus state-history/audit records exist, and provider meeting cleanup is best-effort. A second override on the terminal booking must be rejected. Do not use the normal student reschedule route to bypass H-2; after H-2 the case goes through support/admin handling. The override regression command is:

```bash
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/admin-override.test.ts
```

### Contact-sharing privacy smoke check

Use two student accounts that were confirmed participants in the same completed
group booking. On the booking detail, verify **Stay in touch** shows only the
other student's name/photo and a **Request contact** action; no email or phone
number should appear in the page, booking response, or network response. Send a
request with a short note and confirm the recipient sees the note plus
**Share email**, **Accept privately**, and **Decline**, with no full-chat control.

Accept privately first and verify the requester sees an accepted state but no
email. Repeat with **Share email** and verify only the requester receives the
recipient's email and that it is rendered as a `mailto:` link; the recipient's
incoming response must still contain no email value. Toggle **Allow contact
requests** off in Profile and confirm new requests are blocked. Also verify an
outsider, a tutor/admin, an absent participant, and a booking that is not yet
`completed` cannot list or create contact requests. Inspect the raw
`/rpc/contact/*`, `/rpc/auth/students/search`, `/rpc/tutors/list`, and booking
responses during the check: account emails must not appear before explicit
consent, in notifications, or in audit records.

### Form-control smoke check

On availability/profile/admin forms, verify dates use the Selia date picker, times use the 24-hour minute control, multiline fields use Selia Textarea, and IDR amounts use Selia NumberField. On `/admin-tutor-payouts`, verify both custom-range fields open the Selia calendar, the start date cannot move after the end date, and the end date cannot move before the start date. Focus each text-entry field at a narrow viewport and confirm its rendered font is 16px or larger so the browser does not zoom the page. On `/availability`, confirm both weekly time fields stay compact and equal in width with a centered dash between them, while focusing a time field allows its suggestions to extend beyond the field when needed; confirm the modality trigger keeps its icon and label on one row. At desktop width, verify Calendar preview appears below Date override, its seven-day strip selects only dates with windows, and the selected-day panel shows time, weekly/override source, and modality. Clicking a window's trash action must open a confirmation dialog; cancelling preserves the window and confirming removes it with success/error feedback. On the calendar, verify month/year dropdowns open as Selia selects and retain the selected value. No app-level raw date, time, number, select, or textarea control should appear, and the browser console should remain free of runtime errors.

### Achievement form smoke check

As a student, open `/achievements`, choose **Add Achievement**, and verify the
Level options appear in this order: **International**, **National**,
**Province/State**, **City/Regency**, **School**. Confirm the **Proof link**
copy tells the student to upload proof to Google Drive, set General access to
**Anyone with the link** + **Viewer**, and paste the link. Confirm there is no
student-facing **Public documentation image** field.

Enter one clear Location value such as `Jakarta, Indonesia`,
`Geneva, Switzerland`, or `Online`. Confirm the section is titled
**Brief Description**, uses a multiline textarea, and shows a ranked-result
example such as “Ranked 1st among 1,000 participants across 20 countries.”
Verify the Category and Level selects open above the modal and update their
triggers. Open **Awarding Date**, confirm the calendar is visible above the
modal, select a day, and verify the trigger shows the chosen date. Open the
calendar month/year dropdowns as well; each popup must remain clickable and
must not be hidden behind the dialog backdrop.

With at least one submission present, verify the student achievement list is a
compact single-card summary whose Total, Approved, and Pending label-and-pill
counts remain in three columns even at narrow widths,
followed by a semantic table with readable achievement, status, awarded date,
and **View details** columns. Open a row and confirm the drawer exposes category,
level, location, description, attachments, and moderator notes; pending rows
must keep **Edit** and **Delete** usable. At a narrow viewport, confirm the
table reaches the card edges and scrolls horizontally inside its container
without creating page-level overflow, and that the details trigger, drawer
controls, and attachment links remain keyboard accessible.

As an admin, open `/admin-achievements`, choose **Correct** on a pending
submission, change each submission field and the **Public documentation image**,
save, and confirm the row stays pending until an explicit Approve/Reject action.
Repeat with a stale version and confirm the API returns a conflict without
overwriting the newer correction; verify the `achievement_admin_updated` audit
record contains before/after content. The API-level regression command is:

With submissions in more than one status, verify the admin queue is a compact
table with student identity, achievement, awarded date, status, and **View
details** columns. Open a pending row and confirm the drawer exposes the full
metadata, evidence/documentation, and **Correct**, **Reject**, and **Approve**
actions; reviewed rows remain read-only. Change the status filter and confirm
the counts and visible rows stay aligned. At a narrow viewport, the table reaches
the card edges and may scroll horizontally within its card, but the surrounding
page must not overflow.

```bash
bun test packages/api/src/tests/unit/achievement.types.test.ts packages/api/src/tests/unit/achievement.router.test.ts packages/api/src/tests/unit/achievement.handler.test.ts packages/api/src/tests/unit/achievement.service.test.ts packages/api/src/tests/unit/achievement.repo.test.ts
```

### Public achievements smoke check

Open `https://cogitoacademy.id/id/achievements` and `https://cogitoacademy.id/en/achievements` without an authenticated session. Verify the archive shows only approved + visible records, the homepage preview links to the archive, and changing the locale updates labels without changing the record data. Open a record detail and confirm only the student's display name and public documentation link are shown; private verification evidence and internal user IDs must not appear in the rendered page or the network response.

For an API-level check, run:

```bash
curl -sS -X POST https://api.cogitoacademy.id/rpc/achievement/listApproved \
  -H 'content-type: application/json' \
  --data '{"json":{}}'
```

The response should be the standard oRPC envelope with a JSON array. Inspect one returned record and verify it has no `userId` or `evidenceUrl`. If the API returns an empty array, the public site should render its intentional empty/error state rather than exposing draft or rejected records.

On a completed booking, verify there is no separate Session notes card, rich-text editor, preview, textarea, or Add note action. Student notes should appear in the Session overview, and when tutor feedback exists it should appear directly below them with the three feedback groups rendered as bullet lists. The legacy `addSessionNote` and `getSessionNotes` procedures remain available for protected API clients, but they are not part of the web booking-detail surface.

For a group booking with a pending invite, verify the invitee sees **Accept invitation** and **Decline invitation** (decline is the pre-confirmation exit path). As the booking proposer, verify **Withdraw invite** opens an in-app confirmation dialog, optionally records a reason, marks only the selected pending invitee `withdrawn_pre_h2`, leaves confirmed headcount unchanged, and creates a notification for that invitee. If another pending invite remains, the parent must stay in `awaiting_participant_confirmation`. If this is the final pending invite, verify fewer than two confirmed participants releases holds and expires the booking; a viable partial group enters `awaiting_reconfirmation` with a fresh deadline; a full group advances to `awaiting_tutor_review`. Expired group-series sessions must be cancelled. A confirmed participant uses the separate participant `withdraw` flow; group-series no-opt-out rules still apply. For a one-session group, verify the booking form shows both the per-student price and the full temporary target-headcount hold, and blocks submit when the wallet cannot cover that hold. On tutor dashboard, verify **Needs action** matches Bookings **Needs action** rather than showing tutor-review requests only.

For booking deadline coverage, inspect a new online request, an offline request awaiting room approval, a group invite, and an `awaiting_reconfirmation` booking. Each detail page should show a timezone-aware **Respond by** notice with a live remaining window; an expired or near-expiry deadline should use the danger treatment. Confirm an invite, decline an invite, and accept/reject a reschedule from separate participant sessions. For an offline booking with a confirmed room, accept a new booking-level time and verify the room window moves with it; reject or let the proposal expire and verify the room returns to the original window. A conflicting room window must return the booking to admin room approval rather than leaving a stale room reservation. After H-2, confirm student self-service cancellation/reschedule is blocked and the late-cancellation/no-show path is surfaced with the expected warning and hold outcome. Tutor lateness reporting must be available for both online and offline scheduled bookings after the 15-minute tolerance.

### Reschedule proposal smoke check

From a booking detail in `awaiting_tutor_review`, `confirmed`, or `scheduled`, verify that **Propose new time** opens a height-constrained bottom drawer on narrow viewports and a width-constrained right-side drawer on desktop. For tutors, confirm **Availability** and **Custom time** appear through the shared Selia Tabs component, keyboard focus and arrow-key selection work, and switching modes clears the prior slot/date selection. Availability windows must be grouped under one Jakarta-local date heading and shown as compact selectable time chips; four dates appear initially, See more/Show less expands and collapses the inline grid, and no nested availability scrollbar appears. Selected state must remain visually and semantically exposed. For series bookings (solo and group) the header action is hidden and each non-terminal session in Series sessions exposes its own per-session **Propose new time** drawer prefilled with that session time and sending `sessionId`; solo/group single bookings keep the booking-level action. Confirm the form body scrolls independently and the Cancel/Send proposal footer remains accessible. The start-time control must step backward/forward in 15-minute increments, show the automatically derived 90-minute end time, omit persistent “valid starts” copy, and show a danger validation message only after the chosen start leaves the selected tutor window. A non-blank reason is required before submission. Verify that a student booking proposer submits through `/rpc/booking/proposeReschedule` and a tutor submits through `/rpc/tutorActions/proposeReschedule`. Both should show the success toast and move the booking to `reschedule_proposed`; a tutor may choose a custom time outside the published availability window. A student proposal in `confirmed` or `scheduled` remains valid before H-2, while a proposal at or after H-2 must be rejected as not editable. A tutor receiving `403 Student access required` indicates the frontend is using the wrong procedure. Group bookings still in `awaiting_participant_confirmation` intentionally wait for invitees before rescheduling is enabled. For offline bookings, accept/reject/expiry must keep the confirmed room row aligned with the active schedule; a conflict should return the booking to admin room approval. Force-majeure requests after H-2 follow support/admin exception handling and require an auditable override decision rather than the normal reschedule mutation.

On `/tutors/:tutorId/book`, verify Available times is the only scheduling card: tutors supporting both modalities expose shared Selia Tabs for Online/Offline, including arrow-key selection, and the prior standalone Session format card is absent. Verify each section explanation is available from its CardInfoPreview/InfoPreview trigger, and Specialization plus **What would you like to focus on?** share one **Session details** card and semantic fieldset instead of separate sections. Each page must show seven consecutive calendar dates on desktop and three on mobile with previous/next controls even when fewer dates have slots; no-slot dates remain visible but disabled, while selecting an available date changes the concrete start-time grid below it. For a 09:00–17:00 availability window and a fixed 90-minute session, starts must run in 15-minute increments from 09:00 through 15:30 and appear under Morning/Afternoon/Evening headings. Selected buttons change variant and expose `aria-pressed` without a check icon. Select two non-overlapping starts from the same source availability window/day and confirm both appear once in **Selected sessions** with their derived end times; starts overlapping an existing 90-minute choice must be disabled. Select up to four total, verify Remove clears only its exact slot-and-start selection, and confirm the existing single/group/series request payloads retain each source `availabilitySlotId` and chosen `scheduledStartAt`. The desktop series price card keeps the normal Session price/Price per student presentation rather than introducing a separate Series total treatment. In both desktop and mobile insufficient-balance messages, verify visible spacing around the inline Cogito Marks amount.

### Student booking responsive-layout smoke check

At a narrow viewport, smoke-test dashboard, admin operations, tutor
availability/onboarding, profile, notifications, achievements, and wallet cards.
Explanatory header copy must be available from the info trigger beside the title
without reserving a second header row. Sign-in and sign-up must have title-only
headers; while their initial session check is loading, the loader must reserve the
full auth content height so the legal notice does not shift upward. Content
summaries and account/resource metadata must remain visible inline.

Open the create-booking page with a tutor that supports both modalities and several availability windows. At desktop width, confirm Session format and Booking summary form a sticky right rail and availability remains a two-column card grid. The page header must not show a changing booking-type badge; adding invitees updates the Participants badge and both summaries from Solo to `You + N invitees`. Confirm the participant search has a decorative leading magnifier and that its input, results popup, and result actions use the default Selia radius rather than pill or enlarged local overrides. Select one slot: only that card should expand into a full row, with its own start-time editor directly beside it; there must be no consolidated “Selected session time” panel. Select additional series slots and confirm each one retains an adjacent editor. The summary must distinguish Participants from Sessions (`Single session` or `Series · N sessions`) and list every selected series date and time in compact `EEE, d MMM yyyy` form. Changing modality must clear incompatible selected slots. At mobile width, confirm each editor stacks below its selected slot, Session format appears before the main booking fields, the desktop summary is absent, and a sticky bottom preview shows the current schedule and `CogitoMarks` price without covering the final content. Open **Review**, verify the bottom drawer mirrors tutor, subject, participants, sessions, format, schedule, price, reserved amount, available balance, and post-reserve balance. For a one-session group, the reserved amount must cover the target headcount; for group series it must cover only the proposer's package. Submit from the drawer and confirm exactly one booking request is created. Test insufficient balance, no selected time, blank student notes, a 2–4 session series, and a group booking; button labels and disabled/progress states must match the desktop summary.

In the same drawer, select the booking's current date and start minute. Confirm the UI explains that a different time is required and disables **Send proposal**. While a proposal is pending, reopen the drawer and select that pending start minute; it must also be disabled. Repeat against a non-first series session's own active time. Direct RPC requests for either no-op must return `BOOKING_NOT_EDITABLE` without creating or superseding a proposal. Finally, submit two concurrent proposals for one booking and verify no more than one `pending` row exists.

### Booking-page tutor profile preview smoke check

On `/tutors/:tutorId/book`, activate **View tutor profile** beside the booking
heading. At narrow widths it must open the existing tutor profile as a
bottom sheet; at `sm` and wider it must open as a right-side drawer. Confirm
the profile body scrolls independently, **Back to booking** closes the drawer,
and selected subject, schedule, notes, invitees, and other booking state remain
unchanged. The directory flow at `/tutors` must continue to show **Book a
session** in the same drawer.

### Tutor specialization taxonomy smoke check

> Updated 2026-09-23: category cards and specialization options now use one
> vertical column at every viewport width. This supersedes the older two-stack
> instruction in the legacy check below.

On the tutor list, search remains visible while category, specialization, and
modality start inside the closed **Filters** panel. Toggle it with pointer and
keyboard, apply filters, close it, and confirm the trigger preserves the active
selection count. The height/fade and chevron transitions should be smooth, with
no animation under reduced-motion preferences. Closed controls must not receive
keyboard focus. For multiple selections, the leading label may truncate but the
`+N more` chip must remain fully visible without a clipped border. **Clear**
resets these panel filters without clearing search.

Below the `sm` breakpoint, verify each tutor card shows a compact identity row,
a bio of at most two lines, a short specialization plus optional count, and a
separated **Starting from** footer using the Marks icon prefix and chevron. The
whole card must open the tutor drawer. The existing hover shadow remains in use
without translating the card or adding a pressed-scale effect. At `sm` and above, the existing
horizontal tutor summary remains in use.

Desktop card specialization chips should use the child specialization names
without repeating the parent category, size to their content, and truncate
within the single metadata row when necessary. Confirm the `+N` count and
`From [Marks icon] #` price block stay visible on the same line.

Open `/profile` as a tutor and verify the selector loads exactly seven active competition categories and 34 specializations from `tutors.listSubjects`, including **Law Debate** under **Debate**. At `md` and wider, confirm the category cards form two independent vertical stacks without a large blank area beside a taller card; below `md`, confirm they collapse into one visible column. All categories should be visible with keyboard-accessible checkboxes, no manual specialization input, selected-specialization chips, and a 7-specialization limit. The selector should show the current count, disable an eighth selection, and the submit validation should reject any over-limit state. Select specializations from multiple categories, save a draft, and confirm the selections reload with the profile. A submission with no current specialization must be blocked; archived legacy specializations on an existing profile should remain visible as read-only labels. Published tutor discovery should expose current specializations and allow students to filter by category or specialization. On the tutor list page, category, specialization, and modality filter triggers must show their labels rather than raw IDs or values. Confirm category and specialization filters support multiple values, retain overlapping specializations while categories are added, remove specializations that are no longer available after a category is removed, and wait about 300 ms after typing/toggling before `listPublished` runs. Open a tutor drawer with both modalities and verify pricing appears in one table with `Group Size`, `Online (Marks)`, and `Offline (Marks)` columns; populated prices should have the Cogito Marks icon as a prefix, and a size available in only one modality should show an em dash in the other column. Below the `sm` breakpoint, confirm the student tutor profile opens from the bottom and dismisses with a downward swipe; at `sm` and wider, confirm it opens from the right and dismisses rightward. On a short viewport, confirm the profile body scrolls independently while its header and booking/close footer remain visible; body overscroll may bounce locally, but the fixed regions must not move.

### Tutor onboarding field layout smoke check

Open `/profile` as a tutor at desktop and narrow widths. Confirm labels and
descriptions stay left of controls on wider screens and stack above controls on
mobile. Confirm validation messages and dynamic education, achievement, and
experience add/remove actions stay in the control column. Confirm Teaching setup
and payout account render as one full-width sequence, and specialization choices
remain one vertical list without cramped labels. Online/offline capacity
selectors and base-honorarium steppers should fill their available
control-column width.

### Tutor achievement and experience formatting smoke check

The tutor editor uses one combined Education, Achievements, and Experiences card and one public preview. Proof-link fields remain separate, and the form recommends putting both proof types in one Google Drive folder with the “Anyone with the link can view” setting.

Open `/profile` as a tutor. Enter affiliation plus two education entries, five achievements, and five experiences. Verify labels sit above inputs, add actions remain left-aligned below entries, delete actions remain right-aligned below entries, and experience years share one desktop row but stack on mobile. Confirm sixth-entry controls disable, malformed rows fail validation, draft save permits blank affiliation, and review submission requires affiliation plus at least one achievement and experience. Reload and verify persistence. Open published discovery and admin review; confirm affiliation and canonical arrays render, pending diffs use canonical labels, and no legacy text fallback appears.

Open **View details** from both `/achievements` and `/admin-achievements`. Confirm Status retains its semantic badge beneath the field label, while Category, Level, Subjects, Award, Awarded, and Location use the same label/value hierarchy. Below the `sm` breakpoint, confirm the detail opens from the bottom, stays usable within the viewport, and dismisses with a downward swipe. At `sm` and wider, confirm it opens from the right and dismisses with a rightward swipe. Resize across the breakpoint while the drawer is open and confirm its placement and dismissal direction update together. Open both available attachment types and confirm image URLs render in the preview, **Open original** launches the source in a new tab, and a non-image or inaccessible URL shows the preview-unavailable fallback without removing the original link.

Open **Add Achievement**, edit a pending achievement, and use **Correct** from the admin moderation queue. Below `sm`, confirm each form opens as a bottom drawer and dismisses downward; at `sm` and wider, confirm it opens from the right and dismisses rightward. Resize while open, verify the direction updates, and confirm the Category, Level, and Awarding Date popups remain usable above the drawer.

### Tutor profile validation and action smoke check

Open `/profile` as a tutor with a draft or changes-requested profile. Leave one
required top-level field empty and click **Save draft**; confirm the profile
progress saves without submitting for review. Enter a short bio with 51 words
and confirm the counter, inline error, and validation summary say to use 50
words or fewer. Enter an invalid URL, an invalid year, or an invalid honorarium
and confirm the exact control receives the red invalid state and inline message,
while the validation summary lists the same field. Click **Submit for review**
with multiple missing fields and confirm all missing fields are listed and the
first invalid control receives focus. Fix the fields, submit again, and verify
the existing review transition and redirect to `/dashboard` still occur. For a
server-side rejection, confirm the returned missing-field, word-count, or
pricing detail highlights the corresponding form area rather than showing only
a generic toast.

Open a published tutor with **Changes under review**, edit another profile
field, and confirm **Save profile changes** remains enabled and updates the
pending proposal without changing the live public value. Confirm
**Submit changes for review** validates and queues the latest version, and that
the tutor remains editable while the admin review is pending.

### Profile UX smoke check

As a student, choose a JPG, PNG, or WebP profile photo up to 5 MB. Confirm the
crop dialog shows a circular guide, dragging repositions the image, and zoom
changes the visible area. Choose **Use this photo**, confirm the account card
shows the uploaded-photo state, then select **Save account details**. Reload the
page and verify the cropped image appears in the account card and authenticated
sidebar avatar. In R2 mode, the network request should be a `PUT` to the
presigned S3 endpoint and return success; a CORS failure means the bucket policy
does not include the current frontend origin. Confirm an unsupported file type
or oversized file is rejected, and that cancelling the crop leaves the previous
photo unchanged.

### Tutor experience formatting smoke check

Open `/profile` as a tutor and verify the Experiences subsection accepts up to five role, organization, start-year, end-year, and description entries. Leave End year blank for ongoing work, confirm year inputs stay as plain digits without grouping dots, verify an end year before the start year is rejected on review submission, and confirm canonical entries persist in the public discovery drawer and admin review card with no text fallback.

Open `/profile` as a student and as a tutor at desktop and narrow widths. Verify the account card shows the current name, profile image (or initials), and read-only sign-in email; changing the name or image enables only the account save action. On a new student account without a profile row, confirm the student page still opens with an empty editable form and does not require the wallet/tutor aggregate request. On the student page, learning and parent/guardian fields use separate sections with one learning-profile save action. On the tutor page, the shell title and sidebar item say **Tutor Profile**, profile status and review feedback remain visible, the public profile section is separated from the teaching setup row, the honorarium preview is one combined modality matrix, fields are grouped into public profile/teaching setup/availability sections, and the final action card offers draft save plus submit-for-review only when the profile is editable. Verify the tutor profile scrolls through the same page-level shell container as the student profile, with no inner form scrollbar or large blank region after the action card; inspect the shell, tutor wrapper, and onboarding root and confirm the wrapper's natural height covers the full form rather than shrinking to the viewport. The action card must remain in normal document flow, and shorter specialization categories should not stretch to the height of the longest category. Opening `/onboarding` as a tutor should redirect to `/profile`. As an admin, verify the avatar menu has no **Profile** item and opening `/profile` redirects to `/dashboard`. In the payout-account form, verify all four account details plus ownership and disclaimer confirmation are required, the conventional-BCA/non-BCA fee copy is visible, and BCA Syariah and blu (BCA Digital) are not treated as fee-free. Confirm the browser console has no runtime errors and that the updated payout fields remain private to the tutor/admin surfaces.

For a tutor, confirm the public-profile editor exposes one **Name** field backed by Better Auth `user.name` and no second tutor-profile name. Save a changed name and verify the sidebar, tutor discovery, booking, dashboard, and admin review all render the updated account name; changing unrelated tutor-profile fields must not introduce or display `tutorProfile.displayName`.

The authenticated shell shows a session-expiry warning during the final 30 minutes of Better Auth's seven-day session. The warning includes a sign-in-again action; an API `401` remains the fallback redirect for expired sessions.

### Development

```bash
bun run dev              # Starts web + server (port 3001)
bun run dev:server       # Server only
bun run dev:web          # Web only (port 3000)
```

### Production

```bash
bun run build            # Build server + web
NODE_ENV=production bun apps/server/dist/index.mjs
```

The server runs on port 3001 by default (configurable via `PORT` env var).

## Database

### Start PostgreSQL (Docker)

```bash
bun run db:start         # Starts PostgreSQL (dev DB cogito-app) on port 6767
bun run db:test          # Starts isolated test PostgreSQL + Redis (docker-compose.test.yml) on port 6767
```

> Note: the dev and test PostgreSQL containers both map host port 6767 — do not run `db:start` and `db:test` simultaneously. `db:test` uses `docker-compose.test.yml` (repo root) and the test harness targets `cogito-test` via `apps/server/.env.test(.example)`.

> **Shutdown noise (C6):** stopping the Postgres container while the app still holds pooled connections prints `FATAL: terminating connection due to administrator command` lines — that is normal fast-shutdown, not a failure. Postgres has a `stop_grace_period: 30s` in both compose files; stop the app (or `docker compose stop` the app service) **before** the DB so connections drain cleanly. On Coolify, set a stop grace period ≥ 30s for the app so graceful shutdown (redis quit + DB drain) can finish before SIGKILL.

### Run Migrations

```bash
bun run db:migrate       # Apply pending migrations
bun run db:generate      # Generate new migration from schema changes
```

Migration `0038_room_booking_overlap_guard.sql` enables PostgreSQL `btree_gist` and adds `room_booking_confirmed_no_overlap`. Before applying it to an existing environment, query for overlapping `confirmed` room assignments and resolve any duplicates; PostgreSQL will refuse the constraint if conflicting historical rows exist. The range is half-open (`[start,end)`), and the API conflict queries use the same strict boundaries, so back-to-back room sessions are valid. The migration requires a database role allowed to install the trusted `btree_gist` extension (or an operator must pre-install it).

Contact sharing uses migration `0030_bouncy_madrox.sql`, which adds
`student_profile.allow_contact_requests` and the `contact_request` table. Apply
the migration before starting an API build that includes the Contact Module;
the reviewed migration is intentionally limited to those contact-sharing
changes.

If tutor discovery returns `500` with a missing `subject_category` or
`tutor_profile_subject` relation, the local database is behind migration
`0029_competition_taxonomy.sql`. Apply that migration (or the equivalent reviewed
pending migration) and restart the server. `bun run db:push` can detect broad
schema drift and ask ambiguous rename questions; review those prompts instead
of accepting unrelated changes blindly.

Canonical tutor profile credentials require migration
`0051_short_hobgoblin.sql`. Run `bun run db:migrate` before deploying matching
API/web builds. Migration adds nullable `affiliation`, renames
`competition_achievements` to `achievements`, renames `experience_entries` to
`experiences`, preserves both JSONB arrays, and discards obsolete pending JSON
keys. Existing published affiliation values may remain null until edited.

Tutor Terms of Service acceptance requires migration
`0042_nappy_thunderbird.sql`. Run `bun run db:migrate` before starting an API
build that includes the first-submit consent flow; it adds nullable
`tutor_profile.terms_of_service_accepted_at` and
`tutor_profile.terms_of_service_version`. Existing rows are not backfilled;
the first accepted submission records version `2026-09`.

Human-readable booking references require migration
`0043_cheerful_blockbuster.sql`. Run `bun run db:migrate` before starting an
API/web build that displays or searches booking numbers. It adds the global
PostgreSQL-backed `booking.booking_number` sequence, assigns numbers to
existing bookings, and enforces uniqueness. Numbers are immutable and may have
gaps after rolled-back inserts; this is expected and is not a migration or data
integrity failure. No manual backfill or environment variable is required.

Temporary admin Knowledge Bank access requires migration
`0048_knowledge_bank_access_grant.sql`. Run `bun run db:migrate` before starting
the build that includes `/admin-knowledge-bank`. It creates one optional grant
per student, with a unique student index and an expiry index. Expiry is checked
at read time; expired rows are intentionally retained for admin visibility and
can be removed from the page without affecting audit history.

The IDR economy and admin rate-control surface require migration
`0028_economy_config.sql`. Run `bun run db:migrate` before starting the server;
it adds `tutor_profile.base_rates_idr`, creates the singleton
`economy_config` row with client-approved defaults, and is safe to rerun.

With the migration present, selecting a category or specialization
should execute the normalized relation filter and return either matching
tutors or an empty list—not a `500`. If only filtered requests fail, restart
the server after the latest API build and inspect the emitted SQL for the
`tutor_profile_subject`/`subject_category` filter aliases.

If `support.listTickets` returns `500` and the server log reports a missing
`support_ticket` relation, apply migration `0013_grey_sphinx.sql` and restart
the server. The procedure reads this table directly; a missing relation is a
database migration problem, not an empty ticket list.

For isolated local test runs, the test runner migrates `cogito-test` automatically
using `apps/server/.env.test` or `apps/server/.env.test.example`.

Migration `0059_massive_blindfold.sql` creates `tutor_session_fee`. Apply it
before starting an API build that records completed-session fees. It adds one
source-keyed row per completed solo/group booking or completed series child and
does not backfill historical bookings. Tutor/admin payout summaries consume
these rows, suppress the corresponding legacy booking/session snapshot, and
retain the legacy fallback for sources with no fee event. Pending cutoffs filter
new events by `earnedAt` and preserve the existing completion-time fallback for
legacy sources. Paid rows are still aggregate cutoff records, not allocations
to individual fee events. Only the successful completion transaction writes
these fee facts.

For a browser preview against the local development database, `apps/server/.env`
selects `cogito-app` and the API's port; keep that database URL but disable
external side effects (`PAYMENT_PROVIDER=stub`, `SCHEDULER_ENABLED=false`,
`GOOGLE_MEET_ENABLED=false`, blank `RESEND_API_KEY`, and local-only analytics).
Use an explicitly configured local test environment for database-backed
integration tests. `resetDatabase()` requires the exact dedicated 6769/6770
target plus both reset-consent variables; 6767/6768 are always blocked, and
`cogito-app` is never an allowed reset target.

#### Migration rollback

Up migrations are the only automatic path; rollback SQL for the 2026 taxonomy
and IDR-economy migrations lives here (NOT inside the migration files —
drizzle-kit executes each file as one batch, so embedded down-DDL would run
immediately after the up-DDL). Rollback is a manual `psql` operation against
the target database, ordered newest-first:

```sql
-- 0028 economy config down
DROP TABLE IF EXISTS "economy_config";
ALTER TABLE "tutor_profile" DROP COLUMN IF EXISTS "base_rates_idr";

-- 0027 subject taxonomy down
DROP TABLE IF EXISTS "tutor_profile_subject";
DROP TABLE IF EXISTS "subject_category";
```

Order matters (0028 before 0027 is fine either way; children before parents for
0027). There is **no** automatic CD rollback — revert the code first, then run
the down SQL, then re-run `bun run db:migrate` to restore the journal state
consistently. `drizzle-kit` does not execute `-- down` sections; they exist for
manual recovery only.

### Seed the Database

```bash
# Default mark packages are installed by migration 0041_seed_mark_packages.sql.
bun run seed-packages          # Optional local/test or explicitly approved recovery tool
```

Production guard: `NODE_ENV=production bun run seed-packages` will exit with an error unless `SEED_ALLOWED_IN_PROD=true` is explicitly set. Do not run it as part of normal deploys: the CD migration step applies `0041_seed_mark_packages.sql` automatically and safely. Use the command only for local/test setup or an explicitly approved recovery. The full `bun run seed` command uses the same guard and additionally requires `SEED_ADMIN_PASSWORD`, `SEED_TUTOR_PASSWORD`, and `SEED_STUDENT_PASSWORD` (minimum 12 characters). In production it creates a dedicated local-login review admin from `SEED_REVIEW_ADMIN_EMAIL` and refuses to reuse an operator address from `ADMIN_EMAILS`. Set the review student/tutor emails explicitly, run the seed once, then remove all seed passwords and `SEED_ALLOWED_IN_PROD` from the deployment environment. Never provide the Google Calendar account password to a reviewer.

Launch defaults are `cogito.diego@yopmail.com` (Diego by Cogito, tutor) and
`cogito.andre@yopmail.com`, `cogito.argya@yopmail.com`, and
`cogito.athena@yopmail.com` (Andre, Argya, and Athena by Cogito, students).
`SEED_REVIEW_TUTOR_EMAIL` and `SEED_REVIEW_STUDENT_EMAIL` override Diego and
Andre only; Argya and Athena remain fixed defaults.

The full production/staging seed creates or reuses the separate review address
from `SEED_REVIEW_ADMIN_EMAIL` and sets its role to `admin`. Independently, on
every production-like server boot, the `ADMIN_EMAILS` operator allowlist
promotes matching existing accounts
case-insensitively without demoting other admins. A matching account created
after boot is promoted by the Better Auth signup hook. Set `ADMIN_EMAILS` to a
comma-separated list when more than one trusted account should be bootstrapped.
Other admin accounts may still be granted through the existing admin role UI/API.

Default catalog values follow PRD OQ-01: Starter 50 Marks / Rp312,500, Learner 120 Marks / Rp690,000, Explorer 200 Marks / Rp1,070,000, Pioneer 400 Marks / Rp2,000,000. Migration `0041_seed_mark_packages.sql` inserts missing rows and updates those name/Marks/price fields when a matching code already exists, while preserving an existing `is_active` choice. Seed demo students are marked email-verified so the local booking smoke flow can exercise the verified-student guard without an external OTP provider. To change the catalog after deployment, use the admin mark-package API; do not delete rows because payment records reference the package id and retain amount/Marks snapshots.

If production is currently missing packages, deploy the migration and verify with:

```bash
bun run db:migrate
```

Then call `adminMarkPackage.list` as an admin and confirm the four default codes are present. The next normal CD deployment runs this migration automatically; no per-deploy seed command or server-boot seed is required.

### Reset the Database

For the exceptional production prelaunch wipe/reseed procedure, including the
mandatory private-R2 backup and restore path, use
[`PRODUCTION-DATA-RESET.md`](./PRODUCTION-DATA-RESET.md). Never delete the
Coolify PostgreSQL resource or volume to reset application data.

```bash
# Stop and remove the Docker container, then recreate:
docker compose down -v
bun run db:start
bun run db:migrate
# Migration 0041 inserts the default mark-package catalog.
```

Test database reset:

```bash
docker compose -f docker-compose.test.yml down -v
bun run db:test
```

### Drizzle Studio (Database GUI)

```bash
bun run db:studio        # Opens Drizzle Studio on port 4983
```

## Backup & Restore

### How the nightly backup works

Every night at **02:00 server time (UTC — 09:00 WIB)** a cron job on the VPS
runs [`infra/backup.sh`](../infra/backup.sh), which:

1. Dumps the production database with `pg_dump --no-owner --no-acl -Fc` (custom
   format, gzip-compressed — the file is still named `backups-YYYY-MM-DD.sql.gz`).
2. Uploads it to Cloudflare R2 via the `aws` CLI
   (`--endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com --region auto`)
   under `s3://cogito-backups/backups/YYYY-MM-DD.sql.gz`.
3. Prunes R2 objects older than `RETENTION_DAYS` (default **30 days**).

**Failure self-check (2026-09-05):** any failing step (dump, upload,
verify, prune) posts a Discord `CRITICAL: nightly backup FAILED during
<step>` alert naming the step, and preflight problems (missing env,
unresolvable DB host, missing CLI tools, empty dump) abort loudly before
any snapshot or upload. Without `DISCORD_WEBHOOK_URL` the failure is loud
on stderr + exit 1.

**RPO (accepted 2026-09-05):** **24h** — the nightly dump plus the CD
pre-migrate snapshots (`pre-migrate-<sha>.sql.gz`, newest 7 kept) are the
recovery points (see `docs/FAILURES.md` DR-2/DR-3). Continuous WAL
archiving (point-in-time recovery) is the documented future path, not
implemented: it would ship WAL segments to `cogito-backups/wal/` alongside
the nightly base dumps.

The cron job, the `pg_dump` package, the decrypted credential file
(`/etc/cogito/backup.env`, root-only `0600`, decrypted from the SOPS vault on
the control node — the age key never reaches the VPS) and log rotation
(`/var/log/cogito-backup.log`, 7 daily files) are all installed by the
idempotent playbook [`infra/ansible/backup-cron.yml`](../infra/ansible/backup-cron.yml):

```bash
ansible-playbook -i infra/ansible/inventory.ini \
  infra/ansible/backup-cron.yml --ask-become-pass
```

**AWS CLI note (verified 2026-08-31):** Ubuntu noble dropped the `awscli` apt
package, so the playbook detects the existing AWS CLI v2 at
`/opt/cogito-actions-tools/bin/aws` (installed for the CD runner) instead of
apt-installing it. **DB-host resolution (dynamic since 2026-09-05):** the
vault keeps the Coolify-private hostname (e.g. `noxeaeuxfreq0axa9unpew5r`);
`infra/backup.sh` rewrites it to the container IP on the `coolify` network
at runtime (`getent` → `docker inspect`) and aborts loudly pre-snapshot when
the host is unresolvable — the operator never hand-maintains a container IP
(the old `10.0.1.8:5432` note below is one resolved value, not config).

(Or, during an apply window, `./infra/apply.sh backup-cron` — same playbook
with the DATABASE_URL reachability gate built in; see
[`infra/APPLY-RUNBOOK.md`](../infra/APPLY-RUNBOOK.md) §0.)

The playbook runs the backup as **root** (documented in the playbook header):
the single-tenant VPS is already root-managed, and the script needs the full
`DATABASE_URL` plus the R2 token either way, so a dedicated `backup` user
would duplicate credentials without adding isolation.

> **Before first run:** `DATABASE_URL` in the SOPS vault keeps the
> Coolify-private hostname (e.g. `postgres-prod` or the app's private-network
> hostname — reachable only inside the Docker network). The backup script
> resolves it to the container IP at runtime and aborts loudly when it
> cannot, so no hand-maintained IP is needed.
> `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and
> `R2_SECRET_ACCESS_KEY` come from the same vault; the token needs Object
> Read & Write on the bucket.

### Manual run and verification

```bash
# Print the exact commands without executing (no credentials needed):
/usr/local/bin/cogito-backup.sh --dry-run
# Run one backup now:
DATABASE_URL=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  /usr/local/bin/cogito-backup.sh
```

Verify a backup exists and is the expected size:

```bash
aws s3 ls s3://cogito-backups/backups/ \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com --region auto
```

A fresh nightly backup should appear by ~02:10 WIB. Missing backups surface as
an empty `backups/` listing plus the cron log at `/var/log/cogito-backup.log`.

### Restore drill

The nightly dumps are **custom-format** (from `pg_dump -Fc`) — restore them
with `pg_restore`, not `psql`. Practice this on a scratch database before ever
needing it in anger:

```bash
# 1. Pull the latest backup and decompress the custom-format dump.
aws s3 cp s3://cogito-backups/backups/$(date +%F).sql.gz . \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com --region auto
gzip -dc backups-$(date +%F).sql.gz > backup.dump

# 2. Restore into a scratch database (NOT the live one).
createdb cogito-restore-drill
pg_restore --no-owner --no-acl -d cogito-restore-drill backup.dump

# 3. Verify against known-good expectations: row counts, newest rows.
psql -d cogito-restore-drill -c "SELECT count(*) FROM \"user\";"
psql -d cogito-restore-drill -c "SELECT count(*) FROM booking;"
# Compare with the live database; also spot-check the newest ledger rows and
# a recent booking state history.
```

**Promoting the drill to a real restore** (disaster recovery, not a drill):

1. **Never restore over live traffic without a maintenance window.** Pick a
   low-traffic slot, put the API in maintenance (or stop the `cogito-api`
   resource in Coolify), and take a fresh pre-restore snapshot of the current
   database in case the restore must be abandoned.
2. Restore the verified dump into the production database:
   ```bash
   pg_restore --clean --if-exists --no-owner --no-acl -d <PROD_DATABASE_NAME> backup.dump
   ```
3. If the backup predates pending migrations, run `bun run db:migrate` with
   the production `DATABASE_URL` (see DEPLOYMENT.md — migrations are never
   automatic).
4. Start the API and verify `/health` (database + Redis + scheduler `ok`) and
   the smoke checks in this runbook before reopening traffic.

Backups are retained 30 days; a restore older than that requires the R2
bucket's lifecycle configuration to have kept the object, so verify any
emergency restore against the actual object list first.

## Monitoring & Alerting (Uptime Kuma + Discord + disk watchdog)

### What is wired

- **Uptime Kuma** runs as a Coolify **service** (`cogito-uptime-kuma`,
  `louislam/uptime-kuma:2`, port 3001, volume `uptime-kuma-data:/app/data`)
  at **https://status.cogitoacademy.id** (DNS `status.` record is
  Terraform-owned). It is declared **declaratively through the Coolify API**
  by [`infra/ansible/uptime-kuma.yml`](../infra/ansible/uptime-kuma.yml) —
  the same control-node pattern as `coolify-resources.yml` (tunnel to
  `localhost:8000`, SOPS decrypt on the control node, idempotent, drift
  PATCHed). Nothing is installed on the VPS host directly.
- **Discord alerting**: the webhook URL is a bearer secret stored in the
  SOPS vault as `DISCORD_WEBHOOK_URL`. Kuma posts monitor alerts to the ops
  Discord channel; the disk watchdog posts disk warnings. **Wired
  2026-09-02** — the `COGITO ALERT` Discord notification is attached to all
  four Kuma monitors (see `docs/KUMA-RUNBOOK.md` for the live state and the
  two root causes fixed that day: the 503-flap from `maxretries=0` during CD
  deploys, and the empty `monitor_notification` that silently killed Discord
  alerting).
- **Disk watchdog**: [`infra/ansible/disk-watchdog.yml`](../infra/ansible/disk-watchdog.yml)
  installs `/usr/local/bin/cogito-disk-watchdog.sh` + a nightly cron
  (**03:30 WIB**) that warns at **≥ 85%** disk and auto-prunes at **≥ 92%**
  (see [Disk thresholds & auto-prune](#disk-thresholds--auto-prune)).

### Setup steps (one-time, operator)

1. **Add `DISCORD_WEBHOOK_URL` to the SOPS vault** (the playbooks print this
   instruction loudly when the key is missing; they never invent a URL):
   ```bash
   sops infra/secrets/prod.env
   # add: DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```
   Create the webhook first: ops Discord server → channel (e.g.
   `#cogito-alerts`) → Settings → Integrations → Webhooks → New Webhook.
2. **Declare the Kuma service** (tunnel up, from the repo root):
   ```bash
   ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@<tailnet-ip>
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/uptime-kuma.yml
   ```
   The playbook creates the service from the built-in `uptime-kuma`
   one-click template, applies `https://status.cogitoacademy.id`, starts it,
   and probes the domain. Re-runs are no-ops (drift-checked).
3. **Install the disk watchdog**:
   ```bash
   ansible-playbook -i infra/ansible/inventory.ini \
     infra/ansible/disk-watchdog.yml --ask-become-pass
   ```
4. **Configure Kuma** — **DONE 2026-09-02** (operator UI pass; the Coolify
   API cannot express Kuma's monitors). Live state: `api-health` (keyword
   `"status":"ok"`, `maxretries=2`), `web-app`, `DLQ DEPTH` (keyword
   `"dlqDepth":0`, `maxretries=3`), the `COGITO ACADEMY` group, the
   `COGITO ALERT` Discord notification attached to all monitors, and the
   `cogito` status page at `status.cogitoacademy.id`. The click-by-click
   runbook and the read-only verification query live in
   `docs/KUMA-RUNBOOK.md`. Two root causes were fixed during the pass:
   - **503-flap** — `maxretries=0` recorded DOWN on every CD deploy (the
     API container restarts and `/health` 503s while the new image boots).
     Fixed with `maxretries=2` + `retry_interval=60`.
   - **Discord silent** — the notification existed but no monitor was
     attached (`monitor_notification` empty). Fixed by attaching it to every
     monitor.
   - Not yet created: `api-cert` / `app-cert` certificate monitors
     (recommended follow-up).

### What alerts arrive

| Alert                                                                                      | Source               | Meaning                                                                                                                                                                                                                                | Response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kuma: api /health down                                                                     | Kuma monitor         | API unreachable or `status != ok` (DB/Redis/scheduler degraded)                                                                                                                                                                        | `./ops.sh health`, `./ops.sh status`, check Coolify logs                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Kuma: app down                                                                             | Kuma monitor         | Web app unreachable                                                                                                                                                                                                                    | `curl -sI https://app.cogitoacademy.id`, Coolify web resource                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Kuma: cert expiring                                                                        | Kuma monitor         | TLS cert for `api.`/`app.` near expiry (monitors not yet created)                                                                                                                                                                      | Traefik/Let's Encrypt renewal check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Kuma: dlqDepth > 0                                                                         | Kuma keyword monitor | A **fresh** DLQ failure landed in the last 24h                                                                                                                                                                                         | `./ops.sh dlq` to see what failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Discord: "VPS disk at N%"                                                                  | disk watchdog        | Disk ≥ 85%                                                                                                                                                                                                                             | `./ops.sh disk`; plan cleanup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Discord: "CRITICAL: VPS disk still at N% after auto-prune"                                 | disk watchdog        | Disk ≥ 92% **after** the prune ladder                                                                                                                                                                                                  | Operator action required — see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Grafana: DLQFresh / DiskWarn / DiskCrit / ApiErrors / ProdOnStub / TestModeRestrictedSpike | Grafana alert rules  | Same signals as above, evaluated from Prometheus/Loki (1m)                                                                                                                                                                             | Same responses; Grafana is the second pair of eyes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Grafana: PaymentIntegrityEvent (critical, `for: 5m`)                                       | Grafana alert rules  | `max(increase(payment_integrity_events_total[30m])) > 0` (`max`, not `sum` — public + internal jobs scrape the same replica) — a Midtrans webhook/reconcile amount, currency, provider mismatch or partial refund needs reconciliation | Identify the type: PromQL `sum by(type) (increase(payment_integrity_events_total[1h]))`; check `./ops.sh db "SELECT * FROM refund_record ORDER BY created_at DESC LIMIT 5"` + audit `partial_refund_reconciliation`; reconcile via admin refund flow. NOTE: resolve means "quiet 30m", not "reconciled". Root cause (2026-10-01): provider gross includes channel fees (echannel +4440) while the app compared against package price — amount/currency checks now apply only to PAID/SETTLED; reconcile skips attempts older than 7d |

### Observability stack (LIVE 2026-09-05 — Loki + Prometheus + tailnet Grafana)

Declared by [`infra/ansible/observability.yml`](../infra/ansible/observability.yml)
(Coolify services `cogito-loki` / `cogito-prometheus` / `cogito-grafana` /
`cogito-alloy`, all tailnet-only, no public domains). Retention: Loki 30d,
Prometheus 15d. 2G swap live on the VPS (2026-09-05) with per-service memory
limits in the composes.

- **Declarative pipeline (2026-09-06):** `./infra/apply.sh observability`
  (Play 1 Coolify API declares + Play 2 host files/network + Play 3 Grafana
  Discord wiring; needs the `:8000` + `:3000` tunnels up). Merges touching
  `infra/ansible/observability.yml`, `tasks/observability-service.yml`,
  `studio.yml`, `drift-check.yml`, or `infra/{prometheus,loki,alloy,grafana}/**`
  auto-apply via `infra-apply.yml` (runner loopback, `workflow_dispatch`
  break-glass). Config-file changes self-restart `cogito-prometheus`,
  `cogito-alloy`, and `cogito-grafana` via the playbook handler
  (change-triggered only — alert rules load at Grafana startup, so the
  restart is required, not optional; the ~60s gap fits inside the 5m/10m
  alert `for` windows while Kuma covers api/app). Drift gate: `ansible-playbook -i
infra/ansible/inventory.ini infra/ansible/drift-check.yml -e
coolify_api_base=http://localhost:8000/api/v1 -e
coolify_api_token="$(sops -d infra/secrets/prod.env | grep
COOLIFY_API_TOKEN | cut -d= -f2-)"` (tunnel up; exit 0 = no drift —
  covers existence + tailnet-only `urls == []` + image pins for all 5
  PLG/studio services).

- **Grafana SQLite WAL (2026-10-09):** the `cogito-grafana` compose sets
  `GF_DATABASE_WAL=true` + `GF_DATABASE_QUERY_RETRIES=3`. Before this, Grafana's
  delete-journal SQLite locked the metadata DB for ~4 minutes once a day (an
  in-process write transaction starting ~17:52 UTC) and every 1-minute alert
  evaluation failed with `database is locked`, emitting bursts of mislabeled
  `DatasourceError` notifications (the grafana#64692/#68941 signature). WAL lets
  rule-evaluation reads proceed during any long write; retries absorb residual
  contention. The `grafana.db-wal`/`-shm` files live in the `grafana-data`
  volume: to inspect the DB, copy it with `sqlite3 grafana.db ".backup …"` — a
  plain `cp`/`cat` yields a snapshot that may lag the last committed WAL frames.

- **Logs without SSH:** Grafana → Explore → Loki datasource →
  `{service="cogito-api"} |= "<traceId>"` (the stable Coolify resource names:
  `cogito-api`, `cogito-web`, `cogito-prod-db`, … — relabeled from the
  `coolify_resourceName` container label, never the random container name). Or `./infra/ops.sh trace <traceId>` for the Explore URL.
- **Grafana access (tailnet-only):** `./infra/ops.sh grafana` (tunnel + URL
  in one command), or manually `ssh -L 3000:127.0.0.1:3000
ubuntu@cogito-vps.tail674634.ts.net`, then `http://localhost:3000` (admin user `admin`;
  password in the SOPS vault as `GRAFANA_ADMIN_PASSWORD`). The direct tailnet URL
  `http://cogito-vps.tail674634.ts.net:3000` also resolves via MagicDNS with no
  tunnel; `./infra/ops.sh trace` defaults `GRAFANA_URL` to it. Provisioned:
  datasources (Loki default + Prometheus), 6 dashboards (App RED, Logs &
  Traces, Infra, Delivery, Saturation, Important Logs), 15 alert rules (DLQFresh/DiskWarn/DiskCrit/ApiErrors/TargetDown/CpuHigh/CpuCrit/MemHigh/MemCrit/DiskForecast/ContainerRestartBurst/BackupStale
  - ProdOnStub/TestModeRestrictedSpike/PaymentIntegrityEvent → `Discord-ops` contact point).
- **Grafana password rotation (2026-09-06 pattern):** `GRAFANA_ADMIN_PASSWORD`
  is SOPS-encrypted in `infra/secrets/prod.env` (never plaintext). Rotate by
  setting a fresh value in the vault, then applying live without needing the
  old password: `CID=$(sudo -n docker ps --format '{{.Names}}' | grep -E
'^grafana-' | head -1); sudo -n docker exec "$CID" grafana cli admin
reset-admin-password '<new>'` on the VPS; verify the new password returns
  200 on `/api/org` and the old returns 401. Then update the Coolify UI env
  `GF_SECURITY_ADMIN_PASSWORD` on `cogito-grafana` to the same value so a
  future fresh volume boots with the rotated password. File-provisioned alert
  rules load at Grafana startup only — `./infra/apply.sh observability` (or
  the Infra Apply pipeline on merge) syncs the tree and auto-restarts Grafana
  via the Play 2 handler, so there is no separate restart step (dashboards
  hot-reload regardless).
- **Zero-safe PromQL pattern (2026-09-06):** a ratio whose numerator is empty
  when healthy (e.g. zero 5xx) renders No Data, not 0. Wrap the fallible side:
  `(sum(rate(http_requests_total{status=~"5.."}[5m])) or vector(0)) /
sum(rate(http_requests_total[5m]))`, and `breaker_state or on() vector(0)`
  (per-breaker series preserved) or `max(breaker_state) or vector(0)` (stat).
- **Slow-scrape tuning (2026-09-07):** cAdvisor renders 10MB+ expositions
  here, so its job uses `scrape_interval: 60s` / `scrape_timeout: 50s`
  (capacity panels tolerate the freshness). Watch
  `scrape_duration_seconds{job="cadvisor"}` — if it rides the timeout,
  trim at the source with `--disable_metrics=disk,diskIO` (disk panels
  already use node-exporter). The `TargetDown` alert (`count(up{job!="cogito-api-internal"} == 0) or vector(0)`, warning,
  `cogito-api-internal` excluded — DOWN by design until the API joins `cogito-obs`)
  covers silently-failing scrapes.
- **Memory-pressure incident (2026-09-07):** load 2.75 on 2 cores with
  `wa` up to 84% + ~690MB swap in/out = swap-thrash, not app burn (API sat at
  0.5% CPU / 177MB). cAdvisor OOM-cycled on its 128m cgroup (dmesg
  `CONSTRAINT_MEMCG` proof) → bumped to 256m **and** trimmed at the source
  with `--disable_metrics=disk,diskIO`. Alloy's `unhealthy` flag was a missing
  `wget` in-image (Alloy ships fine) — probe removed, liveness now comes from
  the Prometheus `alloy:12345` self-scrape job (Alloy runs with `--server.http.listen-addr=0.0.0.0:12345`, container networks only, unpublished). Compose drift self-rolls: Play 2 compares sha256 of each declared compose against a host hash file and restarts ONLY the drifted service (first apply restarts once to record hashes; steady-state applies restart nothing). The API `cogito-obs` alias-attach is a Play 2 task (idempotent, re-attaches after redeploys on next apply). Host backup log tails to Loki
  as `{service="cogito-backup",job="backup"}` (single-file read-only mount;
  within the A3 constraint). Watch post-apply: cAdvisor RSS <200m, swap
  trending down, `alloy` target UP.
- **OK (not KeepLast) alert semantics (2026-09-14, supersedes the 2026-09-07
  KeepLast entry below):** all 14 rules use `noDataState: OK` (= Normal state)
  with
  zero-safe queries — every query A returns a numeric vector when its
  datasource is healthy (thresholds live in the C step, e.g. raw CPU % with
  C `gt 80`), so healthy resolves via real data and only true gaps hit the
  OK fallback. File-provisioning enum is `NoData`/`Alerting`/`OK`
  (+`KeepLast`) — `Normal` is NOT a valid value and crash-loops Grafana on
  boot with `unknown NoData state option Normal` (verified live 2026-09-14;
  the first version of this fix used it and took Grafana down until
  corrected to `OK`). Root cause fixed: the old in-query comparisons
  (e.g. `... > 80`) returned an EMPTY vector when healthy, so healthy was
  also NoData and KeepLast latched firing forever (CpuHigh kept firing at
  28–45% CPU). Three never-fire bugs fixed along the way: TargetDown
  (`up == 0` with C `> 0` could never fire — now a counted
  `job!="cogito-api-internal"` expression), DiskForecast (negative `< 0`
  value with C `> 0` — now `< bool 0` 0/1 mapping), BackupStale (empty
  `< 1` with C `> 0` — now `sum(...) or vector(0)` with C `lt 1`).
  Vanished-series/dead-scraper coverage comes from TargetDown + Kuma, not
  from holding last state.
- **KeepLast alert semantics (2026-09-07, SUPERSEDED 2026-09-14):** all 12 rules used
  `noDataState: KeepLast` — a firing alert _survived_ scrape gaps and
  Prometheus restarts (the CpuCrit NoData-resolution incident must never
  recur); only real data resolves. Side effect (the 2026-09-14 latch):
  an alert firing when healthy stayed firing — see the Normal entry above.
- **rsyslog ufw.log suspend loop (2026-08-30..09-08, fixed):** rotated-away `ufw.log` was never recreated, so privilege-dropped rsyslog failed every UFW BLOCK write forever (49k+ suspend lines, 30MB syslog bloat). Fixed live (`syslog:adm 640`) + durable via host-hardening (`create 640 syslog adm` + ensure-file task; manual `harden` phase, excluded from auto-apply).
- **Tailscale HTTPS (optional):** enabling HTTPS in the Tailscale admin console
  (DNS → Enable HTTPS) gives the same `cogito-vps.tail674634.ts.net` name a
  trusted certificate; until then use plain `http` over the tailnet, which is
  already encrypted by WireGuard.
- **Prometheus targets** (all UP 2026-09-05): `cogito-api` (Bearer
  `metrics_token`), `node-exporter`, `cadvisor`.
  Shortcut: `./infra/ops.sh prometheus`.
- **Networking lesson (recorded so nobody re-learns it):** each Coolify
  service gets its OWN Docker network — bare service names do NOT resolve
  across services. All obs traffic rides the shared `cogito-obs` Docker
  network (one-time `docker network create cogito-obs`); human access rides
  VPS-loopback publishes (`127.0.0.1:3000/3100/9090/9100/8081`) + SSH
  tunnels. Nothing obs-related is public.
- **Gotchas fixed during apply:** Coolify API requires base64
  `docker_compose_raw`; Alloy component is `loki.source.docker` (not
  `docker_logs`); Loki 3.x needs `delete_request_store: filesystem` with
  retention; `reject_old_samples_max_age` raised to 720h (first connect
  backfills container history); Prometheus container user can't read a 0600
  token file (0644); cAdvisor moved to loopback `:8081` (host `:8080` is
  held by an old docker-proxy).
- **cAdvisor containerd blind spot (2026-09-06):** cAdvisor `≤v0.53` cannot
  register Docker containers when the daemon uses the containerd image store
  (Docker 29 default; `docker info` shows `driver-type:
io.containerd.snapshotter.v1`, `/var/lib/docker/image/` has no
  `overlayfs/` subtree). Symptom: target UP but every
  `container_memory_working_set_bytes` series carries only
  `__name__,id,instance,job` (no `name`/`container_label_*`), and the
  container logs `manager.go:1116 ... layerdb/mounts/...: no such file` every
  minute. Fix: bump `cadvisor_image` to `ghcr.io/google/cadvisor:v0.60.5`
  (upstream #3709, ≥v0.54), `./infra/apply.sh observability`, redeploy
  `cogito-alloy`, verify `with_name > 0` via `/api/v1/series`. Do NOT flip
  the daemon back to the legacy snapshotter (restarts every container).

### Important Logs dashboard (replaces Payment Logs, 2026-09-14; payment panels restored 2026-09-14)

Routine triage without Grafana Explore: open the provisioned **Important
Logs** board (Cogito folder, file
`infra/grafana/provisioning/dashboards/important-logs.json` — source of truth
in git, `allowUiUpdates: false`). Ten panels, top to bottom: request
trail (`traceId` textbox), user trail (`userId` textbox), errors
(`rpc_error`/`request_error`), bookings (created + failures), webhooks,
scheduler/DLQ, meetings (Meet failures + manual fallback), payment boot line
(`payment_provider_configured`), payment gate (`PAYMENT_TEST_MODE_RESTRICTED`/
`FORBIDDEN`), payment provider stat (`app_info`). Each panel states
what healthy looks like. The standalone **Payment Logs** board
(`payment-logs.json`) stays deleted from git — its payment observability now
lives as panels 8–10 on this board; manually DELETE the old board once in
Grafana if it still lingers (`DELETE
/api/dashboards/uid/cogito-payment-logs`; `disableDeletion: true` means the
provisioned copy otherwise lingers as stale).

- **Payment LogQL queries** (same exprs as board panels 8–9, usable in Explore
  or ad-hoc):
  - Boot line: `{service="cogito-api"} |= "payment_provider_configured"`
    (expect `provider=midtrans midtransMode=test` during sandbox UAT; the
    secret never appears in logs).
  - Request trail: `{service="cogito-api"} |= "<traceId>"` (same `traceId`
    the board's textbox filters on; logs carry `userId`, never email).
  - Test-mode gate stream: `{service="cogito-api"} |= "PAYMENT_TEST_MODE_RESTRICTED"`.
  - Rejected-purchase stream: `{service="cogito-api"} |= "FORBIDDEN"`.
- **Alerts behind the board** (same `cogito-1m` group, default policy →
  `Discord-ops`): `ProdOnStub` (critical — `app_info{provider="stub"} == 1`
  for 5m, prod taking no money is an outage) and
  `TestModeRestrictedSpike` (warning — burst of gate rejections over 10m;
  usually an allowlist misconfig during UAT, not a provider outage).
- **CPU-transient rule:** brief ~80% CPU during deploys is normal (container
  recreate + health polls, same class as the Kuma 503-flap absorbed by
  `maxretries=2`); investigate only if sustained >5 min outside
  deploy/backup windows.
  - **`PAYMENT_TEST_ALLOWED_EMAILS` is the test-mode UAT list:** in
    `MIDTRANS_MODE=test` on production/staging it gates `payment.createPurchase`
    to approved verified student emails.
  - **Balance-page mode check:** authenticated `/balance` must show a persistent
    **Test mode** badge beside **Top Up Marks** when `MIDTRANS_MODE=test`; it
    must disappear in live mode. The UI reads protected
    `POST /rpc/payment/getConfig`, not the application hostname.

### Coolify duplicate env row dedupe procedure

Coolify permits two rows with the same key on one application, and
`infra/ansible/tasks/env.yml` PATCHes the FIRST row matching a key — so a
stale second row silently shadows the intended value after a restart, while
normal applies stay green. The playbook now fails loud
(`Fail loud on duplicate Coolify env rows`), naming the duplicated keys.
Resolve manually — the playbook never deletes rows automatically (this
Coolify build's DELETE endpoint semantics are unverified):

1. Note the duplicated keys from the assert failure message.
2. Coolify UI (tailnet) → the application (`cogito-api`) → Environment
   Variables. Find every row with each duplicated key.
3. Compare the values against the SOPS vault (`sops infra/secrets/prod.env`
   — read-only compare, never paste secrets into chat/tickets). Keep the row
   whose value matches the vault; delete the extra row(s) in the UI so
   exactly one row per key remains.
4. Re-run the playbook (tunnel up); the uniqueness assert must print
   `Every declared env key occurs exactly once in the Coolify env list.`
5. Redeploy/restart is NOT needed for the dedupe itself (no value changed),
   but if the shadowed value was live, restart `cogito-api` via the normal
   env-switch path and verify the boot line shows the intended
   provider/mode.

The env apply refreshes the Coolify env list after creating missing rows before
running this uniqueness guard. A remaining `missing keys` entry means the live
API did not persist or return that row; the playbook fails before restart so the
operator can investigate safely.

### Drizzle Studio ownership (LIVE 2026-09-05 — `cogito-studio`)

Coolify service `cogito-studio` (app `drizzle-gateway`,
`ghcr.io/drizzle-team/gateway`, volume `drizzle-gateway-data`). It was
`unhealthy` for 11 days (wedged vendor healthcheck + dead sslip.io domain);
revived 2026-09-05 by service restart + loopback publish
(`127.0.0.1:4983`, PATCHed compose) — status `healthy`, UI serves 200.

- **Access:** `ssh -L 4983:127.0.0.1:4983 ubuntu@cogito-vps.tail674634.ts.net`, then
  `http://localhost:4983`. No public domain by design (DB GUI).
- **Credentials:** managed in the Coolify service env (UI → cogito-studio →
  Environment, `SERVICE_PASSWORD_DRIZZLE`); never in our vault (Coolify-owned
  secret, like the Coolify API token pattern).
- **Operate:** restart via Coolify UI or `POST
/api/v1/services/tzhidx0p18mvbbpuaeahcxwy/restart` (Bearer
  `COOLIFY_API_TOKEN`); health via Coolify status or the UI port check.
  The vendor `healthcheck.js` (5s timeout) is flaky — treat Coolify status +
  UI 200 as truth, not the container health flag alone.
- **Guardrails:** read anytime; writes only in maintenance windows, never
  during a deploy. `./infra/ops.sh studio` (tunnel + local Studio) remains
  the alternative path.

### Disk thresholds & auto-prune

The watchdog (`/usr/local/bin/cogito-disk-watchdog.sh`, cron 03:30 WIB,
log `/var/log/cogito-disk-gc.log`, rotated 7) appends one heartbeat line
per run — `heartbeat disk_pct=N verdict=ok|warn|pruned` (2026-09-05, M3) —
so log-shipping and the operator can tell "watchdog alive" apart from
"watchdog silent because the disk is fine":

- **≥ 85%**: posts `VPS disk at N% — cleanup recommended` to Discord.
- **≥ 92%**: runs the prune ladder, then re-checks:
  1. `docker image prune -f` (dangling images only);
  2. `docker image prune -af --filter until=48h` (unused images older than
     48h);
  3. re-tags the newest 1–2 local `ghcr.io/cogitoacademy/app` images as
     `rollback-keep-*` so the CD rollback candidates survive (GHCR remains
     the authoritative rollback source — `migrate-and-deploy.sh` re-pulls
     `v<PREV_GIT_SHA>`).
- **NEVER deletes**: volumes, active containers' images, postgres data
  (`docker image prune` semantics + the explicit keep-list). A `--dry-run`
  mode prints the exact commands without executing or posting:
  ```bash
  /usr/local/bin/cogito-disk-watchdog.sh --dry-run
  ```
- Rationale: Coolify's built-in `docker_cleanup` (threshold 80, daily)
  failed to prevent the 2026-08-31 incident (99% disk: 28GB of dangling
  images, Redis `MISCONF` stop-writes-on-bgsave-error, failed image
  extraction, a stalled Coolify deployment). This watchdog is the
  independent second line.

If the CRITICAL alert fires, act: `./ops.sh disk` to see what is large,
then remove the offender (e.g. old backups, large volumes — never the
postgres volume) and re-run the watchdog manually.

### Disk watchdog verification (after first install)

The watchdog (`/usr/local/bin/cogito-disk-watchdog.sh`, cron 03:30 WIB) was
installed 2026-09-02 while the disk was at 99% (31G of 38G in
`/var/lib/containerd` — dangling Docker images, 25.8G reclaimable). The
operator's `docker image prune -f` reclaimed the space (99% → 36%, verified
2026-09-02 17:33 UTC: 14G of 38G used). Verify the watchdog works:

1. `./infra/ops.sh disk` — record `df -h /` usage.
2. After 03:30 WIB: `sudo cat /var/log/cogito-disk-gc.log` — expect a
   `check:` line and, if ≥92%, a `prune ladder` run with the post-prune
   usage.
3. `./infra/ops.sh disk` again — usage should be below 85% if the prune
   ran. If not: run the ladder manually
   (`sudo /usr/local/bin/cogito-disk-watchdog.sh --force-prune`) and check
   the log for errors.
4. If the watchdog never ran (no log file): check the cron entry
   (`sudo crontab -l -u root`) and that `/etc/cogito/disk.env` exists with
   `DISCORD_WEBHOOK_URL` (the playbook writes it; a missing key logs
   "webhook not set" but the watchdog still runs).

> **2026-09-02 status:** installed (binary + cron + env present), first run
> pending — `/var/log/cogito-disk-gc.log` did not exist yet at 17:33 UTC
> (the 03:30 WIB run had not fired). Re-verify after the first 03:30 WIB run.

### Memory headroom (recommended, not yet applied)

The VPS has 3.8G RAM, **no swap**, and **no container memory limits**
(verified 2026-09-02: all containers `Memory: 0`). Recommended hardening
(deferred — operator decision; do NOT apply from a worker — operator
console/VPS steps, see the checklist in the wave report):

- Add 2G swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
&& sudo mkswap /swapfile && sudo swapon /swapfile` (+ fstab entry:
  `echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab`, then verify
  with `free -m`).
- Set Coolify per-resource memory limits (Coolify UI → resource → Advanced
  → Memory limit):
  - Existing: API 512M, Redis 256M, Postgres 512M, Kuma 256M.
  - Observability stack (declared by `infra/ansible/observability.yml`;
    limits are also in each service's compose `mem_limit`, the API-service
    limit below is the UI step): Loki 300M, Prometheus 256M, Grafana 256M,
    Alloy 128M, node_exporter 64M, cAdvisor 128M.

### Observability stack (PLG, tailnet-only — declared, not yet applied)

Loki + Prometheus + Grafana + Alloy (+ node_exporter + cAdvisor) are
declared by [`infra/ansible/observability.yml`](../infra/ansible/observability.yml)
(2026-09-05, control-node driven like `uptime-kuma.yml`, idempotent). The
playbook is syntax-checked only — the operator applies it (tunnel up) per
the printed steps; nothing here was applied from a worker.

- **Tailnet-only (hard requirement):** no observability service has a public
  domain (`urls: []`, drift-checked). Grafana is reached over the tailnet
  (`http://cogito-vps.tail674634.ts.net:3000`) or an SSH tunnel — there is deliberately no
  public log UI.
- **Provisioned files** (source of truth in git; the operator places them
  once under `/etc/cogito/observability/` per the playbook's printed
  commands): `infra/prometheus/prometheus.yml` (scrapes api `/metrics` with
  the vault `METRICS_TOKEN` via a token file, 15s interval; node_exporter +
  cAdvisor), `infra/loki/loki-config.yml` (30d retention), `infra/alloy/config.alloy`
  (`loki.source.docker_logs` over the Docker socket — never file globs under
  `/var/lib/docker`), Grafana datasources + 6 dashboards (App RED, Logs &
  Traces with traceId/userId search, Infra with the 85%/92% disk lines,
  Delivery with deploys/backups/DLQ/breakers, Saturation with burn-rate math,
  Important Logs with traceId/userId trails + errors/bookings/webhooks/scheduler/meetings/payments).
- **Retention vars** (single tuning point in the playbook):
  `LOKI_RETENTION_DAYS=30`, `PROM_RETENTION_DAYS=15`. **Lean fallback** for a
  tight VPS (documented, not applied): scrape_interval `30s` in
  `prometheus.yml` + `--storage.tsdb.retention.time=7d` in the prometheus
  compose (halve both vars first so the declaration stays truthful).
- **Trace lookup without SSH:** `./infra/ops.sh trace <traceId>` prints the
  tailnet Grafana Explore URL (LogQL `{service="cogito-api"} |=
"<traceId>"`). Logs carry `userId`, never email.
- **Grafana → Discord** (Grafana UI step, like the Kuma monitors — the
  Coolify API cannot express it): Alerting → Contact points → Discord with
  the vault `DISCORD_WEBHOOK_URL`; suggested rules DLQFresh
  (`dlq_fresh_depth > 0`), DiskWarn/DiskCrit (85%/92%), ApiErrors (5xx %
  canary) — see the playbook's printed steps.

### Redeploy / retry procedure (the 'CD red but box recovered' case)

The 2026-08-31 disk event showed the exact failure shape: the CD deploy
step went red because the queued Coolify deployment failed on a full disk
(image extraction failed), while the box itself was healthy. The recovery
flow, verified in that event:

1. **Confirm the box recovered**: `./ops.sh health` (all `ok`) and
   `./ops.sh disk` (usage back under the thresholds).
2. **Re-run the failed CD run from the GitHub Actions UI** — this is **safe**
   because the pipeline is idempotent:
   - `pg_dump` snapshot → R2 (`pre-migrate-<GIT_SHA>.sql.gz`) — a re-run
     overwrites the same key; no data loss.
   - `bun run db:migrate` — Drizzle migrations are journaled; already-applied
     migrations are no-ops.
   - Coolify deploy webhook — re-POSTing the same image is a no-op redeploy.
   - sha-verified health poll — the gate that proves the new image serves.
     In the Actions UI: failed run → **Re-run failed jobs** (or Re-run all
     jobs). Alternatively, one command:
   ```bash
   ./ops.sh deploy-retry    # gh run rerun for the last CD run; falls back to
                            # POSTing the Coolify deploy webhook with the
                            # vault Bearer token (never echoed)
   ```
3. **Verify**: `curl -s https://api.cogitoacademy.id/health` — `version`
   must equal the merged commit sha, and `checks.*` all `ok`.

> **Never** "fix" a red CD by deploying manually from a laptop while the
> runner is mid-flight — the `production-deploy` concurrency group would
> queue a second migration. Re-run the failed run instead.

### CD does not auto-retry (the 2026-09-02 disk-full incident class)

`cd-prod.yml` has **no retry** — a failed run stays red until someone
re-runs it or the next merge to main happens (the workflow has no paths
filter, so **any push to main re-triggers CD**). The 2026-09-02 incident
(#174–#178) showed the exact shape: the host disk was 99% full, Coolify's
image pull died mid-extraction (`failed to extract layer ... no space left
on device` in `application_deployment_queues.logs`), the deploy webhook was
accepted (`deployment queued`) but the container never switched from
`bb1ccb9a` (still serving, healthy). Recovery procedure:

1. **Free disk first** — the watchdog auto-prunes at ≥92% (03:30 WIB), but
   do not wait for it during an incident:
   ```bash
   ./infra/ops.sh disk                       # confirm the diagnosis
   sudo docker image prune -f                # dangling images (reclaimed 25.3GB, 99% → 36% on 2026-09-02)
   # if still ≥92%: sudo docker image prune -af --filter until=48h
   ./infra/ops.sh disk                       # verify < 85%
   ```
2. **Re-run the failed CD run** (safe — snapshot/migrate/deploy are
   idempotent): `./infra/ops.sh deploy-retry` (or Actions UI → failed run →
   Re-run failed jobs). The wave PR's squash-merge to main is the
   alternative re-trigger — do NOT push to main from a worker branch.
3. **Verify**: `curl -s https://api.cogitoacademy.id/health` — `version`
   must equal the merged commit sha, and `checks.*` all `ok`.

> The old container keeps serving while the deploy is stuck — a disk-full
> deploy failure is a stuck deploy, not an outage. Fix the disk, then
> re-run.

### Operator follow-ups

- ~~Add `DISCORD_WEBHOOK_URL` to the SOPS vault~~ — **done** (vault has it,
  encrypted #149).
- ~~Kuma UI paste for monitors + Discord notification~~ — **done 2026-09-02**
  (see `docs/KUMA-RUNBOOK.md` for the live state and the two root causes
  fixed: 503-flap from `maxretries=0`, and the empty `monitor_notification`
  that silenced Discord).
- Recommended: add `api-cert` / `app-cert` certificate monitors in the Kuma
  UI (not yet created).
- Optional: add `DISCORD_WEBHOOK_URL` as a GitHub secret if the CD should
  post deploy failures to Discord (not wired — noted only).

## Redis

### Check Redis Connection

```bash
redis-cli ping           # Should return PONG
redis-cli info server    # Server info
```

### Application Health Check

```bash
curl http://localhost:3001/health
# Returns: { "status": "ok", "checks": { "database": "ok", "redis": "ok", "scheduler": "ok" }, "timestamp": "..." }
```

`checks.scheduler` mirrors Redis reachability (`ok`/`error`/`degraded`) because the BullMQ scheduler runs on the same Redis — an `error` there means the booking-expiry/hold-release/email/SLA/payment-reconciliation jobs are not running and the readiness check trips (503).

When investigating `cogito-jobs-dlq`, expect one entry only after the source
job has exhausted its configured BullMQ attempt count. A failure with retries
remaining is intentionally absent from the DLQ; inspect the source queue's
attempt counter and backoff state instead.

**DLQ depth is age-aware (fresh failures only).** Since 2026-08-31 each entry
pushed to `cogito:dlq` carries `failedAt` (epoch ms, stamped at push time by
the DLQ worker). `/health` `dlqDepth` counts only entries whose `failedAt` is
within the freshness window — default **24 hours**, overridable via the
`DLQ_FRESH_WINDOW_HOURS` env var (plain integer; an invalid, zero/negative,
or > 1-year value falls back to 24h). **Entries without `failedAt` — the
pre-2026-08-31 ledger — and any non-JSON payload are treated as STALE and
never count**, so an old batch (e.g. the 2026-08-25 one) no longer trips the
alert forever. This is alert hygiene, not data loss: the full ledger remains
in Redis for `ops.sh dlq` inspection and `dlq-clear` still removes it. An
entry exactly 24h old counts as stale (the window is a strict `failedAt >
now − window` comparison).

**Scheduler boot failure mode:** with `SCHEDULER_ENABLED=true`, `initScheduler()` pings Redis first and **throws if unreachable — the API boot aborts**. This is intentional: a silently dead scheduler (no expiry/hold-release/email/payment-reconciliation jobs) is worse than a failed deploy. Fix Redis (or set `SCHEDULER_ENABLED=false` for a scheduler-less instance) and redeploy.

Redis is **mandatory** (`REDIS_URL` is required — the server won't boot without it). The in-memory stores are defensive fallbacks only when a configured Redis call fails at runtime; they are per-process and degrade cross-instance guarantees.

### Clear Rate Limit Keys

```bash
redis-cli KEYS "cogito:rl:*"       # List rate limit keys
redis-cli DEL "cogito:rl:127.0.0.1" # Clear specific key
redis-cli --scan --pattern "cogito:rl:*" | xargs redis-cli DEL  # Clear all
```

### Reset Circuit Breaker State

```bash
redis-cli KEYS "cogito:cb:*"       # List circuit breaker keys
redis-cli DEL "cogito:cb:google_meet"  # Reset Google Meet circuit
redis-cli DEL "cogito:cb:resend"       # Reset Resend circuit
redis-cli DEL "cogito:cb:midtrans"     # Reset Midtrans circuit
```

### Monitor BullMQ Jobs

```bash
redis-cli KEYS "cogito-jobs:*"     # List all job keys
redis-cli LLEN "cogito-jobs:wait"  # Jobs waiting
redis-cli LLEN "cogito-jobs:failed" # Failed jobs
redis-cli ZCARD "cogito-jobs:delayed" # Delayed jobs
```

## Test and Coverage

The CI coverage collection has three separate Bun processes. The former
combined API coverage command is unsupported as a CI-equivalent: it mixes
resettable tests, reset-free report fixtures, and payout tests, and it does not
produce the three raw profiles that CI merges. Run the commands below from the
repository root only against explicitly prepared disposable databases. Keep the
reset guards limited to the resettable API and payout commands; the report
fixture command must run without either reset variable.

For the resettable and report-fixture partitions, provide the same test
environment shape as CI: `NODE_ENV=test`, `DATABASE_URL` exactly targeting
`localhost:6769/cogito-test`, Redis at `localhost:6379`, and the test auth,
CORS, payment-webhook, and Sanity settings. Migrate that disposable database
before running tests. CI also creates `apps/server/.env` for Drizzle, with
`PAYMENT_PROVIDER=stub`. Never target the old 6767/6768 databases or the
retained local 6769/6770 fixtures.

The resettable API/env/auth/DB/OpenAPI partition requires both reset values to
match `DATABASE_URL` exactly:

Each partition is only a partial coverage profile, so CI uses a temporary copy
of the root Bun config without its per-file `coverageThreshold`; the merged
LCOV gate below applies the 100% requirements after all profiles are combined.
Create that config before running the coverage partitions and pass it to each
Bun process:

```bash
coverage_config="$(mktemp .coverage-collection-bunfig.XXXXXX.toml)"
trap 'rm -f "$coverage_config"' EXIT
sed '/^coverageThreshold[[:space:]]*=/d' bunfig.toml > "$coverage_config"
```

```bash
TEST_DATABASE_ALLOW_RESET=true \
TEST_DATABASE_RESET_TARGET="$DATABASE_URL" \
bun --config="$coverage_config" test --coverage --coverage-reporter=lcov --timeout 30000 \
  --path-ignore-patterns '**/booking-admin-reports.test.ts' \
  --path-ignore-patterns '**/class-enrollment.test.ts' \
  --path-ignore-patterns '**/report-export.test.ts' \
  --path-ignore-patterns '**/booking-payout-g16.test.ts' \
  packages/api/src/tests/ packages/env/src/ packages/auth/src/ \
  packages/db/src/ apps/server/src/openapi.test.ts
```

The reset-free report fixture partition uses the 6769 `DATABASE_URL`, with
`TEST_DATABASE_ALLOW_RESET` and `TEST_DATABASE_RESET_TARGET` unset:

```bash
bun --config="$coverage_config" test --coverage --coverage-reporter=lcov --timeout 30000 \
  packages/api/src/tests/integration/booking-admin-reports.test.ts \
  packages/api/src/tests/integration/class-enrollment.test.ts \
  packages/api/src/tests/integration/report-export.test.ts
```

The payout partition uses a separately migrated `cogito-test-payout` at
`localhost:6770`, normally via `apps/server/.env.test-payout`. Set
`PAYOUT_DATABASE_URL` to that exact URL; the test command must point
`DATABASE_URL` and both reset values at it:

```bash
DATABASE_URL="$PAYOUT_DATABASE_URL" \
TEST_DATABASE_ALLOW_RESET=true \
TEST_DATABASE_RESET_TARGET="$PAYOUT_DATABASE_URL" \
bun --config="$coverage_config" test --coverage --coverage-reporter=lcov --timeout 30000 \
  packages/api/src/tests/integration/booking-payout-g16.test.ts
```

CI clears `coverage/lcov.info` before each process, snapshots each fresh profile
to its `coverage/api-*` path, then merges those three profiles before applying
the coverage gate. Running the three commands manually without the workflow's
profile capture/merge steps does not reproduce the complete CI gate.

For the contact-sharing regression path, run the database-preparing wrapper
with the focused integration test, then the Playwright privacy spec against the
local web/API stack:

```bash
bun scripts/run-test-suite.mjs api packages/api/src/tests/integration/contact-sharing.test.ts
bun scripts/run-test-suite.mjs e2e --grep "identity surfaces"
```

The workflow runs resettable API/env/auth/DB/OpenAPI tests, reset-free report
fixture suites, and payout integration tests against their exact database. It
then runs the server suite in a separate process because its webhook test uses
module mocking. The previous duplicate uninstrumented API pass is
intentionally not run. Test + Coverage starts independently from lint and
typecheck. After every process, the workflow copies the fresh configured
`coverage/lcov.info` to its partition path (`coverage/api-resettable/`,
`coverage/api-fixtures/`, or `coverage/api-payout/`) and requires that profile
to be non-empty. It clears the default profile before the next process so no
partition can reuse stale coverage. The merger unions all three raw profiles
into `coverage/lcov.merged.info` and leaves the final Bun-generated
`coverage/lcov.info` untouched. Named functions retain their exact union. If a
Bun profile supplies `FNF`/`FNH` without function identities, the merger uses
the maximum profile counts and known named counts as lower bounds, and writes
`coverage/lcov.function-identity.json` to record incomplete identities. The
coverage comment labels these counts as lower bounds and blocks the gate when
unidentified functions remain uncovered. It enforces the unchanged 100% for
`packages/api` lines, overall lines, functions, and branches; a 0/0 branch total
is treated as 100%. It runs only after successful test and merge commands, so
an incomplete raw profile cannot be reported as merged coverage. A failed
coverage command is propagated explicitly by the following step. If the gate
fails on a merged profile, inspect the missing function/line records and add a
behavior-level test before pushing. CI uploads the three raw partitions, merged
LCOV profile, and function-identity manifest as the
`api-coverage-profiles-<run-id>` artifact when collection, merging, or the gate
fails. Use those profiles to identify uncovered source lines and functions
before changing tests or thresholds. The generated PR comment
uses blank lines between its status blockquote and tables; preserve these
separators when editing the renderer.
The DB unit test's environment mock includes an auth secret because Bun can
share module mocks with integration tests in the resettable process. Its tests
restore the mocked environment after each case so a development-mode SSL test
cannot affect the following auth integration cases.
The Bun command's own function/statement output is
diagnostic; the lcov gate is authoritative.

PR310 CI run [#39913840116](https://github.com/cogitoacademy/app/actions/runs/39913840116)
passed its server and coverage test partitions but failed the LCOV merge because
Bun 1.3.14 omitted function identities while keeping the `FNF`/`FNH` summaries;
it did not reach the 100% threshold step. E2E had 48 regular passes and 3
failures, while the separate payout partition passed all 3 tests. Current
focused proof is 6 LCOV merger tests / 55 expectations and 2 E2E identity tests
/ 4 expectations. The serial hook and one hosted rerun on the updated branch
remain pending. Do not use local database or browser acceptance as a substitute
for the isolated hosted jobs.

The CI lint job uses the pinned oxlint 1.80.0 and oxfmt 0.65.0 toolchain. It
emits **documented-intentional warnings**: `no-await-in-loop` = sequential
money/DB writes in booking/wallet paths (parallelizing would risk money
correctness), plus `consistent-function-scoping` and `no-underscore-dangle`
style conventions. Known legacy React compiler errors are tracked in
`.github/lint/baseline.txt`; new errors fail `.github/lint/check-baseline.ts`.
They are triaged, not regressions (CI-SANITY F13, plan closed 2026-09-05).
The local pre-push hook invokes this same baseline gate; `bun run lint` remains
the raw diagnostic command and is expected to report the baselined errors.
Do not "fix" the warnings by parallelizing the loops or by silencing the rules
in `.oxlintrc.json` (that config is shared with the local run). The lint
auto-fix commit sets `LEFTHOOK=0`; the baseline and format steps remain the
authoritative CI gates.

## Public Tutor API Verification

`publicContent.tutors.list` is an anonymous server-side API for the future
marketing-site consumer. Verify its HTTP contract locally with a `POST` to
`http://localhost:3001/rpc/publicContent/tutors/list`, no cookie, and body
`{"json": {}}`. The RPC response wraps the tutor array as `json`; an empty
published set is `json: []`, while a non-success response indicates an API or
database failure. The route does not enable browser CORS; use the marketing
Next server for the fetch unless a later browser-read requirement adds an
explicit origin policy.

Run the focused API check from the repo root:

```powershell
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/unit/public-content.test.ts packages/api/src/tests/integration/public-content-tutors.test.ts
```

The integration fixture guard requires `NODE_ENV=test`, a local database host,
and the exact `cogito-test` database name before any fixture write or cleanup;
this suite does not reset or truncate the shared test database. Never load
`apps/server/.env` for this fixture suite. It verifies an anonymous read, a
published profile beside a draft profile, the exact public key set while
sensitive columns are populated, active-vs-inactive catalog selection, the
seeded published profile's presence and draft profile's absence, and the
unchanged student gate on `tutors.listPublished`; it does not assume the shared
test database has no other published tutors. The unit suite adds future/unknown
top-level and nested fields to a simulated database row, verifies the positive
selected-column allowlist, and checks that empty and error responses remain
distinct. The 2026-10-19 integration run passed (1 test, 18 assertions) and the
unit run passed (5 tests, 30 assertions); fixture cleanup was verified after
the test.

## FAQ content verification

The app serves FAQ data through anonymous `POST /rpc/publicContent/faq/list` with the standard oRPC body envelope, for example `{"json":{"locale":"en","surface":"landing"}}`. The response array is in `json`; it retains the legacy plain-text `question`/`answer` fields and adds locale-selected `questionRich`/`answerRich` documents. Older consumers can ignore these additive fields. Entries are alphabetized by the question displayed for the requested locale. A valid empty array means there is no active matching FAQ copy; a non-success response remains an API failure. Indonesian question and answer fields fall back independently to English. Admin edits are available at `/admin-faq`; the rich editor supports bold, italic, safe links, and ordered/unordered lists, with optional Indonesian fields hidden by default. Only active rows are public, and at most six active rows may be selected for the landing surface.

Run the focused FAQ checks from the repository root:

```powershell
bun test --timeout 30000 apps/web/src/lib/faq-rich-text.test.ts packages/api/src/tests/unit/faq.test.ts
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/faq.test.ts
bun run --filter @cogito-app/e2e test -- faq-admin.spec.ts --retries=0
```

The integration fixture guard requires `NODE_ENV=test`, a loopback host, and the exact `cogito-test` database before writes or cleanup. It deletes only recorded fixture IDs; it does not reset or truncate the database. Migrations `0058` and `0059` are applied to local `cogito-test`; migration `0059` is also applied to local development `cogito-app`. In shared/production, apply migrations `0058` then `0059` through the approved release process before deploying API code that selects the rich columns. The marketing reader accepts responses without rich fields, so it may deploy before or after the API release. On 2026-10-19, the rich-text/API unit checks passed (8 tests, 28 expectations), FAQ Postgres integration passed (2 tests, 13 expectations), the FAQ admin Playwright spec passed (1 Chromium test), and the E2E TypeScript check passed. A local development-database create probe succeeded after applying `0059` and its throwaway row was deleted. The scoped FAQ web typecheck and web production build also passed; the full web typecheck was not rerun because earlier attempts exhausted available memory.

If `POST /rpc/adminFaq/create` returns `500` with `INTERNAL_SERVER_ERROR` / `Unexpected error`, first check that migration `0059_faq_rich_text.sql` is applied to the exact database used by that API server. It adds `question_en_rich`, `question_id_rich`, `answer_en_rich`, and `answer_id_rich`; migrating `cogito-test` does not update development `cogito-app`. For local development, run `bun run db:migrate` from `packages/db` with the default `apps/server/.env` target, then restart the API. Verify the target before migrating; never point this local command at a shared/production database.

The marketing site reads both FAQ surfaces server-side using `COGITO_APP_API_URL`, `POST /rpc/publicContent/faq/list`, and `cache: "no-store"`. The parser requires a `json` field and accepts `meta` when absent or an array; the configured API omits empty metadata. Missing configuration, HTTP failure, invalid JSON/envelope, or invalid entries produce a localized FAQ error state; a valid empty array produces a separate empty state. The adapter validates rich documents and safe link schemes, uses rich fields when present, and falls back to legacy answer/question text when an older API omits them. FAQ JSON-LD continues to use the plain projection. Landing FAQ failures stay inside that section, and failed requests do not render FAQ JSON-LD. Local mock coverage returned HTTP 503 while `/{en,id}/faq` remained HTTP 200 with retry text; do not use the production API URL for local verification. From `C:/.Projects/cogito-acad`, run `bun test apps/web/tests`; FAQ-specific rendering/parser tests and the marketing typecheck/build have passed. A headless-browser smoke against a local FAQ mock verified Enter/Space operation for the desktop/mobile landing cards and full FAQ accordion, plus the answer-region ARIA links; Tab-sequence and screen-reader behavior remain unverified. The marketing production build passed with `COGITO_APP_API_URL=http://127.0.0.1:4300`; both FAQ and landing routes are dynamic and no API data is baked into the build. Do not seed client FAQ copy without the approved M01 content inventory.

## Common Errors

### Google OAuth `state_mismatch`

This means Better Auth could not validate the short-lived OAuth state. Confirm
the browser received `better-auth.state` from the API before navigating to
Google and sent it back on `GET /api/auth/callback/google`. In production the
session cookies remain `SameSite=Strict`, but the OAuth state cookie must be
`SameSite=Lax` because Google returns through a top-level `GET` navigation.
Clear cookies for `api.cogitoacademy.id` and retry once in a clean browser;
do not open multiple Google sign-in attempts in parallel or refresh the
callback URL. If the cookie is present but the error persists, verify that
`BETTER_AUTH_SECRET` is stable across the deployment and that the shared
database contains the verification record. Do not disable
`skipStateCookieCheck`/CSRF checks as a workaround.

### `BOOKING_CONFLICT` (409)

Two bookings overlap the same tutor time slot. The overlap check uses an exclusion constraint on `tutor_id` + time range. Wait for the other booking to expire or cancel.

### `INSUFFICIENT_BALANCE` / `INSUFFICIENT_MARKS` (400)

Student's `availableBalance` is less than the required hold amount. Check wallet balance via `wallet.getOrCreate`.

### `BOOKING_STATE_TRANSITION` (409)

Invalid state machine transition. Check `booking-transitions.ts` for valid transitions.

For rescheduling, `reschedule_proposed` must return to the state captured in `booking.previousState` after unanimous acceptance or rejection. A partial acceptance must leave both the current schedule and `reschedule_proposed` state unchanged. If a decision reports that no pending proposal exists, refresh booking detail: the supplied `proposalId` may belong to a superseded proposal.

When a 24-hour reschedule proposal deadline passes, expire only the proposal. Keep the original schedule and wallet holds, restore `booking.previousState`, and do not cancel the provider meeting event.

Acceptance/rejection calls also reject an already expired proposal. Final acceptance rechecks the tutor and series-session target under advisory locks; `BOOKING_CONFLICT` at this stage means the proposed slot became occupied after it was proposed and a fresh time must be proposed.

### `BOOKING_NOT_EDITABLE` while creating a booking (400)

Confirm the chosen start is inside the selected tutor availability window and leaves the full server-fixed 90 minutes before the window ends. The web form shows the valid start range and blocks invalid submissions. Also verify the availability is active and that no non-terminal booking overlaps the requested session; declined, cancelled, and expired bookings should not keep the time blocked.

### Contact request errors

- `NOT_FOUND` — the viewer is not a participant in the booking, or the request
  does not exist.
- `BAD_REQUEST` — the booking is not `completed`, the peer is not an eligible
  student participant, or the peer has disabled new contact requests.
- `FORBIDDEN` — someone other than the request recipient attempted to respond.
- `CONFLICT` — the request was already created or has already been answered;
  refresh the booking detail before retrying.

### `LAST_ADMIN` (409)

Attempted to remove the last admin role. Promote another user to admin first.

### `OPTIMISTIC_LOCK` (409)

Concurrent modification conflict. The `version` field didn't match. Retry the operation.

### Circuit Breaker Open Errors

- `Email service unavailable: 503` — Resend circuit breaker is open. Wait 2 minutes or reset manually.
- `Google Meet API timeout after 30s` — Google Meet circuit breaker is open. Wait 1 minute or reset manually.
- `Payment provider error` — the active provider's circuit breaker is open (`cogito:cb:midtrans-test` or `cogito:cb:midtrans-live`). Wait 30 seconds or reset manually.
- `Payment simulation error: 403 PAYMENT_SIMULATION_UNAVAILABLE` — expected for Midtrans; Sandbox has no simulation endpoint. Use the Midtrans Snap test cards instead.
- `Payment provider error: 503 ...` — inspect the bounded provider status/code/message, circuit state, credentials, and provider dashboard status. Do not retry an old pending intent indefinitely; create a fresh intent after correcting configuration.
- Re-purchase behavior — a PAID, SETTLED, FAILED, EXPIRED, or REFUNDED attempt is retained as history and the next `payment.createPurchase` call creates a new payment row/provider reference. The latest PENDING attempt is checked against Midtrans before reuse; a remotely expired checkout must produce a fresh payment row and Snap URL. Test transactions in the production database therefore do not permanently lock a package for the UAT account.

### Database Connection Errors

- `ECONNREFUSED` — PostgreSQL not running. Run `bun run db:start`.
- `ECONNREFUSED` during tests — Start the isolated test DB with `bun run db:test`.
- `connection timeout` — Check `DATABASE_URL` in `.env`.
- `server does not support SSL` or repeated `db_retry` in Coolify — Coolify's
  bundled PostgreSQL is non-TLS. Set `DB_SSL_ENABLED=false` on the API service,
  redeploy, and keep `DB_SSL_REJECT_UNAUTHORIZED=true` for any deployment where
  `DB_SSL_ENABLED=true`.

### Test Safety Guard

- `Database URL must target an approved local test database` — The connection URL did not exactly match an approved local PostgreSQL test target.
- `resetDatabase() requires explicit consent for an exact dedicated local test database` — Reset lacked the exact 6769/6770 target, `TEST_DATABASE_ALLOW_RESET=true`, or a matching `TEST_DATABASE_RESET_TARGET`; 6767/6768 are always refused.

### Role-boundary errors

- `FORBIDDEN: Student access required` is expected when tutor/admin sessions call tutor-discovery or student booking mutations. Use protected `booking.listMine`/`booking.get` for the shared booking read surface, `tutorActions.*` for tutor fulfillment, and `adminTutor.*`/`adminBooking.*` for admin review. The protected booking detail/list/session/availability reads are outside the 30/minute mutation limiter; a `Too Many Requests` response on one of these reads indicates a limiter regression.

### Redis Connection Errors

- `ECONNREFUSED` — Redis not running. Start it (`bun run db:start` brings up postgres + redis). Redis is required; the server fails fast on env validation if `REDIS_URL` is missing.

## Rollback a Deployment

Deployments are Coolify auto-deploys from GHCR images (`ghcr.io/cogitoacademy/app/{server,web}`). Rollback is done in Coolify:

1. Open the Coolify dashboard → the service (server / web)
2. Use **Rollback to previous release** (Coolify keeps the previous image/version)
3. Verify health **and the deployed sha**: `curl https://api.cogitoacademy.id/health` must return `"version": "<full-commit-sha>"` matching the image you intended to run. The CD pipeline (`scripts/migrate-and-deploy.sh`) polls `/health` until `version == GIT_SHA` (bounded 20×15s) and fails loudly with a rollback hint if the new image never comes up — a green deploy now means the _new_ image is serving, not merely "some container is up".
4. If a database migration was part of the deployment, check migration status:
   ```bash
   bun run db:studio  # Check migration table
   ```
5. Roll back migrations if needed (rare — coordinate with DBA)

## Agent Herd

Parallel development with a lead agent and skill-gated worker agents on top of Herdr. Prereqs: `herdr` + `herd` installed (`~/.local/bin/`), you are inside a Herdr-managed pane (`echo $HERDR_ENV` → `1`).

Roles:

- **Lead** (`~/.config/opencode/agents/lead.md`): plans, proposes the per-goal worker roster, spawns/monitors/verifies workers. The lead never spawns workers without user approval and never resolves a worker `blocked` state on its own — it escalates to the user first.
- **Workers** (`.opencode/agents/worker-*.md`): `worker-frontend` (frontend-design), `worker-review` (code-review, read-only), `worker-feature` (feature-workflow), `worker-core` (engineering-core), `worker-prod` (production-reliability). Each is skill-gated via `permission.skill` (`*` denied, one allowed) so unrelated skill bodies never load in its context, and carries anti-loop rules (never re-run a command that already produced output).

### Dispatch one goal across workers

```bash
# 1. Per unit of work, create an isolated worktree + branch (required for parallel
#    write-capable workers — they must never share a working directory)
herd worktree feat/f1-admin-dashboard    # cwd defaults to the repo; creates workspace + pane

# 2. Spawn a worker pinned to its role (passes --agent <role> to the opencode process)
herd-spawn-worker w-frontend worker-frontend /path/to/worktree

# 3. Submit a self-contained brief (goal / scope / constraints / acceptance criteria /
#    WORKER-REPORT.md contract / escalation rule — workers cannot see the lead's conversation)
herd prompt w-frontend "Implement F1 per docs/plans/active/FRONTEND-GAPS-SPEC.md. Scope: apps/web. Use the frontend-design skill. Write WORKER-REPORT.md at repo root; stop and report rather than guess."

# 4. Monitor — block, never sleep-poll
herdr agent wait w-frontend --timeout 300000   # blocks until idle/done/blocked
herd read w-frontend                            # inspect output / a blocked question

# 5. User answers a blocked worker directly, e.g. to type a password
herd attach w-frontend                         # detach: ctrl+b q

# 6. Verify before integrating (never trust "done"): read WORKER-REPORT.md,
#    run bun run check + bun run check-types per worker, review the diff,
#    diff worker file sets against each other to catch overlaps.
```

### Integration (PR + CI + squash-merge)

Worker branches are never merged directly into main:

```bash
# 1. Rebuild the wave as a clean feature branch from origin/main with
#    Conventional Commits (type(scope): short description + body)
git checkout -b fix/waveN-<area> origin/main
# ... apply the verified changes in logical commits ...

# 2. Push + PR with a full body (Summary/Why/Implementation/Testing/Risks/Rollback/Notes)
git push -u origin fix/waveN-<area>
gh pr create --title "..." --body "..."

# 3. Wait for CI (blocking watch, never sleep-wait)
gh pr checks <n> --watch

# 4. Squash-merge when green
gh pr merge <n> --squash --delete-branch
```

Findings/concerns discovered during a wave are documented in `docs/plans/active/` in the same PR (planning-first, AGENTS.md rule 11).

### Lifecycle

- Detach the TUI (`ctrl+b q`) and the Herdr server keeps all panes/agents running headless; reattach with `herdr`. Remote/multi-device attach: `herdr --remote <ssh-target>` (see herdr docs, "Persistence and remote access").
- Worker approval/`blocked` states wait for a user; there is no fully unattended flow by design.
- Agent names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents.
- Cleanup: `herd` never closes panes/workspaces it didn't create; close finished worker panes explicitly.

## Environment Variables

Student account name/image editing uses the existing Better Auth session and requires no additional environment variables or database migration.

Key environment variables (see `.env.example` for full list):

| Variable                                                                                      | Required | Description                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                | Yes      | PostgreSQL connection string                                                                                                                                                                                                                                                     |
| `BETTER_AUTH_SECRET`                                                                          | Yes      | Auth secret key                                                                                                                                                                                                                                                                  |
| `BETTER_AUTH_URL`                                                                             | Yes      | API base URL for auth cookies (production: `https://api.cogitoacademy.id`)                                                                                                                                                                                                       |
| `CORS_ORIGIN`                                                                                 | Yes      | Allowed frontend origin (production: `https://app.cogitoacademy.id`)                                                                                                                                                                                                             |
| `PAYMENT_WEBHOOK_SECRET`                                                                      | Yes      | Webhook verification secret (provider-agnostic)                                                                                                                                                                                                                                  |
| `REDIS_URL`                                                                                   | Yes      | Redis URL (required since #48 — mandatory for boot)                                                                                                                                                                                                                              |
| `GOOGLE_CLIENT_EMAIL`                                                                         | No       | Google service account email                                                                                                                                                                                                                                                     |
| `GOOGLE_PRIVATE_KEY`                                                                          | No       | Google service account private key                                                                                                                                                                                                                                               |
| `GOOGLE_CALENDAR_ID`                                                                          | No       | Google Calendar ID for meeting creation                                                                                                                                                                                                                                          |
| `GOOGLE_IMPERSONATED_USER`                                                                    | No       | SA-mode impersonation address (REVIEW-FIXES-4 P4.2)                                                                                                                                                                                                                              |
| `GOOGLE_MEET_ENABLED`                                                                         | No       | Enables Google Meet provider (default false)                                                                                                                                                                                                                                     |
| `GOOGLE_CALENDAR_SEND_UPDATES`                                                                | No       | Google attendee emails on create/update/delete: `none` (default) or `all` (production)                                                                                                                                                                                           |
| `GOOGLE_MEET_CLIENT_ID`/`GOOGLE_MEET_CLIENT_SECRET`/`GOOGLE_MEET_REFRESH_TOKEN`               | No       | OAuth path credentials for Google Meet                                                                                                                                                                                                                                           |
| `RESEND_API_KEY`                                                                              | No       | Resend API key (required in production/staging — P4.1)                                                                                                                                                                                                                           |
| `EMAIL_FROM`                                                                                  | No       | Sender address (default `noreply@cogitoacademy.id`; must be a verified Resend domain in prod/staging)                                                                                                                                                                            |
| `ADMIN_EMAILS`                                                                                | No       | Comma-separated production/staging admin bootstrap emails (default `itcogitoacademy01@gmail.com`); existing admins are never demoted                                                                                                                                             |
| `PAYMENT_PROVIDER`                                                                            | No       | `stub` or `midtrans`; defaults to `stub` in development                                                                                                                                                                                                                          |
| `PAYMENT_TEST_ALLOWED_EMAILS`                                                                 | No       | Comma-separated verified student emails allowed to create Midtrans Sandbox purchases in production/staging; required when `MIDTRANS_MODE=test` there                                                                                                                             |
| `WEBHOOK_ALLOWED_IPS`                                                                         | No       | Optional webhook source IP allowlist (comma-separated). Signature verification remains the primary gate                                                                                                                                                                          |
| `SCHEDULER_ENABLED`                                                                           | No       | Starts the BullMQ worker + repeatable jobs (default false). **Required `true` in production/staging (D3)** — the env schema rejects boot with it false, since a prod server without the scheduler silently skips booking expiry, hold release, email dispatch and SLA escalation |
| `TRUST_PROXY`                                                                                 | No       | Trust `x-forwarded-for` first hop for client IP (default false) — required behind a reverse proxy so rate limiting and webhook IP checks see real client IPs                                                                                                                     |
| `DB_SSL_ENABLED`                                                                              | No       | Enable TLS for the PostgreSQL connection (default true); set false for Coolify's bundled non-TLS PostgreSQL                                                                                                                                                                      |
| `DB_SSL_REJECT_UNAUTHORIZED`                                                                  | No       | Reject unauthorized TLS certificates on the DB connection (default true)                                                                                                                                                                                                         |
| `METRICS_TOKEN`                                                                               | No       | Bearer token for the metrics endpoint                                                                                                                                                                                                                                            |
| `UPLOAD_DIR`                                                                                  | No       | Local upload directory when R2 is not configured (default `./uploads`)                                                                                                                                                                                                           |
| `SANITY_PROJECT_ID`                                                                           | No       | Sanity project id (defaults to the Cogito Academy project; set explicitly per deployment)                                                                                                                                                                                        |
| `SANITY_DATASET`                                                                              | No       | Sanity dataset (defaults to `development`; production/staging must set the intended published dataset)                                                                                                                                                                           |
| `SANITY_API_VERSION`                                                                          | No       | Sanity API version in `YYYY-MM-DD` format (default `2024-03-01`)                                                                                                                                                                                                                 |
| `SANITY_API_TOKEN`                                                                            | No       | Server-only token for private Sanity datasets; never add it to `apps/web`/`VITE_*` variables                                                                                                                                                                                     |
| `MIDTRANS_SERVER_KEY`                                                                         | No       | Midtrans Snap Server Key (required when `PAYMENT_PROVIDER=midtrans`); Sandbox keys (`SB-Mid-server-…`) for `MIDTRANS_MODE=test`, Production keys (`Mid-server-…`) for `live`. The key selects the actual environment                                                             |
| `MIDTRANS_CLIENT_KEY`                                                                         | No       | Midtrans Snap Client Key (required when `PAYMENT_PROVIDER=midtrans`)                                                                                                                                                                                                             |
| `MIDTRANS_MERCHANT_ID`                                                                        | No       | Midtrans merchant id (required when `PAYMENT_PROVIDER=midtrans`)                                                                                                                                                                                                                 |
| `MIDTRANS_MODE`                                                                               | No       | Required when `PAYMENT_PROVIDER=midtrans`: `test` for Midtrans Sandbox or `live` for Production. The matching Server Key selects the actual environment                                                                                                                          |
| `MIDTRANS_WEBHOOK_SIGNATURE_KEY`                                                              | No       | Optional dedicated webhook signature key; when unset the Server Key verifies the notification `signature_key` (SHA512 of order_id+status_code+gross_amount+key)                                                                                                                  |
| `SESSION_COOKIE_CACHE_MAX_AGE`                                                                | No       | Better Auth session-cookie cache max age in seconds (default 60)                                                                                                                                                                                                                 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` | No       | Cloudflare R2 upload backend (required in production/staging — P4.3)                                                                                                                                                                                                             |
| `R2_BACKUP_BUCKET`                                                                            | No       | Private R2 bucket used only for database backups; keep separate from the public upload bucket                                                                                                                                                                                    |
| `SEED_ALLOWED_IN_PROD`                                                                        | No       | Seed-script production guard                                                                                                                                                                                                                                                     |
| `SEED_REVIEW_ADMIN_EMAIL` / `SEED_REVIEW_TUTOR_EMAIL` / `SEED_REVIEW_STUDENT_EMAIL`           | No       | Dedicated local-login reviewer identities. The review admin must not be present in `ADMIN_EMAILS`; never use the Google Calendar operator account.                                                                                                                               |
| `SEED_ADMIN_PASSWORD` / `SEED_TUTOR_PASSWORD` / `SEED_STUDENT_PASSWORD`                       | No       | One-time seed inputs, all required in production/staging with at least 12 characters. Remove them from the deployment environment immediately after seeding.                                                                                                                     |
| `STUB_WEBHOOK_ALLOWED`                                                                        | No       | Stub-checkout E2E flag; the stub checkout endpoint only serves `development`/`test` — staging always returns 404 (prod-fixes C2)                                                                                                                                                 |

## Real-Provider Swap (Resend / Midtrans / Google Meet / R2)

The app defaults to dev-safe stand-ins (stub email, stub payments, manual Meet fallback, local-disk uploads). Before a production launch these must be swapped for real providers. What fails **loud** vs **silent**, and what each swap requires:

| Provider    | Dev default          | Silent-failure mode if misconfigured                                                                                                      | Prod requirement (fail-loud guard PR)                                                                                                           |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Resend      | Stub (no-op email)   | **Silent** — `RESEND_API_KEY` optional, no `NODE_ENV` check; critical emails suppressed with no alert                                     | `RESEND_API_KEY` required when `NODE_ENV` is production/staging + verified `EMAIL_FROM` domain (P4.1)                                           |
| Midtrans    | Stub provider        | Wrong mode key, or a Sandbox key used in production (sandbox payments never settle real money)                                            | `MIDTRANS_MODE` + matching Sandbox/Production Server Key + Client Key + merchant id; sandbox E2E before live (see `docs/MIDTRANS-MIGRATION.md`) |
| Google Meet | Manual link fallback | **Boot warning + fallback** — a failed probe is logged and online bookings fall back to manual/retry handling until credentials are fixed | Complete credential set + `GOOGLE_IMPERSONATED_USER` (SA mode) + successful boot probe (P4.2)                                                   |
| R2          | Local `UPLOAD_DIR`   | **Silent** — prod without R2 writes to container-local disk, lost on redeploy; R2 set but `R2_PUBLIC_URL` unset → objects unreachable     | All `R2_*` + `R2_PUBLIC_URL` required in production/staging (P4.3)                                                                              |

> **Midtrans (2026-09-03; Balance redirect handling 2026-09-12):** the Midtrans Snap provider is implemented behind
> the same `PaymentProvider` port (`docs/MIDTRANS-MIGRATION.md`). Snap returns
> a hosted `redirect_url`; the Balance page navigates directly to it after the
> drawer confirmation; the webhook `signature_key` is verified in the body
> (`SHA512(order_id + status_code + gross_amount + signature key)`); statuses
> map `capture`→PAID (fraud `accept`), `settlement`→SETTLED, `pending`→PENDING,
> `deny/cancel/failure`→FAILED, `expire`→EXPIRED, `refund/partial_refund`→
> REFUNDED. `order_id` is the payment UUID (unique per repurchase attempt).
> Midtrans Sandbox has **no simulation endpoint** — `canSimulate` is false and
> sandbox test payments use the Snap test cards. `PAYMENT_PROVIDER=midtrans`
> requires `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY`/`MIDTRANS_MERCHANT_ID`/
> `MIDTRANS_MODE` (fail-loud env guard). No retired-provider rollback path
> remains; emergency payment stop uses `PAYMENT_PROVIDER=stub` after confirming
> no real checkout can be created.

> Historical provider implementation notes are retained in archived plans. This
> runbook documents only the active `stub`/Midtrans runtime and current operator
> procedures.

### Payment-provider go-live checklist (production switch)

The active provider is Midtrans (`PAYMENT_PROVIDER=midtrans`, currently Test Mode). The live switch uses `MIDTRANS_MODE=live` plus the production `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY`/`MIDTRANS_MERCHANT_ID`, with the Payment Notification URL `https://api.cogitoacademy.id/webhooks/payments/midtrans`.

The production app can run provider Test Mode first. The switch to Live Mode happens only after the production-domain UAT checklist below passes:

1. **Pre-flight:** run the Midtrans Sandbox checklist in `docs/MIDTRANS-MIGRATION.md` §5.1. Confirm Sandbox keys, merchant id, webhook URL, and `PAYMENT_TEST_ALLOWED_EMAILS`.
2. **Webhook wiring:** configure `https://api.cogitoacademy.id/webhooks/payments/midtrans` in Midtrans Sandbox. Send one valid notification, one bad-signature notification, and one duplicate lifecycle notification.
3. **Env:** keep `PAYMENT_PROVIDER=midtrans`, `MIDTRANS_MODE=test`, matching Sandbox keys, and the approved UAT list in the SOPS-encrypted environment. The env schema fails boot on missing Midtrans credentials or a missing production-like Sandbox allowlist.
4. **Live smoke:** after Sandbox passes, replace keys with Production keys, set `MIDTRANS_MODE=live`, and run one approved small purchase end-to-end: create purchase → Snap checkout → webhook → wallet credit once. Verify the redirect return and balance.
5. **Negative tests:** deliver a wrong body `signature_key`, a non-allowlisted webhook source when `WEBHOOK_ALLOWED_IPS` is configured, and a duplicate notification. Expect rejection/retry/idempotency as applicable.
6. **Refund path:** confirm `adminRefund` writes `refund_record` with `amount_idr = 0` and `provider_event_id` NULL; no provider cash refund is issued (PRD §677).
7. **Emergency stop:** set `PAYMENT_PROVIDER=stub` only after confirming no real checkout can be created. In-flight Midtrans payments require status reconciliation before or after the stop.

### Google Meet refresh-token acquisition (X3)

The repeatable setup is documented in [`docs/GOOGLE-MEET-SETUP.md`](GOOGLE-MEET-SETUP.md). Use the OAuth refresh-token path for a normal Gmail account; use the service-account path only with Workspace domain-wide delegation.

The short version for OAuth is:

1. Enable **Google Calendar API** in the Google Cloud project.
2. Add the calendar-owner account as an OAuth consent-screen **Test user**.
3. Create a **Web application** OAuth client and add exactly `https://developers.google.com/oauthplayground` as an authorized redirect URI. Do not use the deprecated OOB URI.
4. In OAuth Playground, enable **Use your own OAuth credentials**, authorize `https://www.googleapis.com/auth/calendar`, and exchange the code for tokens.
5. Put the returned `refresh_token` (not `access_token`) in `GOOGLE_MEET_REFRESH_TOKEN`, set the client credentials and `GOOGLE_MEET_ENABLED=true`, then restart the API.
6. Verify the startup log contains `google_meet_probe_ok` and accept a future online booking as the tutor. The booking should become `scheduled` with a `meet.google.com` URL.

The provider's OAuth probe calls the Calendar API calendar-list endpoint, so a token created with only `https://www.googleapis.com/auth/calendar.events` may create events but still fail the startup probe. Re-authorize with `https://www.googleapis.com/auth/calendar` if the log reports insufficient scopes. A failed probe is logged loudly and the app keeps the manual/fallback provider available; it is not a successful production configuration.

Calendar attendee emails follow `GOOGLE_CALENDAR_SEND_UPDATES` (`none` by default, `all` in production) because Cogito sends its own booking notifications regardless. Automated E2E additionally forces `GOOGLE_MEET_ENABLED=false` with blanked Meet credentials, so seeded runs use the manual fallback and never create live Calendar events for undeliverable `*@cogitoacademy.id` seed addresses.

### Resend domain verification (X2 / P4.1)

The production env schema requires `RESEND_API_KEY` and a non-default `EMAIL_FROM` (the dev default `noreply@cogitoacademy.id` is rejected). Before enabling production email:

1. Resend dashboard → **Domains** → add `cogitoacademy.id` (and `staging.cogitoacademy.id` for staging).
2. Add the DNS records Resend provides (SPF/DKIM) at the DNS provider; wait for verification.
3. Set `EMAIL_FROM` to a verified address, e.g. `noreply@cogitoacademy.id` — the env schema rejects the dev default when `NODE_ENV` is production/staging, so the verified domain's address is fine.
4. Send a test invite/refund email on staging before enabling production email.

### Legacy account email verification

Accounts created before mandatory email verification remain `email_verified=false`; do not run a data backfill that marks them verified. On the next email/password or Google sign-in, the web client requests a fresh verification OTP and routes the account to `/verify-email`. After the code is accepted, the user continues to the original destination.

New email/password signups receive the six-digit OTP before any account exists. The server commits the proof and cooldown before calling the mail provider, so provider latency does not hold a database transaction or email lock. A send failure deletes only that request's proof row and returns an inline error; it cannot remove a newer resend. After verified account creation commits, the server makes one separate best-effort attempt to send the welcome/onboarding email with the login link and platform introduction. Resending a code sends only the OTP. Legacy account verification and email-OTP sign-in remain verification-only; the email-OTP plugin cannot create users and does not send sign-in codes to unknown emails.

Manual signup smoke test:

1. Create a new email/password account with a fresh address and confirm the OTP email arrives before an account exists.
2. Enter the six-digit code in the signup form. Confirm the account is created only after the code is accepted and the separate welcome email is attempted after commit.
3. Request another code after the cooldown and confirm the new code works while the previous code is rejected.
4. Change the email field and confirm the code input clears; return to the original address during cooldown and confirm the browser recovers its own attempt without exposing another attempt ID.
5. Confirm existing-account email verification/sign-in still works and an unknown address cannot receive a sign-in OTP or create an account through the Better Auth email-OTP plugin.
6. Simulate a provider send failure and confirm no account is created, the failed proof cannot be used, and a later resend remains usable if it replaced the failed request's proof while delivery was pending.

Auth diagnostics must not print OTP values, signup attempt IDs, passwords, reset URLs, or reset tokens. The development reset-mail log may identify the user and action but omits the one-time link.

Manual smoke test after an auth or web deploy:

1. Sign in with a pre-verification account whose `email_verified` value is `false`.
2. Confirm a verification email is delivered and the browser opens `/verify-email`.
3. Enter the six-digit code and confirm the account reaches its original destination.
4. Sign out and sign in again; confirm the account follows the normal role redirect without another verification step.
5. If the automatic email request fails, use **Resend code** on `/verify-email`; inspect the email-service logs and Resend configuration before retrying.

### R2 bucket + API-token setup (X4 / P4.3)

The production env schema requires all four `R2_*` vars together **and** `R2_PUBLIC_URL` when R2 is configured (partial config or a missing public URL fails loudly — no container-local disk fallback, no unreachable objects).

1. Cloudflare dashboard → **R2** → create a bucket (region `auto`).
2. **Manage R2 API Tokens** → create a token with Object Read & Write on the bucket → copy `ACCESS_KEY_ID` + `SECRET_ACCESS_KEY` into `R2_ACCOUNT_ID` (your Cloudflare account id), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. Set `R2_PUBLIC_URL` to the public object URL (e.g. `https://media.cogitoacademy.id` via a custom domain, or the `r2.cloudflarestorage.com` endpoint). `GET /uploads/*` is disabled whenever `R2_PUBLIC_URL` is set (objects are served from R2 instead).
4. In the bucket's **CORS Policy** JSON tab, allow the frontend origins and the presigned PUT flow:

   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:3000",
         "http://127.0.0.1:3000",
         "https://app.cogitoacademy.id"
       ],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. Verify an upload → the returned key resolves under `R2_PUBLIC_URL`.

> U3 CORS verified 2026-09-05 (read-only — Terraform has no CORS resource,
> so bucket CORS is console-managed like the R2 custom domain; no console
> change made): the policy above allows only `https://app.cogitoacademy.id`
> plus the two local dev origins, methods `GET`/`PUT`/`HEAD`, and the
> `Content-Type` header the presigned PUT signs. The nightly
> `infra/r2-upload-audit.sh` (list + HEAD, read-only) posts to Discord when
> an object's ContentType does not match its key's extension class.

## Deploy Secrets (CD webhooks)

The CD workflow (`cd-prod.yml`) triggers Coolify deploys via webhook. (`cd-staging.yml` was **deleted on 2026-08-31** — locked decision: prod-first, no staging exists; see below.) Since P4 (C3) the trigger **fails loudly** (`curl --fail --max-time 30`, no `|| true`) — if the webhook secret is missing or the request fails, the build goes red instead of silently doing nothing. Since the CD-pipeline hardening (2026-08-27) `cd-prod.yml` also **guards the secrets explicitly**: an unset `COOLIFY_PROD_SERVER_WEBHOOK` / `COOLIFY_PROD_WEBHOOK` prints a clear message ("... is unset — configure the Coolify resource webhook and add it as a GitHub secret") and exits 1 before any curl runs, so the failure mode is a readable message, not a bare `curl exit 6`.

**Setup (one-time, user action):**

1. Coolify → your service → **Webhooks** tab → copy the **Deploy webhook** URL.
2. The value to save is the **full URL**, not the separate Manual Git Webhook
   Secret. Use this format:

   ```text
   https://cl.cogitoacademy.id/api/v1/deploy?uuid=<resource-uuid>&force=false
   ```

   Replace `<resource-uuid>` with the Coolify resource UUID and remove the
   angle brackets. Keep `&` literal; do not add `\&`, backticks, quotes, or
   trailing `??`. The URL host must be publicly DNS-resolvable from GitHub
   Actions.

   > **Canonical host: `cl.cogitoacademy.id`** (renamed from
   > `coolify.cogitoacademy.id` on 2026-08-31 — the live Coolify host,
   > verified: 302 → /login). The Coolify control plane is tailnet-only — the
   > UI and SSH are reachable only over Tailscale — so a DNS record + Traefik
   > route expose **only** the deploy-webhook path on this host
   > (`cl.cogitoacademy.id/api/v1/deploy/*`; the per-resource UUID in the URL
   > is the bearer secret); everything else on that host returns 404/denied
   > and the Coolify UI stays tailnet-only.

   > **REQUIRED-OPERATOR-ACTION (2026-08-31):** the two GitHub secrets
   > `COOLIFY_PROD_SERVER_WEBHOOK` + `COOLIFY_PROD_WEBHOOK` currently point at
   > `https://coolify.cogitoacademy.id/...` and must be recreated with
   > `https://cl.cogitoacademy.id/api/v1/deploy?uuid=...` before the next
   > production deploy.

3. GitHub → repo **Settings → Secrets and variables → Actions**:
   - `COOLIFY_PROD_SERVER_WEBHOOK` — full production API resource URL
   - `COOLIFY_PROD_WEBHOOK` — full production web resource URL
   - (The staging webhook secrets are gone with `cd-staging.yml`, deleted
     2026-08-31 — see the staging note below. Do not recreate them.)
4. Current Coolify versions require a separate API token with the `deploy`
   permission. Store it as another Actions secret and have the workflow send
   `Authorization: Bearer <token>`; never append the token to the URL. See
   [Setup and Deployment](./DEPLOYMENT.md#5-configure-deploy-webhooks) for the
   full format and distinction from Manual Git Webhooks.
5. Push to `main` and verify the "Trigger Coolify deploy" step is green.

Until the secrets are set, CD pushes will fail at the trigger step by design (a silent no-op deploy is worse than a red build).

### Staging CD removed (2026-08-31, locked decision)

`.github/workflows/cd-staging.yml` was **deleted** (CI-SANITY F7, locked:
"prod first, no staging"). Rationale:

- No staging infrastructure exists — no staging host in Terraform/DNS, no
  staging Coolify project.
- The `COOLIFY_STAGING_SERVER_WEBHOOK` / `COOLIFY_STAGING_WEBHOOK` secrets
  were never set, and the documented example URLs pointed at the **same
  public Coolify host as prod** (`cl.cogitoacademy.id`). Had anyone set
  them, a "staging deploy" would have redeployed over the production
  Coolify instance.
- Pushing to the `staging` branch now runs **no CD at all** (CI PR runs
  still cover it). If staging is ever reintroduced, it returns with its
  own host and its own Coolify instance — never shared webhooks with prod.

## Test Environment

Tracked template:

```bash
apps/server/.env.test.example
```

Optional local override:

```bash
apps/server/.env.test
```

Default local test ports:

- Web: `3100`
- Server: `3101`
- PostgreSQL: `6767` (test container; override with `TEST_POSTGRES_PORT`)
- Redis: `6379` (override with `TEST_REDIS_PORT`)

### Isolated pre-account signup E2E (REQ-AUTH-01)

Use a task-local ignored env file such as
`apps/server/.env.signup-test.local`. Keep it pointed at loopback PostgreSQL
`cogito-test` and Redis, with `SERVER_URL=http://localhost:3201`,
`WEB_URL=http://localhost:3200`, `PORT=3201`, and `WEB_PORT=3200`. Leave
`RESEND_API_KEY` and Google/Meet credentials blank. The test server captures
signup OTPs in memory and suppresses signup/welcome mail; the browser fixture
reads that code through a route available only in the exact local test target.

To avoid colliding with the shared `6767`/`6379` test services, start a separate
local Compose project with loopback-only port overrides:

```powershell
$env:TEST_POSTGRES_PORT = "6768"
$env:TEST_REDIS_PORT = "6380"
docker compose -p cogito-signup -f docker-compose.test.yml up -d
```

Before reusing a previously initialized target, inspect its data and preserve
anything unexpected. Do not use `down --volumes` or remove database volumes.
Run the standard migration before Playwright setup, and keep `ENV_FILE` pointed
at the same task-local file in both commands:

```powershell
$env:NODE_ENV = "test"
$env:ENV_FILE = "../../apps/server/.env.signup-test.local"
bun run db:migrate

Push-Location packages/e2e
$env:ENV_FILE = "../../apps/server/.env.signup-test.local"
bun run test --config=playwright.signup.config.ts src/specs/pre-account-signup.spec.ts
Pop-Location
```

The Playwright guard checks `NODE_ENV=test`, loopback HTTP origins, and the
exact `cogito-test` database before its seed/reset setup. The spec must use a
free dedicated API/web pair, and server reuse stays disabled. Do not point this
run at development data or add live mail, Google OAuth, or Google Meet
credentials.

Signup verification covers the same 10/minute/IP auth bucket for canonical,
encoded, repeatedly encoded, case-varied, and trailing-slash forms of auth
paths. The browser keeps the per-email attempt UUID in session storage so it
can recover its own cooldown after changing the email field or reloading; the
OTP input is cleared on email change and must be entered again. The test-only
OTP capture remains in memory and emits no OTP or credential values to logs.

Economy role checks:

```bash
bun scripts/run-test-suite.mjs api packages/api/src/tests/integration/economy-roles.test.ts
bun scripts/run-test-suite.mjs e2e --grep economy --reporter=line
```

The role suite covers student, tutor, and admin authorization plus the
admin-update → future-booking snapshot path. The E2E runner starts the isolated
web/server ports above and seeds deterministic role credentials.
Its setup resolves `cogito.andre@yopmail.com` before clearing test bookings
and resets the test economy row to defaults, so repeated runs do not depend on
stale seeded state or a hard-coded user ID. Economy inputs are displayed with
locale grouping separators; the browser check edits them through the visible
control and verifies the numeric value after saving.

The 2026-09-05 browser regression exercised 14 tests across the four E2E specs,
including online group invite confirmation, accepted-online reschedule and
cancellation, tutor accept/decline, unauthorized booking access, the
future-booking economy snapshot, invalid negative IDR input, and narrow
viewport containment. The student auth state is saved under
`packages/e2e/.auth/` for the run and is ignored by git; this avoids exceeding
the production auth sign-in rate limit during a multi-role suite. The local
run also showed the expected Google Meet boot-probe failure for an
expired/revoked credential. Before a marketing recording, refresh the provider
credential and rerun the browser suite; with a broken provider the app
deliberately keeps an online booking `confirmed` and surfaces manual/retry
setup attention.

## GHCR / Docker Deploy (CD)

The CD workflow (`cd-prod.yml`; `cd-staging.yml` was deleted 2026-08-31 — see
[Deploy Secrets](#deploy-secrets-cd-webhooks) → "Staging CD removed") builds both images (`apps/server/Dockerfile`, `apps/web/Dockerfile`) and pushes to `ghcr.io/cogitoacademy/app/{server,web}`.

The production pipeline (`cd-prod.yml`) builds and pushes images on a GitHub-hosted runner, then runs the backup → migrate → deploy → health sequence on the production VPS runner labelled `production`. `scripts/resolve-private-db-url.sh` converts the Coolify-only database hostname to its current VPS-local container IP for that job without publishing PostgreSQL, then `scripts/migrate-and-deploy.sh` performs the release:

1. **Backup:** `pg_dump` snapshot of the production database, gzipped, uploaded to R2 as `pre-migrate-<GIT_SHA>.sql.gz` (aws CLI against the R2 S3 endpoint). **Databases are never restored automatically** — the snapshot exists purely for a reviewed, operator-driven restore/rollback decision.
2. **Migrate:** `bun run db:migrate` against the production `DATABASE_URL`.
   Turbo allowlists this variable for the `db:migrate` task so strict env mode
   passes it through to `drizzle-kit`.
3. **Deploy:** POST the configured Coolify server webhook. The workflow and script are restored to their last known successful `bb1ccb9a` implementation. Do not pull application images from the self-hosted VPS runner: the 2026-09-02 attempt filled the host disk and crashed the runner with `No space left on device`.
4. **Health (sha-verified):** poll `https://api.cogitoacademy.id/health` until `version == GIT_SHA` (bounded 20×15s ≈ 5 min).
5. **Auto-rollback (best-effort, restored `bb1ccb9a` behavior):** on poll timeout the script attempts its original Coolify application lookup/PATCH/redeploy sequence, then always prints the manual rollback hint and exits 1. This path requires application write permission and may be skipped or fail with the current deploy-only token; it is retained only because the CI/CD files were explicitly restored to the last successful state. Database snapshots are never restored automatically. **Rollback-perm truth (recorded 2026-09-05, operator to verify):** until a token-perm check proves otherwise, rollback is **manual-only** — Coolify UI → previous release (code) plus a reviewed snapshot restore (DB, DR-1/DR-2).
6. **Web verification (F3 2026-08-31):** a separate step POSTs the web deploy webhook (`COOLIFY_PROD_WEBHOOK`) and immediately runs `scripts/migrate-and-deploy.sh --poll-web`, which polls `HEALTH_URL_WEB` (default `https://app.cogitoacademy.id`) for plain **HTTP 200** (bounded 20×15s). The web image is static nginx with no version marker, so HTTP 200 is the verification signal; a poll timeout fails the job with a manual web-rollback hint (the web resource is not auto-rolled back — it would need a `COOLIFY_WEB_APP_UUID` secret that does not exist).

Runner triage:

```bash
sudo systemctl status 'actions.runner.cogitoacademy-app.cogito-prod.service'
sudo journalctl -u 'actions.runner.cogitoacademy-app.cogito-prod.service' -n 100 --no-pager
sudo -n docker inspect noxeaeuxfreq0axa9unpew5r --format '{{with index .NetworkSettings.Networks "coolify"}}{{.IPAddress}}{{end}}'
```

An indefinitely queued deploy means the runner is offline or lacks the
`production` label. A database resolution error means the Coolify database
container or network attachment changed; never expose port 5432 publicly.

The server image is built with `--build-arg GIT_SHA=${{ github.sha }}`; the Dockerfile bakes it into `ENV GIT_SHA`, and `GET /health` returns it as `version` (`"dev"` when unset, e.g. local runs). The web image is built with `--build-arg VITE_SERVER_URL=https://api.cogitoacademy.id`.

For the exact manual build, push, redeploy, verification, and rollback
procedure when Actions cannot start, use [Setup and Deployment](./DEPLOYMENT.md#manual-deployment-when-ci-has-no-quota).

If a push fails with `denied: installation not allowed to Create organization package`:

1. **Workflow permission (code, already fixed):** the job must declare `permissions: { contents: read, packages: write }` so the `GITHUB_TOKEN` can write to GHCR.
2. **Org-level (requires an org admin):** the `cogitoacademy` org must allow GitHub Actions to create packages. Either enable it in **Org Settings → Actions → General → Workflow permissions → "Read and write permissions"** (with "Allow GitHub Actions to create and approve pull requests" as needed), or initialize the packages once by pushing any image under `ghcr.io/cogitoacademy/app/{server,web}` with an org member account:
   ```bash
   docker pull oven/bun:1.3.14
   docker tag oven/bun:1.3.14 ghcr.io/cogitoacademy/app/server:init
   docker push ghcr.io/cogitoacademy/app/server:init   # repeat for /web
   ```
   After the packages exist, the workflows push without org changes.

## Tutor drawer scroll smoke check

Open a long tutor profile in the student discovery drawer and in the admin review
drawer on a short viewport. Scroll and overscroll the profile body; it may bounce
locally, but the header and booking/review footer must remain visible and must not
move with the body.

## Tutor payout operations (2026-10-21)

Migrations `0060_tutor_payout_allocations.sql` and the reviewed Release V3 payout migration must be applied before using the tax/payout workflow. For Release V3, review and apply `0065_*` only after verifying it was generated from the parent-integrated `0064` snapshot and contains only tutor tax/payout schema changes. Never regenerate or rewrite earlier SQL, snapshots, hashes, or timestamps as part of this rollout. Do not backfill historical paid aggregates or fabricate fee/tax snapshots. Payout review uses the legacy cutoff only for rows with no source allocations; existing T02 allocations remain source-scoped even when T03 preview columns are NULL. A void row with reconciliation required blocks its released source keys until audited resolution. Where legacy allocation or tax snapshots are absent, the admin/tutor history and export show that the details are unavailable instead of reporting zero sessions or a zero tax rate.

Release V3 migration `0065_tutor_payout_tax.sql` was generated with the
lockfile version of Drizzle Kit `0.31.10` after merging parent commit
`385fc959`. Its journal entry is idx `65`, timestamp `1792525224597`, tag
`0065_tutor_payout_tax`, and SQL SHA-256
`876ec0367859d9ad5bd378d4e96cc4a29f49fab8e1d31ac17c9c95e98b041939`. It was
generated from snapshot `0064` and changes only tutor tax/payout schema. The
parent confirms `0064` is applied to local development; `0065` is not applied
to development or test and remains gated on parent review and database
verification. Preserve all earlier migration files, snapshots, hashes, and
timestamps.

### Dedicated T03 payout test target

The isolated target is prepared but must not be started, migrated, reset, or
tested until the parent assigns the database/browser window. It uses
`docker-compose.test-payout.yml`: PostgreSQL database `cogito-test-payout` on
`127.0.0.1:6770`, Redis on `127.0.0.1:6382`, API/web ports 3111/3110, and the
explicit named volume `cogito-t03-payout-20261021-data`. At the last port check
on 2026-10-21, 6770, 6382, 3110 and 3111 were free; 6767 and 6769 were occupied
and remain assigned to other work. The env template is
`apps/server/.env.test.payout.example`; it pins `NODE_ENV=test`, the exact
loopback database URL, disabled Google Meet, and the stub payment provider.
Keep bank, calendar, and email providers fake; do not send real email or execute
a bank transfer.

After the parent grants the window, copy the template and use the same absolute
env file for the target guard, migration, service integration test, and browser
test:

```powershell
Copy-Item apps/server/.env.test.payout.example apps/server/.env.test.payout
$payoutEnvFile = (Resolve-Path apps/server/.env.test.payout).Path
$env:ENV_FILE = $payoutEnvFile
$env:NODE_ENV = 'test'
docker compose -f docker-compose.test-payout.yml up -d postgres redis
bun --env-file $payoutEnvFile packages/db/ensure-test-database.mjs
bun --env-file $payoutEnvFile run db:migrate
bun --env-file $payoutEnvFile test --timeout 30000 packages/api/src/tests/integration/booking-payout-g16.test.ts
Push-Location packages/e2e
bun run test -- tutor-payout-tax.spec.ts --retries=0
Pop-Location
Remove-Item Env:ENV_FILE, Env:NODE_ENV
```

Verify the exact target before any write. The test helper independently refuses
reset/migration against any other database/port pair:

```powershell
$payoutEnvFile = (Resolve-Path apps/server/.env.test.payout).Path
bun --env-file $payoutEnvFile -e "const u = new URL(Bun.env.DATABASE_URL ?? ''); if (Bun.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1','[::1]'].includes(u.hostname.replace(/^\[|\]$/g, '')) || u.port !== '6770' || u.pathname !== '/cogito-test-payout') throw new Error('Payout DB guard failed'); console.log(JSON.stringify({nodeEnv:Bun.env.NODE_ENV,host:u.hostname,port:u.port,database:u.pathname.slice(1)}));"
```

Do not use `0065` until its reviewed SQL is cleared and the parent authorizes
database verification. The authored acceptance covers selected-source
cutoffs, legacy reconciliation, concurrent preview/transfer behavior,
allocation immutability, roles, and the tutor payout journey; all remain pending
the assigned window.

Honoraria do not reset on a calendar boundary. In `/admin-tutor-payouts`, review the selected unpaid sessions, legal-name/NIK completeness, configured rate, saved bank destination, whole-IDR withholding, one transfer fee and exact net. Current defaults are 2.50% for NIK+NPWP, 3.00% for NIK-only and missing identity; admins may change defaults or set a tutor override with a reason. These are configurable defaults, not legal validation. OPS01 tax-adviser confirmation remains a release operational gate.

Prepare the versioned batch before performing a transfer. The app reserves each selected source atomically and does not call a bank. After the external transfer, record its exact calculated net, actual payment date and optional reference/proof URL. A mismatch cannot be marked paid. Verify the saved payout snapshot and transfer evidence in the admin detail. The tutor notification and email outbox record are written transactionally; do not test with real email delivery or bank transfers.

Only exact bank name `BCA` is fee-free; other banks incur Rp2,500 once per batch. A reasoned void retains payout and transfer evidence and releases its fee allocations. If an external transfer was recorded, verify its real-world reconciliation and record an audited resolution before the same sessions can be prepared again. The monthly CSV groups paid rows by actual `paidAt` in Asia/Jakarta and exports their saved tax/bank snapshots; void and reconciliation rows remain in a separate section. Legacy paid rows without saved fee allocations remain aggregate-only and unchanged.

New source-based payouts are excluded from the next unpaid summary through
their per-session allocations, so preparing or paying selected sessions leaves
other unpaid legacy and fee-event sources visible. The time cutoff applies only
to historical aggregate rows with no saved source keys/version. An allocationless
legacy payout voided while transfer reconciliation is required keeps its
historical cutoff; after audited resolution, the previous paid legacy cutoff
continues to prevent older covered bookings from reappearing. A repeated
transfer record with the same normalized preview version, amount, date,
reference and proof returns the saved result without another audit or tutor
notification. Conflicting details are rejected. Tutor history and the payout
notification identify each covered booking by booking number, type and date.

## Cogito Marks visual smoke check

Check wallet balances/history, tutor pricing, booking creation/detail/cards, Knowledge Bank eligibility, and admin wallet/analytics screens. Every visible numeric Marks amount must show the Cogito mark symbol immediately before the value; ordinary labels and action copy that mention Marks should remain text. Screen-reader inspection should expose each amount as “N Marks”.

## Invite Tutor card visual smoke check

On `/admin-tutors` at desktop width, verify the Invite Tutor card ends directly after its footer. The adjacent Invitations card may be taller, but it must not stretch the form card or leave a white strip below the footer. Filter Invitations to reduce its records and verify pagination stays aligned to the bottom of the height supplied by its parent grid row.

## T07 development migration acceptance (21 October)

Integrated report workspace and settlement through `d508467b` into local `f/release-v3`. Applied `0067_class-session-reports.sql` to verified loopback development `cogito-app:6767` with the normal Drizzle runner, without reset or seed. Readback: journal id 88, timestamp `1792572957418`, SHA-256 `0510e3bd5f1fd36860b8f289c81db5034b4ba40a2f1527736ea280ea77651037`. The session-owned API was restarted; `/health` reports database/Redis/scheduler healthy and anonymous `/rpc/classes/listSessionReports` returns 401. `/class-reports` on web port 3000 returns 200. Authenticated browser acceptance remains the isolated test result, not a development seed or production-provider test.
