# Tutor Terms of Service onboarding

Status: Completed locally — 2026-09-02; UX follow-up completed — 2026-09-09

## Objective

Require a tutor to review and accept the bilingual Indonesian/English Terms of
Service exactly once before the first complete profile submission for admin
review.

## Delivered

- Added the nine-clause bilingual Terms of Service dialog to the tutor profile
  form. The dialog is read-only; draft saves remain available without consent.
- Added one responsive **I agree to the Tutor Terms of Service** checkbox to
  the sticky onboarding action area. **Read terms** opens the document without
  duplicating the consent control, and the checkbox remains checked/disabled
  after the server records acceptance. Non-editable profiles retain a
  **Review Tutor Terms** action for read-only review.
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
