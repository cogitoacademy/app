# Deployment Plan — Single-Server Production Readiness (rev. 2)

| Field       | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status      | **APPLIED 2026-08-31** — Terraform 7 resources in state (no drift), Tailscale joined + hardened, Coolify resources declared (47 env vars applied), nightly backup cron installed, deploy-webhook route live (401 auth-required). **CD proven green end-to-end (2026-09-01: `/health` `version` == main HEAD, web 200). Phase 2 env wiring confirmed complete by the operator (2026-09-01: payments/Meet/R2/Sanity all live). Tailscale ACL pasted into the admin console (confirmed 2026-09-01).** Remaining: Uptime Kuma + Discord (MONITORING-ALERTING — playbooks delivered, operator console bits pending), drills (Phase 5 — documented for the next operator session), Xendit go-live |
| Created     | 2026-08-26 (rev. 2: 2026-08-27 — Tailscale control plane, Uptime Kuma only, prod-first, no staging, Ansible replaces provision.sh)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Branch      | `deploy/production-readiness`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Depends on  | PR #106, #107 (merged); PR #102 (Terraform + runbook, **merged #115**); main synced to `ca34d9d` (deployment wave: #115 infra scaffold, #116 DLQ health, #117 backups, #118 CD pipeline)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Scope       | Infrastructure first (network + hardening, fully declarative), then component wiring (credentials, env, backups, CD, monitoring)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Credentials | **Mostly ready; R2 bucket creation pending** (operator creates the R2 bucket + API token; Terraform declares it but the operator must run `terraform apply`). Tailscale auth key provided. Secrets go into SOPS (encrypted in git) / Coolify env via Ansible; the lead never types secrets.                                                                                                                                                                                                                                                                                                                                                                                                 |

## 0. Locked decisions (confirmed with user)

