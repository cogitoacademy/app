# Cogito Infrastructure & Code — Deep-Dive Report

> Written 2026-08-28 from the actual code (Terraform, Ansible, CD scripts,
> server bootstrap, routes, webhook handler, env schema, SOPS config) — not
> from memory. Companion to `docs/DEPLOYMENT.md` and
> `docs/plans/active/DEPLOYMENT-PLAN.md`.

---

## 0. The mental model: three planes

Everything in this system lives on one of three planes. Keep this picture and
every question below answers itself:

```
┌─────────────────────────────────────────────────────────────────────┐
│  CODE PLANE — git (the source of truth for behavior)                │
│  apps/server, apps/web, packages/*, infra/*, .github/workflows/*   │
│  CI/CD: GitHub Actions (ci.yml, cd-prod.yml)                        │
└─────────────────────────────────────────────────────────────────────┘
        │ builds images, pushes GHCR, triggers deploys
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE — the operator's machine (the source of truth for   │
│  infrastructure state)                                              │
│  Terraform (host shell, DNS, R2)  ·  Ansible (everything in the     │
│  box)  ·  SOPS + Age (secrets)  ·  Tailscale (network identity)     │
└─────────────────────────────────────────────────────────────────────┘
        │ SSH over tailnet, Coolify API, Cloudflare API
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DATA PLANE — the VPS (the runtime)                                 │
│  Coolify (Traefik TLS) → API container :3001 · web nginx :80          │
│  Postgres 16 · Redis 7 · Uptime Kuma · backup cron                  │
└─────────────────────────────────────────────────────────────────────┘
```

- **Code plane** decides _what the app does_.
- **Control plane** decides _what the infrastructure is_ (declarative, in git).
- **Data plane** _runs_ it.

The three planes communicate through exactly four doors: **HTTPS** (users,
webhooks, deploy webhook), **SSH over tailnet** (operator → VPS), **the
Cloudflare API** (Terraform), and **the Coolify API** (Ansible).

---

## 1. Networking, in detail

### 1.1 The public surface (what the internet can reach)

```
Internet
  │
  ▼
Cloudflare (DNS + proxy + WAF) — cogitoacademy.id zone
  ├── api.cogitoacademy.id    → A 15.235.186.159 (proxied)  → Traefik → API :3001
  ├── app.cogitoacademy.id    → A 15.235.186.159 (proxied)  → Traefik → web :80
  ├── status.cogitoacademy.id → A 15.235.186.159 (proxied)  → Traefik → Uptime Kuma
  └── coolify.cogitoacademy.id→ A 15.235.186.159 (proxied)  → Traefik → ONLY
        /api/v1/deploy/* (the deploy webhook path; everything else 404)
```

All four records are declared in `infra/terraform/main.tf` (Terraform owns
DNS). The apex `cogitoacademy.id` stays on Hostinger (company profile site).

**The VPS firewall (UFW, declared in `host-hardening.yml`):**

| Port             | Allowed from                   | Purpose                                    |
| ---------------- | ------------------------------ | ------------------------------------------ |
| 80, 443          | anywhere                       | Cloudflare-proxied public traffic          |
| 22               | `100.64.0.0/10` (tailnet only) | SSH — unreachable from the public internet |
| 8000, 6001, 6002 | `100.64.0.0/10` (tailnet only) | Coolify UI + realtime                      |

Plus: fail2ban sshd jail, unattended-upgrades, `PasswordAuthentication no`,
root key-only. **The Coolify dashboard has no public DNS record at all** — you
reach it at `http://cogito-vps:8000` (or `https://<tailnet-ip>:8000`) from
devices on your tailnet only.

### 1.2 The tailnet (control plane network)

Tailscale creates a private mesh network (`100.64.0.0/10`) between your
laptop, phone, and the VPS (`cogito-vps`, tagged `tag:server`). The ACL
(`infra/tailscale/acl.hujson`) is the declarative policy: only your admin
account can reach the server's SSH/Coolify ports. This is what makes the
"no public SSH, no public Coolify" posture possible — the VPS is _on_ the
internet but _invisible_ on it.

### 1.3 Inside the box (Coolify's private network)

Coolify runs its own Docker network. On it:

