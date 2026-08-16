# Tutor Invite Hardening

Status: completed — 2026-08-16

- [x] Keep the latest link visible for repeated copying and allow safe regeneration from invitation history.
- [x] Separate link regeneration from the explicit Resend **Send again** action to prevent accidental email spam.

- [x] Audit student, existing tutor, new account, email/password, and Google account claim cases.
- [x] Prevent admin role demotion during claim with an atomic eligible-role update.
- [x] Preserve invite return URLs across Google OAuth.
- [x] Deliver create/resend emails through the existing Resend provider with escaped content and idempotency keys.
- [x] Keep invites valid on provider failure and show a manual-link fallback.
- [x] Add regression tests and update architecture, API, module, and runbook documentation.
