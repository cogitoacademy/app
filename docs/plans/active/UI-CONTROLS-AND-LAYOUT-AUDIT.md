# UI controls and Card/Table audit (22 October 2026)

## Native control sweep (1 November 2026)

- Replaced the remaining browser dialogs with the shared Selia `ConfirmationDialog`: article deletion in Activities · Others and the unsaved-report discard prompt in the session reporting workspace. Both keep the previous action semantics; a failed article delete now closes the dialog and reports through the existing inline error.
- Replaced every `<details>/<summary>` disclosure with Selia `Accordion`. Covered surfaces: referral technical details, competition catalog descriptions, display colors and move-specialization panels, and session report history. The display-colors panel keeps its forced-open state for parent competitions through a default value and a mode-scoped key.
- Renamed the local `confirm` helper in the complete-session dialog to `submitFeedback` so it no longer shadows the browser dialog name.
- Source scan after the change finds no `alert`, `confirm` or `prompt` calls and no `details`, `summary`, `dialog`, `select` or `textarea` elements in `apps/web/src`. Remaining native elements are intentional: hidden inputs for form submission, the hidden profile-image file chooser, native `progress` for the semester meter (no Selia equivalent), and native buttons used as custom widgets (calendar event cells, guide and diff row toggles, time-suggestion options, sidebar backdrop, badge removal).
- `FilterTabBar` keeps its hand-rolled tab strip because the booking layout E2E asserts the scroll container and the shared strip intentionally omits Selia's sliding indicator.
- Verification: web typecheck (`tsgo --noEmit --checkers 1`) passed, focused oxlint reported no findings, and changed files pass `oxfmt --check`. A new bun test asserts the admin report history renders through the Selia accordion instead of `details`/`summary`. Synthetic Edge/Chromium runs passed for the referral technical-details disclosure, the competition catalog palette and move panels (including the forced-open display-colors state for a new parent), and both catalog palette workflows. The DB-backed booking report spec was not run because no database was available, so the report-history accordion has only the unit-level check. No API, database, environment or dependency change.

## Academy class draft reason dialog (1 November 2026)

- [x] Remove the inline "Reason for this change" field from the Academy class draft editor.
- [x] Collect the required audit reason in a confirmation dialog opened by Save draft or Publish class, matching the booking cancellation pattern.
- [x] Keep native form validation ahead of the prompt; publishing a dirty draft still saves it first and reuses the same reason.
- [x] Web and E2E typechecks passed; focused lint reported only the existing array-sort warning. Live API/provider acceptance remains separate.

## Single-language Academy classes (1 November 2026)

- [x] Remove alternate-language editor fields and API draft/read properties.
- [x] Remove alternate-language class/session columns from schema with generated migration 0085.
- [x] Apply only the authorized four-column removal to verified local development; leave unrelated pending migrations and their journal unchanged.
- [x] Update Cogito Academy Activities adapter/title rendering for one class language.
- [x] App web typecheck, 133 focused API unit tests and the single-input editor browser case passed. Website typecheck and 5 focused adapter/locale tests passed; website main was pushed at 060a4b532ce298304a20b801fdd3ea534394fba9. A stale website empty-state test and broader API test/report type errors remain outside this change. Cogito app remains local.

## Compact Academy class detail follow-up (1 November 2026)

- [x] Move the minimum enrollment check to Administration.
- [x] Show compact session information with date and tutor icon actions, inputs and reason in dialogs.
- [x] Reduce session cancellation to a button that opens the quote/confirmation dialog.
- [x] Web typecheck and scoped lint passed; 10 focused synthetic Edge cases covered 320/390/768/1440 layout, minimum check placement, two-session selection, schedule/tutor changes and cancellation quote confirmation. Mobile and desktop captures were inspected. Live provider acceptance remains separate.

## Academy class accordion follow-up (1 November 2026)

- [x] Put session schedule, tutor replacement, absence history and session cancellation in their own accordion.
- [x] Put whole-class cancellation beside the badges and collect action reasons after the action is selected.
- [x] Preserve cancellation quote review before confirmation; keep minimum decisions scoped to the whole class.
- [x] Focused synthetic Edge verification passed: responsive 320/390/768/1440 class details, schedule updates at 390/1440, tutor replacement, both cancellation quotes and a two-session selection. Web typecheck and scoped lint passed; live API/provider acceptance remains separate.

## Shared details follow-up (1 November 2026)

- [x] Reuse class description/pricing/curriculum/schedule presentation for student and admin details.
- [x] Move existing admin class management from list drawers to class detail; preserve student enrollment and server role boundaries.
- [x] Enrich admin class get with the same absence history and late counts as list.
- [x] Route every admin booking entry to the full shared booking detail; retain Operations as the queue/wallet/room workspace.
- [x] Focused verification: 135 API unit tests, 23 synthetic Edge cases (16 shared details/role/navigation, 6 reschedule, 1 absence/replacement), and web typecheck passed. Reviewed 390px and 1440px admin detail captures. Scoped frontend lint has only the existing array-sort warning; live provider acceptance remains separate.