- **Traefik** (Coolify's bundled proxy) terminates TLS for all four domains and
  routes by hostname. It also enforces the `coolify.` host restriction: only
  `/api/v1/deploy/*` is proxied to the Coolify backend — the per-resource UUID
  in the URL is the bearer secret (Option A, locked decision).
- **App Postgres 16** (`postgres-prod:5432`) and **Redis 7** (`redis-prod:6379`)
  are Coolify-managed containers on that private network. The API container
  reaches them by hostname; they are **not** published to the host.
- **API container** (`:3001`, rootless `bun` user, healthcheck every 30s).
- **Web container** (static nginx, `:80`).
- **Uptime Kuma** (`:3002` host port, tailnet-reachable for admin; public via
  `status.` domain) — monitors `api./health`, `app.`, cert expiry, Telegram alerts.

### 1.4 The request lifecycle (one booking, end to end)

```
Student browser
  → https://app.cogitoacademy.id (Cloudflare proxy → Traefik → nginx static)
  → POST https://api.cogitoacademy.id/rpc/booking.createSolo
      (CORS: origin must be in the allowlist; body ≤ 1MB; rate limit 30/min/IP)
  → Elysia: security headers → rate limiter → oRPC router
  → zod validation → handler → service (business rules)
  → Postgres (transaction) + Redis (idempotency key, rate-limit counters)
  → notification row queued (outbox) → scheduler sends via Resend
  → response {"json": {...}, "meta": [...]}
```

Every hop is enforced in code: CORS allowlist (`origins.ts`), body-size limits
(1MB; 256KB for webhooks), per-path rate limits (auth 10/min, payment 5/min,
invite 10/min, booking 30/min, search 30/min, support 5/min, achievement
30/min, upload 30/min, content 30/min), security headers on every response.

---

## 2. Secrets & keys management

### 2.1 The four key systems (they do NOT overlap)

| System                     | What it is                                                                                          | Who holds it                    | Protects                          |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| **Better Auth secret**     | One symmetric key signing session cookies + hashing tokens                                          | API server env only             | Your users' login sessions        |
| **OAuth client ID/secret** | Google's identity for _your app_                                                                    | API server env + Google console | The "Sign in with Google" button  |
| **OAuth refresh token**    | Long-lived token from authorizing the calendar-owner account; lets the server _act as that account_ | API server env                  | Google Calendar/Meet integration  |
| **Provider API keys**      | Each vendor's own credential (Resend, Xendit, R2, Sanity)                                           | API server env                  | Email, payments, storage, content |

The common confusion: **Better Auth secret ≠ OAuth**. Better Auth is _your_
auth system (email/password, sessions, OTP). Google OAuth is one _login
method_ plugged into it — Google proves identity, Better Auth creates the
session with _its own_ secret. The Meet refresh token is a _third_ thing: not
login at all, but the server impersonating the calendar account to create
events.

### 2.2 Where secrets live (the full map)

```
┌─ SOPS vault (git, encrypted) ──────────────────────────────────────┐
│ infra/secrets/prod.env  — encrypted with your Age public key       │
│ .sops.yaml lists exactly which keys are encrypted (encrypted_regex)│
│ Decrypted ONLY on your machine (sops -d), piped straight into      │
│ Ansible → Coolify API. The Age PRIVATE key never leaves your       │
│ machine, never enters CI, never enters the VPS.                   │
└────────────────────────────────────────────────────────────────────┘
┌─ GitHub Actions secrets (repo Settings) ───────────────────────────┐
│ COOLIFY_PROD_SERVER_WEBHOOK, COOLIFY_PROD_WEBHOOK (deploy URLs)   │
│ COOLIFY_API_TOKEN (Bearer for auth-required webhooks)             │
│ PROD_DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,               │
│ R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET (CD pipeline credentials)  │
│ Deliberate exception: CI cannot read your SOPS vault, so the CD   │
│ pipeline's own credentials live here.                             │
└────────────────────────────────────────────────────────────────────┘
┌─ Coolify env (runtime) ───────────────────────────────────────────┐
│ The API container's actual environment. Set by Ansible from the   │
│ vault on every apply — no more hand-editing (that hand-editing is │
│ exactly how the webhook 401 drift happened).                      │
└────────────────────────────────────────────────────────────────────┘
┌─ On the VPS (one deliberate copy) ────────────────────────────────┐
│ /etc/cogito/backup.env (root:root 0600) — decrypted vault values  │
│ written by the backup-cron playbook so the nightly cron can run   │
│ unattended. Root-only, documented, auditable.                    │
└────────────────────────────────────────────────────────────────────┘
```

### 2.3 KMS? You already have one.

KMS (Key Management Service) is for orgs with many engineers, key rotation
audits, and hardware-backed storage. At your scale (one operator, ~20
secrets), **SOPS + Age is your KMS**: one Age keypair encrypts the whole
vault, the vault lives in git (publicly safe), the private key lives on your
machine. The `.sops.yaml` `encrypted_regex` is your secret inventory. The
plan's Task 4.2 (resource-access map with owner + rotation path) is the
lightweight governance layer on top.

### 2.4 The secrets flow at apply time

```
Your machine                          VPS
  sops -d prod.env ──┐
                     ├─ Ansible ── SSH (tailnet) ──► Coolify API: set env
  ansible-playbook ──┘                              Coolify API: create resources
  coolify-resources.yml                             Coolify API: webhooks, cron
```

The Age private key is used **on your machine only**; the decrypted values
travel over the tailnet SSH session and land in Coolify's env store. The VPS
never sees the Age key.

---

## 3. Who runs what — and why not Actions for Terraform/Ansible

| Layer                                                                         | Runs where   | When                                | Credentials it needs                            |
| ----------------------------------------------------------------------------- | ------------ | ----------------------------------- | ----------------------------------------------- |
| **Terraform** (DNS, R2 buckets, host bootstrap)                               | Your machine | Rarely (infra changes)              | `CLOUDFLARE_API_TOKEN`, R2 state token, SSH key |
| **Ansible** (hardening, Tailscale, Coolify resources, env, cron, Uptime Kuma) | Your machine | Every infra/env change (idempotent) | Age private key (SOPS), SSH over tailnet        |
| **GitHub Actions CD** (build → push → backup → migrate → deploy → health)     | GitHub cloud | Every merge to main                 | GitHub secrets (webhook URL, DB URL, R2)        |

**Why your old "Actions runs Terraform/Ansible" setup can't be copied here:**

1. **The Age private key must never touch CI.** If it lived in GitHub
   secrets, anyone with repo write access (or a compromised Actions runner)
   could decrypt the entire vault — Xendit live keys, Google credentials, DB
   passwords. SOPS exists precisely so the encrypted file is safe to commit
   publicly while the key stays with you.
2. **SSH is tailnet-only.** GitHub's cloud runners cannot reach your VPS —
   that's the lock-down decision. Only devices on your tailnet can.
3. **Terraform state + Cloudflare token** in CI would expand the blast
   radius for an operation that runs 3×/year.

**Your auditability concern is valid, and there's a middle path** (recommended
follow-up, not in this wave): a **plan-only CI job** — `terraform plan` +
`ansible-playbook --check` with _read-only_ credentials (a Cloudflare token
scoped to read, a read-only R2 token, no Age key — `--check` against the
Coolify API with a read-only API token). CI then produces an auditable
"what would change" trail on every PR, while the private key and the actual
apply stay on your machine. This gives you the audit log without the secret
exposure. (Tracked as a candidate in `docs/plans/active/DEFERRED-OPS-TASKS.md`.)

