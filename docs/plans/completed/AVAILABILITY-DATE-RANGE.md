# Tutor Availability Date Range

Status: Completed locally 2026-09-22

## Goal

Allow tutors to choose both the start and end date when applying their weekly
availability schedule.

## Delivered

- Added Start date and End date Selia date pickers to Weekly hours.
- Allowed a same-day Date override when its start minute is still in the future,
  while rejecting elapsed same-day times in live client validation.
- Constrained the start to tomorrow or later, the end to the selected start or
  later, and the range to the existing server-side 52-week limit.
- Sent the selected dates through the existing `effectiveFrom` and
  `repeatUntil` fields of `tutor.replaceWeeklyAvailability`.
- Kept weekly time ranges, modalities, date overrides, and persistence
  unchanged.
- Updated architecture, API, module, and operations documentation.

## Verification

- Web TypeScript check.
- Targeted lint/format check for changed source and documentation.
