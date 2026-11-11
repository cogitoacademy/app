# Student and tutor terms layout evidence

Screenshots were captured on 2026-11-11 from source at merge-base `c31a497a`
(before) and task head `8e743020` (after), rendered by the local Vite dev
server at `http://localhost:5180`.

Two temporary evidence-only routes rendered the real product components with
labelled local fixture states. Both routes and all temporary source changes
were removed after capture; the tracked tree contains only product code from
the task commit plus these evidence files.

Fixture limits:

- The invitation variant stubs the `/rpc/invite/verify` response with
  `tutor@example.com`. No invitation was created and no email was sent.
- The tutor onboarding consent is rendered as an isolated component, not a
  full authenticated onboarding session.
- The email verification code step was not completed; no account was created.
- The before invitation variant does not exist as a separate screen because
  the merge-base signup form did not preserve tutor invitations.

## Before and after pairs

| Area | Before | After |
| --- | --- | --- |
| Signup, desktop | `before-signup-desktop.png` | `after-signup-desktop.png` |
| Signup, mobile | `before-signup-mobile.png` | `after-signup-mobile.png` |
| Student consent, adult | `before-student-consent-adult-desktop.png` | `after-student-consent-adult-desktop.png` |
| Student consent, minor, desktop | `before-student-consent-minor-desktop.png` | `after-student-consent-minor-desktop.png` |
| Student consent, minor, mobile | `before-student-consent-minor-mobile.png` | `after-student-consent-minor-mobile.png` |
| Student terms, desktop | `before-student-terms-dialog-desktop.png` | `after-student-terms-drawer-desktop.png` |
| Student terms, mobile | `before-student-terms-dialog-mobile.png` | `after-student-terms-drawer-mobile.png` |
| Tutor terms, desktop | `before-tutor-terms-dialog-desktop.png` | `after-tutor-terms-drawer-desktop.png` |
| Tutor terms, mobile | `before-tutor-terms-dialog-mobile.png` | `after-tutor-terms-drawer-mobile.png` |
| Tutor onboarding consent, desktop | `before-tutor-consent-desktop.png` | `after-tutor-consent-desktop.png` |
| Tutor onboarding consent, mobile | `before-tutor-consent-mobile.png` | `after-tutor-consent-mobile.png` |
| Login footer, desktop | `before-login-footer-desktop.png` | `after-login-footer-desktop.png` |
| Login footer, mobile | `before-login-footer-mobile.png` | `after-login-footer-mobile.png` |

Invitation signup, after only:

- `after-signup-invite-desktop.png`
- `after-signup-invite-mobile.png`

## Checks

- `bun test packages/auth/src/tutor-invite-signup.test.ts apps/server/src/signup-body.test.ts`:
  5 pass, 0 fail.
- `GOMAXPROCS=2 GOMEMLIMIT=1GiB bun run --cwd apps/web check-types`: pass.
- `GOMAXPROCS=2 GOMEMLIMIT=1GiB bun run --cwd apps/server check-types`: pass.
