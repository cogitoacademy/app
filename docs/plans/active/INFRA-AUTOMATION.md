# Infra Automation & Coolify Unification — Wave Plan

| Field      | Value |
| ---------- | ----- |
| Status     | Active |
| Created    | 2026-09-01 |
| Depends on | #148 (monitoring wave), #149 (vault), #150 (INFRA-PLAYBOOK); infra applied 2026-08-31 |
| Scope      | (1) Coolify project unification, (2) Kuma recreate in the right project, (3) full CI-driven Terraform + Ansible applies via the VPS self-hosted runner, (4) docs |

## Background (live-verified 2026-09-01)

- **Project split (accidental):** `coolify-resources.yml` + `uptime-kuma.yml`
  declare `project_name: "cogito"`. The real project (created 2026-08-25)
  is named **`cogito-prod`** (uuid `q6lrayxaaw1uy9mm74gykl34`, env
  `production` id 1) and holds cogito-api, cogito-web, cogito-prod-db,
  cogito-prod-redis (+ cogito-studio). On 2026-08-31 the playbooks did not
  find a project named `cogito`, created one (uuid `y94u4o4y0vu7wx8hpvez7yau`,
  created 2026-08-31T11:21Z), and the Kuma service landed there. Live state:
  apps/db/redis → project `cogito-prod`; **only cogito-uptime-kuma → empty
  `cogito` project**. `cogito-studio` is pre-existing in `cogito-prod`
  (Coolify-internal tooling; not ours to move).
- **Kuma state:** operator created only the first-run admin account (SQLite
  volume `uptime-kuma-data` — per-service, NOT the app Postgres). No
  monitors/notifications configured. **Safe to delete + recreate** in the
  correct project; the volume dies with the service, which is desired here.
- **Runner:** a self-hosted GitHub runner `cogito-prod` already exists on the
  VPS (registered 2026-08-31 for the CD migrate/deploy job — `[self-hosted,
  linux, x64, production]`). Full automation can reuse it; no new runner.
- **Tailnet (verified live):** 3 nodes — laptop (operator), iPhone (offline),
  cogito-vps. Inbound to VPS via tailnet: 22 (Tailscale SSH check), 8000
  (Coolify UI), 6001/6002 (realtime). Everything app-facing is
  Cloudflare-public by design. ACL source of truth:
  `infra/tailscale/acl.hujson` (pasted to the console 2026-09-01).

## User decisions (2026-09-01)

1. **Keep Kuma** (not Gatus). Operator does the one-time UI pass (monitors +
   Discord notification + optional status page) — tutorial in
   INFRA-PLAYBOOK §2b / RUNBOOK Monitoring section.