---

## 4. The deploy pipeline, end to end

```
merge to main
  → ci.yml (lint, typecheck, build, test+coverage 100%)
  → cd-prod.yml
      1. build server image  --build-arg GIT_SHA=<sha>  → ghcr.io/.../server:latest + v<sha>
      2. build web image     --build-arg VITE_SERVER_URL=https://api.cogitoacademy.id
      3. scripts/migrate-and-deploy.sh:
           a. pg_dump snapshot → gzip → R2 pre-migrate-<sha>.sql.gz   (backup)
           b. bun run db:migrate against PROD_DATABASE_URL           (migrate)
           c. POST https://coolify.cogitoacademy.id/api/v1/deploy?uuid=... (deploy)
           d. poll https://api.cogitoacademy.id/health until version == <sha>
              (20 × 15s)                                             (verify)
           e. on failure: rollback hint naming v<prev-sha> + snapshot (rollback)
      4. trigger the web resource webhook
```

The clever bit: the image bakes `GIT_SHA` in (`Dockerfile` ARG/ENV), `/health`
returns it as `version`, so the CD poll verifies the **new image is actually
serving** — not just "some container is up". The pre-migrate snapshot in R2
is the recovery artifact; rollback is pointing Coolify at the previous
immutable `v<sha>` image.

---

## 5. Third-party providers — does the code accommodate them?

**Yes — every one is implemented, guarded, and fail-loud. Verified in code:**

