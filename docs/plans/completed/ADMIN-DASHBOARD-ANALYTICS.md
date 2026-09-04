# Admin Dashboard Analytics

Status: **Completed locally — 2026-08-31**

## Objective

Give admins a business-analyst view in the existing `/admin` workspace without
turning the operational queue into a misleading analytics sample.

## Delivered

- Added the admin-only `admin.getDashboardAnalytics` procedure with `7d`,
  `30d`, and `90d` period validation.
- Added server-side aggregate reads for booking volume/completion, Marks
  volume, active learners, audience growth, live booking-state mix, modality,
  and top session categories.
- Normalized trend rows to continuous WIB calendar dates, including zero-value
  days for stable chart axes.
- Added a mature analytics section to `/admin` with KPI cards, booking activity
  area chart, booking portfolio bar chart, audience-growth stacked bars, and
  demand-signal progress rows.
- Added loading, retry/error, and no-data states; kept all visuals on Selia
  components and existing OKLCH theme tokens.
- Lazy-loaded the Recharts-heavy analytics module so the rest of the dashboard
  does not pay the chart bundle cost before the section is needed.
- Moved the Booking activity explanation into the reusable Selia
  `CardInfoPreview` popover beside its title, with a contextual info icon.

## Data semantics

Period metrics use booking/user creation time and WIB calendar boundaries.
Completion rate is completed bookings divided by completed plus terminal
exception bookings in the selected creation cohort. The current state mix is
all-time by design so it represents the live admin workload. Marks-based
platform take is a locked booking-snapshot signal and is explicitly not a cash
revenue report.

## Verification

- `bun test packages/api/src/tests/unit/admin.types.test.ts packages/api/src/tests/unit/admin.repo.test.ts packages/api/src/tests/unit/admin.service.test.ts packages/api/src/tests/unit/admin.handler.test.ts`
- `bun run check-types`