2. **Full automation** of Terraform + Ansible applies, accepting that the
   SOPS **Age private key** lives as a GitHub Actions secret. Risk accepted
   because: collaborators are internal-only, branch protection + secret
   scanning + push protection are ON, and the runner is on the VPS (no
   public egress of the key beyond GitHub's secret store).
3. Wave scope: unify projects → recreate Kuma in the right project →
   automation → docs. Xendit Live E2E + Phase 5 drills remain separate.

## Wave 1 — Coolify project unification + Kuma recreate (repo + live apply)

1. `infra/ansible/coolify-resources.yml` + `infra/ansible/uptime-kuma.yml`:
   `project_name: "cogito"` → `"cogito-prod"` (the playbook find-by-name
   logic then matches the LIVE project; no resource renames/recreates —
   the playbook never renames).
2. Live cleanup via Coolify API: DELETE service
   `cogito-uptime-kuma` (uuid `a5owkrjjxlfafp9rnuehsx7x`, wrong project),
   then DELETE project `cogito` (empty after the delete).
3. Re-run `uptime-kuma.yml` (now `cogito-prod`) → Kuma recreated in the
   right project; verify `status.` 302 + container healthy.
4. `drift-check.yml` re-run → green (project name now matches declaration).
5. Docs: INFRA-PLAYBOOK project note, plans index row.

**Guard rails:** never touch `cogito-prod-db`/`cogito-prod-redis`/api/web
(no delete paths involved); the only deletions are the empty-project Kuma
service (zero config inside) and the empty `cogito` project itself.

## Wave 2 — Full apply automation (CI applies on merge)

**Trigger surfaces (new workflows):**

- `infra-apply.yml` (repo):
  - Trigger: `push` to `main` touching `infra/**` + `workflow_dispatch`.
  - Job A **terraform** (ubuntu runner, existing secrets
    `CLOUDFLARE_API_TOKEN`/`R2_*`/`R2_STATE_ENDPOINT`): `init` → `plan
    -detailed-exitcode` → `apply -auto-approve` only when the plan is
    non-empty; uploads the plan as artifact; **never applies on PRs**.
  - Job B **ansible** (the existing `cogito-prod` VPS runner, which is on
    the tailnet and can reach `127.0.0.1:8000` directly — no tunnel):
    1. Write the Age key from secret `SOPS_AGE_KEY` to a 0600 temp file
       (`SOPS_AGE_KEY_FILE` points there; file deleted in an `always()`
       cleanup step; `::add-mask` on the value).
    2. Decrypt the vault in-memory (same pipe discipline as the playbooks).
    3. Run the **drift-check first** (report), then only the playbooks whose
       inputs changed (path-filter matrix: `host-hardening.yml`,
       `tailscale.yml`, `coolify-resources.yml`, `backup-cron.yml`,
       `disk-watchdog.yml`, `uptime-kuma.yml`).
    4. Hard gates: **never** auto-run `host-hardening.yml` (lockout risk —
       stays a manual, gated phase); `resources` phase runs with
       `--skip-tags restart` on auto-runs? NO — keep it simple: env applies
       include the restart (existing async-queue-aware logic); a
       `workflow_dispatch` with `force_restart` input covers edge cases.
    5. Post-apply: run `verify` phase (health sha + webhook route probe),
       post a one-line result to the Discord webhook (GitHub secret) on
       failure only.
- **Concurrency:** `concurrency: infra-apply` (never two applies at once);
  the CD `production-deploy` concurrency group stays separate.
- **Rollback story:** every apply is idempotent (playbooks + terraform
  plan/apply); a bad auto-apply is reverted by reverting the commit (CI
  applies the revert). Coolify-side changes are drift-checked; terraform
  state is versioned in R2.

**Security analysis (explicit, for the record):**

| Risk | Mitigation |
|---|---|
| Age key in GitHub secrets | repo is internal-collaborator; secret scanning + push protection on; the key can be rotated by re-encrypting the vault (`sops updatekeys`) if GitHub is ever suspected |
| Runner on the VPS executing infra code | the runner already runs CD (it can already deploy prod); it gains no new blast radius beyond ansible become |
| Malicious PR modifying playbooks | applies only run on `push: main` (post-merge); branch protection requires review + green CI; internal-only collaborators |
| Lockout (hardening automation) | `host-hardening.yml` is EXCLUDED from auto-apply triggers (manual, tailscale-verify-gated) |

**Operator actions required to enable Wave 2:**
1. Create GitHub secret `SOPS_AGE_KEY` = contents of
   `~/.config/sops/age/keys.txt` (operator console; the lead never reads it).
2. Optional: `DISCORD_WEBHOOK_URL` as a repo secret for apply-result pings.
3. Confirm the VPS runner labels (`production`) still match `cd-prod.yml`.

## Files (wave)

- `infra/ansible/coolify-resources.yml`, `infra/ansible/uptime-kuma.yml` (project name)
- `.github/workflows/infra-apply.yml` (new) + `.github/workflows/infra-plan.yml` (comment cross-ref)
- `docs/INFRA-PLAYBOOK.md` (automation section replaces manual §1/§3 paths where applicable)
- `docs/RUNBOOK.md`, `docs/DEPLOYMENT.md`, `docs/plans/README.md`, `docs/CONTEXT.md` (statuses)
- this plan

## Exit gates

- Single Coolify project `cogito-prod` holds every declared resource; the empty `cogito` project deleted; Kuma recreated in the right project; drift-check green.
- A merge touching `infra/ansible/uptime-kuma.yml` auto-applies on the VPS runner without operator SSH (Age key from GitHub secret; vault decrypt in-memory; drift-check + health verify posted).
- Terraform applies on merge with plan-diff posted; PRs keep read-only plan.
- Manual `apply.sh` remains as the documented break-glass path (runner down, key rotation, DR).

## Risks

- Runner = single point: if the VPS is down, automation can't run — acceptable (the thing it manages IS the VPS; break-glass is manual from the operator machine).
- Auto-apply of env changes restarts the API on merges that touch the vault — acceptable (documented; seconds of downtime, same as the manual path).
- Kuma recreate loses the just-created admin account (user-confirmed: nothing else configured).