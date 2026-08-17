# Forgot Password / Reset Password Design

Date: 2026-08-17
Status: Approved

## Context

Cogito app has no forgot-password flow. Login page has a dead "Forgot password?" link (`sign-in-form.tsx:168`, href `#`). Stack: Better Auth v1 mounted at `/api/auth/*` on an Elysia server, Drizzle/Postgres, oRPC RPC layer, TanStack Router + Selia UI on the web app.

## Decisions

1. **Backend: Better Auth built-in endpoints.** `POST /api/auth/forget-password` and `POST /api/auth/reset-password` already exist in Better Auth. Token generation, expiry (1h), single-use enforcement, and password hashing are handled by Better Auth. Tokens are stored in the existing `verification` table (no schema change). The only missing piece is email sending, wired via the `emailAndPassword.sendResetPassword` config hook.
2. **Frontend: two standalone routes** `/forgot-password` and `/reset-password`, following the existing `login.tsx` Card + Field + Input pattern.

## Backend Changes

### `packages/auth/src/index.ts`

- Add `emailAndPassword.sendResetPassword({ user, url, token }, request)` config callback.
- Email module (`EmailService`) lives in `@cogito-app/api`; `@cogito-app/auth` cannot import it (circular dependency — `@cogito-app/api` imports `@cogito-app/auth`). Wire via a setter injection port instead:
  - Export type `ResetPasswordEmailSender = (params: { user: CogitoUser; url: string; token: string }) => Promise<void>`.
  - Export `setAuthEmailSender(send: ResetPasswordEmailSender)` that stores the sender in a module-level variable; `createAuth()` reads it when building the `sendResetPassword` callback.
  - Default (unset): log a warning and skip sending (never throw — the request endpoint must still return success to avoid enumeration).
- The `sendResetPassword` callback must **always** be provided to Better Auth so the endpoint works; if no sender is wired, it logs and returns without error.

### Email sending

- Extend `EmailMessage.category` union in `packages/api/src/modules/email/email.service.ts` with `"auth"`.
- New file `packages/auth/src/reset-password-email.ts` building the HTML email body (inline HTML string, matching the existing no-shared-template pattern; Cogito branding, "Reset your password" heading, reset link button, expiry note 1h, ignore-if-not-requested note).
- When the email provider is the stub (no `RESEND_API_KEY`), log the full reset URL so developers can click it in dev (stub provider currently logs only subject/to).
- Sender is wired at the composition root in `apps/server/src/index.ts` using `services.email` (imported from `@cogito-app/api/services`), called before `listen`.

### Rate limiting

- Add `/api/auth/forget-password/` and `/api/auth/reset-password/` to `AUTH_PATHS` in `apps/server/src/rate-limit-paths.ts`. Existing 10 req/min auth limiter then covers them (no new limiter).

## Frontend Changes

### `/forgot-password` route (`apps/web/src/routes/forgot-password.tsx` + component)

- Card + Field + Input form, single email field.
- Submit → `authClient.forgetPassword({ email, redirectTo: `${window.location.origin}/reset-password` })`.
- Always show success state ("If an account exists for that email, we've sent a reset link") regardless of whether the user exists — anti-enumeration.
- Error handling via `toastManager` on network/validation failures only.
- Link back to `/login`.

### `/reset-password` route (`apps/web/src/routes/reset-password.tsx` + component)

- Reads `token` search param via TanStack Router `validateSearch` (pattern from `-login-search.ts`).
- Form: new password + confirm (min 8 chars, match validation, show/hide toggles like sign-in form).
- Submit → `authClient.resetPassword({ newPassword, token })`.
- Success → toast → navigate `/login`.
- Invalid/expired token → error toast, link back to `/forgot-password`.
- Guard: if no `token` present, show "invalid link" state instead of the form.

### Login page

- Change "Forgot password?" `TextLink` href from `#` to `/forgot-password` (`sign-in-form.tsx:168`).

## Security

- New endpoints covered by existing 10 req/min auth rate limiter.
- Always-success response on forgot-password request (no user enumeration).
- Token single-use, 1h expiry (Better Auth defaults).
- New password validated server-side (min 8 chars, Better Auth `minPasswordLength: 8` already configured).
- On successful reset, revoke the user's other sessions server-side via a Better Auth `after` hook scoped to the reset-password endpoint (defense against stolen-session-with-known-password). Failed revoke must not fail the reset itself — wrap in try/catch, log only.
- Reset link is per-account: Better Auth's `verification` table records `identifier` as user id; replay of a used token fails.
- Email content contains no credentials; the link is the only secret and expires.

## Testing

- **Unit (`packages/auth` or `packages/api/src/tests/unit/auth-config.test.ts`):**
  - `sendResetPassword` callback invokes the wired sender with user, url, token.
  - No sender wired → logs warning, does not throw, endpoint still succeeds.
  - Stub email path logs the reset URL.
  - `EmailMessage.category` accepts `"auth"`.
- **Integration (`packages/api/src/tests/integration/forgot-password.test.ts`):**
  - Sign up → call forget-password (capture URL via stub sender) → reset-password with token → sign in with new password succeeds.
  - Old password rejected after reset.
  - Token replay (second reset-password with same token) fails.
  - Forget-password for unknown email returns the same success response.
  - Other sessions revoked after reset (if session revocation implemented).
  - Rate limit: >10 forget-password calls per minute → 429.
- **E2E (`packages/e2e`):** skipped for this feature (covered by integration tests).

## Docs

- Update `docs/CONTEXT.md` auth section with forgot/reset endpoints.
- Update `docs/API-REFERENCE.md` auth section.
- `.env.example` already lists `RESEND_API_KEY` and `EMAIL_FROM` — no change needed.

## Out of Scope

- Email verification flow (`sendVerificationEmail`) — not requested.
- Custom token storage or password policy beyond Better Auth defaults.
- Rate-limit tuning beyond adding paths to the existing limiter.