## Competition types redesign (26 October 2026)

Replaced the dense tree/permanent editor with a grouped competition directory and on-demand Selia drawer. Search/status, visible specializations, parent color identity, optional descriptions/colors/movement and dirty-close confirmation make the catalog manageable without changing backend contracts. All existing audit/version/impact/lifecycle controls remain. Dedicated synthetic Edge workflow covers the changed UI; current validation results are recorded in the PR and RUNBOOK. This does not close live DB, native zoom or assistive-technology gates.

Validation: 10/10 installed-Edge synthetic cases passed (44.7s), with card/field/button geometry at 320/390/768/1440px. Inspected directory and drawer screenshots. Initial cold-load timeouts were resolved by DOM-content navigation and a 60-second cold-load budget; a fixture was corrected to refresh nested parent relations after mutations. The live DB catalog suite remains unrun.

## Classes UI follow-up (22 October 2026)

- Completed: one compact catalog card per class, local search/type filters,
  explicit WIB dates and price units, curriculum/enrollment detail layout.
- Completed follow-up: the whole catalog card links to class details, the
  schedule uses a divider-based list, and enrollment appears first on mobile.
  Reduced-motion users do not receive the card hover translation. The payment
  action retains the explicit “Reserve and confirm Marks” label.
- Verified on 23 October: web `check-types --checkers 1`, focused oxlint, and
  14 synthetic Chromium cases passed, including the existing 11 layout/report
  cases plus unverified-student verification/return, signed-out login redirect,
  and non-student dashboard redirect. Reviewed captured 320px catalog/detail
  and 1440px detail screenshots. This used a temporary copy of
  `classes-layout.spec.ts` with the catalog button locator changed to the new
  full-card link. Integration now updates that permanent locator; all 14
  cases in the checked-in suite pass against the combined UI and PDF export
  source (36.6 seconds), including PDF downloads and responsive class/report flows.
- Completed: published-first admin studio tabs, retained draft editor mounting,
  expandable lifecycle controls, wider editor and wrapping confirmation actions.
- Completed: bounded report session list, mobile focus/scroll to selected report,
  and correct Class studio/Class details app header labels.
- Previously verified: 11 synthetic Chromium cases at
  320/390/768/1440px and mobile report flows for all three roles; dark-mode
  student coverage at 768px. No horizontal
  page overflow or page errors in those cases. Existing role guards and payment
  math remain. Full DB-backed publish/enrollment/cancellation journeys were not
  rerun; their UI locators were updated for the intentional navigation changes.

The T3 preview reached the synthetic frontend, but its unmocked auth request
failed (`TypeError: Failed to fetch`) and snapshot timed out after 15000ms.
Browser evidence above comes from the repository's mocked Playwright workflow,
not a live API session. No DB/provider checks were performed.

Scope: all web TSX source and the shared Selia controls; repair browser-native
date/time/number widgets and Card/Table composition without changing API contracts.

Final integrated verification: 11 Chromium cases pass in 19.5s after merging
PR #305. Full workspace typechecking and lint baseline pass. Luna Max source
review found missing tab-panel semantics in the catalog filters; these now use
pressed-state filter buttons. No other concrete finding remained in that review.

## Completed

- Source scan of the web components and 40 route files: no visible raw select,
  textarea or table elements; the remaining raw input is the hidden profile-image
  file chooser. The analytics `XAxis type="number"` is a chart axis, not an input.
- Migrated numeric controls in Academy, payout/tax configuration, competition
  display order, V3 economy settings and custom Marks top-up to Selia NumberField.
  Empty strings remain nullable numeric values at the control boundary; original
  min/max/step/required/read-only constraints and submission conversions remain.
- NumberField's default composition now includes styled decrement/increment
  buttons; custom child compositions remain supported. Mobile inputs use 16px text.
- Reused CrossBrowserDateTimeInput for Academy minimum checks/session schedules,
  lifecycle replacement times and actual payout time. The value remains a local
  `YYYY-MM-DDTHH:mm` string; existing callers own timezone conversion. The date
  trigger retains the field's ID, with a separate `-time` input ID.
- Required/partial date-time values and times earlier than the same-day minimum
  fail form validation. DatePicker handles invalid stored dates without throwing,
  opens at the selected month and constrains its trigger text. Calendar dropdown
  items register their labels before opening, so October does not display as `9`.
- Card and CardBody allow children to shrink. CardBody owns full-width table
  margins/width and keeps mixed content separated. Removed repeated per-page
  width overrides; removed the conflicting zero-padding payout body. Tables
  scroll locally. CardBody no longer applies negative margins to every Stack.
- Header actions use the correct grid column and move below the title in narrow
  Cards, including narrow cards on a desktop viewport. Table cells retain padding
  around mixed text/link content; only a sole direct link fills the cell.
- Academy publish E2E now selects dates through the custom calendar and fills its
  time control. Existing helper regression fixtures use explicit union types so
  the web compiler can check both published and postponed snapshots.

## Role-based sidebar grouping follow-up

- Completed: split admin Navigation into Overview, Teaching, Finance, and
  Content & reviews using existing Selia sidebar groups. Resources and the
  account footer remain below.
