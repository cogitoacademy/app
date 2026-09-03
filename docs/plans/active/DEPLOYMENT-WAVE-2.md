# Deployment Wave 2 — Finalized Plan & Dispatch (rev. 1)

| Field      | Value                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status     | **APPLIED 2026-08-31** — Terraform imports + Ansible apply completed via `infra/apply.sh` (with live-API fixes #136/#137); vault refreshed (R2/Coolify tokens rotated, DATABASE_URL host-reachable); GitHub secrets updated; deploy-webhook route live |
| Created    | 2026-08-28                                                                                                                                                                                                                                             |
| Depends on | main `151fd2a` (#115–#118 merged; **#120 Xendit Test Mode merged 2026-08-28**; deployment wave state synced in #119)                                                                                                                                   |
| Scope      | Repo work only: `coolify-resources.yml` (Coolify API playbook + deploy-webhook route fix), drift-check + docs, plan-only CI audit. **No secrets values needed — names only.**                                                                          |

---

## 0. Locked decisions from the planning session (2026-08-28)

1. **R2 NOT yet available** (operator's admin cannot fill the payment info for
   R2 activation). The wave proceeds — no R2 values are needed for repo work.
   R2 remains the **first operator task** before any prod apply/boot (env
   guard P4.3 + backup target). Documented, not blocking.
2. **Google Meet: token EXISTS but expires every 7 days** (root cause
   confirmed in GOOGLE-MEET-SETUP.md:152: _"A project left in Testing issues
   Calendar refresh tokens that expire after 7 days"_). Permanent fix: set the
   OAuth consent screen publishing status to **In production**, then
   regenerate the refresh token (long-lived; the unverified-app warning
   remains until the verification video is done — separate track). Decision:
   run `GOOGLE_MEET_ENABLED=true` with the current token (boot probe + manual
   link fallback keep the app safe when the token lapses), and add the
   publish-then-regenerate step to the operator checklist.
3. **`ADMIN_EMAILS`** = `itcogitoacademy01@gmail.com` — confirmed.
4. **Plan-only CI audit job — IN THIS WAVE** (user-approved). Precise scope:
   `terraform validate` + `terraform plan` (read-only Cloudflare + R2 tokens)
   - `ansible-playbook --syntax-check`. NOTE: `ansible --check` is NOT
     possible in CI (needs tailnet SSH); `--syntax-check` is the CI-safe
     equivalent. Full `--check` remains a local operator command.
5. **Drizzle Studio tunnel docs — IN THIS WAVE** (safe path: tailnet SSH
   tunnel + local `bun run db:studio`; never on the prod container).
6. **Uptime Kuma — DEFERRED to a follow-up plan** (RAM verified healthy —
   see §3 — but the user wants all deployments wired first; Kuma needs a
   live, wired box to monitor).
7. **Xendit sandbox — YES**, with a setup guide (see §4) since the operator
   is unsure about allowed IPs / redirects / webhook tokens.
8. **Dispatch approved in principle** — 3 workers (scope below), final plan
   first.
9. **`WEBHOOK_ALLOWED_IPS` requirement REMOVED (2026-08-28, user decision).**
   Xendit publishes no stable webhook source IP list (their documented
   verification is the `x-callback-token` signature), and a wrong allowlist
   silently 403s webhooks → Xendit retries 24h → payments never credit. The
   D2 env superRefine (mandatory in prod with xendit) is removed; the env
   var stays optional and the `ipAllowed` check stays as defense-in-depth
   (empty = signature-only gating). Code change: `packages/env/src/server.ts`
   - tests. Folded into W1.
10. **Webhook 401 — second hypothesis found in the doc audit (2026-08-28):**
    `docs/DEPLOYMENT.md` §5 documents the endpoint as **"Deploy Webhook (auth
    required)"** requiring `Authorization: Bearer <coolify-api-token>` (deploy
    permission) — but `cd-prod.yml` / `migrate-and-deploy.sh` send **no
    Authorization header**. The 401 may be the missing Bearer token, not
    (only) the missing route. W1 adds optional Bearer support to the curl
    (guarded by a `COOLIFY_API_TOKEN` secret); the operator verifies against
    live Coolify 4.3.12 and adds the secret if required.
11. **#120 Xendit Test Mode merged (2026-08-28) — changes the Xendit story:**
    - New env: `XENDIT_MODE` (`test`/`live`, required with xendit) +
      `XENDIT_TEST_ALLOWED_EMAILS` (required in prod-like envs when
      `XENDIT_MODE=test` — UAT email allowlist; `createPurchase` throws
      `PaymentTestModeRestrictedError` for non-allowlisted users).
    - Circuit breaker keyed per-mode (`xendit-test` / `xendit-live`).
    - Boot log `payment_provider_configured` with the non-secret mode.
    - **The D2 `WEBHOOK_ALLOWED_IPS` guard is STILL PRESENT in main** (line
      231-241 of `packages/env/src/server.ts`) — the §0.9 removal decision
      still applies, but W1 must now also add `XENDIT_MODE` +
      `XENDIT_TEST_ALLOWED_EMAILS` to the curated env examples and the
      `coolify-resources.yml` env list. The operator's Xendit wiring is now:
      `XENDIT_MODE=test` + Test Mode keys + UAT emails → production-domain
      sandbox E2E → switch `XENDIT_MODE=live` + Live keys → one real small
      transaction. **This answers the user's "can my app really transact with
      Xendit now?" — yes, in Test Mode, restricted to UAT emails, on the
      production domain.**

---

## 1. IMPORTANT CORRECTION from live box inspection (2026-08-28)

**The Coolify bundled proxy is TRAEFIK v3.6, not Caddy.**

Verified live on the VPS: `coolify-proxy|traefik:v3.6|Up 3 days (healthy)`.
Coolify 4.x uses Traefik. `docs/plans/active/DEPLOYMENT-PLAN.md` (lines 15,
48, 79) and `docs/INFRA-ARCHITECTURE-DEEP-DIVE.md` reference "Caddy" — these
must be corrected, and **the deploy-webhook route (the 401 fix) must be
written as a Traefik route**, not a Caddy route.

This changes Task 0.2's implementation: the `coolify-resources.yml` playbook
must drive the **Coolify API / Traefik labels** for
`cl.cogitoacademy.id` → only `/api/v1/deploy/*` proxied, everything else 404. Worker W1 owns this and the doc corrections.

---

## 2. Live VPS inspection (ran 2026-08-28 via SSH — new data, not from the plan)

```
Memory:  total 3819MB · used 1549MB · available 2270MB (free 332 + reclaimable cache)
Containers (docker stats):
  coolify            340.2MiB   coolify-db   28.3MiB   coolify-redis  8.5MiB
  coolify-realtime    57.8MiB   coolify-sentinel 11.0MiB
  app server (latest) 202.7MiB  app web       3.9MiB
  app postgres:16     34.8MiB   app redis     8.3MiB
  drizzle-gateway     18.6MiB   (UNHEALTHY — Coolify-internal, known, not ours)
  coolify-proxy (traefik) 24.1MiB
Host processes: bun 244MB (app server) · traefik 99MB · soketi 79MB ·
  dockerd 74MB · fail2ban 72MB · php artisan ×4 ≈ 288MB · php-fpm 68MB (Coolify backend)
```

- **RAM is healthy: 2.27GB available.** The plan's "318MB free" line was
  misleading (it read `free`, ignoring reclaimable cache; `available` is the
  correct number). Uptime Kuma (~150MB) fits comfortably — the deferral is a
  sequencing choice, not a RAM constraint.
- **drizzle-gateway unhealthy**: Coolify-internal, confirmed not ours, no
  action (already known in the plan).
- Containers total ≈ 738MiB; the rest is the host OS + Docker + Coolify's PHP
  backend. That's the "where does RAM go" answer.

---

## 3. Operator checklist additions (folded into DEPLOYMENT-PLAN.md by W1)

1. **SOPS encryption (do before any commit):**
   `age-keygen -o ~/.config/sops/age/keys.txt` → public key into `.sops.yaml`
   → `sops -e -i infra/secrets/prod.env`. **DONE 2026-08-28** — vault filled
   (44 keys) + encrypted + committed (r2-split PR).
2. **R2 creation** — **DONE 2026-08-28**: public `cogito-bucket` +
   `r2bucket.cogitoacademy.id` custom domain (app uploads, `R2_BUCKET`) and
   private `cogito-backups` (`R2_BACKUP_BUCKET`, dumps/snapshots). Terraform
   declares both (r2-split PR); operator must `terraform import` the
   pre-created bucket + domain before first apply.
3. **Google Meet**: publish OAuth consent screen → **In production** →
   regenerate refresh token (permanent fix for the 7-day expiry).
4. **Xendit sandbox wiring** (see §4).
5. **Backup `DATABASE_URL`** must resolve from the VPS host (published port /
   container IP), not the private hostname.
6. **Verify the default package catalog after deploy.** Migration
   `0041_seed_mark_packages.sql` installs Starter/Learner/Explorer/Pioneer
   idempotently during the normal CD migration step and updates their default
   name/Marks/price values without overriding an existing `is_active` choice.
   Use the admin mark-package API for future catalog changes; do not seed on
   every deploy.

---

## 4. Xendit — the setup guide (updated for #120 Test Mode, 2026-08-28)

**#120 changed the model: Xendit selects Test/Live from the API key, and our
app now asserts the intended mode explicitly via `XENDIT_MODE` + a UAT email
allowlist (`XENDIT_TEST_ALLOWED_EMAILS`).**

**The two "allowlists" (still distinct, still NOT the same thing):**

| Feature                                        | Where                                    | Value                                                 | What it protects                                                                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Xendit dashboard "IP Allowlist"**            | Xendit dashboard → IP Allowlist settings | **YOUR VPS IP** (`15.235.186.159`)                    | Xendit's APIs — only your server can call them. Protects against API-key theft. **This is the merchant-side allowlist — yes, it's your IP.**                                                                                           |
| **Our `WEBHOOK_ALLOWED_IPS` env var**          | Our SOPS vault → Coolify env             | **Xendit's webhook SOURCE IPs** (observed, see below) | OUR endpoint — only Xendit's IPs can deliver webhooks. Defense-in-depth second layer; the `x-callback-token` signature is the primary gate. **§0.9: the D2 mandatory guard is being removed (user decision); the var stays optional.** |
| **`XENDIT_TEST_ALLOWED_EMAILS` (NEW in #120)** | Our SOPS vault → Coolify env             | UAT account emails (comma-separated)                  | **Who may purchase in Test Mode** — `createPurchase` throws `PaymentTestModeRestrictedError` for anyone else. This is the real "test mode" gate.                                                                                       |

**The honest problem with `WEBHOOK_ALLOWED_IPS`:** Xendit does NOT publish a
stable list of webhook source IPs (their docs emphasize the `x-callback-token`
as the verification mechanism; docs.xendit.co webhook pages 404'd when checked
2026-08-28). A WRONG allowlist is worse than none — webhooks 403 → Xendit
retries for 24h → payments silently never credit. Safe approach: log the
source IPs of received sandbox webhooks, populate with **observed** IPs, verify
webhooks still flow. If unstable, leave empty (signature-only gating).

| Vault var                                                     | Where to get it                                                                     | What it is                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `XENDIT_MODE`                                                 | Your choice — `test` for UAT, `live` for go-live                                    | Explicit deployment-mode assertion (required with xendit)                                                         |
| `XENDIT_SECRET_KEY`                                           | Settings → API Keys (Test Mode section)                                             | Authenticates API calls; Test Mode = test key                                                                     |
| `XENDIT_WEBHOOK_TOKEN`                                        | Settings → Webhooks → Callback Token                                                | Sent as `x-callback-token` header on every webhook; the server compares it (constant-time)                        |
| `XENDIT_TEST_ALLOWED_EMAILS`                                  | Your UAT accounts                                                                   | Who may purchase while `XENDIT_MODE=test` (required in prod-like envs)                                            |
| Webhook URL (set in Xendit dashboard)                         | Settings → Webhooks → per event type                                                | `https://api.cogitoacademy.id/webhooks/payments/xendit` — events: payment succeeded / refunded / failed / expired |
| `WEBHOOK_ALLOWED_IPS`                                         | **Observed from real sandbox webhooks** (log source IPs), not from a published list | Comma-separated source IPs Xendit sends webhooks from; server rejects anything else (403)                         |
| `XENDIT_SUCCESS_REDIRECT_URL` / `XENDIT_FAILURE_REDIRECT_URL` | Your choice                                                                         | Where the customer lands after paying/cancelling — defaults `https://app.cogitoacademy.id/balance` work fine      |

**Can the app really transact with Xendit now? YES — in Test Mode, on the
production domain, restricted to UAT emails.** QRIS is the default production channel; the student receives a dynamic QR on the Balance page →
approved UAT students trigger Xendit's Test Mode simulation from the QR card →
webhook fires → wallet credits Marks. If the sandbox webhook is delayed or
rejected, approved-user polling reconciles Xendit's authoritative request
status through the same idempotent credit path. Real banking apps are not used
and **no real money moves.** Go-live = switch
`XENDIT_MODE=live` + Live keys + one real small transaction (RUNBOOK
checklist).

---

## 5. Concerns answered (from the user's questions)

### 5.1 "DLQ only audits — what does it mean, what should we do better?"

**What it means:** failed BullMQ jobs land in `cogito-jobs-dlq` (queue) + a
bounded Redis list `cogito:dlq` (100 entries). `/health` exposes `dlqDepth`
but it is **excluded from overall status** — so it can alert (Uptime Kuma
monitor) without crash-looping the Coolify probe. Nothing auto-replays: the
six repeatable jobs re-fire on their cadence anyway, and auto-replaying a
failed job could **double-run a money path** — that's why replay is
deliberately absent.

**What we should do better (ranked):**

1. **Now (this wave):** nothing extra in code — the alert hook is designed;
   the Uptime Kuma `dlqDepth` monitor lands with the deferred Kuma follow-up.
2. **Next (small, follow-up):** a protected admin RPC to _read_ DLQ entries
   (currently only `redis-cli` can inspect them) — read-only, no replay.
3. **Never:** auto-replay on money paths.

### 5.2 "Manual migration rollback — no .down migrations, only up. How do we migrate with real users?"

The pattern is **additive-only releases; destructive changes are two-step** —
this is already a locked decision (DEPLOYMENT-PLAN §Task 3.2). Concretely:

- Drizzle migration files are **up-only by design** (each file runs as one
  batch; embedded down-DDL would execute immediately — that's why rollback SQL
  for the 2026 migrations lives separately in RUNBOOK, manual `psql`,
  newest-first).
- **With real users:** add columns/tables in release N (non-breaking); backfill;
  remove/rename in release N+1. Never drop a column in the same release that
  reads it.
- **If a migration breaks at deploy time:** the CD already snapshotted
  `pre-migrate-<sha>.sql.gz` to R2 before migrating — restore under a
  maintenance window (never blind-auto-restore with live traffic). Code
  rollback is Coolify "Rollback to previous release"; DB rollback is manual
  down-SQL + re-migrate.
- W2 documents this as the "Migration policy with live users" section in
  RUNBOOK.

### 5.3 "In-memory fallback — we need Redis right? There's no case for in-memory fallback."

**Correct — and the docs should say so.** Redis is **mandatory**: `REDIS_URL`
is required by the env schema (no boot without it), and with
`SCHEDULER_ENABLED=true` an unreachable Redis **aborts boot**. The in-memory
stores (idempotency/rate-limit/circuit-breaker) exist for:

- **unit tests** (`InMemoryRedis`), and
- a **last-ditch per-call defense** if a configured Redis call fails at
  runtime mid-flight (a network blip keeps that one request working instead
  of throwing).

They never silently replace Redis, and `/health` still trips 503 during a
real outage. On a single instance the "per-process degradation" caveat is
moot. **Doc action (W2):** downgrade the CONTEXT.md "In-Memory Fallback
(defensive only)" section from a feature to a note — "test utility +
last-ditch per-call defense; Redis is mandatory and monitored". No code
change; the fallback stays as-is (removing it would churn tests for zero
prod benefit).

### 5.4 RAM — answered with live data (§2): healthy, 2.27GB available.

---

## 6. Worker briefs (final)

### W1 — `deploy-resources` → `deploy/coolify-resources` (worker-feature)

**Goal:** `infra/ansible/coolify-resources.yml` — declare the existing app
resources via the Coolify API (Postgres/Redis/API/web, env from SOPS,
domains, webhooks) + the **Traefik** deploy-webhook route; fix Caddy→Traefik
doc references.

**Files (owned):** `infra/ansible/coolify-resources.yml` (new),
`docs/plans/active/DEPLOYMENT-PLAN.md` (Caddy→Traefik corrections + operator
checklist additions from §3 + **#120 Xendit Test Mode wiring**),
`docs/INFRA-ARCHITECTURE-DEEP-DIVE.md` + `docs/INFRA-KNOWLEDGE-SYNC.md`
(Caddy→Traefik fixes ONLY), `infra/.env.prod.example` +
`infra/secrets/prod.env.example` (curated env guide — see "Env example
cleanup" below; **include `XENDIT_MODE` + `XENDIT_TEST_ALLOWED_EMAILS` from
#120**; the RUNBOOK env table is W2's — W1 supplies the curated content in
the two example files and W2 mirrors it), `packages/env/src/server.ts` +
`packages/env/src/server.test.ts` (D2 allowlist requirement removal — see
§0.9), `scripts/migrate-and-deploy.sh` + `.github/workflows/cd-prod.yml`
(optional Bearer header — see §0.10).

**Do NOT touch:** `apps/` (except the env package files listed above),
`packages/` (except `packages/env`), `.github/` (except `cd-prod.yml`),
`infra/ansible/*.yml` except the new file, `infra/terraform/`,
`docs/RUNBOOK.md`, `docs/DEPLOYMENT.md`.

**Key points:** Traefik, not Caddy — route
`cl.cogitoacademy.id/api/v1/deploy/*` only; everything else on that host 404. Env values come from `sops -d` on the control node (never written to
disk on the VPS). Playbook is idempotent + dry-runnable. `--syntax-check`
passes. This is the 401 fix.

**Env example cleanup (user-approved 2026-08-28):** trim
`infra/.env.prod.example` + `infra/secrets/prod.env.example` + the RUNBOOK env
table to a curated, commented guide: group vars by feature (Auth / Meet /
Payments / Email / Storage / Content / Ops), mark each `REQUIRED` /
`OPTIONAL` / `MODE-SPECIFIC (service-account only)`, and add a "which mode
am I?" decision tree at the top (OAuth triple vs service account). The SOPS
vault stays the single source of truth; the examples become a readable
decision guide, not a 57-var dump. Leave `GOOGLE_PRIVATE_KEY` /
`GOOGLE_CLIENT_EMAIL` / `GOOGLE_IMPERSONATED_USER` marked service-account-only.

### W2 — `deploy-ops` → `deploy/drift-check-docs` (worker-feature)

**Goal:** `infra/ansible/drift-check.yml` + the wave's docs.

**Files (owned):** `infra/ansible/drift-check.yml` (new — diffs Coolify API
state vs declared, fails on drift), `docs/RUNBOOK.md` (incident-response
tables: deploy failure / crash-loop / circuit breaker / DLQ alert / DB loss /
disk full / VPS loss; migration policy with live users; Drizzle Studio via
tailnet tunnel; **Xendit webhook wiring section — observed-IPs approach,
two-allowlist distinction, `x-callback-token` as primary gate**),
`docs/DEPLOYMENT.md` (Traefik + plan-only audit section is W3's — W2 owns the
rest, incl. the **webhook auth-required Bearer note**), `docs/CONTEXT.md`
(deployment-wave state line + in-memory fallback downgrade per §5.3),
`docs/plans/README.md` (plan row), `docs/plans/active/DEFERRED-OPS-TASKS.md`
(sync §0/§4 statuses: webhook 401 → wave-2, Uptime Kuma → deferred follow-up,
R2 → operator first task).

**Do NOT touch:** `apps/`, `packages/`, `.github/`, `infra/ansible/coolify-resources.yml`, `docs/plans/active/DEPLOYMENT-PLAN.md`, `docs/plans/active/DEPLOYMENT-WAVE-2.md`.

**Key points:** Uptime Kuma DEFERRED (no Kuma playbook this wave — note it in
the docs as the follow-up). Drizzle Studio: document the tunnel path, never
on the prod container. DEFERRED-OPS-TASKS.md statuses synced (webhook 401 →
wave-2; Kuma → follow-up; R2 → operator first task).

### W3 — `deploy-ci-audit` → `deploy/plan-only-audit` (worker-feature)

**Goal:** the plan-only CI audit job.

**Files (owned):** `.github/workflows/infra-plan.yml` (new — on PR touching
`infra/**`: `terraform validate` + `terraform plan` with **read-only**
Cloudflare + R2 tokens, documented as placeholders; `ansible-playbook
--syntax-check` for all playbooks), `.github/scripts/` if a helper is needed,
`docs/DEPLOYMENT.md` ("Plan-only audit" section ONLY).

**Do NOT touch:** `apps/`, `packages/`, `infra/`, `docs/RUNBOOK.md`, `docs/plans/`, other `.github/workflows/*`.

**Key points:** honest scope — `terraform plan` (real audit value), `ansible
--syntax-check` (no SSH from CI; `--check` is a local operator command).
Read-only tokens only; the Age private key NEVER enters CI. Job must be
skippable/skipped when secrets are unset (documented).

---

## 7. Overlap map & merge order

| File                                                                                 | W1                      | W2        | W3                      |
| ------------------------------------------------------------------------------------ | ----------------------- | --------- | ----------------------- |
| `infra/ansible/coolify-resources.yml`                                                | ✅ owns                 | —         | —                       |
| `infra/ansible/drift-check.yml`                                                      | —                       | ✅ owns   | —                       |
| `.github/workflows/infra-plan.yml`                                                   | —                       | —         | ✅ owns                 |
| `.github/workflows/cd-prod.yml`                                                      | ✅ owns                 | —         | —                       |
| `packages/env/src/server.ts` + tests                                                 | ✅ owns                 | —         | —                       |
| `scripts/migrate-and-deploy.sh`                                                      | ✅ owns                 | —         | —                       |
| `docs/plans/active/DEPLOYMENT-PLAN.md`                                               | ✅ owns                 | —         | —                       |
| `docs/RUNBOOK.md`                                                                    | —                       | ✅ owns   | —                       |
| `docs/DEPLOYMENT.md`                                                                 | —                       | ✅ (rest) | ✅ (audit section only) |
| `docs/CONTEXT.md`, `docs/plans/README.md`, `docs/plans/active/DEFERRED-OPS-TASKS.md` | —                       | ✅ owns   | —                       |
| `docs/INFRA-ARCHITECTURE-DEEP-DIVE.md`, `docs/INFRA-KNOWLEDGE-SYNC.md`               | ✅ (Traefik fixes only) | —         | —                       |

**Merge order:** W3 → W1 → W2 (W2 last: it owns the most docs and rebases
trivially on the others).

---

## 8. Exit gates

- All 3 workers: `WORKER-REPORT.md` written; `ansible-playbook --syntax-check`
  green on their playbooks; docs in every commit (AGENTS.md rule 11).
- W1: playbook references Coolify API endpoints with correct Traefik route;
  plan doc corrected + operator checklist added; D2 allowlist requirement
  removed with tests green; optional Bearer support in the deploy curl;
  env examples curated.
- W2: drift-check playbook + all doc sections; Uptime Kuma explicitly marked
  deferred; DEFERRED-OPS-TASKS.md statuses synced.
- W3: workflow runs `terraform plan` (or skips with a clear message when
  tokens are unset) + `ansible --syntax-check`; CI passes on the PR.
- Lead: rebuild the wave on `origin/main`, PR with full body, `gh pr checks
--watch`, squash-merge; then wave finalization (close panes, remove
  worktrees `~/cogito/wt-deploy-*` + stale `wt-backend-prod-readiness`,
  `wt-review-fixes3`, `wt-review-fixes4`, delete merged local branches,
  sync plans/docs).

## 9. Deferred (follow-up plans, per user)

- **Uptime Kuma** playbook + monitors + Telegram alerts (needs wired box; RAM verified OK).
- **Admin DLQ reader** RPC (read-only).
- **WAL archiving / point-in-time recovery** (only if sub-24h recovery becomes a requirement).
- **Xendit go-live**: sandbox E2E → one real small transaction → swap keys.
- **Google OAuth verification video** (operator deliverable: record the Google permission screen with **Show all services** expanded, provide active test credentials, and include step-by-step navigation; the app now forces `prompt=consent`).
