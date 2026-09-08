# Cogito Marks Presentation

Status: **Complete locally (2026-09-08)**

## Outcome

- Standardized visible numeric Marks amounts on the shared `CogitoMarks` component.
- Applied the Cogito mark-symbol prefix across wallet, tutor pricing, booking, Knowledge Bank, and admin views.
- Removed duplicated amount/icon implementations from booking components.
- Preserved textual product labels and accessible `N Marks` announcements.
- Assigned an explicit icon size at every call site to match compact metadata,
  standard values, and prominent totals.
- Standardized inline vertical alignment and added contextual spacing where a
  Marks value appears inside prose.

## Verification

- `bun run check-types --filter=web`