- Student follow-up: Overview groups Dashboard/Balance; Learning groups Tutors,
  Classes, My Bookings, Session reports, and Achievements. Tutor follow-up:
  Overview contains Dashboard; Teaching groups Bookings, Session reports,
  Availability, and Tutor Profile. Both roles put FAQ in Resources.
- All 13 admin destinations, link labels, icons, active-link styling, and the
  booking-action badge remain available. No API or environment changes.
- Verification: web TypeScript and focused sidebar lint passed. A source check
  confirmed all 13 admin destinations occur exactly once. Student/tutor follow-up
  web TypeScript and focused lint passed; a source assertion confirmed every
  original student/tutor destination remains exactly once, including FAQ moved
  to Resources. Booking badge rendering and role selection are retained. Authenticated visual checks remain unverified: the fresh browser
  preview redirects to sign-in and has no admin session.

## Verification

- Follow-up spacing regression: Card-root inline-size containment inflated grid
  row heights in a column Stack. Moving the named container to CardHeader reduced
  the measured economy section gap from 251.25px to the intended 24px while
  preserving the icon-header action's column 3. Reloaded desktop page also reports
  a 24px gap. The economy E2E spec now asserts the gap at mobile/desktop widths.

- Tax copy/usability follow-up: default and custom tutor tax fields use percent
  labels and 0..100 inputs with two decimal places, retaining integer API units.
  Default fields include a sample deduction from Rp400,000. Authenticated browser
  check: 250/300 appeared as 2.5/3; keyboard entry of 2.55 produced Rp10,200,
  and increment from 2.5 produced 2.51/Rp10,040. Configuration was not saved.
  Conversion regression passed 1 test / 7 assertions; web typecheck/lint passed.

- UI, web and E2E TypeScript checks passed.
- Focused regressions: 7 tests / 13 assertions passed (calendar label, invalid
  date, quarter-hour helpers, class list merge).
- Browser component fixture: at 320, 390, 768 and 1440 CSS-pixel widths, no
  document horizontal overflow; a 900px table stays inside its Card, mixed
  filters/table/pagination have positive gaps, and mixed-link cells keep padding.
  Counter click changed 5 to 6. Required empty date/time was rejected; selected
  date plus `09:35` was accepted; midnight below a `09:30` minimum was rejected.
  Calendar month trigger reads October before opening its dropdown.
- Changed-file lint has no errors; the existing capitalized CVA helper warning
  remains. No new dependency, migration, seed or provider call is required.

## Authenticated route checks and counter clipping repair

After restarting the local stack, authenticated browser checks used an owned
temporary local account, first as admin and then as student. It and its sessions
were deleted after verification; existing account passwords were not changed.
No business draft, purchase, payout or economy configuration was saved.

- Admin at 390/1440px: Academy, economy, payouts, competitions, operations,
  tutors, Knowledge Bank access and achievements loaded. Visible numeric values
  fit, the document did not overflow horizontally and table containers remained
  inside Cards. Economy draft edit mode also passed the numeric-fit check.
- Student at 390px: dashboard, bookings, classes, reports, tutor discovery,
  profile, achievements, notifications, FAQ, calendar, Knowledge Bank and guide
  loaded without document horizontal overflow. Balance passed at 390/1440px.
  Current dev economy exposes legacy packages, so the gated V3 custom Marks
  input was not present and its purchase path was not exercised.
- The user screenshot exposed a real regression in Academy's nested price grid:
  three steppers shared half the draft panel. At 1440px, their inputs had 0px
  remaining text width. Schedule and rates now occupy separate rows; rate columns
  use auto-fit with a 10rem minimum. Available text width became 93px, sufficient
  for the default 20/22/25. Checks at 390/1024/1440px found no clipped numeric
  values. The draft list Card no longer stretches to the editor's height.
- Actual Academy controls: full-plan increment changed 20 to 21 while half-plan
  remained 22; tutor fee remained read-only. Calendar selection displayed
  23 October 2026, time entry accepted 09:35, and incomplete draft submission
  focused the title field without creating a draft. The publish E2E now includes
  a rendered numeric-width regression assertion at all three viewport widths.

## Remaining acceptance

The DB-backed publish journey, payout recording, class lifecycle writes and tutor
workflows have not been rerun in this UI audit. Route checks cover the existing
development data and empty states, not every data/permission/error combination.
The earlier report worker's DB/merge work remains separate. Web/API/DB/Redis are
left running; email/payments remain stubbed and Calendar disabled.

## Sidebar section controls (23 October 2026)

- Implemented independent default-expanded Selia collapsibles for every role
  section and Resources, retaining route/access rules and the account footer.
- Synthetic verification uses `playwright.sidebar.config.ts` on isolated port
  3302 with mocked auth/RPC, covering keyboard, tab order, active links, booking
  badges, support, and mobile navigation. All six Chromium cases passed (28.5s).
  Reviewed expanded mobile and collapsed desktop keyboard-focus screenshots.
