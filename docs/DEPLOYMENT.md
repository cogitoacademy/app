# Cogito Setup and Deployment

Last updated: 2026-08-28

This is the operational guide for the current production setup. It covers the
first-time VPS/Coolify setup, the normal GitHub Actions deployment, and the
manual GHCR fallback when GitHub Actions has no runner quota.

## Release record: auth validation deployment

The first production rollout of the auth form validation used this path on
2026-08-25:

| Item                  | Result                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Source commit         | `c00445d` — `fix(web): add auth form validation feedback`                                                      |
| Changed runtime image | `ghcr.io/cogitoacademy/app/web`                                                                                |
| Tags pushed           | `latest`, `vc00445d767413c41d629484b046d937a6cab4aa1`                                                          |
| API image             | Not rebuilt; the release changed only the frontend                                                             |
| CI result             | GitHub Actions could not start because the account billing/spending limit was blocked                          |
| Fallback              | Built the web image locally with `VITE_SERVER_URL=https://api.cogitoacademy.id`, then pushed both tags to GHCR |
| Verification          | `app.cogitoacademy.id/login` returned `200`; `/health` returned `200` with database and Redis `ok`             |

The live login bundle contained the new validation feedback after Coolify
pulled the changed `latest` image. Keep the immutable `v<full-sha>` tag for
rollback even when the Coolify resource tracks `latest`.

## Production topology

The apex domain stays on Hostinger for the company profile. Only the
application subdomains point to the Coolify VPS:

| Component                          | Public URL                     | Runtime                        |
| ---------------------------------- | ------------------------------ | ------------------------------ |
| API, Better Auth, health, webhooks | `https://api.cogitoacademy.id` | Coolify API image, port `3001` |
| Frontend                           | `https://app.cogitoacademy.id` | Coolify nginx image, port `80` |
| PostgreSQL                         | private Coolify network only   | `postgres:16-alpine`           |
| Redis                              | private Coolify network only   | Redis 7                        |

Production images are published to:

```text
ghcr.io/cogitoacademy/app/server
ghcr.io/cogitoacademy/app/web
```

The current Coolify resources use the `latest` tag and auto-deploy when that
tag changes. The production API resource is `cogito-api`; the frontend
resource is `cogito-web`. Resource names may differ in a new Coolify project,
but the image names, ports, domains, and environment rules must remain the
same.

## Local development setup

Prerequisites are Bun, Docker Desktop, and Git. From the repository root:

```bash
bun install --frozen-lockfile
cp .env.example .env
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
bun run db:start
bun run db:migrate
bun run dev
```

Set a 32+ character `BETTER_AUTH_SECRET` in `apps/server/.env`. The local web
app runs at `http://localhost:3000`, the API at `http://localhost:3001`,
PostgreSQL at port `6767`, and Redis at port `6379`. Stop the local services
with `bun run db:stop` when finished.

## First-time setup

### 1. Provision the OVH VPS

For the already-created OVH VPS, use the Terraform bootstrap in
[`infra/terraform`](../infra/terraform/). It uploads and runs
[`infra/provision.sh`](../infra/provision.sh) over SSH, but deliberately does
not order or reinstall a VPS. This keeps `terraform apply` from creating a
second billable server.

Before applying, confirm that SSH key access works and that the initial OVH
user can run non-interactive sudo:

```powershell
ssh -i "$env:USERPROFILE\.ssh\cogito_ovh" ubuntu@<VPS_IP>
sudo -n true
exit
```

Then run from the repository root:

```powershell
Copy-Item infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# Edit infra/terraform/terraform.tfvars with the real VPS IP and key path.
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan
terraform -chdir=infra/terraform apply
```

The bootstrap installs Docker and Coolify, enables UFW/fail2ban, disables SSH
password authentication, permits only key-based root access for Coolify's
internal localhost server, and creates a `deploy` user. Verify that the new
key-based login works before closing the original SSH session:

```powershell
ssh -i "$env:USERPROFILE\.ssh\cogito_ovh" deploy@<VPS_IP>
```

Coolify's dashboard, realtime channel, and web terminal are intentionally
bound to VPS localhost. Run the multi-port tunnel printed by Terraform in a
second local terminal, then open `http://localhost:8000` and immediately
create the Coolify admin account. Public application traffic only needs ports
`80` and `443`.

The Coolify `localhost` server uses its generated private key to SSH back to
the VPS as root; root password login remains disabled. The bootstrap also
allowlists Docker's private `10.0.0.0/8` range in fail2ban so repeated server
checks cannot accidentally ban Coolify itself.

#### Two different SSH keys

There are two separate key relationships:

