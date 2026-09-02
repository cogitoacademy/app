# Tutor Terms of Service onboarding

Status: Completed locally — 2026-09-02

## Objective

Require a tutor to review and accept the bilingual Indonesian/English Terms of
Service exactly once before the first complete profile submission for admin
review.

## Delivered

- Added the nine-clause bilingual Terms of Service dialog to the tutor profile
  form. Draft saves remain available without consent; the submit action opens
  the dialog only when the tutor has no recorded acceptance.
- Added a persistent **View Tutor Terms** action in the
  sticky onboarding action area. After acceptance it reopens the document in
  read-only mode.
- Added `acceptTerms?: boolean` to `tutor.submitForReview` and enforced the
  requirement in the service, including `TUTOR_TERMS_NOT_ACCEPTED` for direct
  API callers that skip consent.
- Added nullable `tutor_profile.terms_of_service_accepted_at` and
  `tutor_profile.terms_of_service_version` fields. The first accepted submit
  records version `2026-09` in the same transaction as `pending_review`, using
  a one-time `COALESCE` write; later submissions do not overwrite it.
- Removed the acceptance metadata from public tutor-discovery projections.
- Added unit, repository, handler, discovery-privacy, and invite-onboarding
  regression coverage.

## Verification

- `bun run check-types` — passed
- Focused Tutor/API tests — 127 passed, 0 failed
- Tutor invite/onboarding integration test — 24 passed, 0 failed
