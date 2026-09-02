# Infrastructure Knowledge Sync — Verification Report

> Written 2026-08-28. The user's mental model, verified/corrected against the
> actual code and plans. Each section: **your statement → verdict → the
> precise reality**.

---

## 1. "Code changes → automatically deployed via CI/CD, Coolify changes the image tag and rebuilds the container"

**Verdict: mostly right, two precision fixes.**

The flow, precisely:

```
merge to main
  → ci.yml: lint, typecheck, build, test + coverage (100% gate)
  → cd-prod.yml (GitHub Actions, NOT Coolify):
      1. builds the server image with --build-arg GIT_SHA=<sha> (baked into
         the image as ENV GIT_SHA) → pushes ghcr.io/.../server:latest + v<sha>
      2. builds the web image (static nginx serving built assets) → same tags
      3. scripts/migrate-and-deploy.sh:
         pg_dump snapshot → R2 → db:migrate → POST the Coolify deploy webhook
         → poll /health until version == <sha> (20×15s) → rollback hint on fail
      4. triggers the web resource webhook
```

**Correction A — "Coolify changes the image tag and rebuilds":** the image is
**built in GitHub Actions**, not on the VPS. Coolify's job is only to **pull
the new `latest` image from GHCR and recreate the container** when the webhook
fires. The `v<sha>` tag is never "switched to" — it exists purely as the
**rollback target** (Coolify's "Rollback to previous release" points the
resource back at the previous image). The web container isn't "rebuilt"
either — it's a static nginx serving pre-built assets; a deploy just swaps
the files.

**Correction B — "automatically":** only **merges to main** deploy. PRs run
CI but never touch production. And the deploy is only "green" when the new
image actually reports its sha via `/health` — a deploy that doesn't come up
fails loudly with a rollback hint, it doesn't silently pass.

---

## 2. "Env/infra changes → I apply manually; CI could check (plan-only)"

**Verdict: right. One word fix: "rebuilt" → "reconciled".**

- **Terraform** (DNS, R2 buckets, host bootstrap) — you run `terraform apply`
  from your machine, rarely. It **diffs** state vs. config and applies only
  what changed. Nothing is "rebuilt".
- **Ansible** (hardening, Tailscale, Coolify resources, env, cron, Uptime
  Kuma) — you run `ansible-playbook` from your machine, on every change.
  Idempotent: it **reconciles** the VPS/Coolify to the declared state and
  touches only what drifted. Containers are recreated only when their config
  actually changed.
