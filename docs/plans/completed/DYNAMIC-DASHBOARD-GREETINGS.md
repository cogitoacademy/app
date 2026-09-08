# Dynamic Dashboard Greetings

Status: Completed — 2026-09-08

## Goal

Give all three dashboard roles varied, context-appropriate greetings that
follow the user's local time of day without changing during routine re-renders.

## Completed scope

- Added four local time bands and 60 role-specific greeting titles.
- Added role-specific supporting copy with student lesson, tutor review, and
  admin priority context.
- Extended the shared welcome card to student, tutor, and admin dashboards.
- Fixed the admin salutation name to `Admin`; student and tutor greetings keep
  using the account's first name.
- Kept the randomized selection stable for the lifetime of the mounted card.
- Added boundary, role, name, and workload-context unit coverage.
- Updated context, module, API, and runbook documentation.

## Verification

- `bun test apps/web/src/components/dashboard/dashboard-greetings.test.ts` —
  10 passed.
- `bun run --filter web check-types` — blocked by the pre-existing unrelated
  type error in `apps/web/src/components/admin/admin-operations-page.tsx:479`.
