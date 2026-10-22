# Release v3 - SDD execution and acceptance plan

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

Core order: finish on-demand report verification/integration, report PDF and
remaining legacy reminders; then AUTH-02/referrals/KOL and remaining pricing,
analytics/provider/financial acceptance, core content, end-to-end UAT and release
readiness. Apply approved policy gates to dependent behavior; do not invent
ordinary-reschedule or analytics policy.

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

This isolated T07 reminder slice adds tutor-only reminders for ended, scheduled cohort/masterclass sessions without a report. The existing one-minute class-enrollment job queues at most 100 current-period reminders; the first is due at session end and the next after each 24 elapsed hours. Stable notification event keys plus the existing email outbox make scheduler replay/restart idempotent, with no schema migration. Report arrival and stale schedule/tutor candidates are rechecked under locks; a cancelled parent class keeps a retained past scheduled session eligible, while cancelled/completed sessions and completed classes stop. The worker does not mutate report, delivery, wallet, allocation, or tutor-fee state and does not infer delivery from no-show expiry. Legacy solo/group/series report-reminder coverage remains pending. Focused unit/DB verification and remaining release gates are recorded in docs/RUNBOOK.md; PDF and the dedicated on-demand admin correction workflow remain pending.

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
| T04 / IN PROGRESS: audited drafts, publish validation, durable Meet retry, admin controls, and published-only public reads implemented; API race suite passes 9 tests/51 expectations, meeting-provider units pass 42/146, and the admin-to-student browser journey passes 1 Chromium spec including accepted-event/pending-link retry; T05 enrollment, T06 cancellation, and T07 settlement backend are integrated; absence/expiry acceptance, T07 PDF and dedicated on-demand admin correction, T02 fee integration, and approved M01 content remain open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | REQ-CLASS-01..05, REQ-LANG-01                                  | Class/session draft/publish/admin pages, per-session tutor/fee/Meet, absence and minimum check. Published class catalog/detail read model; English required/Indonesian optional in shared website content admin. Publish retry meeting-once and authorized tutor assignment tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | T00A for classification; Q04 minimum/postponement accepted (ordinary reschedules open); Q05 both modes, existing rooms and same flat fees resolved; class-cover/curriculum M01; basic content shell independent                                            |
| T05 / IN REVIEW: enrollment service, student UI, scheduler, migration 0064, DB and Chromium journeys implemented; pricing/funding 11/36, DB 7/64 and DTO 1/1 prior evidence; the focused E2E passed before identity isolation and needs rerun. Per-run T05 student identity preserves prior financial history; guard/identity tests 7/19 pass. Exact-6769 rollback regression authored but not run; no DB reset, browser E2E or typecheck in this slice; parent review pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | REQ-ENROLL-01..04, REQ-PAY-02                                  | Plan quote, atomic seat allocation/hold, 15m reservation, installments/due/reminder/default, late join/rejoin. Raw API duplicate/last-seat tests against Postgres. Paid-after-expiry returns credited wallet but no promised enrollment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | T01/T04; Q01/Q02 policy resolved 20 Oct                                                                                                                                                                                                                    |
| T06 / IN PROGRESS: core lifecycle integrated and DB-verified; class-card refresh deduplication integrated and unit/browser-verified; broader release gates remain open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | REQ-CANCEL-01..03, REQ-CLASS-04, REQ-ACCESS-01                 | Admin future-session cancellation uses version/hash/reason/idempotency and returns only the target unspent funded Marks at zero fee; delivered fees/reports and original snapshots remain. Minimum counts unique paid full/half students, continues or postpones once, enforces strictly-after-72h replacements and inclusive free exit, preserves rates/funding and updates unpaid dueAt/reminders. Postponed classes stay visible to existing students; new enrollments are blocked. Meeting updates target the saved event ID, retry transient failures, durably requeue stale lease results and persist a creation generation for 404/410 recreation. Latest focused evidence: provider 52/196, cancellation 8/16, guard 6/40; cached format/lint exit 0. Parent refreshed non-reset Postgres evidence: 41/319, exit 0; migrations 0068/0069 applied to dev without reset or seed. First integrated browser run passed 2 journeys; lifecycle login and exact-locator corrections passed the focused lifecycle rerun (1 Chromium test, 32.4s); web/E2E typechecks passed. Follow-up source fix deduplicates the admin published/postponed query snapshots by ID, retaining the highest class version; focused helper regression passes 2 tests / 4 expectations, with no integrated Chromium rerun in this worktree. Migration 0069 SQL hash: A6A442562692E34CEA132CBD4BB20DE6561906FB45AD9441ADD19DBF8B8C2617. Ordinary rescheduling is out of scope. | T05/T02; Q04 ordinary rescheduling remains open; dev through 0069, journal id 90; lifecycle browser acceptance passed; query-overlap unit regression passed; integrated rerun pending                                                                                                                               |
| T07 / IN PROGRESS: report/settlement backend, class payout identity, role-based `/class-reports` workspace and class-only repeated reminders integrated at 1f9b6dd7; parent root verification passes the full guarded PostgreSQL suite (44 tests / 354 expectations) and pure reminder suite (7 tests / 25 expectations); broader legacy reminder coverage remains open | REQ-REPORT-01..04 | Shared 600-codepoint validation, private report reads, versioned submit/correction, atomic funded-Mark deduction and fixed session fee, immutable revision/audit, real class fee payout source, role-based workspace and settlement preview/readback. Class-only reminders run from the one-minute job, at most 100 per pass, at `endAt` then every 24 elapsed hours; catch-up writes only the current period. Event key `academy-class-session:${sessionId}:missing-report:day:${period}` and the existing email outbox make notification replay transactional and idempotent. Published/postponed scheduled sessions and retained past scheduled sessions on cancelled parents are eligible; cancelled/completed sessions, completed classes and reports stop. Earlier isolated reminder evidence: 7 fake-clock tests / 25 expectations and 3 guarded non-reset Postgres tests / 34 expectations on loopback 6769/cogito-test, covering concurrent/replay outbox dedupe, current/next-day/catch-up, report and parent-cancel interleavings, state exclusions, rollback/retry and unchanged wallet/allocation/ledger/fee/report/session facts. Parent root verification at `1f9b6dd7`: full non-reset `class-enrollment.test.ts` passed 44 tests / 354 expectations (exit 0, 9.62s); pure reminders passed 7 / 25 (exit 0, 0.15s). The global report scan stays enabled with separate counters. No dev seed or migration, live email, browser or external provider ran in the parent checkpoint. PDF, dedicated on-demand admin correction, legacy solo/group/series reminder coverage, visual QA and broader acceptance remain pending. | T02/T04/T05; Q06/Q07 resolved; schema 0067 applied to test and dev; reminder work adds no migration; PDF/admin correction and broader legacy reminder coverage remain open |
| T08 / IN PROGRESS: REQ-AUTH-01 integrated and validated; AUTH-02 pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | REQ-AUTH-01..02, REQ-ACCESS-01                                 | Pre-account email OTP, cooldown/proof-before-delivery, atomic account/session/proof/outcome commit, outcome recovery, path/CSRF guards, no unknown-user OTP auto-signup. Parent DB 15/73, safety/path units 19/69 and Edge browser 2/2 pass. Later combined source web typecheck passes. No auth migration. Google pending code choice/resume and referral economics remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | AUTH-02 and T09 still outstanding                                                                                                                                                                                                                          |
| T09 / TODO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | REQ-FRIEND-01..03, REQ-KOL-01..03                              | One-time code choice/welcome/friend semester cap and UI, campaigns/first-top-up commission/partial+overpayment records/CSV/corrections/reversal. Concurrent cap and callback replay/out-of-order scenarios; no friend reversal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | T08/T01/T02; Q09-Q12 policy resolved 20 Oct; Q06 reward eligibility resolved 19 Oct                                                                                                                                                                        |
| T10 / IN PROGRESS: public tutor API/site consumer and FAQ APIs implemented; FAQ admin editor and marketing full/landing consumer implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | REQ-CONTENT-01..02, REQ-FAQ-01, REQ-LANG-01..02, REQ-ACCESS-01 | Published-only tutor allowlist and app catalog projection; marketing list/landing use the no-store DTO with Online/Offline filters (`both` matches either), active parent-category filters, inherited palette badges, Indonesian category-name fallback, and unavailable/error state without Sanity fallback. FAQ database, anonymous full/landing reads, EN-required/ID-optional admin CRUD, English app chrome, localization fallback, version-checked updates and strict marketing server adapter implemented. FAQ and tutor API-adapter/filter tests, rich public FAQ rendering with legacy fallback, API/browser checks, app build/typecheck, and marketing build/typecheck pass; see T10 FAQ and public tutor checkpoints. Activities/Other content, approved initial FAQ copy, app tutor-roster reconciliation, tutor browser acceptance and full release acceptance remain open.                                                                                                                                                                                                                                      | T00A for catalog projections; T04/T05 and approved FAQ/Other content M01; tutor modality behavior follows the currently agreed app structure; public DTO and FAQ CRUD were independent                                                                     |
| T11 / IN PROGRESS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | REQ-LANDING-01..02                                             | Landing Activities/Start Learning removed; hero LogoCloud and testimonials section restored to their pre-change implementations per owner request; reduced-motion pulse remains. Why Cogito spacing is refined to 16px label-to-heading and 32px heading-to-cards; earlier headless checks covered the prior landing state, not these reverts. Owner review of restored sections, physical-device/screen-reader checks and client visual acceptance remain; the approved showcase brief is gated on M02/Q14. Rerun final browser/build checks after the desired logo/testimonial direction is selected. No full redesign.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | T10 where data used, M02/Q14 for video; non-video polish independent                                                                                                                                                                                       |
| T12 / TODO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | REQ-CONTENT-03, REQ-CALENDAR-01                                | Inventory/export/mapping/import or re-entry, KB and calendar admin/DB/API, same event/date dedupe, preserve multi-day distinct events/locales/files/access/redirect. Counts+link/access comparison and rollback rehearsal before final Sanity removal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | T10, actual content inventory; runs last, not assumed trivial                                                                                                                                                                                              |
| T13 / TODO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | All plus success criteria PRD §10                              | Real DB integration, browser journeys, security/role tests, old on-demand regression, notification recovery, migration/rollback, provider sandbox tests and authorized live smoke, report visual QA, approved English content. Client UAT evidence with named approver and exception list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Qs closed for shipped paths, M inputs/approved deferrals, all relevant slices                                                                                                                                                                              |
| T14 / TODO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Release readiness                                              | Backup/restore readiness, deploy-compatible schema/API/app/website order, pricing activation, payment webhook/Meet/email smoke, financial reconciliation, launch approval and monitoring/rollback owner. Document exact deployed SHAs and known deferred items.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | T13, Q14, OPS01                                                                                                                                                                                                                                            |

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
| AC-K02    | Out-of-order purchase callbacks, expiry instant, paid reversal                                                                   | Provider success before expiry, duplicate-safe first event; reversal adjusts commission without resetting first-event eligibility                                                                                                                                                                                                                | REQ-KOL-01..03                |
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