- **Control plane: Tailscale** (not CF Zero Trust). VPS joins the existing tailnet (`argyavityasy1208@gmail.com`, `tail674634.ts.net`). Coolify UI + SSH reachable **only** via tailnet. No `coolify.*` DNS record at all.
- **Deploy trigger: Option A — expose ONLY the Coolify deploy-webhook path publicly** (decided 2026-08-27). The CI pipeline (GitHub Actions, cloud-hosted) cannot reach a tailnet-only Coolify. Instead of opening the whole Coolify UI, add a DNS record + Traefik route for `cl.cogitoacademy.id/api/v1/deploy/*` only. The URL contains a per-resource UUID that acts as the bearer secret; nothing else on the domain is exposed, and the Coolify UI itself stays tailnet-only. This is Coolify's standard deployment model. (Rejected Option B: SSH-from-Actions deploy key — more moving parts, no public surface; kept as documented fallback.)
- **Tailscale ACL is declarative**: committed `infra/tailscale/acl.hujson`, pasted into the admin console, versioned in git. Default allow-all is NOT safe for a server node.
- **Reverse proxy / LB**: Coolify's bundled proxy (Traefik v3.6 — verified live on the VPS as `coolify-proxy|traefik:v3.6`) terminates TLS and routes `api.*` → :3001, `app.*` → :80. No extra proxy on a single VPS. LB deferred (scale lever, documented).
- **Monitoring: Uptime Kuma + Telegram alerts only.** No Prometheus/Grafana (overkill for 3.7GB RAM; 2.27GB available, verified 2026-08-28). Log tracing via Coolify json-file 10m×3 + structured JSON logs.
- **Prod first. No staging** in this wave (staging deferred until prod is proven).
- **Postgres/Redis: keep the existing running containers**, bring them under Ansible-declared Coolify config; add volumes + nightly backup cron. Never recreate (data).
- **Division of labor**: Terraform = host shell + Cloudflare DNS + R2 (rare runs). Ansible = everything inside the box via the Coolify API (apps, env, domains, webhooks, cron, Uptime Kuma, hardening) — runs on every change, fully declarative. GitHub Actions = build/test/push/migrate/deploy/health/rollback.
- Backups to R2 (30-day retention) + pre-migration snapshot in CD.
- Migrations in CD with rollback (backup → migrate → deploy → health → rollback).
- DLQ: **verified wired** (`scheduler.service.ts` `worker.on("failed")` → `cogito-jobs-dlq` queue + bounded `cogito:dlq` Redis list, atomic LPUSH+LTRIM). No gap.
- Scheduler: `SCHEDULER_ENABLED=true` required in prod (env guard, #107). Fail-loud boot (#106).

## 1. Current state (verified 2026-08-27, post-wave)

| Item                 | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main                 | `ca34d9d` — deployment wave merged: **#115 infra scaffold** (Tailscale ACL, Terraform R2/DNS incl. `coolify` record, Ansible playbooks, SOPS scaffold), **#116 DLQ health** (`/health` `dlqDepth`, alert-only), **#117 nightly backups** (`infra/backup.sh` + Ansible cron), **#118 CD pipeline** (`/health` `version` = `GIT_SHA`, webhook guards, `scripts/migrate-and-deploy.sh`)                                                                                                                                                                                            |
| Live API `/health`   | `{"status":"ok","checks":{"database":"ok","redis":"ok"}}` (no `version` yet — new image not deployed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| VPS                  | OVH `15.235.186.159`, 3.7GB RAM (2.27GB available, verified 2026-08-28), UFW active (22/80/443), `PasswordAuthentication no` effective, Coolify + own db/redis healthy, app Postgres/Redis containers running, **`drizzle-gateway` unhealthy (Coolify-internal, not ours)**, **Tailscale NOT installed**                                                                                                                                                                                                                                                                        |
| Deploy Production    | **Runner remediation ready (2026-08-31):** three deploys failed because the GitHub-hosted runner could not resolve the Coolify-private PostgreSQL hostname. Repository runner `cogito-prod` is registered, online, and labelled `production` on the VPS with PostgreSQL client 16 + AWS CLI installed. `cd-prod.yml` is split so image builds remain hosted while backup/migrate/deploy runs on that runner; `scripts/resolve-private-db-url.sh` resolves the current container IP without publishing PostgreSQL. First green production rollout remains to verify after merge. |
| Live env gaps        | **Historical snapshot (pre-apply).** **All wiring confirmed complete by the operator 2026-09-01** — payments (xendit Test Mode + UAT emails), Google Meet, R2, Sanity, backups, and `status.` DNS are live; 47 env vars were applied from the SOPS vault on 2026-08-31.                                                                                                                                                                                                                                                                                                         |
| PR #102              | **Merged (#115)** — Terraform + runbook landed with the infra scaffold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| New env vars to wire | `ADMIN_EMAILS` (default `itcogitoacademy01@gmail.com` — verify this is the operator account)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 2. Target topology (single VPS, declarative, scale-ready)

```
Tailnet (argyavityasy1208@gmail.com)          Cloudflare (DNS + proxy + WAF)
  ├── laptop 100.119.76.120 ──┐                ├── app.cogitoacademy.id → web :80
  ├── iphone 100.107.75.120 ──┤ SSH :22        ├── api.cogitoacademy.id → server :3001
  └── cogito-vps (tag:server) ◄┘ Coolify :8000 └── status.cogitoacademy.id → Uptime Kuma
       │
VPS (OVH 2vCPU/3.7GB/38GB, Ubuntu; ufw: 80/443 public, 22+8000+6001+6002 tailnet-only)
  ├── Coolify (Traefik v3.6 TLS termination; app Postgres 16 + Redis 7 on private network)
  ├── Uptime Kuma (status page + monitors + Telegram)
  ├── Backup cron: nightly pg_dump → R2 (30-day retention) + pre-migration snapshot
  └── GHCR images: ghcr.io/cogitoacademy/app/{server,web}:latest + v<sha>
```

**Declarative layers (git → apply):**

| Layer          | Tool               | Owns                                                                                                                                                                                                 | When it runs                         |
| -------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Host + network | **Terraform**      | VPS bootstrap, Cloudflare DNS records, R2 bucket, state in R2                                                                                                                                        | Rarely (drift check in CI)           |
| Inside the box | **Ansible**        | Tailscale join + ACL, ufw/fail2ban/unattended-upgrades, Coolify install + **resources via Coolify API** (apps, Postgres, Redis, env vars, domains, webhooks), SOPS decrypt, backup cron, Uptime Kuma | Every change (idempotent, diffable)  |
| Secrets        | **SOPS + Age**     | encrypted `infra/secrets/prod.env` in git; decrypted at apply time                                                                                                                                   | —                                    |
| Control plane  | **Tailscale ACL**  | `infra/tailscale/acl.hujson` (committed)                                                                                                                                                             | Pasted into admin console, versioned |
| Code           | **GitHub Actions** | build → test → push → backup → migrate → deploy → health → rollback                                                                                                                                  | Every merge to main                  |

**Not declarative (documented one-time steps):** Google Cloud console (OAuth client), Xendit dashboard (webhook URL + egress IPs), Resend domain verification, and the Coolify webhook UUIDs (generated in the Coolify UI per resource). Their _outputs_ become SOPS vars / GitHub secrets. The webhook's DNS record + Traefik route ARE declarative (Task 0.2) — only the UUID itself is generated by the UI.

---

## Phase 0 — Sync + merge foundation (repo work)

### Task 0.1: Rebase + merge PR #102

- [x] Rebase `docs/production-deployment-runbook` on `origin/main` — **landed as part of #115 (infra scaffold)**; Terraform + runbook merged.
- [x] Fix its stale CI failure (coverage gate at old base), re-run CI until green.
- [x] Squash-merge #102.
- Commit: `chore(infra): merge deployment runbook + terraform bootstrap (#102)` — **merged via #115**

### Task 0.2: Fix Deploy Production (S7) — Option A: expose only the deploy-webhook path (repo + operator)

**Files:** `.github/workflows/cd-prod.yml`, `infra/terraform/main.tf` (DNS record), `infra/ansible/coolify-resources.yml` (Traefik route)

- [x] **DNS (Terraform):** `cl` A record → VPS, proxied — **declared in #115 as `coolify` (`cloudflare_record.coolify`), renamed to `cl` on 2026-08-31** (canonical host now `cl.cogitoacademy.id`). The Coolify UI stays tailnet-only (no other routes exposed).
- [x] **Traefik route (Ansible → Coolify):** route `cl.cogitoacademy.id/api/v1/deploy/*` → Coolify proxy; everything else on that host returns 404/denied. The per-resource UUID in the webhook URL is the bearer secret — never put it in a public doc. **RESOLVED — route live; `COOLIFY_API_TOKEN` supplies the `Authorization: Bearer` header (guarded in `scripts/migrate-and-deploy.sh` + `cd-prod.yml`). Proven end-to-end 2026-09-01: `/health` `version` == main HEAD (`2a4bfad`), web 200.**
- [x] **Secrets:** recreate `COOLIFY_PROD_SERVER_WEBHOOK` + `COOLIFY_PROD_WEBHOOK` with the resolvable URL (`https://cl.cogitoacademy.id/api/v1/deploy?uuid=...`). Keep them in GitHub Actions secrets (this is the deliberate exception; real credentials stay in SOPS). **DONE (2026-09-01 verified — CD green on the resolvable `cl.` host).**
- [x] Guard the Coolify webhook steps (empty secret → clear error, not curl exit 6) — **#118**.
- [x] Add `version` (image sha) to the `/health` response (`apps/server/src/routes.ts` + test) so the poll verifies the **deployed sha**, not just "some container is up" — **#118**.
- [x] Health poll checks `version == <sha>` — **#118** (`scripts/migrate-and-deploy.sh`).
- Commit: `fix(ci): wire Option A webhook path, guard secrets, verify deployed sha` — **merged via #118**

### Task 0.3: Tailscale ACL file — repo work + user console paste

- [x] Create `infra/tailscale/acl.hujson`: `tag:server` owned by admin; members → `tag:server:22,8000,6001,6002`; server egress allowed (app needs outbound); Tailscale SSH `check` for root/nonroot — **#115**.
- [x] User pastes into the admin console (ACL page) — the file stays the source of truth. **CONFIRMED pasted (operator, 2026-09-01).**
- Commit: `chore(infra): declarative tailscale ACL for server node` — **merged via #115**

---

## Operator checklist (2026-08-28 — run in order; each item is a gate for the next)

1. **SOPS vault**: generate the Age keypair, update `.sops.yaml` public key, then encrypt the filled vault:
   ```bash
   sops -e -i infra/secrets/prod.env
   ```
   The vault must include `COOLIFY_API_TOKEN` (Coolify UI → Keys & Tokens → API tokens, `deploy` permission) — the playbook asserts it. Never commit the plaintext.
2. **R2 bucket**: create the bucket + API token in the Cloudflare dashboard (Terraform declares it, but the operator must run `terraform apply` with `CLOUDFLARE_API_TOKEN` + R2 state token first — Task 1.1). Add `R2_*` values to the vault.
3. **Google Meet**: run the OAuth helper locally (`scripts/google-meet-auth.ts`) → `GOOGLE_MEET_REFRESH_TOKEN` → add to the vault. If the OAuth client was published to Google Meet after the last refresh token was issued, **regenerate the refresh token** (a published client invalidates previously issued tokens).
4. **Xendit Test Mode wiring (#120)**: set `XENDIT_MODE=test` + Test Mode `XENDIT_SECRET_KEY`/`XENDIT_WEBHOOK_TOKEN` + `XENDIT_TEST_ALLOWED_EMAILS` (UAT accounts) in the vault. `WEBHOOK_ALLOWED_IPS` stays optional (2026-08-28 decision: Xendit publishes no stable source IP list; the `x-callback-token` signature is the primary gate — a wrong allowlist silently 403s webhooks and payments never credit).
5. **Backup DATABASE_URL host-reachability**: the vault `DATABASE_URL` must resolve from the VPS host (Coolify's Postgres lives on a private Docker network; use `127.0.0.1:<published-port>` or the container IP) — otherwise the nightly backup cron (Task 3.1) and the CD pre-migrate snapshot fail.
6. **Seed packages before real payments**: run the package seed against production once (with `SEED_ALLOWED_IN_PROD` + `SEED_ADMIN_PASSWORD` per the seed guard) so purchasable Mark packages exist before the first real transaction.
7. **Apply the playbooks** — prefer the one-command wrapper (added 2026-08-31 on `ops/apply-tooling`):
   ```bash
   ./infra/apply.sh --dry-run all   # review the full ordered plan first
   ./infra/apply.sh all             # pausing between phases, marker-gated
   ```
   This runs the manual sequence below in runbook order (import → tf-plan →
   tf-apply → tailscale → tailscale-verify → harden → resources →
   backup-cron → verify), skipping completed phases via `infra/.apply-state/`
   markers and refusing to harden until `tailscale-verify` creates its marker.
   The manual commands remain valid:
   ```bash
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/host-hardening.yml --ask-become-pass
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/tailscale.yml --ask-become-pass
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/coolify-resources.yml
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/backup-cron.yml --ask-become-pass
   ```
   `coolify-resources.yml` prints the Traefik dynamic config for the deploy-webhook host — paste it into Coolify UI → Servers → cogito-vps → Proxy → Custom Configuration (the API cannot express it; the playbook's probe verifies the route afterwards).
8. **GitHub secrets**: add `COOLIFY_PROD_SERVER_WEBHOOK` + `COOLIFY_PROD_WEBHOOK` (resolvable `https://cl.cogitoacademy.id/api/v1/deploy?uuid=...` URLs), `PROD_DATABASE_URL`, `R2_*`, and optionally `COOLIFY_API_TOKEN` (enables the Bearer header on the deploy curl — required if the endpoint is in its "Deploy Webhook (auth required)" form per docs/DEPLOYMENT.md §5).
9. **Verify**: `curl -fsS https://api.cogitoacademy.id/health` shows the deployed sha; a `GET https://cl.cogitoacademy.id/api/v1/deploy?uuid=probe` returns 401/405 (route live) not 404 (route missing); public `:8000` refused; app `/health` ok.

---

## Phase 1 — Infrastructure first (network + hardening, all declarative)

### Task 1.1: Terraform — host shell + DNS + R2 (repo work, runs rarely)

- [x] Extend `infra/terraform` (from #102): keep the `terraform_data` bootstrap; add Cloudflare provider records (already-existing `api.`/`app.` become managed, plus `status.` and `coolify.`); R2 bucket for backups + Terraform state backend — **#115** (also fixed the provider source `cloudflare/cloudflare` and R2 `location = "APAC"`).
- [x] `terraform validate` + plan in CI (no apply in CI — operator applies) — **#115** (validate verified locally; CI runs docs+infra).
- Commit: `feat(infra): terraform dns + r2 + state backend` — **merged via #115**
- [x] **Apply** (operator runs `terraform apply` with `CLOUDFLARE_API_TOKEN` + R2 state token) — **DONE 2026-08-31 via `infra/apply.sh` (7 resources in state, zero drift; `.apply-state/tf-imported`).**

### Task 1.2: Ansible — host hardening + Tailscale join (repo work + user auth key)

**Files:** `infra/ansible/` (playbooks, `inventory.ini`, `group_vars/`)

- [x] Playbook `host-hardening.yml` (replaces `provision.sh` ad-hoc bits) — **#115**:
  - ufw: `80/443` from anywhere (Cloudflare-proxied public traffic), `22` + `8000/6001/6002` **from the tailnet CIDR only** (`100.64.0.0/10`)
  - fail2ban sshd jail enabled; unattended-upgrades on; sshd `PasswordAuthentication no`, root key-only for Coolify's internal loopback SSH
  - Docker pinned (no unpinned get.docker.com); verify no host ports except 80/443 public
- [x] Playbook `tailscale.yml` — **#115**: install Tailscale, `tailscale up --authkey={{ ts_auth_key }} --hostname=cogito-vps --advertise-tags=tag:server` — the key lives in the SOPS vault (user pasted `tskey-auth-...`; lead never sees it).
- [ ] Playbook `coolify-resources.yml`: drive the **Coolify API** — re-declare the existing app Postgres/Redis containers (names, volumes, private network), the API + web app resources (image tags, ports, domains, health checks), and all env vars from SOPS. **WRITTEN (2026-08-28) — includes the Task 0.2 Traefik route for the deploy-webhook path (UI fallback + probe) and guarded Bearer support in the CD pipeline; apply pending.**
- Commit: `feat(infra): ansible host hardening, tailscale join, coolify resources` — **scaffold merged via #115; coolify-resources.yml written 2026-08-28 (apply pending)**
- [ ] **Apply** (operator runs `ansible-playbook` with the vault; or via a worker pane with `herd attach` for the vault password).
- [ ] **Verify lock-down**: SSH via tailnet IP works; public `:8000` refused; `coolify` container only reachable via tailnet; app `/health` still ok.

### Task 1.3: Verify existing containers are declared + drift-check

- [ ] Add a `drift-check.yml` playbook (or CI job) that diffs the Coolify API state vs the Ansible-declared state and fails on drift — keeps the UI honest.
- Commit: `feat(infra): coolify drift-check job`

---

## Phase 2 — Component wiring (credentials → live)

### Task 2.1: SOPS vault (repo scaffold + user fills)

- [x] `.sops.yaml` + Age keypair scaffold — **#115** (public key placeholder `CHANGE_ME_OPERATOR_AGE_PUBLIC_KEY`; operator generates the keypair and updates it).
- [x] `infra/secrets/prod.env` (encrypted) with ALL credentials the user has: `BETTER_AUTH_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `ADMIN_EMAILS` (default `itcogitoacademy01@gmail.com` — confirm), `RESEND_API_KEY`+`EMAIL_FROM`, `XENDIT_MODE` + matching Test/Live `XENDIT_SECRET_KEY`/`WEBHOOK_TOKEN`/redirects/`WEBHOOK_ALLOWED_IPS` (and `XENDIT_TEST_ALLOWED_EMAILS` while in Test Mode), `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_MEET_*` (+ refresh token via `scripts/google-meet-auth.ts`), `R2_*`+`R2_PUBLIC_URL`+`R2_BACKUP_BUCKET`, `SANITY_*`, `METRICS_TOKEN`, `DATABASE_URL`/`REDIS_URL` (existing containers). **DONE 2026-08-28** — 44 keys filled + encrypted + committed (r2-split PR #122)
- Commit: `chore(secrets): add SOPS vault scaffold` (encrypted only) — **scaffold merged via #115**

### Task 2.2: Apply env + wire providers (Ansible → Coolify; operator confirms console bits)

- [x] Ansible applies the decrypted vault to the API resource env (incl. `NODE_ENV=production`, `SCHEDULER_ENABLED=true`, `TRUST_PROXY=true`, `DB_SSL_ENABLED=false`, `BETTER_AUTH_URL=https://api.cogitoacademy.id`, `CORS_ORIGIN=https://app.cogitoacademy.id`). **DONE 2026-08-31 — 47 env vars applied (fail-loud + async-queue-aware restart, #146/#147).**
- [x] Add `COOLIFY_PROD_SERVER_WEBHOOK`/`COOLIFY_PROD_WEBHOOK` as GH secrets (from Coolify resource webhooks) — unblocks S7. **DONE (all 8 secrets set 2026-08-28; recreated on the `cl.` host; CD verified green 2026-09-01).**
- [x] Repo fix: keep production session cookies `SameSite=Strict` while overriding Better Auth's short-lived OAuth state cookie to `SameSite=Lax`, so the Google top-level callback can complete state verification without disabling CSRF checks (2026-08-31).
- [x] Google OAuth: verify `/api/auth/callback/google` redirect URI in console. **DONE (env live, operator-confirmed 2026-09-01).**
- [x] Google Meet: run the OAuth helper locally → `GOOGLE_MEET_REFRESH_TOKEN` → verify boot probe. **DONE (env live, operator-confirmed 2026-09-01; boot probe green on deploys).**
- [x] R2: uploads now land in R2 (env guard requires all vars in prod — verified). **DONE (operator-confirmed 2026-09-01).**
- [x] Sanity: verify `content.listCompetitions` + KB file proxy against live CDN. **DONE (env live, operator-confirmed 2026-09-01).**
- [x] Xendit: deploy with `PAYMENT_PROVIDER=xendit` + `XENDIT_MODE=test` + matching Test Mode credentials + UAT email/IP allowlists first; **production-domain sandbox E2E, then switch to Live Mode for one real small transaction** (RUNBOOK checklist). **Test Mode wiring DONE (operator-confirmed 2026-09-01). Remaining go-live step: Live Mode E2E (one real small transaction).**
- [x] Redeploy; verify `/health` + deployed sha. **DONE 2026-09-01 — `/health` `version` == main HEAD.**

---

## Phase 3 — Backups + CD pipeline

### Task 3.1: Nightly backup → R2 (repo script + Ansible cron)

- [x] `infra/backup.sh`: `pg_dump -Fc` via the Coolify Postgres container → gzip → R2 (`backups/$(date +%F).sql.gz`) → prune 30 days — **#117**.
- [x] Ansible installs the cron (nightly 02:00 WIB) — **#117** (`infra/ansible/backup-cron.yml`). Restore drill documented in RUNBOOK.
- Commit: `feat(ops): nightly postgres backup to R2 with retention` — **merged via #117**
- [x] **Apply** the cron playbook on the VPS (operator; needs SOPS vault + host-reachable `DATABASE_URL`). **DONE 2026-08-31 — nightly 02:00 WIB cron installed (`/etc/cogito/backup.env`, 30-day retention).**

### Task 3.2: Migration strategy in CD (repo work)

- [x] Pre-deploy step in `cd-prod.yml`: `pg_dump` snapshot → R2 (`pre-migrate-<sha>`) → `bun run db:migrate` (prod `DATABASE_URL` from secret) → Coolify deploy → health poll (sha-verified) — **#118** (`scripts/migrate-and-deploy.sh`).
- [x] On health failure: rollback to previous `v<sha>`; migration failure → restore snapshot manually under a maintenance window (never blind-auto-restore with live traffic) — **#118** (rollback hint names `v<prev-sha>` + R2 snapshot key).
- [x] Migration ordering: additive-only in a release; destructive steps are two-step.
- Commit: `feat(ci): backup + migrate + deploy + health + rollback pipeline` — **merged via #118**
- [x] **Secrets (operator):** add `PROD_DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET` as GitHub Actions secrets; recreate the Coolify webhook secrets with the resolvable URL. **DONE 2026-08-28** — all 8 GitHub secrets set (webhook URLs + API token + DB URL + R2 creds); live-verified 2026-09-01 (CD green).

---

## Phase 4 — Monitoring + security + docs

### Task 4.1: Uptime Kuma (Ansible-declared Coolify service)

- [ ] Deploy `louislam/uptime-kuma:1` (port 3002 host), domain `status.cogitoacademy.id` (DNS record from Terraform), volume, Telegram notifications → both operators.
- [ ] Monitors: `api./health` (60s), `app.` (60s), HTTPS cert expiry.
- [ ] Log rotation 10m×3 verified on all resources (Coolify json-file).

### Task 4.2: Security pass (verify on the live box)

- [ ] ufw/fail2ban/sshd verified; Coolify UI tailnet-only; GHCR tokens rotated; GitHub secret scanning on; SOPS private key off-repo.
- [ ] Resource-access map (OVH, Cloudflare, Google, GitHub, Resend, Xendit, Sanity, Tailscale) with owner + rotation path → RUNBOOK.

### Task 4.3: Docs (AGENTS.md rule 11)

- [ ] `docs/DEPLOYMENT.md` updated: new pipeline, Tailscale control plane, Ansible layout, drills.
- [ ] `docs/RUNBOOK.md`: incident sections (crash, DB failure, disk, cert, dependency, rollback, restore) + component inventory (every container/port/DNS/env/cron with owner).
- [ ] `docs/CONTEXT.md` + `docs/plans/README.md`: topology + live state + this plan row.

---

## Phase 5 — Drills (deferred to the next dedicated operator session — documented 2026-09-01)

> The deploy drill is already satisfied in practice: every merge to main runs
> the full CD chain and 2026-09-01 proved it green end-to-end (sha-verified).
> The remaining drills are one operator session, top to bottom:

1. **Deploy drill** — merge trivial change → CI green → CD green → `/health` + sha verified. _(Effectively continuous; verify once explicitly per the checklist.)_
2. **Rollback drill** — point Coolify at previous `v<sha>` (or re-run the CD script's auto-rollback path with `COOLIFY_API_TOKEN` set) → `/health` shows the previous sha.
3. **Backup-restore drill** — restore the newest nightly `pg_dump -Fc` from `cogito-backups` into a scratch DB, verify table counts (RUNBOOK restore procedure).
4. **Tailscale drill** — laptop+phone SSH to the VPS via tailnet; public `:8000` refused (ACL now pasted in the admin console — confirmed 2026-09-01).
5. **Monitoring drill** — after the operator wires Kuma monitors + `DISCORD_WEBHOOK_URL`: kill a container and confirm the Discord alert posts (MONITORING-ALERTING exit gate).

## Exit gates

- Phase 1: ufw/tailnet lock-down verified; Coolify UI unreachable publicly; app `/health` ok. **DONE — applied 2026-08-31 (Tailscale joined+verified, hardened; ACL pasted, confirmed 2026-09-01).**
- Phase 2: `/health` + sha ok with full env; production-domain Xendit Test Mode UAT → Live Mode E2E; Meet probe ok; R2 round-trip ok. **Env wiring confirmed complete by the operator (2026-09-01: payments/Meet/R2/Sanity all live; `/health` sha-verified). Live Mode E2E (real transaction) remains the Xendit go-live step.**
- Phase 3: nightly backup runs + restores (drill); CD migrate→deploy→rollback drill green. **Scripts merged (#117/#118) + active live (cron installed; CD green); restore/rollback drills remain (Phase 5, next operator session).**
- Phase 4: Uptime Kuma live + Telegram alert (kill-container drill); security checklist; docs current. **Pending.**
- Every PR: CI green (`gh pr checks --watch`). **Held for the wave's 4 PRs (#115–#118).**

## Risks

- **RAM (3.7GB)**: skip Prometheus (locked); monitor `free -m` after each phase; if <500MB free, defer Uptime Kuma to a tiny external host (documented fallback).
- **GitHub Actions quota**: repo public; if it binds, self-hosted runner on the VPS (documented in #102).
- **Xendit go-live**: production can stay on Test Mode during UAT, restricted by `XENDIT_TEST_ALLOWED_EMAILS`; switch to Live Mode only after sandbox E2E and then run one real small transaction.
- **Gmail refresh token expiry**: documented re-auth (RUNBOOK).
- **Migration in CD**: never auto-restore with live traffic; snapshot is the recovery artifact under a maintenance window.
- **Ansible→Coolify API**: Coolify API surface may lag UI features; fall back to UI + drift-check for anything the API can't express (documented per resource).