- **Your plan-only CI suggestion is good and I recommend adding it** to the
  deployment plan as a follow-up task: a CI job running `terraform plan` +
  `ansible-playbook --check` with **read-only** credentials (no Age key, no
  write tokens). It gives you the audit trail in CI while the private key and
  the real apply stay on your machine. (Why not full apply in CI: the Age
  private key must never touch CI — anyone with repo access could decrypt the
  whole vault — and SSH is tailnet-only, which GitHub runners can't reach.)

---

## 3. "Secrets: GitHub secrets for CD, SOPS prod.env for Coolify app secrets"

**Verdict: right, with one expansion.**

| Store                                                       | What lives there                                                                                                                                                                 | Who reads it                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **GitHub Actions secrets**                                  | `COOLIFY_PROD_SERVER_WEBHOOK`, `COOLIFY_PROD_WEBHOOK`, `COOLIFY_API_TOKEN`, `PROD_DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET` | Only the CD pipeline (deliberate exception — CI can't read your vault)    |
| **SOPS vault** (`infra/secrets/prod.env`, encrypted in git) | The app's runtime env **plus** operator-time credentials: `TS_AUTH_KEY` (Tailscale join), R2 creds for the backup cron, `DATABASE_URL` for backups                               | Decrypted only on your machine at apply time → piped into the Coolify API |
| **On the VPS**                                              | `/etc/cogito/backup.env` (root:root 0600) — a decrypted copy of the vault values the nightly cron needs                                                                          | The cron, unattended (documented deliberate exception)                    |

So the vault is not _only_ "Coolify app secrets" — it's "everything the
operator needs at apply time, including the app env". The GitHub secrets are
the one place real credentials live outside SOPS, and the plan documents that
as a deliberate exception.

---

## 4. "Redis, DB, and 3rd parties are declaratively built; we just wire env vars"

**Verdict: needs a three-way split — "built", "declared", and "external".**

| Component                          | Built by us?                                                                                                                                                                                                  | Declared in git?                                                                                                     | Wired via env?                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Postgres 16 + Redis 7**          | **No — they already exist** as running Coolify containers. The plan explicitly says: _"keep the existing running containers, bring them under Ansible-declared Coolify config... **Never recreate (data)**."_ | Yes — Ansible re-declares them (names, volumes, private network) so drift-check can verify the UI matches the config | Yes — `DATABASE_URL` / `REDIS_URL` |
| **R2 buckets**                     | **Yes** — Terraform creates `cogito-infra-state` (state) + `cogito-backups` (private dumps) + `cogito-bucket` (public uploads, `r2bucket.cogitoacademy.id` custom domain)                                     | Yes                                                                                                                  | Yes — R2 creds                     |
| **DNS records**                    | **Yes** — Terraform owns `api.`/`app.`/`status.`/`coolify.`                                                                                                                                                   | Yes                                                                                                                  | n/a                                |
| **Xendit, Resend, Google, Sanity** | **No — external SaaS**, nothing to build                                                                                                                                                                      | No — their _outputs_ (keys, webhook URLs, redirect URIs) become vault/GitHub values                                  | Yes — that's the whole wiring      |
| **Tailscale**                      | Yes — join playbook + declarative ACL                                                                                                                                                                         | Yes                                                                                                                  | `TS_AUTH_KEY` (one-time)           |

The important distinction: **"declared" ≠ "built"**. The DB/Redis were born
in the Coolify UI (one-time control-plane operation); Ansible's job is to
_re-declare_ them so the state is reproducible and drift-checkable — not to
create them. Recreating them would destroy data, which is why the plan
forbids it.

---

## 5. "The code is resilient and handles all failure scenarios — impossible for stale state or dead data"

**Verdict: the strongest overstatement in your list. Correct it to:**
_"the code is designed to fail loudly, retry safely, and leave audit trails
so a human can reconcile — it does NOT make stale state or dead data
impossible."_

What's genuinely true (verified in code):

- **Atomicity**: wallet balance + ledger in one transaction; booking state +
  holds in one transaction; optimistic locking (`version` column) on
  read-then-write paths.
- **Idempotency**: booking creation and webhook processing are idempotency-
  keyed (120s claim + 24h processed record).
- **Retries with backoff**: all 6 scheduler jobs (attempts: 3), webhook
  transient failures (5xx → provider retries), circuit breakers on email/
  meet/xendit.
- **Fail-loud boot**: env schema refuses to boot with partial/missing prod
  config; scheduler refuses to boot without Redis; Meet probe logs loudly.
- **DLQ**: failed jobs land in `cogito-jobs-dlq` + bounded Redis list.

What's **not** true — the honest gaps:

| Gap                            | Reality                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **In-memory fallbacks**        | If Redis fails at runtime, idempotency/rate-limit/circuit-breaker fall back to per-process in-memory stores — they degrade cross-instance guarantees (documented in CONTEXT.md). Not "impossible to have stale state" — a _degraded mode_. |
| **Refund reconciliation (H4)** | When a REFUNDED webhook arrives and Marks are already spent, the code **does not auto-fix** — it writes a `refund_record` + audit row for **manual admin reconciliation**. Deliberate: money decisions are human decisions.                |
| **DLQ is alert-only**          | Failed jobs sit in the DLQ until a human investigates. No auto-replay (repeatable jobs re-fire on cadence anyway).                                                                                                                         |
| **Data loss window**           | Nightly full snapshots only — **up to 24h of data loss** on a disaster restore. No WAL archiving / point-in-time recovery (deliberate scope decision).                                                                                     |
| **Migrations**                 | No automatic rollback. Manual down-SQL (documented in RUNBOOK), never blind-auto-restore over live traffic.                                                                                                                                |
| **Webhook out-of-order**       | Handled (idempotency + status mapping), but the reconciliation cases above still need a human.                                                                                                                                             |

The design philosophy is: **fail loud, never silently degrade, leave an audit
trail, and make the human's reconciliation path explicit.** That's the right
posture for a money-handling app — but it's not "impossible for dead data".

---

## 6. Networking deep dive (your point 6)

### 6.1 The request flow — one correction: Traefik is a reverse proxy, NOT a load balancer

```
User browser
  → Cloudflare edge (anycast IPs; DNS + proxy + WAF + TLS to the user)
  → Cloudflare → origin: https://15.235.186.159:443 (the VPS's public IP)
  → Traefik (Coolify's bundled proxy, terminates TLS, routes by HOSTNAME):
       api.cogitoacademy.id    → server container :3001
       app.cogitoacademy.id    → web nginx container :80
       status.cogitoacademy.id → Uptime Kuma
       cl.cogitoacademy.id→ ONLY /api/v1/deploy/* → Coolify backend
  → container → Postgres/Redis on the private Docker network
```

**"Load balancer" is wrong** — there is exactly **one** VPS and one Traefik.
Traefik is a **reverse proxy** (routes by hostname, terminates TLS). Load
balancing is explicitly deferred (documented scale lever in the plan). If you
ever add a second node, that's when an LB appears.

### 6.2 NAT, IPs, and ports — the full map

**Public IP:** `15.235.186.159` (OVH). This is the _only_ public address. All
public traffic enters here.

**Docker NAT (the key concept):** containers live on a private Docker network
(e.g. `172.x.x.x` or Coolify's network). They have **no public IP**. Docker's
iptables MASQUERADE does NAT in both directions:

- **Inbound**: Traefik (a container itself) listens on the host's published
  ports and proxies to container IPs on the private network. Nothing else on
  the host is published.
- **Outbound**: containers share the host's public IP via NAT. **This is why
  `WEBHOOK_ALLOWED_IPS` matters** — when Xendit's webhook arrives, the server
  checks the _client_ IP; and when the server calls Xendit, Xendit sees the
  VPS's egress IP. Both are the same public IP.

**Tailscale NAT (the second NAT):** Tailscale assigns addresses in
`100.64.0.0/10` (CGNAT range, RFC 6598 — reserved for carrier-grade NAT, which
is why it's safe to use privately). Your devices:

| Device                         | Tailscale IP     | Role                         |
| ------------------------------ | ---------------- | ---------------------------- |
| Laptop                         | `100.119.76.120` | Operator — SSH + Coolify UI  |
| iPhone                         | `100.107.75.120` | Operator — SSH + status page |
| VPS (`cogito-vps`, tag:server) | `100.x.y.z`      | The server node              |

Traffic between them is **WireGuard-encrypted** (Tailscale's protocol). The
"NAT" part: your laptop is behind your home router's NAT — Tailscale punches
through it (STUN + DERP relays when direct connection fails) so the VPS can
reach your laptop and vice versa, without any port forwarding on your router.
The VPS's SSH/Coolify ports are bound to the tailnet interface, so they're
reachable _only_ from `100.64.0.0/10` — invisible to the public internet.

**The port table (who listens where):**

| Port             | Listener                 | Reachable from                                | Purpose                                   |
| ---------------- | ------------------------ | --------------------------------------------- | ----------------------------------------- |
| 80, 443          | Traefik (host-published) | **Public** (Cloudflare-proxied)               | TLS termination, all domains              |
| 22               | sshd                     | **Tailnet only**                              | Operator SSH                              |
| 8000, 6001, 6002 | Coolify                  | **Tailnet only**                              | Coolify UI + realtime                     |
| 3001             | API container            | **Private Docker network only** (via Traefik) | The API                                   |
| 80               | web nginx container      | **Private network only** (via Traefik)        | Static frontend                           |
| 5432, 6379       | Postgres/Redis           | **Private network only**                      | Data stores — never published to the host |

**One more Cloudflare subtlety:** because traffic is Cloudflare-proxied, the
origin (Traefik) sees connections from **Cloudflare's IPs**, not the user's.
That's exactly why `TRUST_PROXY=true` is required in prod — the server must
trust `x-forwarded-for` to recover the real client IP for rate limiting and
the webhook allowlist. Without it, every user looks like Cloudflare and rate
limits/allowlists break.

---

## 7. Concerns — honest assessment of the codebase + deployment pattern

### Already fine (no action)

- **Fail-loud guards** — the strongest part of the design; config errors
  can't silently degrade prod.
- **Money-path atomicity + idempotency** — wallet/booking/webhook paths are
  transactionally sound with audit trails.
- **Secrets posture** — SOPS + Age with the private key off-repo is correct
  for your scale; the GitHub-secrets exception is documented and narrow.
- **Backup strategy** — off-VPS (R2), 30-day retention, restore drill
  documented. Correct for this scale.
- **Network posture** — tailnet-only control plane is genuinely locked down.

### Real concerns (ranked)

| #   | Concern                                                                | Severity                             | Mitigation / decision                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **RAM: 3.7GB, ~318MB free**                                            | High                                 | Prometheus already skipped (locked). Uptime Kuma may need deferral to a tiny external host if free RAM drops below ~500MB (documented fallback in the plan). Monitor `free -m` after each phase. |
| 2   | **Single VPS = single point of failure**                               | Medium                               | Accepted for now (documented). No HA, no failover. The backup-in-R2 is the recovery story.                                                                                                       |
| 3   | **24h data-loss window** (no WAL archiving)                            | Medium                               | Accepted scope decision. If sub-24h recovery becomes a requirement, WAL archiving to R2 is the upgrade path.                                                                                     |
| 4   | **DLQ is alert-only**                                                  | Medium                               | By design (no auto-replay on money paths). Requires an operator to investigate alerts.                                                                                                           |
| 5   | **Manual migration rollback**                                          | Medium                               | Documented (down-SQL in RUNBOOK). Never auto-restore over live traffic.                                                                                                                          |
| 6   | **Coolify API surface may lag UI features**                            | Low-Med                              | Documented fallback: UI + drift-check for anything the API can't express.                                                                                                                        |
| 7   | **In-memory fallbacks degrade guarantees** when Redis fails at runtime | Low                                  | Documented; Redis is mandatory and monitored via `/health`.                                                                                                                                      |
| 8   | **GitHub Actions quota**                                               | Low                                  | Repo is public (free for public repos); self-hosted runner on the VPS is the documented fallback.                                                                                                |
| 9   | **Google OAuth unverified app**                                        | Low (go-live blocker for real users) | Verification video needed before real-user Google sign-in. Email/password works meanwhile.                                                                                                       |
| 10  | **Xendit sandbox → live swap**                                         | Low                                  | One vault edit + redeploy. Sandbox E2E + one real small transaction first (plan Phase 2).                                                                                                        |
| 11  | **No plan-only CI audit** (your suggestion)                            | —                                    | **Add to the plan** — cheap, gives the audit trail you want.                                                                                                                                     |
| 12  | **Drizzle Studio on prod**                                             | —                                    | Not recommended directly; the safe path is a tailnet SSH tunnel + local studio (documented in RUNBOOK).                                                                                          |

### Maintainability verdict

The pattern is **sound and maintainable for a single-operator, single-VPS
product**: declarative infra in git, secrets in SOPS, app CD in Actions,
fail-loud runtime. The main risks are operational (RAM, single node, 24h
window) and all have documented mitigations. Nothing here is a blocker for
go-live except the items in the gap list below.

---

## 8. Missing steps to add to the deployment plan

The plan is thorough; these are the gaps found during this review:

1. **SOPS encryption step (operator, before any commit)** — the plan's Task
   2.1 says "operator fills" but doesn't spell out the exact commands:
   `age-keygen -o ~/.config/sops/age/keys.txt` → public key into `.sops.yaml`
   → `sops -e -i infra/secrets/prod.env`. **Currently your vault is filled but
   unencrypted on disk.**
2. **R2 creation as an explicit Phase-0 prerequisite** — it's a hard boot
   blocker (env guard) _and_ the backup target, but the plan lists it only
   inside Task 1.1's apply. Make it a numbered operator step with the exact
   dashboard path (bucket → API token → custom domain).
3. **Plan-only CI audit job** (your suggestion) — `terraform plan` +
   `ansible-playbook --check` with read-only credentials, on every PR.
4. **Drizzle Studio via tailnet tunnel** — document the safe path (SSH tunnel
   → local `bun run db:studio`), explicitly _not_ on the prod container.
5. **Incident-response section in RUNBOOK** — the symptom → action tables
   (deploy failure, crash-loop, circuit breaker, DLQ alert, DB loss, disk
   full, VPS loss) as one page, not scattered. Task 4.3 covers "incident
   sections" — make the tables explicit.
6. **`WEBHOOK_ALLOWED_IPS` verification at go-live** — sandbox and live use
   the same documented Xendit egress IPs, but verify against the live
   dashboard before the first real transaction.
7. **Default package catalog on prod** — migration
   `0041_seed_mark_packages.sql` now installs/upserts the PRD catalog during
   the normal CD migration step. Keep the package seed command for local/test
   setup or explicitly approved recovery; it is not a per-deploy operation.
8. **Backup `DATABASE_URL` host-reachability note** — the vault's
   `DATABASE_URL` must resolve from the VPS _host_ (published port or
   container IP), not the private hostname. It's in the playbook header; add
   it to the plan's Task 3.1 apply step.

---

## 9. Clarifying questions (ambiguities to resolve before dispatch)

1. **R2**: create the bucket + token now (unblocks boot), or should the wave
   proceed and you create it before the apply phase?
2. **Google Meet**: confirm `GOOGLE_MEET_ENABLED=false` in the vault for now
   (manual links), or do the OAuth Playground flow first?
3. **`ADMIN_EMAILS`**: confirm `itcogitoacademy01@gmail.com` is the operator
   account.
4. **Plan-only CI audit job**: add to this wave's scope (small third worker
   item) or document as a follow-up plan?
5. **Drizzle Studio tunnel doc**: include in this wave's docs work?
6. **Uptime Kuma**: include in this wave (Ansible playbook + docs) or defer
   until RAM is verified after the first phases?
7. **Xendit**: proceed with sandbox keys in the vault now (checkout flow
   works end-to-end with test methods)?
8. **Approve the 2-worker dispatch** (W1 `coolify-resources.yml` + Traefik
   route fixing the 401; W2 drift-check + Uptime Kuma + docs)?
