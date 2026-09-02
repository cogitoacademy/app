# Achievement Student and Review UX

**Status:** Completed locally 2026-09-02 on `f/client-revisions`

## Objective

Make achievement entry language clear for students and give admins a safe,
audited correction step before approval.

## Delivered

- Reordered student Level options to International, National, Province/State,
  City/Regency, and School.
- Replaced admin-oriented public-documentation wording in the student form with
  Google Drive proof-link instructions and the “Anyone with the link can view”
  setting.
- Clarified Location examples and changed the description field to a long-answer
  **Brief Description** textarea with a ranked-result example.
- Kept `documentationUrl` out of student create/update schemas and exposed it
  only through the admin correction flow.
- Added versioned `achievement.adminUpdate` with before/after audit content;
  corrections are available for `pending`/`pending_review` records and leave
  approval as a separate action.
- Added queue controls and regression coverage for admin corrections, stale
  versions, and student/admin payload boundaries.
- Replaced the student achievement card list and admin moderation card grid with
  compact minimum-width Selia tables plus a shared right-side detail drawer.
  Rows keep core identity, status, and date information visible; the drawer
  contains full metadata, proof/documentation links, notes, and pending student
  or admin actions. Both tables scroll horizontally inside their containers on
  narrow viewports; their table containers are full-bleed within the cards while
  the card/page wrappers remain constrained to the viewport.

## Verification

- Focused achievement API unit tests pass.
- Web TypeScript validation passes with the direct `tsgo` project check.
- Web lint and formatting checks pass for the changed achievement surfaces.
- The runbook contains the student/admin smoke checks and public privacy check.
