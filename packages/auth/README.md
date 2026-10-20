# @cogito-app/auth

Better Auth configuration for Cogito, wired to the Drizzle `schema.user` table (`src/index.ts` exports a singleton `auth`).

## Configuration

- **Email/password** sign-in (`emailAndPassword`), plus **Google OAuth** — enabled conditionally via `resolveGoogleSocialProviders` only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; forces the consent prompt (`prompt: "consent"`).
- **Email OTP verification** (`emailOTP` plugin): 6-digit codes, 5-minute expiry (`otpLength: 6`, `expiresIn: 300`) for existing-account verification, sign-in, reset, and change-email. The plugin does not create or verify a public signup account.
- **Sessions** expire after 7 days (`expiresIn: 60 * 60 * 24 * 7`), with an opt-in cookie cache (`SESSION_COOKIE_CACHE_MAX_AGE` from env).
- **Password policy**: minimum 8 characters (Better Auth `minPasswordLength`) plus `assertPasswordPolicy(...)` at sign-up — at least one uppercase letter, one lowercase letter, and one digit.
- **User model**: `role` additional field (default `"student"`, not client-settable). In production-like envs, accounts with a configured admin email (`env.ADMIN_EMAILS`) are stored as `admin` by the create-before hook.
- **Cookies**: `sameSite: strict` + `secure: true` in production-like envs (lax otherwise); the OAuth state cookie stays `lax`.

## Email sender wiring

Email sending lives outside this package (in `@cogito-app/api`'s EmailService) to avoid a circular dependency — `@cogito-app/api` imports `@cogito-app/auth`. The composition root (`apps/server`) wires the ports at boot:

- `setAuthEmailSender(sender)` — reset-password emails (`sendResetPassword`).
- `setVerificationEmailSender(sender)` — existing-account OTP emails for sign-in, email verification, forgot password, and change-email.
- `setPreAccountSignupEmailSender(sender)` — public email signup proof sent before account creation.
- `setSignupWelcomeEmailSender(sender)` — one welcome message after the proof-backed account transaction commits.

### Pre-account signup

The server intercepts `POST /api/auth/sign-up/email`; requests without both the six-digit OTP and `signupAttemptId` are rejected before Better Auth runs. `POST /api/auth/sign-up/email-otp` takes `{ email, signupAttemptId }`, returns the bound attempt ID and 60-second cooldown, and enforces that cooldown per normalized email. A resend after the cooldown replaces the code, which expires after five minutes and allows three incorrect attempts. OTP digest, expiry, attempt count, and attempt ID use the existing `verification` table; no new schema is needed. `POST /api/auth/sign-up/email-outcome` takes `{ email, signupAttemptId }` and returns `{ created }` for the bounded idempotency result after an uncertain response.

The completion path serializes by normalized email and attempt ID. Better Auth inserts the user, account, and session on the same transaction connection; successful creation consumes the proof and records the outcome in that transaction. A rejected create rolls back, leaving a valid proof available for retry. The verified-email hook is scoped to the exact email and private signup transaction; the public `createAuth` factory exposes no verification bypass option.

When `NODE_ENV=test`, the server mail ports do not send real mail. `GET /api/__test/auth/signup-otp?email=...` exposes the latest code only when the server targets the loopback `cogito-test` database and the request host is loopback; the route is not registered in production. E2E cleanup accepts only a synthetic `@cogito.test` fixture email on that local database.

### API and operations documentation follow-up

This package README records the local module behavior. The release integration should also document the request/response contracts in `docs/API-REFERENCE.md`, the signup verification rule in `docs/CONTEXT.md` and `docs/MODULE-REFERENCE.md`, and the test-only OTP capture plus coordinated test procedure in `docs/RUNBOOK.md`. Update `docs/plans/active/RELEASE-V3-PRD.md` to keep REQ-AUTH-01 implementation status pending until the coordinated database integration and browser E2E run pass. These core docs are left to the release integration worker while those files are being integrated.

## Files

- `src/index.ts` — Better Auth factory, email ports, pre-account OTP send/consume/outcome, and `assertPasswordPolicy`.
- `src/reset-password-email.ts`, `src/verification-email.ts` — email-building helpers.
- `src/index.test.ts` — auth hook, sender, policy, and provider tests.
- `packages/api/src/tests/integration/signup-auth-req-auth-01.test.ts` — database-backed signup proof/atomicity cases (requires the coordinated test window).
- `packages/e2e/src/specs/pre-account-signup.spec.ts` — public-route bypass and browser signup flow (requires the coordinated test window).
