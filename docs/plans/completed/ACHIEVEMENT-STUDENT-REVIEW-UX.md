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

## Verification

- Focused achievement API unit tests pass.
- Web TypeScript validation passes with the direct `tsgo` project check.
- The runbook contains the student/admin smoke checks and public privacy check.