| Provider               | Status in code                                                                                                                                                                                     | What happens if credentials are missing/broken                                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Xendit**             | ✅ Fully implemented for the 2024-11-11 API (`payment_requests`, `channel_code` OVO/QRIS/BCA, `actions[].value`, statuses, refund port, webhook `data.payment_id` idempotency). Sandbox keys work. | Env schema **fails boot** if `PAYMENT_PROVIDER=xendit` without secret key, webhook token, redirect URLs, and `WEBHOOK_ALLOWED_IPS`. Webhook: `x-callback-token` signature + IP allowlist + 256KB cap + 120s idempotency claim; permanent errors dead-letter (4xx), transient retry (5xx). |
| **Resend**             | ✅ Email outbox pattern (notification rows `queued` → scheduler sends, no I/O in transactions), circuit breaker, 3 retries.                                                                        | Env schema **fails boot** in prod without `RESEND_API_KEY`; rejects unverified `EMAIL_FROM`.                                                                                                                                                                                              |
| **Google Meet**        | ✅ OAuth triple OR service account, boot-time probe, 5-min retry job (×3), manual-link fallback, circuit breaker.                                                                                  | `GOOGLE_MEET_ENABLED=true` without a complete set **fails boot**. With `false`: fallback provider — bookings stay `confirmed`, tutor/admin enters a manual link. **No data risk.**                                                                                                        |
| **Google OAuth login** | ✅ Conditional on env vars.                                                                                                                                                                        | Unverified-app warning only; email/password works meanwhile.                                                                                                                                                                                                                              |
| **R2**                 | ✅ Presigned POST uploads, all-or-nothing env guard, `R2_PUBLIC_URL` required in prod. **Two buckets (2026-08-28):** public `cogito-bucket` (uploads, `r2bucket.cogitoacademy.id`) vs private `cogito-backups` (`R2_BACKUP_BUCKET`, dumps/snapshots — never public). | **Fails boot** in prod without all four `R2_*` + `R2_PUBLIC_URL` (P4.3). |
| **Sanity**             | ✅ Tokenless CDN reads (`useCdn: true`, `perspective: published`); token optional. Hardened file proxy (host allowlist, 10s timeout, 5MB cap, 30/min rate limit).                                  | Works with no token for public content.                                                                                                                                                                                                                                                   |
| **Tailscale**          | ✅ Declarative ACL + join playbook.                                                                                                                                                                | Auth key in vault; join is one Ansible run.                                                                                                                                                                                                                                               |
| **Cloudflare**         | ✅ DNS + proxy + R2 buckets declared in Terraform.                                                                                                                                                 | Token needed only at apply time.                                                                                                                                                                                                                                                          |

**The fail-loud philosophy** (the single most important design decision):
every external dependency has a boot-time or first-use guard that _stops the
server_ (or loudly logs) instead of silently degrading. A prod server without
the scheduler **refuses to boot** (`SCHEDULER_ENABLED` guard). A prod server
without Resend **refuses to boot**. Partial R2 config **refuses to boot**.
This is why the current live API (hand-configured Coolify env) is a risk: it
predates these guards.

---

## 6. Failure modes & safety nets (already in code)

| Risk                     | Net                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Webhook replay/duplicate | Idempotency claim (120s) + 24h processed record; keyed on `data.payment_id`           |
| Provider retry loops     | Permanent errors → 4xx dead-letter; transient → 5xx + claim release                   |
| Scheduler crash          | DLQ (`cogito-jobs-dlq` + bounded `cogito:dlq` list), `/health` `dlqDepth`, alert-only |
| DB loss                  | Nightly `pg_dump -Fc` → R2 (30-day retention) + pre-migrate snapshot in CD            |
| Bad deploy               | Sha-verified health poll; rollback to previous `v<sha>`; snapshot for restore         |
| External provider down   | Circuit breakers (email, meeting) + manual fallback (meeting links)                   |
| Boot with broken config  | Zod env schema superRefine — fail loud, never silent stub                             |
| Unbounded abuse          | Rate limits per path, body-size caps, IP allowlists, security headers                 |
| Crash mid-request        | Idempotency keys on booking creation; atomic wallet guards; outbox pattern            |

---

## 7. Current state & the gap list (what's blocking go-live)

