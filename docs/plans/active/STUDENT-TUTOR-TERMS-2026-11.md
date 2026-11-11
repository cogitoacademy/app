# November 2026 student and tutor terms

- Implement supplied bilingual documents, student consent, and versioned tutor onboarding acceptance in this change.
- Validate email and Google signup, guardian declaration, migration, and tutor onboarding before release.
- Outstanding: confirm operational support for the tutor fee schedule and seven-day change notifications; the supplied contract describes these commitments. Existing published tutors are not automatically re-consented.
- Implemented student terms presentation as a right-side Selia drawer; document body scrolls independently. Rendered verification captured on 2026-11-11; before and after screenshots are in `docs/pr-assets/student-consent-layout/`.

Signup consent uses inline age choices and a student terms link within the consent sentence. Tutor terms remain in invitation-based tutor onboarding. Both terms documents use bottom drawers below 640px and right drawers on larger screens, with matching swipe directions. Guardian fields remain conditional on selecting Under 18.

Invitation signup: `/login?redirect=/invite?token=...` preserves the tutor invitation when switching to signup. New invitees use email OTP signup with the invited email fixed; Google signup and referral input are omitted in this flow. `POST /api/auth/sign-up/email` accepts optional `tutorInviteToken`. Only a matching, unexpired, invited token (SHA-256 lookup, row locked during signup) bypasses student consent storage. Invalid invitation tokens return 400. The invitation is claimed separately after login; tutor consent remains required in onboarding. No schema/env changes. Test with a fresh invite, its matching inbox OTP, then Claim Invitation and complete tutor onboarding; expired/revoked/wrong-email tokens must fail. Live invitation/inbox acceptance remains unverified.