- Web and e2e typechecks passed with `--checkers 1` after limiting Go memory
  (`GOMEMLIMIT=1GiB`, `GOMAXPROCS=2`); the initial web attempt exhausted Windows
  virtual memory. Focused lint and diff checks passed.
- No DB, provider, persistence, or API behavior changes.

### KOL responsive polish checkpoint

2026-10-25 bounded checkpoint: KOL settlement history wrapping and multiline settlement/export/retry actions implemented; 13/13 synthetic Edge checks pass. Measured baseline clipping and reproduction command are in RUNBOOK. This does not complete the wider V3 responsive audit: economy, payout, class/report, native 200% zoom, RTL and assistive-technology acceptance remain open. Parent owns cross-checkout docs backlog reconciliation.

### Economy and tutor payout responsive slice (25 October 2026)

Bounded implementation complete: V3 amount controls have a 14rem minimum width within local table scrollers. Baseline 834f525f reproduced ten-digit IDR clipping at 320/390px (100.6px required versus 92px available); after repair 128px is available. No measured payout production issue required a change. Shared-card audit fixes are retained.

Dedicated synthetic Edge checks pass 8/8 across 320/390/768/1440 CSS px, covering economy read/edit, payout prepared-transfer, unpaid-preview and void/reconciliation drawers, numeric widths, contained tables, button content height and keyboard reachability. Mock-only ports 3356/3357, cache, command and artifact paths are in RUNBOOK. No financial write is activated and live economy/payout specs are not run.

Remaining: native 200% zoom (unverified), RTL and assistive-technology audit, live auth/persistence and financial workflow acceptance, plus other responsive slices. This checkpoint does not mark the overall V3 UI audit complete.

### Canonical KB/calendar pages (25 October 2026)

Implemented admin View/Manage within `/knowledge-bank` and `/calendar` using the existing single-kind editor. Removed the duplicate KB & calendar sidebar item; retained `/admin-content` as a role-checked compatibility redirect. Reader layouts and API access gates are retained; reader caches invalidate after save/delete, and open drafts require confirmation before switching to View.

Bounded acceptance uses the existing mocked Edge KB/calendar harness on 3316/3317: version/conflict behavior, timestamps/catalog IDs, agenda dates, student/tutor reader isolation, redirect, and both editor forms at 320/390/768/1440px. No live DB/storage/provider workflow is run. This does not complete the broader UI or release audit; native zoom, assistive technology and real persistence/authorization remain open.

Verification: 11/11 installed-Edge tests passed (40.1s); serial web/E2E TS-Go, focused lint and formatting passed. Resource list targets have a 40px minimum height.

Parent integration check (26 October 2026): after merging release head 8945a6d6 into the feature, all 11 synthetic Edge cases passed again (1.2 minutes). Reviewed 320px screenshots for both editors. This is mocked UI/wire evidence, not DB, storage, provider or production proof.

### Reason markers and on-demand entry (1 November 2026)

Implemented required red asterisks and explicit optional labels for reason inputs, following existing API/service validation. Inline operational/finance reasons now use Add/Edit to open a desktop dialog or mobile bottom drawer; reasons in existing editor overlays retain their location. Use reason commits locally without submitting the action, and dismissing the prompt preserves the previous committed reason. ConfirmationDialog enforces its disabled confirmation state while leaving Cancel usable.

Verification complete for this slice: focused mocked Edge cases passed for desktop/mobile KOL reason entry (2), reschedule/changed-session flows (6), economy activation (1) and catalog reason/lifecycle flows (4, across bounded invocations). Initial catalog navigation timeouts cleared on isolated reruns; its move test now expands the collapsed group before selecting a specialization. Reviewed desktop/mobile reason prompt screenshots. Web/E2E/UI typechecks pass with constrained memory; focused formatting and lint pass with existing warnings, and the CRLF-aware diff check passes. A concurrent web typecheck exhausted memory before the bounded serial rerun passed.

Approach updated (2 November 2026): the separate Add/Edit reason prompt was replaced by `ActionReasonDialog`. The action trigger now opens the reason dialog, and its confirmation button submits the action with the reason. This applies to tax configuration, V3 economy draft/activation, KOL adjustments, class lifecycle decisions and session changes. `ReasonField` and `ClassActionReason` were removed; E2E helpers now enter the reason after clicking the action trigger. E2E typecheck, focused lint and formatting pass. Web typecheck could not finish on this machine because tsgo exhausted commit memory; live Academy/enrollment/economy/booking specs remain unrun.

Live Academy/enrollment/economy/booking specs were updated for the new reason prompts/selectors but were not run. No API policy change, DB/storage/provider acceptance or broader release readiness is implied.

### Tutor honorarium in booking detail (2026-10-29)

Implemented: admin booking tutor participant details use gross IDR session honorarium and payment status in place of student wallet/ledger controls. Live browser and persisted payout acceptance remain pending.

Academy class scheduling (2026-10-29): the admin session form accepts start date/time and duration in minutes (default 60). Editing derives duration from existing timestamps; saving computes endAt as startAt plus duration. The API and stored startAt/endAt contract remain unchanged; no migration or environment change is required.