- The operator key, for example `C:\Users\<user>\.ssh\id_ed25519`, is used
  from the laptop to connect to the VPS as `ubuntu` or `deploy`.
- `localhost's key` in Coolify is generated by Coolify and is used by the
  Coolify container to SSH back to this same VPS as `root`.

Do not select the laptop private key in Coolify. In **Servers → localhost**,
the expected connection is host `host.docker.internal`, port `22`, user
`root`, and Coolify's generated `localhost's key`. Use **Check connection**
after saving the server settings.

If Terraform is unavailable, the direct fallback is to upload and run the
script manually after confirming SSH key access:

```powershell
scp -i "$env:USERPROFILE\.ssh\cogito_ovh" infra/provision.sh ubuntu@<VPS_IP>:/tmp/cogito-provision.sh
ssh -i "$env:USERPROFILE\.ssh\cogito_ovh" ubuntu@<VPS_IP> "sudo bash /tmp/cogito-provision.sh"
```

The script is a bootstrap, not a complete application deployment. After it
finishes:

1. Create the Coolify admin account.
2. Add `ghcr.io` under **Settings → Docker Registries** with a GitHub token
   that has `read:packages`.
3. Create a production project, for example `cogito-prod`.
4. Create PostgreSQL 16 and Redis 7 services on the same private network.
5. Create the API and web Docker Image resources described below.

For the click-by-click Coolify settings, see
[`infra/coolify-setup.md`](../infra/coolify-setup.md).

### 2. Configure DNS and domains

Keep `cogitoacademy.id` on Hostinger. Point these records to the VPS:

```text
api.cogitoacademy.id  -> VPS IP
app.cogitoacademy.id  -> VPS IP
```

Assign the API domain to the API resource and the app domain to the web
resource. Coolify's bundled proxy (Traefik v3.6, verified 2026-08-28 — not
Caddy) then provisions HTTPS and routes traffic as follows:

```text
api.cogitoacademy.id/*  -> API container :3001
app.cogitoacademy.id    -> web container :80
```

### 3. Configure the API resource

Use image `ghcr.io/cogitoacademy/app/server:latest`, expose port `3001`, and
set the health check to `GET /health`.

Copy the required values from [`infra/.env.prod.example`](../infra/.env.prod.example)
into the Coolify API environment. At minimum, production must have:

```text
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...@postgres-prod:5432/...
REDIS_URL=redis://redis-prod:6379
BETTER_AUTH_URL=https://api.cogitoacademy.id
CORS_ORIGIN=https://app.cogitoacademy.id
TRUST_PROXY=true
SCHEDULER_ENABLED=true
DB_SSL_ENABLED=false
DB_SSL_REJECT_UNAUTHORIZED=true
```

`DB_SSL_ENABLED=false` is required for the bundled Coolify PostgreSQL service,
which is currently non-TLS. If the database is moved to a managed PostgreSQL
endpoint that requires TLS, set `DB_SSL_ENABLED=true` and configure certificate
verification deliberately.

Keep provider credentials, auth secrets, and tokens in Coolify environment
variables. Do not commit them to the repository or put them in this document.

### 4. Configure the web resource

Use image `ghcr.io/cogitoacademy/app/web:latest`, expose port `80`, and set
the health check to `GET /`.

`VITE_SERVER_URL` is a build-time Vite value. It is baked into the static image
and cannot be fixed by adding a runtime variable to the Coolify web resource.
Production web images must be built with:

```text
VITE_SERVER_URL=https://api.cogitoacademy.id
```

The build argument is already wired in `apps/web/Dockerfile` and
`.github/workflows/cd-prod.yml`.

### 4.1 Auth page validation behavior

The frontend validates auth input before making a Better Auth request:

- Sign-in trims and validates the email, and requires a password of at least
  eight characters.
- Sign-up requires a name of at least two characters, a valid email, and a
  password of at least eight characters containing uppercase, lowercase, and a
  digit.
- A touched invalid field shows its own inline warning. An invalid submit also
  shows a form-level warning and does not call the auth API.
- Correcting a field clears its warning. The server-side Better Auth rules
  remain authoritative; this is client-side feedback, not a security boundary.

Smoke-test `/login` and the sign-up mode with an `@example.com` address. Check
an empty/malformed email, a short password, a short name, and a password
missing each required character class. Confirm the warnings clear before a
valid request is submitted.

### 5. Configure deploy webhooks

Create a **Deploy Webhook** for each Coolify resource and store the complete
URL as a GitHub Actions secret. These are URLs, not the separate
**Manual Git Webhook Secret** used when Coolify receives GitHub repository
webhooks.

The URL shape is:

```text
https://<coolify-public-host>/api/v1/deploy?uuid=<resource-uuid>&force=false
```

For this deployment, the values look like this (replace the placeholders with
the real Coolify resource UUIDs; do not include `<` or `>`):

```text
COOLIFY_PROD_SERVER_WEBHOOK=https://coolify.cogitoacademy.id/api/v1/deploy?uuid=<prod-api-resource-uuid>&force=false
COOLIFY_PROD_WEBHOOK=https://coolify.cogitoacademy.id/api/v1/deploy?uuid=<prod-web-resource-uuid>&force=false
COOLIFY_STAGING_SERVER_WEBHOOK=https://cl.cogitoacademy.id/api/v1/deploy?uuid=<staging-api-resource-uuid>&force=false
COOLIFY_STAGING_WEBHOOK=https://cl.cogitoacademy.id/api/v1/deploy?uuid=<staging-web-resource-uuid>&force=false
```

Keep the `&` literal: do not add a backslash, backticks, quotes, or trailing
question marks. The hostname must be publicly DNS-resolvable from a GitHub
hosted runner. The `uuid` is the Coolify **resource** UUID, not a deployment
UUID.

> **Production host (2026-08-27, S7):** the Coolify control plane is
> tailnet-only, so the production webhook host is `coolify.cogitoacademy.id` —
> a DNS record + Traefik route expose **only** the `/api/v1/deploy/*` path
> (the per-resource UUID is the bearer secret); the Coolify UI stays
> tailnet-only. The old `cl.cogitoacademy.id` host had no DNS record, which is
> why `Deploy Production` failed with `curl exit 6 "Could not resolve host"`.
> The operator recreates `COOLIFY_PROD_SERVER_WEBHOOK` / `COOLIFY_PROD_WEBHOOK`
> with the resolvable URL above. (The Coolify bundled proxy is **Traefik
> v3.6**, verified 2026-08-28 — not Caddy.)

Current Coolify versions label this endpoint **Deploy Webhook (auth
required)**. The URL identifies the target, while a Coolify API token with the
`deploy` permission authorizes the request; store that token separately and do
not append it to the URL. The workflow must send it as an
`Authorization: Bearer ...` header before this auth-required form can be used.

> **Bearer variant is conditional (wave-2, 2026-08-28):** whether the webhook
> accepts the URL alone or requires `Authorization: Bearer <coolify-api-token>`
> depends on the Coolify version. If the webhook returns `401`, try the Bearer
> variant first (token with the `deploy` permission); if it still returns
> `401`/`404`, the Traefik route for `coolify.cogitoacademy.id/api/v1/deploy/*`
> is missing (declared in `infra/ansible/coolify-resources.yml`). Both causes
> are documented in RUNBOOK → Xendit webhook wiring → "Webhook 401
> investigation".

The workflows intentionally fail if a webhook is missing or unreachable. A
green image build without a successful Coolify deploy is not a completed
release. `cd-prod.yml` additionally guards the secrets before any curl: an
unset `COOLIFY_PROD_SERVER_WEBHOOK` / `COOLIFY_PROD_WEBHOOK` prints a clear
message and exits 1 (readable failure instead of a bare `curl exit 6`).

## Normal deployment: GitHub Actions

1. Make the code change and run the relevant local checks:

   ```bash
   bun install --frozen-lockfile
   bun run check-types
   bun run build:server
   bun run build:web
   ```

2. Open a PR, wait for CI, merge to `main` for production or `staging` for
   staging.
3. `cd-prod.yml` or `cd-staging.yml` builds the server and web images, logs in
   to GHCR, and pushes them.
4. Production receives both `latest` and immutable `v<full-commit-sha>` tags.
   Staging receives the `staging` tag.
5. The workflow calls the API and web Coolify webhooks, then polls the API
   health endpoint for up to approximately five minutes. The production poll is
   **sha-verified**: `scripts/migrate-and-deploy.sh` requires
   `GET /health` to return `version == <commit-sha>` (the server image is
   built with `--build-arg GIT_SHA=${{ github.sha }}` and `/health` surfaces it
   as `version`), so a green deploy means the _new_ image is serving. On
   timeout the script prints a rollback hint pointing at the previous immutable
   `v<prev-sha>` image.
6. Check both Coolify deployment logs and the public smoke checks below.

For staging, use the `cogito-staging` project, `:staging` image tags,
`staging.cogitoacademy.id` for the API, and
`staging-app.cogitoacademy.id` for the web app. The staging web image must be
built with `VITE_SERVER_URL=https://staging.cogitoacademy.id`; the staging
workflow already supplies that build argument.

Database migrations are not run automatically by the server container. If a
release contains a migration, take the normal database backup and apply the
reviewed migration to the target database before or during the rollout using
the exact target `DATABASE_URL`:

```bash
ENV_FILE=/secure/cogito-prod.env bun run db:migrate
```

PowerShell equivalent:

```powershell
$env:ENV_FILE = "C:\secure\cogito-prod.env"
bun run db:migrate
Remove-Item Env:ENV_FILE
```

Use a one-off Coolify task or a secured operator machine for production. Do
not use `db:push` as an unreviewed production migration mechanism.

A nightly PostgreSQL backup runs on the VPS at 02:00 WIB and uploads to
Cloudflare R2 (`cogito-backups`) with 30-day retention — see
[Backup & Restore](./RUNBOOK.md#backup--restore) for the restore drill.

## Manual deployment when CI has no quota

Use this path when a GitHub Actions job cannot start because of account billing,
spending-limit, or runner quota. The application code does not need a second
deployment configuration; build the same Dockerfiles locally and push the same
image names.

### 1. Check the local state

Run from the repository root with Docker Desktop running:

```powershell
git status
git rev-parse HEAD
docker info
bun install --frozen-lockfile
bun run check-types
bun run build:server
bun run build:web
```

If Docker reports storage pressure, free builder cache only after checking that
no useful build is running:

```powershell
docker builder prune --all --force
```

Do not use `docker system prune --volumes` for this release procedure; it can
remove database or other persistent volumes.

### 2. Log in to GHCR

The account pushing images needs `write:packages`. With GitHub CLI:

```powershell
gh auth status
gh auth refresh -h github.com -s write:packages
$ghcrToken = gh auth token
$ghcrToken | docker login ghcr.io --username <github-user> --password-stdin
Remove-Variable ghcrToken
```

If the token scope was just changed, refresh the Docker login as shown above;
an old Docker credential can continue to return `403`.

### 3. Build both images

Use the full commit SHA for an immutable release tag. `latest` is retained
because the current Coolify resources track it.

```powershell
$releaseSha = (git rev-parse HEAD).Trim()
$releaseTag = "v$releaseSha"
$registryRoot = "ghcr.io/cogitoacademy/app"

docker build --progress=plain `
  -t "$registryRoot/server:latest" `
  -t "$registryRoot/server:$releaseTag" `
  -f apps/server/Dockerfile .

docker build --progress=plain `
  -t "$registryRoot/web:latest" `
  -t "$registryRoot/web:$releaseTag" `
  --build-arg VITE_SERVER_URL=https://api.cogitoacademy.id `
  -f apps/web/Dockerfile .
```

Before pushing, confirm the web bundle contains the API origin and not the
apex or frontend origin:

```powershell
docker run --rm "$registryRoot/web:latest" sh -c "grep -l 'https://api.cogitoacademy.id' /usr/share/nginx/html/assets/*.js"
```

For a frontend-only release such as auth-page changes, build and push only the
web image. Use a clean checkout of the release commit when the working tree
contains unrelated local infrastructure edits:

```powershell
$releaseSha = (git rev-parse HEAD).Trim()
$releaseTag = "v$releaseSha"
$registryRoot = "ghcr.io/cogitoacademy/app"
$cleanRoot = Join-Path $env:TEMP "cogito-release-$($releaseSha.Substring(0, 12))"
git worktree add --detach $cleanRoot $releaseSha
try {
  docker buildx build --progress=plain --push `
    --build-arg VITE_SERVER_URL=https://api.cogitoacademy.id `
    -t "$registryRoot/web:latest" `
    -t "$registryRoot/web:$releaseTag" `
    -f "$cleanRoot/apps/web/Dockerfile" `
    $cleanRoot
} finally {
  git worktree remove --force $cleanRoot
}
```

This avoids accidentally packaging unstaged `.env`, Terraform, or unrelated
Dockerfile changes into the release. The server image can remain untouched
when no API/server code changed.

### 4. Push immutable tags, then `latest`

```powershell
docker push "$registryRoot/server:$releaseTag"
docker push "$registryRoot/server:latest"
docker push "$registryRoot/web:$releaseTag"
docker push "$registryRoot/web:latest"
```

Coolify may auto-deploy when `latest` changes. Check the deployment list before
manually starting another deployment so two rollouts do not overlap.

### 5. Redeploy in Coolify

Deploy the API first, then the web resource:

1. Open the production API resource (`cogito-api`).
2. Pull/redeploy the image, or use **Force deploy without cache** if Coolify
   did not pull the new `latest` digest. Wait for `Running (healthy)`.
3. Open the production web resource (`cogito-web`) and repeat.
4. If you want explicit traceability, change the resource tag from `latest` to
   `$releaseTag` and redeploy. Record the tag in the release notes.

If the API container fails during startup, inspect the logs before restarting.
The most common production-specific cause is a PostgreSQL TLS mismatch; verify
`DB_SSL_ENABLED=false` for the bundled database.

## Release verification

Run the health check first:

```powershell
curl.exe -i https://api.cogitoacademy.id/health
```

Expect HTTP `200` and both `database` and `redis` to be `ok`. On a Windows
machine with a local certificate-chain problem, `curl.exe -k` can be used for
diagnosis only; fix the certificate chain rather than making `-k` the normal
monitoring command.

Verify the frontend and cross-origin API contract:

```powershell
curl.exe -i https://app.cogitoacademy.id/login
curl.exe -i -X OPTIONS `
  -H "Origin: https://app.cogitoacademy.id" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: content-type" `
  https://api.cogitoacademy.id/rpc/auth/getProfile

curl.exe -i -X POST `
  -H "Content-Type: application/json" `
  --data '{"json":{}}' `
  https://api.cogitoacademy.id/rpc/auth/getProfile
```

The preflight should return `204`; the unauthenticated RPC smoke check should
return `401`. oRPC paths use slash-separated procedure keys and request bodies
are wrapped in the `json` envelope.

Finally, open `https://app.cogitoacademy.id/login` in a clean browser and verify
that sign-up/login requests go to `api.cogitoacademy.id`, then that a successful
login reaches the correct dashboard. Use a synthetic `@example.com` account
for testing, never a real user's email.

## Rollback

1. Identify the previous healthy immutable tag (`v<full-commit-sha>`) in GHCR or
   the Coolify deployment history.
2. Set the affected Coolify resource to that tag, or use Coolify's previous
   release rollback.
3. Redeploy the API, verify `/health`, then redeploy/verify the web resource if
   the frontend was part of the release.
4. If the release changed the database schema, coordinate a reviewed migration
   rollback or forward-fix separately. Reverting an image does not revert DB
   state.

Never move an immutable tag to a different image. Publish a new tag for a
forward fix.

## Troubleshooting quick reference

| Symptom                                                                          | Check                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actions fails before any job starts                                              | GitHub billing/spending limit or runner quota; use the manual path or resolve the account limit.                                                                                                                                                                                                                                                                               |
| GHCR push returns `403`                                                          | Token has `write:packages`, the Docker login was refreshed, and the org allows package creation.                                                                                                                                                                                                                                                                               |
| API exits with SSL/handshake error                                               | `DB_SSL_ENABLED` matches the database; bundled Coolify PostgreSQL requires `false`.                                                                                                                                                                                                                                                                                            |
| Coolify says healthy but app calls the wrong host                                | The web image was built without `--build-arg VITE_SERVER_URL=https://api.cogitoacademy.id`; rebuild and redeploy web.                                                                                                                                                                                                                                                          |
| Web resource is `unhealthy` / domain returns `No Available Server`               | Check the web container health output and use an IPv4 loopback healthcheck (`127.0.0.1`) when nginx listens only on IPv4; rebuild and redeploy the web image.                                                                                                                                                                                                                  |
| Coolify **Servers → localhost** shows `Unavailable` while containers are healthy | This is the Coolify control-plane SSH check, not proof that the app is down. Confirm host `host.docker.internal`, port `22`, user `root`, and Coolify's generated `localhost's key`; then click **Check connection**. If it says `Permission denied`, install the copied Coolify public key in `/root/.ssh/authorized_keys`. If it says `Connection refused`, verify `ss -ltnp | grep ':22'` on the VPS and retry after SSH/Coolify restarts. |
| New `latest` image is not running                                                | Check auto-deploy/webhook logs, then force a pull/redeploy without cache.                                                                                                                                                                                                                                                                                                      |
| API health is 503 immediately after deploy                                       | Wait for the bounded rollout/healthcheck, then inspect API logs and the Coolify domain/port mapping.                                                                                                                                                                                                                                                                           |
| Health says Redis is down                                                        | Check `REDIS_URL`, private network membership, and Redis resource health.                                                                                                                                                                                                                                                                                                      |

Related references:

- [`docs/RUNBOOK.md`](./RUNBOOK.md) — application smoke checks and incident runbook
- [`infra/coolify-setup.md`](../infra/coolify-setup.md) — Coolify UI setup
- [`infra/.env.prod.example`](../infra/.env.prod.example) — production variable checklist
- [`.github/workflows/cd-prod.yml`](../.github/workflows/cd-prod.yml) — source of truth for the production CD steps
