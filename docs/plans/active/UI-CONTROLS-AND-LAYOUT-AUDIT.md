# UI controls and Card/Table audit (22 October 2026)

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