Academic class references (2026-10-30): academy_class.class_number is a database-generated serial with a unique constraint (migration 0076_academy_class_number). Admin class reads, public catalog responses and class session report rows expose classNumber. Session Reports displays/searches CLS-{classNumber}; UUIDs remain the relational identifiers. Applying 0076 and restarting API processes is required before running this schema. Migration has not been applied by this change.

## Referral layout refresh (30 October 2026)

Implemented: student invitation panel, inline semester summary and full-width friends table; admin Activity/KOL campaigns tabs, inline totals and usage-detail drawer. Existing RPCs and financial rules retained. Responsive synthetic browser validation is tracked in RUNBOOK; live DB and provider acceptance remains a separate gate.

Referral empty states (30 October): reuse the shared EmptyState with contextual icons and copy. Student invites offer a copy-message action; filtered admin results offer Clear filters; unfiltered activity explains when records appear; an empty KOL list opens the existing create form. No new API or reward rules.

Admin referral detail refinement (30 October): table prioritizes student identity, source, split date/time, outcome and right-aligned welcome credit. Compact chevron actions have student-specific accessible labels. Drawer remains mounted with selected content retained during closing so Selia enter/exit transitions can run. Detail sections separate identity/source, rewards/outcome, and collapsible technical evidence; null technical fields are omitted. No RPC or reward-rule changes.

## Session Reports bulk workflow (30 October 2026)

Implemented: one student/report search field, eligible private/cohort/masterclass table, source-qualified report keys and searchable session references, page/all-visible checkboxes with indeterminate state, selections retained across filters/pages, clear selection on student change, 100-report cap, exact-selection PDF download and read-only detail drawer. Admin Student Reports / Session Reporting tabs preserve class report authoring; tutor authoring stays available. Pending sessions are handled in Session Reporting. Focused route/selection/access/window/PDF checks pass (19 tests / 71 assertions), as do web/E2E typechecks and focused lint. Eight synthetic Edge journeys pass, including selection retention at 320/1440px and exact PDF request payloads. Live DB/auth and end-to-end selected PDF content/accessibility checks remain pending.

Admin referral density (30 October): activity records now use a single text line with centered alignment and compact vertical padding. Student email, source owner, reward breakdown and verification remain in the detail drawer; date/time is inline. No API or business-rule changes.

Latest shared-checkout typecheck (30 October 2026): web passed before concurrent changes; the final rerun is blocked by academy-class-page.tsx:1274 (Accordion onValueChange unknown[] versus number[]). Server check remains blocked by the unrelated unused MODALITY import in tutor.service.ts. No errors from the bulk-report files were reported. Focused lint, formatting, route/selection/PDF tests and the eight synthetic Edge journeys passed; these do not prove live API/database acceptance.

Competition types: implemented compact expandable Selia table and exclusion of superseded catalog seed rows. Browser acceptance remains pending; web typecheck is blocked by the existing academy-class-page Accordion value type mismatch.

Competition catalog empty-state refinement (2026-10-30): reuse shared
EmptyState with the search icon and existing Clear filters action; add mt-6
above it. No query/filter/API changes. Scoped diff check passes; file lint
reports existing React Compiler memoization errors at line 303, outside this
empty-state change.

### KB/calendar management controls (2026-10-30)

Admin resource and event lists use tables. Calendar education levels are `sd`, `smp`, `sma`, `mahasiswa`; scale is `international` or `national`, validated by the authoring API. Dates use the shared date picker in WIB, preserving existing times. Manual order is hidden; new entries default to zero and edits retain stored order. Resource categories render verbatim. Admin-only `/rpc/adminContent/previewPdf` accepts `{ "json": { "fileId": "..." } }` and returns a base64 PDF plus its filename, including archived/unattached files; authoring must be enabled. The browser renders a temporary PDF blob and revokes its URL when closed/replaced. Web CSP permits blob frames; deploy the updated nginx configuration with the web app. No database migration is required.

KB/calendar management now follows the FAQ page composition: header add action, status filter, list plus sticky desktop editor, and right-side drawer on smaller screens. Tables remain the record list; opening another entry or closing the editor confirms draft discard.

KB/calendar management refinement: compact rows, shared TablePagination (10 records per page over the loaded admin collection), search resets pagination, no active/archive filter or manual reload control. Existing TanStack Query refresh and mutation invalidation remain. Calendar create/update/delete accept an omitted reason and generate an operation-specific audit reason; Knowledge Bank changes still require a reason. Deploy matching API and web changes together; no environment or database migration changes.

KB/calendar editor confirmation uses Selia Dialog for discarding drafts and deleting entries. Discard confirmation appears only when field values differ from the opened draft; closing an unchanged editor proceeds immediately.

Calendar toolbar: admin management is an accessible gear button immediately before Filter inside CompetitionCalendar, including empty calendars. The button shows the `Edit/add competition` label from the `md` breakpoint and stays icon-only below it. Calendar page/panel widths are constrained to their parent so the 720px month grid scrolls horizontally inside the panel on narrow screens. Focused mocked browser checks cover scroll movement, toolbar placement, manage navigation, and reader visibility; they do not prove live API/data behavior.

