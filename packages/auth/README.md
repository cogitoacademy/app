# @cogito-app/auth

Better Auth configuration for Cogito, wired to the Drizzle `schema.user` table (`src/index.ts` exports a singleton `auth`).

## Configuration

- **Email/password** sign-in (`emailAndPassword`), plus **Google OAuth** — enabled conditionally via `resolveGoogleSocialProviders` only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; forces the consent prompt (`prompt: "consent"`).
- **Email OTP verification** (`emailOTP` plugin): 6-digit codes, 5-minute expiry (`otpLength: 6`, `expiresIn: 300`), sent automatically on sign-up (`sendVerificationOnSignUp`).
- **Sessions** expire after 7 days (`expiresIn: 60 * 60 * 24 * 7`), with an opt-in cookie cache (`SESSION_COOKIE_CACHE_MAX_AGE` from env).
- **Password policy**: minimum 8 characters (Better Auth `minPasswordLength`) plus `assertPasswordPolicy(...)` at sign-up — at least one uppercase letter, one lowercase letter, and one digit.
- **User model**: `role` additional field (default `"student"`, not client-settable). In production-like envs, sign-ups with a configured admin email (`env.ADMIN_EMAILS`) are promoted to `admin` via the `databaseHooks.user.create.after` hook.
- **Cookies**: `sameSite: strict` + `secure: true` in production-like envs (lax otherwise); the OAuth state cookie stays `lax`.

## Email sender wiring

Email sending lives outside this package (in `@cogito-app/api`'s EmailService) to avoid a circular dependency — `@cogito-app/api` imports `@cogito-app/auth`. The composition root (`apps/server`) wires the ports at boot:

- `setAuthEmailSender(sender)` — reset-password emails (`sendResetPassword`).
- `setVerificationEmailSender(sender)` — OTP emails for sign-in, email verification, forgot password, and change-email (`isSignup` flag distinguishes the automatic sign-up OTP).

Both senders are optional at boot; when unwired, Better Auth logs a warning and skips delivery. Email failures are swallowed (anti-enumeration) — the endpoints return the same response for known and unknown emails.

## Files

- `src/index.ts` — Better Auth factory + senders + `assertPasswordPolicy`.
- `src/reset-password-email.ts`, `src/verification-email.ts` — email-building helpers.
- `src/index.test.ts` — DB-backed tests (promotion hook, senders, policies) run against the test database.