| Item                                                                                            | State                                                          | Blocker?                                                                                  |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R2 bucket + token                                                                               | **Not created**                                                | ✅ **Hard blocker** — prod boot fails without it; also the backup target                  |
| SOPS vault                                                                                      | Filled but **not yet encrypted** (Age keypair + `sops -e -i`)  | Must do before committing                                                                 |
| Google Meet refresh token                                                                       | Missing                                                        | Not a blocker — set `GOOGLE_MEET_ENABLED=false`, manual links work                        |
| Xendit                                                                                          | Sandbox keys                                                   | Not a blocker — sandbox E2E first, then one real transaction                              |
| Google OAuth                                                                                    | Unverified app                                                 | Not a blocker — warning screen; video needed before real-user go-live                     |
| Sanity                                                                                          | Tokenless                                                      | Not a blocker — public content works                                                      |
| `coolify-resources.yml` (Ansible → Coolify API, incl. the Traefik route fixing the webhook 401) | **Written in wave-2** (`deploy/coolify-resources`, 2026-08-28) | Repo work done; operator apply pending (needs encrypted SOPS vault + `COOLIFY_API_TOKEN`) |
| Terraform apply, Tailscale join, Ansible applies                                                | Pending                                                        | Operator steps after the wave                                                             |
| GitHub secrets (webhook URLs, DB URL, R2)                                                       | Pending                                                        | Operator steps after the wave                                                             |

---

## 8. Appendix — env var inventory (where each value comes from)

| Var                                                            | Source                                            | Required in prod?                          |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `BETTER_AUTH_SECRET`                                           | `openssl rand -hex 32`                            | ✅                                         |
| `PAYMENT_WEBHOOK_SECRET`                                       | `openssl rand -hex 32`                            | ✅                                         |
| `METRICS_TOKEN`                                                | `openssl rand -hex 32`                            | optional (endpoint 404s if unset)          |
| `ADMIN_EMAILS`                                                 | your operator account                             | ✅ (default `itcogitoacademy01@gmail.com`) |
| `RESEND_API_KEY`                                               | resend.com → API Keys                             | ✅ (boot fails without)                    |
| `EMAIL_FROM`                                                   | resend.com → verified domain                      | ✅ (unverified default rejected)           |
| `XENDIT_SECRET_KEY` / `XENDIT_WEBHOOK_TOKEN`                   | dashboard.xendit.co → API Keys / Webhooks         | ✅ when `PAYMENT_PROVIDER=xendit`          |
| `WEBHOOK_ALLOWED_IPS`                                          | Xendit documented egress IPs                      | ✅ with xendit in prod                     |
| `XENDIT_SUCCESS/FAILURE_REDIRECT_URL`                          | your choice (defaults fine)                       | ✅ with xendit                             |
| `GOOGLE_CLIENT_ID/SECRET`                                      | Google Cloud Console → Credentials                | optional (login method)                    |
| `GOOGLE_MEET_CLIENT_ID/SECRET/REFRESH_TOKEN`                   | Console + OAuth Playground (GOOGLE-MEET-SETUP.md) | ✅ when `GOOGLE_MEET_ENABLED=true`         |
| `R2_ACCOUNT_ID`                                                | Cloudflare dashboard (Account ID)                 | ✅ all-or-nothing                          |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`                    | R2 → Manage API Tokens                            | ✅ all-or-nothing                          |
| `R2_BUCKET`                                                    | PUBLIC uploads bucket (`cogito-bucket`)           | ✅ all-or-nothing                          |
| `R2_PUBLIC_URL`                                                | R2 custom domain (`r2bucket.cogitoacademy.id`)    | ✅ when R2 configured                      |
| `R2_BACKUP_BUCKET`                                             | PRIVATE backups bucket (`cogito-backups`)         | ✅ backup cron + CD only                   |
| `SANITY_PROJECT_ID` / `DATASET` / `API_TOKEN`                  | sanity.io/manage                                  | token optional                             |
| `DATABASE_URL` / `REDIS_URL`                                   | Coolify Postgres/Redis resources                  | ✅                                         |
| `TS_AUTH_KEY`                                                  | login.tailscale.com → Keys                        | ✅ (one-time join)                         |
| GitHub: `COOLIFY_PROD_SERVER_WEBHOOK` / `COOLIFY_PROD_WEBHOOK` | Coolify UI → resource webhooks                    | ✅ (CD)                                    |
| GitHub: `PROD_DATABASE_URL`, `R2_*`                            | as above                                          | ✅ (CD)                                    |
| Terraform: `CLOUDFLARE_API_TOKEN`, `cloudflare_account_id`     | Cloudflare dashboard                              | at apply time only                         |