Competition types directory toolbar now places search, an icon-only status filter, and an icon-only Add competition action in one row. Both actions retain accessible labels and title hints. The table keeps a 48rem minimum width and nonwrapping records, scrolling horizontally inside its focusable labeled container on narrow screens.

Competition types result metadata is compact (`N groups`). Color inheritance guidance is available through the shared InfoPreview popover beside the count, supporting tap, hover and keyboard access.
Replaced the dense tree/permanent editor with a grouped competition directory and on-demand Selia drawer. Search/status, visible specializations, parent color identity, optional descriptions/colors/movement and dirty-close confirmation make the catalog manageable without changing backend contracts. All existing audit/version/impact/lifecycle controls remain. Dedicated synthetic Edge workflow covers the changed UI; current validation results are recorded in the PR and RUNBOOK. This does not close live DB, native zoom or assistive-technology gates.

Validation: 10/10 installed-Edge synthetic cases passed (44.7s), with card/field/button geometry at 320/390/768/1440px. Inspected directory and drawer screenshots. Initial cold-load timeouts were resolved by DOM-content navigation and a 60-second cold-load budget; a fixture was corrected to refresh nested parent relations after mutations. The live DB catalog suite remains unrun.

## Classes UI follow-up (22 October 2026)

- Completed: one compact catalog card per class, local search/type filters,
  explicit WIB dates and price units, curriculum/enrollment detail layout.
- Completed follow-up: the whole catalog card links to class details, the
  schedule uses a divider-based list, and enrollment appears first on mobile.
  Reduced-motion users do not receive the card hover translation. The payment
  action retains the explicit “Reserve and confirm Marks” label.
- Verified on 23 October: web `check-types --checkers 1`, focused oxlint, and
  14 synthetic Chromium cases passed, including the existing 11 layout/report
  cases plus unverified-student verification/return, signed-out login redirect,
  and non-student dashboard redirect. Reviewed captured 320px catalog/detail
  and 1440px detail screenshots. This used a temporary copy of
  `classes-layout.spec.ts` with the catalog button locator changed to the new
  full-card link. Integration now updates that permanent locator; all 14
  cases in the checked-in suite pass against the combined UI and PDF export
  source (36.6 seconds), including PDF downloads and responsive class/report flows.
- Completed: published-first admin studio tabs, retained draft editor mounting,
  expandable lifecycle controls, wider editor and wrapping confirmation actions.
- Completed: bounded report session list, mobile focus/scroll to selected report,
  and correct Class studio/Class details app header labels.
- Previously verified: 11 synthetic Chromium cases at
  320/390/768/1440px and mobile report flows for all three roles; dark-mode
  student coverage at 768px. No horizontal
  page overflow or page errors in those cases. Existing role guards and payment
  math remain. Full DB-backed publish/enrollment/cancellation journeys were not
  rerun; their UI locators were updated for the intentional navigation changes.

The T3 preview reached the synthetic frontend, but its unmocked auth request
failed (`TypeError: Failed to fetch`) and snapshot timed out after 15000ms.
Browser evidence above comes from the repository's mocked Playwright workflow,
not a live API session. No DB/provider checks were performed.

Scope: all web TSX source and the shared Selia controls; repair browser-native
date/time/number widgets and Card/Table composition without changing API contracts.

Final integrated verification: 11 Chromium cases pass in 19.5s after merging
PR #305. Full workspace typechecking and lint baseline pass. Luna Max source
review found missing tab-panel semantics in the catalog filters; these now use
pressed-state filter buttons. No other concrete finding remained in that review.

## Completed

- Source scan of the web components and 40 route files: no visible raw select,
  textarea or table elements; the remaining raw input is the hidden profile-image
  file chooser. The analytics `XAxis type="number"` is a chart axis, not an input.
- Migrated numeric controls in Academy, payout/tax configuration, competition
  display order, V3 economy settings and custom Marks top-up to Selia NumberField.
  Empty strings remain nullable numeric values at the control boundary; original
  min/max/step/required/read-only constraints and submission conversions remain.
- NumberField's default composition now includes styled decrement/increment
  buttons; custom child compositions remain supported. Mobile inputs use 16px text.
- Reused CrossBrowserDateTimeInput for Academy minimum checks/session schedules,
  lifecycle replacement times and actual payout time. The value remains a local
  `YYYY-MM-DDTHH:mm` string; existing callers own timezone conversion. The date
  trigger retains the field's ID, with a separate `-time` input ID.
- Required/partial date-time values and times earlier than the same-day minimum
  fail form validation. DatePicker handles invalid stored dates without throwing,
  opens at the selected month and constrains its trigger text. Calendar dropdown
  items register their labels before opening, so October does not display as `9`.
- Card and CardBody allow children to shrink. CardBody owns full-width table
  margins/width and keeps mixed content separated. Removed repeated per-page
  width overrides; removed the conflicting zero-padding payout body. Tables
  scroll locally. CardBody no longer applies negative margins to every Stack.
