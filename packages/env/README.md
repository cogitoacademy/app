# @cogito-app/env

Environment-schema validation for every runtime, built on `@t3-oss/env-core` + Zod. Fail-loud by design: a misconfigured server refuses to boot instead of silently degrading.

## Entrypoints

| Import | What it validates |
| ------ | ----------------- |
| `@cogito-app/env/server` | Server env schema (loaded from `.env` via `dotenv/config`) |
| `@cogito-app/env/web` | Client env: `VITE_SERVER_URL` (absolute URL or same-origin relative path) |
| `@cogito-app/env/admin` | Admin-email helpers: `DEFAULT_PRODUCTION_ADMIN_EMAIL`, `parseConfiguredAdminEmails`, `isConfiguredAdminEmail` |
| `@cogito-app/env/node-env` | `isProductionLike()` + `PRODUCTION_LIKE_ENVS` (`production`, `staging`) |
| `@cogito-app/env/origins` | `getAuthTrustedOrigins()` — auth trusted-origin derivation from `CORS_ORIGIN` + NODE_ENV (excludes private-network hosts, adds dev ports) |

## The `server` schema (`serverEnvSchema`)

Covers the base set plus cross-field rules enforced with `superRefine` — the server **fails to boot** when any of these hold:

- **`PAYMENT_PROVIDER=xendit`** requires `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_MODE` (test/live), and the `XENDIT_SUCCESS_REDIRECT_URL` / `XENDIT_FAILURE_REDIRECT_URL` return URLs; Test Mode in production/staging additionally requires `XENDIT_TEST_ALLOWED_EMAILS`.
- **`PAYMENT_PROVIDER=midtrans`** requires `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID`, and `MIDTRANS_MODE`.
- **Production-like (`production`/`staging`)** additionally requires:
  - `RESEND_API_KEY` — otherwise the stub email provider silently suppresses all emails.
  - `EMAIL_FROM` must be a verified sending address (the dev default is rejected).
  - `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_BUCKET` together **and** `R2_PUBLIC_URL` — partial R2 config fails; without these, uploads silently write to the container-local `UPLOAD_DIR` and are lost on redeploy.
  - `SCHEDULER_ENABLED=true` — a prod server without the scheduler silently skips booking expiry, hold release, email dispatch, and SLA escalation.
- **`GOOGLE_MEET_ENABLED=true`** requires a complete credential set — either the OAuth triple (`GOOGLE_MEET_CLIENT_ID` + `GOOGLE_MEET_CLIENT_SECRET` + `GOOGLE_MEET_REFRESH_TOKEN`, falling back to the shared `GOOGLE_CLIENT_*`) **or** the service account (`GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`); service-account mode also requires `GOOGLE_IMPERSONATED_USER` (domain-wide delegation).
- **Boolean parsing** goes through `boolFromEnv` (H1): string `"false"`/`"0"` parse as `false`, unknown strings fail loudly, and empty strings fall back to the schema default — `z.coerce.boolean()` is never used directly.

Notable base fields: `DATABASE_URL`, `BETTER_AUTH_SECRET` (min 32), `BETTER_AUTH_URL`, `CORS_ORIGIN`, `PAYMENT_PROVIDER` (stub/xendit/midtrans, default `stub`), `PAYMENT_WEBHOOK_SECRET` (min 32), `REDIS_URL`, `SESSION_COOKIE_CACHE_MAX_AGE` (default 60), `PORT` (default 3001), `ADMIN_EMAILS`, and `UPLOAD_DIR`.

## Node-env helpers

`isProductionLike(env.NODE_ENV)` treats `production` and `staging` as production-like — strict cookie attributes, mandatory SSL/email/R2 config, OpenAPI hidden without a session, and no stub payment provider. `NODE_ENV` values: `development` | `production` | `test` | `staging`.
