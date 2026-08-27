# Deployment Plan — Single-Server Production Readiness (rev. 2)

| Field       | Value                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status      | Active                                                                                                                                                                                     |
| Created     | 2026-08-26 (rev. 2: 2026-08-27 — Tailscale control plane, Uptime Kuma only, prod-first, no staging, Ansible replaces provision.sh)                                                         |
| Branch      | `deploy/production-readiness`                                                                                                                                                              |
| Depends on  | PR #106, #107 (merged); PR #102 (Terraform + runbook, **needs rebase + CI re-run**); main synced to `1636cf6` (13 new commits incl. #108 contact sharing, admin bootstrap, migration 0030) |
| Scope       | Infrastructure first (network + hardening, fully declarative), then component wiring (credentials, env, backups, CD, monitoring)                                                           |
| Credentials | **User has all credentials ready** (R2, API tokens, etc.). Tailscale auth key provided. Secrets go into SOPS (encrypted in git) / Coolify env via Ansible; the lead never types secrets.   |

## 0. Locked decisions (confirmed with user)

- **Control plane: Tailscale** (not CF Zero Trust). VPS joins the existing tailnet (`argyavityasy1208@gmail.com`, `tail674634.ts.net`). Coolify UI + SSH reachable **only** via tailnet. No `coolify.*` DNS record at all.
- **Deploy trigger: Option A — expose ONLY the Coolify deploy-webhook path publicly** (decided 2026-08-27). The CI pipeline (GitHub Actions, cloud-hosted) cannot reach a tailnet-only Coolify. Instead of opening the whole Coolify UI, add a DNS record + Caddy route for `coolify.cogitoacademy.id/api/v1/deploy/*` only. The URL contains a per-resource UUID that acts as the bearer secret; nothing else on the domain is exposed, and the Coolify UI itself stays tailnet-only. This is Coolify's standard deployment model. (Rejected Option B: SSH-from-Actions deploy key — more moving parts, no public surface; kept as documented fallback.)
- **Tailscale ACL is declarative**: committed `infra/tailscale/acl.hujson`, pasted into the admin console, versioned in git. Default allow-all is NOT safe for a server node.
- **Reverse proxy / LB**: Coolify's bundled proxy (Caddy) terminates TLS and routes `api.*` → :3001, `app.*` → :80. No extra proxy on a single VPS. LB deferred (scale lever, documented).
- **Monitoring: Uptime Kuma + Telegram alerts only.** No Prometheus/Grafana (overkill for 3.7GB RAM; 318MB free now). Log tracing via Coolify json-file 10m×3 + structured JSON logs.
- **Prod first. No staging** in this wave (staging deferred until prod is proven).
- **Postgres/Redis: keep the existing running containers**, bring them under Ansible-declared Coolify config; add volumes + nightly backup cron. Never recreate (data).
- **Division of labor**: Terraform = host shell + Cloudflare DNS + R2 (rare runs). Ansible = everything inside the box via the Coolify API (apps, env, domains, webhooks, cron, Uptime Kuma, hardening) — runs on every change, fully declarative. GitHub Actions = build/test/push/migrate/deploy/health/rollback.
- Backups to R2 (30-day retention) + pre-migration snapshot in CD.
- Migrations in CD with rollback (backup → migrate → deploy → health → rollback).
- DLQ: **verified wired** (`scheduler.service.ts` `worker.on("failed")` → `cogito-jobs-dlq` queue + bounded `cogito:dlq` Redis list, atomic LPUSH+LTRIM). No gap.
- Scheduler: `SCHEDULER_ENABLED=true` required in prod (env guard, #107). Fail-loud boot (#106).

## 1. Current state (verified 2026-08-27)

| Item                 | State                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main                 | synced to `1636cf6` — 13 commits ahead of the last wave: **#108 consent-based contact sharing (migration 0030)**, admin bootstrap (`ADMIN_EMAILS` env var, default `itcogitoacademy01@gmail.com`), tutor fallback meeting links, booking/e2e hardening                                                                                                                               |
| Live API `/health`   | `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`                                                                                                                                                                                                                                                                                                                            |
| VPS                  | OVH `15.235.186.159`, 3.7GB RAM (318MB free / 2.3GB available), UFW active (22/80/443), `PasswordAuthentication no` effective, Coolify + own db/redis healthy, app Postgres/Redis containers running, **`drizzle-gateway` unhealthy (Coolify-internal, not ours)**, **Tailscale NOT installed**                                                                                      |
| Deploy Production    | **Diagnosed 2026-08-27 (S7):** failing on every push — `curl exit 6 "Could not resolve host"`. The `COOLIFY_PROD_SERVER_WEBHOOK`/`COOLIFY_PROD_WEBHOOK` secrets EXIST since 2026-08-24, but the webhook URL inside points at `coolify.cogitoacademy.id`, which has NO DNS record (control plane is tailnet-only) → GitHub Actions (cloud) cannot resolve it. Fix = Option A (below). |
| Live env gaps        | `PAYMENT_PROVIDER=stub`, no Google/R2/Sanity vars, no backups, no monitoring, no status DNS                                                                                                                                                                                                                                                                                          |
| PR #102              | OPEN, CONFLICTING, CI stale-base failure                                                                                                                                                                                                                                                                                                                                             |
| New env vars to wire | `ADMIN_EMAILS` (default `itcogitoacademy01@gmail.com` — verify this is the operator account)                                                                                                                                                                                                                                                                                         |

## 2. Target topology (single VPS, declarative, scale-ready)

```
Tailnet (argyavityasy1208@gmail.com)          Cloudflare (DNS + proxy + WAF)
  ├── laptop 100.119.76.120 ──┐                ├── app.cogitoacademy.id → web :80
  ├── iphone 100.107.75.120 ──┤ SSH :22        ├── api.cogitoacademy.id → server :3001
  └── cogito-vps (tag:server) ◄┘ Coolify :8000 └── status.cogitoacademy.id → Uptime Kuma
       │
VPS (OVH 2vCPU/3.7GB/38GB, Ubuntu; ufw: 80/443 public, 22+8000+6001+6002 tailnet-only)
  ├── Coolify (Caddy TLS termination; app Postgres 16 + Redis 7 on private network)
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

**Not declarative (documented one-time steps):** Google Cloud console (OAuth client), Xendit dashboard (webhook URL + egress IPs), Resend domain verification, and the Coolify webhook UUIDs (generated in the Coolify UI per resource). Their _outputs_ become SOPS vars / GitHub secrets. The webhook's DNS record + Caddy route ARE declarative (Task 0.2) — only the UUID itself is generated by the UI.

---

## Phase 0 — Sync + merge foundation (repo work)

### Task 0.1: Rebase + merge PR #102

- [ ] Rebase `docs/production-deployment-runbook` on `origin/main` (now 13 commits ahead — expect conflicts in `docs/`; resolve to the merged state).
- [ ] Fix its stale CI failure (coverage gate at old base), re-run CI until green.
- [ ] Squash-merge #102.
- Commit: `chore(infra): merge deployment runbook + terraform bootstrap (#102)`

### Task 0.2: Fix Deploy Production (S7) — Option A: expose only the deploy-webhook path (repo + operator)

**Files:** `.github/workflows/cd-prod.yml`, `infra/terraform/main.tf` (DNS record), `infra/ansible/coolify-resources.yml` (Caddy route)

- [ ] **DNS (Terraform):** add `coolify` A record → VPS, proxied (Cloudflare) — needed ONLY so GitHub Actions can reach the webhook path. The Coolify UI stays tailnet-only (no other routes exposed).
- [ ] **Caddy route (Ansible → Coolify):** route `coolify.cogitoacademy.id/api/v1/deploy/*` → Coolify proxy; everything else on that host returns 404/denied. The per-resource UUID in the webhook URL is the bearer secret — never put it in a public doc.
- [ ] **Secrets:** recreate `COOLIFY_PROD_SERVER_WEBHOOK` + `COOLIFY_PROD_WEBHOOK` with the resolvable URL (`https://coolify.cogitoacademy.id/api/v1/deploy?uuid=...`). Keep them in GitHub Actions secrets (this is the deliberate exception; real credentials stay in SOPS).
- [ ] Guard the Coolify webhook steps (empty secret → clear error, not curl exit 6).
- [ ] Add `version` (image sha) to the `/health` response (`apps/server/src/routes.ts` + test) so the poll verifies the **deployed sha**, not just "some container is up".
- [ ] Health poll checks `version == <sha>`.
- Commit: `fix(ci): wire Option A webhook path, guard secrets, verify deployed sha`

### Task 0.3: Tailscale ACL file — repo work + user console paste

- [ ] Create `infra/tailscale/acl.hujson`: `tag:server` owned by admin; members → `tag:server:22,8000,6001,6002`; server egress allowed (app needs outbound); Tailscale SSH `check` for root/nonroot.
- [ ] User pastes into the admin console (ACL page) — the file stays the source of truth.
- Commit: `chore(infra): declarative tailscale ACL for server node`

---

## Phase 1 — Infrastructure first (network + hardening, all declarative)

### Task 1.1: Terraform — host shell + DNS + R2 (repo work, runs rarely)

- [ ] Extend `infra/terraform` (from #102): keep the `terraform_data` bootstrap; add Cloudflare provider records (already-existing `api.`/`app.` become managed, plus `status.`); R2 bucket for backups + Terraform state backend.
- [ ] `terraform validate` + plan in CI (no apply in CI — operator applies).
- Commit: `feat(infra): terraform dns + r2 + state backend`

### Task 1.2: Ansible — host hardening + Tailscale join (repo work + user auth key)

**Files:** `infra/ansible/` (playbooks, `inventory.ini`, `group_vars/`)

- [ ] Playbook `host-hardening.yml` (replaces `provision.sh` ad-hoc bits):
  - ufw: `80/443` from anywhere (Cloudflare-proxied public traffic), `22` + `8000/6001/6002` **from the tailnet CIDR only** (`100.64.0.0/10`)
  - fail2ban sshd jail enabled; unattended-upgrades on; sshd `PasswordAuthentication no`, root key-only for Coolify's internal loopback SSH
  - Docker pinned (no unpinned get.docker.com); verify no host ports except 80/443 public
- [ ] Playbook `tailscale.yml`: install Tailscale, `tailscale up --authkey={{ ts_auth_key }} --hostname=cogito-vps --advertise-tags=tag:server` — the key lives in the SOPS vault (user pasted `tskey-auth-...`; lead never sees it).
- [ ] Playbook `coolify-resources.yml`: drive the **Coolify API** — re-declare the existing app Postgres/Redis containers (names, volumes, private network), the API + web app resources (image tags, ports, domains, health checks), and all env vars from SOPS.
- Commit: `feat(infra): ansible host hardening, tailscale join, coolify resources`
- [ ] **Apply** (operator runs `ansible-playbook` with the vault; or via a worker pane with `herd attach` for the vault password).
- [ ] **Verify lock-down**: SSH via tailnet IP works; public `:8000` refused; `coolify` container only reachable via tailnet; app `/health` still ok.

### Task 1.3: Verify existing containers are declared + drift-check

- [ ] Add a `drift-check.yml` playbook (or CI job) that diffs the Coolify API state vs the Ansible-declared state and fails on drift — keeps the UI honest.
- Commit: `feat(infra): coolify drift-check job`

---

## Phase 2 — Component wiring (credentials → live)

### Task 2.1: SOPS vault (repo scaffold + user fills)

- [ ] `.sops.yaml` + Age keypair (user generates; public key committed; private key off-repo).
- [ ] `infra/secrets/prod.env` (encrypted) with ALL credentials the user has: `BETTER_AUTH_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `ADMIN_EMAILS` (default `itcogitoacademy01@gmail.com` — confirm), `RESEND_API_KEY`+`EMAIL_FROM`, `XENDIT_MODE` + matching Test/Live `XENDIT_SECRET_KEY`/`WEBHOOK_TOKEN`/redirects/`WEBHOOK_ALLOWED_IPS` (and `XENDIT_TEST_ALLOWED_EMAILS` while in Test Mode), `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_MEET_*` (+ refresh token via `scripts/google-meet-auth.ts`), `R2_*`+`R2_PUBLIC_URL`, `SANITY_*`, `METRICS_TOKEN`, `DATABASE_URL`/`REDIS_URL` (existing containers).
- Commit: `chore(secrets): add SOPS vault scaffold` (encrypted only)

### Task 2.2: Apply env + wire providers (Ansible → Coolify; operator confirms console bits)

- [ ] Ansible applies the decrypted vault to the API resource env (incl. `NODE_ENV=production`, `SCHEDULER_ENABLED=true`, `TRUST_PROXY=true`, `DB_SSL_ENABLED=false`, `BETTER_AUTH_URL=https://api.cogitoacademy.id`, `CORS_ORIGIN=https://app.cogitoacademy.id`).
- [ ] Add `COOLIFY_PROD_SERVER_WEBHOOK`/`COOLIFY_PROD_WEBHOOK` as GH secrets (from Coolify resource webhooks) — unblocks S7.
- [ ] Google OAuth: verify `/api/auth/callback/google` redirect URI in console.
- [ ] Google Meet: run the OAuth helper locally → `GOOGLE_MEET_REFRESH_TOKEN` → verify boot probe.
- [ ] R2: uploads now land in R2 (env guard requires all vars in prod — verified).
- [ ] Sanity: verify `content.listCompetitions` + KB file proxy against live CDN.
- [ ] Xendit: deploy with `PAYMENT_PROVIDER=xendit` + `XENDIT_MODE=test` + matching Test Mode credentials + UAT email/IP allowlists first; **production-domain sandbox E2E, then switch to Live Mode for one real small transaction** (RUNBOOK checklist).
- [ ] Redeploy; verify `/health` + deployed sha.

---

## Phase 3 — Backups + CD pipeline

### Task 3.1: Nightly backup → R2 (repo script + Ansible cron)

- [ ] `infra/backup.sh`: `pg_dump` via the Coolify Postgres container → gzip → R2 (`backups/$(date +%F).sql.gz`) → prune 30 days.
- [ ] Ansible installs the cron (nightly 02:00 WIB). Document restore drill in RUNBOOK.
- Commit: `feat(ops): nightly postgres backup to R2 with retention`

### Task 3.2: Migration strategy in CD (repo work)

- [ ] Pre-deploy step in `cd-prod.yml`: `pg_dump` snapshot → R2 (`pre-migrate-<sha>`) → `bun run db:migrate` (prod `DATABASE_URL` from secret) → Coolify deploy → health poll (sha-verified).
- [ ] On health failure: rollback to previous `v<sha>`; migration failure → restore snapshot manually under a maintenance window (never blind-auto-restore with live traffic).
- [ ] Migration ordering: additive-only in a release; destructive steps are two-step.
- Commit: `feat(ci): backup + migrate + deploy + health + rollback pipeline`

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

## Phase 5 — Drills

- [ ] Deploy drill: merge trivial change → CI green → CD green → `/health` + sha verified.
- [ ] Rollback drill: point Coolify at previous `v<sha>` → `/health` ok.
- [ ] Backup-restore drill: restore nightly backup into scratch DB, verify counts.
- [ ] Tailscale drill: laptop+phone SSH to VPS via tailnet; public `:8000` refused.

## Exit gates

- Phase 1: ufw/tailnet lock-down verified; Coolify UI unreachable publicly; app `/health` ok.
- Phase 2: `/health` + sha ok with full env; production-domain Xendit Test Mode UAT → Live Mode E2E; Meet probe ok; R2 round-trip ok.
- Phase 3: nightly backup runs + restores (drill); CD migrate→deploy→rollback drill green.
- Phase 4: Uptime Kuma live + Telegram alert (kill-container drill); security checklist; docs current.
- Every PR: CI green (`gh pr checks --watch`).

## Risks

- **RAM (3.7GB)**: skip Prometheus (locked); monitor `free -m` after each phase; if <500MB free, defer Uptime Kuma to a tiny external host (documented fallback).
- **GitHub Actions quota**: repo public; if it binds, self-hosted runner on the VPS (documented in #102).
- **Xendit go-live**: production can stay on Test Mode during UAT, restricted by `XENDIT_TEST_ALLOWED_EMAILS`; switch to Live Mode only after sandbox E2E and then run one real small transaction.
- **Gmail refresh token expiry**: documented re-auth (RUNBOOK).
- **Migration in CD**: never auto-restore with live traffic; snapshot is the recovery artifact under a maintenance window.
- **Ansible→Coolify API**: Coolify API surface may lag UI features; fall back to UI + drift-check for anything the API can't express (documented per resource).