- Header actions use the correct grid column and move below the title in narrow
  Cards, including narrow cards on a desktop viewport. Table cells retain padding
  around mixed text/link content; only a sole direct link fills the cell.
- Academy publish E2E now selects dates through the custom calendar and fills its
  time control. Existing helper regression fixtures use explicit union types so
  the web compiler can check both published and postponed snapshots.

## Role-based sidebar grouping follow-up

- Completed: split admin Navigation into Overview, Teaching, Finance, and
  Content & reviews using existing Selia sidebar groups. Resources and the
  account footer remain below.
- Student follow-up: Overview groups Dashboard/Balance; Learning groups Tutors,
  Classes, My Bookings, Session reports, and Achievements. Tutor follow-up:
  Overview contains Dashboard; Teaching groups Bookings, Session reports,
  Availability, and Tutor Profile. Both roles put FAQ in Resources.
- All 13 admin destinations, link labels, icons, active-link styling, and the
  booking-action badge remain available. No API or environment changes.
- Verification: web TypeScript and focused sidebar lint passed. A source check
  confirmed all 13 admin destinations occur exactly once. Student/tutor follow-up
  web TypeScript and focused lint passed; a source assertion confirmed every
  original student/tutor destination remains exactly once, including FAQ moved
  to Resources. Booking badge rendering and role selection are retained. Authenticated visual checks remain unverified: the fresh browser
  preview redirects to sign-in and has no admin session.

## Verification

- Follow-up spacing regression: Card-root inline-size containment inflated grid
  row heights in a column Stack. Moving the named container to CardHeader reduced
  the measured economy section gap from 251.25px to the intended 24px while
  preserving the icon-header action's column 3. Reloaded desktop page also reports
  a 24px gap. The economy E2E spec now asserts the gap at mobile/desktop widths.

- Tax copy/usability follow-up: default and custom tutor tax fields use percent
  labels and 0..100 inputs with two decimal places, retaining integer API units.
  Default fields include a sample deduction from Rp400,000. Authenticated browser
  check: 250/300 appeared as 2.5/3; keyboard entry of 2.55 produced Rp10,200,
  and increment from 2.5 produced 2.51/Rp10,040. Configuration was not saved.
  Conversion regression passed 1 test / 7 assertions; web typecheck/lint passed.

- UI, web and E2E TypeScript checks passed.
- Focused regressions: 7 tests / 13 assertions passed (calendar label, invalid
  date, quarter-hour helpers, class list merge).
- Browser component fixture: at 320, 390, 768 and 1440 CSS-pixel widths, no
  document horizontal overflow; a 900px table stays inside its Card, mixed
  filters/table/pagination have positive gaps, and mixed-link cells keep padding.
  Counter click changed 5 to 6. Required empty date/time was rejected; selected
  date plus `09:35` was accepted; midnight below a `09:30` minimum was rejected.
  Calendar month trigger reads October before opening its dropdown.
- Changed-file lint has no errors; the existing capitalized CVA helper warning
  remains. No new dependency, migration, seed or provider call is required.

## Authenticated route checks and counter clipping repair

After restarting the local stack, authenticated browser checks used an owned
temporary local account, first as admin and then as student. It and its sessions
were deleted after verification; existing account passwords were not changed.
No business draft, purchase, payout or economy configuration was saved.

- Admin at 390/1440px: Academy, economy, payouts, competitions, operations,
  tutors, Knowledge Bank access and achievements loaded. Visible numeric values
  fit, the document did not overflow horizontally and table containers remained
  inside Cards. Economy draft edit mode also passed the numeric-fit check.
- Student at 390px: dashboard, bookings, classes, reports, tutor discovery,
  profile, achievements, notifications, FAQ, calendar, Knowledge Bank and guide
  loaded without document horizontal overflow. Balance passed at 390/1440px.
  Current dev economy exposes legacy packages, so the gated V3 custom Marks
  input was not present and its purchase path was not exercised.
- The user screenshot exposed a real regression in Academy's nested price grid:
  three steppers shared half the draft panel. At 1440px, their inputs had 0px
  remaining text width. Schedule and rates now occupy separate rows; rate columns
  use auto-fit with a 10rem minimum. Available text width became 93px, sufficient
  for the default 20/22/25. Checks at 390/1024/1440px found no clipped numeric
  values. The draft list Card no longer stretches to the editor's height.
- Actual Academy controls: full-plan increment changed 20 to 21 while half-plan
  remained 22; tutor fee remained read-only. Calendar selection displayed
  23 October 2026, time entry accepted 09:35, and incomplete draft submission
  focused the title field without creating a draft. The publish E2E now includes
  a rendered numeric-width regression assertion at all three viewport widths.

## Remaining acceptance

The DB-backed publish journey, payout recording, class lifecycle writes and tutor
workflows have not been rerun in this UI audit. Route checks cover the existing
development data and empty states, not every data/permission/error combination.
The earlier report worker's DB/merge work remains separate. Web/API/DB/Redis are
left running; email/payments remain stubbed and Calendar disabled.

## Sidebar section controls (23 October 2026)

- Implemented independent default-expanded Selia collapsibles for every role
  section and Resources, retaining route/access rules and the account footer.
- Synthetic verification uses `playwright.sidebar.config.ts` on isolated port
  3302 with mocked auth/RPC, covering keyboard, tab order, active links, booking
  badges, support, and mobile navigation. All six Chromium cases passed (28.5s).
  Reviewed expanded mobile and collapsed desktop keyboard-focus screenshots.
- Web and e2e typechecks passed with `--checkers 1` after limiting Go memory
  (`GOMEMLIMIT=1GiB`, `GOMAXPROCS=2`); the initial web attempt exhausted Windows
  virtual memory. Focused lint and diff checks passed.
- No DB, provider, persistence, or API behavior changes.

### KOL responsive polish checkpoint

2026-10-25 bounded checkpoint: KOL settlement history wrapping and multiline settlement/export/retry actions implemented; 13/13 synthetic Edge checks pass. Measured baseline clipping and reproduction command are in RUNBOOK. This does not complete the wider V3 responsive audit: economy, payout, class/report, native 200% zoom, RTL and assistive-technology acceptance remain open. Parent owns cross-checkout docs backlog reconciliation.

### Economy and tutor payout responsive slice (25 October 2026)

Bounded implementation complete: V3 amount controls have a 14rem minimum width within local table scrollers. Baseline 834f525f reproduced ten-digit IDR clipping at 320/390px (100.6px required versus 92px available); after repair 128px is available. No measured payout production issue required a change. Shared-card audit fixes are retained.

Dedicated synthetic Edge checks pass 8/8 across 320/390/768/1440 CSS px, covering economy read/edit, payout prepared-transfer, unpaid-preview and void/reconciliation drawers, numeric widths, contained tables, button content height and keyboard reachability. Mock-only ports 3356/3357, cache, command and artifact paths are in RUNBOOK. No financial write is activated and live economy/payout specs are not run.

Remaining: native 200% zoom (unverified), RTL and assistive-technology audit, live auth/persistence and financial workflow acceptance, plus other responsive slices. This checkpoint does not mark the overall V3 UI audit complete.

### Canonical KB/calendar pages (25 October 2026)

Implemented admin View/Manage within `/knowledge-bank` and `/calendar` using the existing single-kind editor. Removed the duplicate KB & calendar sidebar item; retained `/admin-content` as a role-checked compatibility redirect. Reader layouts and API access gates are retained; reader caches invalidate after save/delete, and open drafts require confirmation before switching to View.

Bounded acceptance uses the existing mocked Edge KB/calendar harness on 3316/3317: version/conflict behavior, timestamps/catalog IDs, agenda dates, student/tutor reader isolation, redirect, and both editor forms at 320/390/768/1440px. No live DB/storage/provider workflow is run. This does not complete the broader UI or release audit; native zoom, assistive technology and real persistence/authorization remain open.

Verification: 11/11 installed-Edge tests passed (40.1s); serial web/E2E TS-Go, focused lint and formatting passed. Resource list targets have a 40px minimum height.

Parent integration check (26 October 2026): after merging release head 8945a6d6 into the feature, all 11 synthetic Edge cases passed again (1.2 minutes). Reviewed 320px screenshots for both editors. This is mocked UI/wire evidence, not DB, storage, provider or production proof.

### Unified admin Referrals (2026-11-01)

Implemented: single Referrals sidebar entry; URL-backed Activity, Campaigns and Commissions tabs; compact campaign table; existing KOL decision, CSV and settlement UI composed under Commissions; previous commission URL redirects. Activity/campaign requests are deferred to their tab. Financial RPC contracts and student friend-code ownership are unchanged. Campaign promotion support and campaign-level commission aggregation are outside this navigation change. Validation: 19 relevant synthetic browser cases passed across the two runs; lint passed. Four student referral expectations, two broader settlement checks and concurrent class-management type errors remain open; see RUNBOOK for scope.

## Admin finance follow-up (2 November 2026)

- [x] Put rate card actions in the responsive Selia card header and compare current versus saved draft pricing.
- [x] Add separate paid and cancelled payout Excel sheets and readable CSV cancellation labels.
- [x] Workspace typecheck, lint baseline, 160 web tests, 38 economy API tests and 9 synthetic finance layout tests passed.
- [ ] Merge after hosted checks pass.

### Specific login errors (7 November 2026)

Email sign-in maps Better Auth INVALID_EMAIL_OR_PASSWORD failures after credential validation to USER_NOT_FOUND, INVALID_PASSWORD, or GOOGLE_SIGN_IN_REQUIRED (Google account without a usable password). Linked Google accounts with passwords use password validation. Other failures remain unchanged. This intentionally exposes email registration/provider status on failed login; existing auth rate limits still apply. No migration or environment change.

### Explicit Google signup (7 November 2026)

Google disables implicit signup. Only the signup form sends requestSignUp: true. Unregistered Google sign-ins return to /login with signup_disabled and guidance to choose another account or sign up. Google prompts for account selection and consent. No migration or new environment setting.
