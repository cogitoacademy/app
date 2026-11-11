# Cogito Office connection: environment and access guide

For Rafsi and the Cogito operator. Prepared 11 November 2026 against the supplied **Main App Connection Request**, approved 10 November 2026.

This guide explains how to obtain the connection settings, open and edit the encrypted environment file, apply changes, and verify the connection. Commands below use Windows PowerShell unless labelled otherwise.

Source links:

- [Main app repository](https://github.com/cogitoacademy/app)
- [PR #365: production Office configuration](https://github.com/cogitoacademy/app/pull/365)
- [Office setup and joint acceptance checklist](../OFFICE-HANDOVER.md)
- [Infrastructure operations guide](../INFRA-PLAYBOOK.md)
- [Automatic environment apply workflow](../../.github/workflows/infra-apply.yml)
- [Deployment and recovery procedures](../RUNBOOK.md)

## 1. What you are receiving

There are two separate kinds of keys:

| Item | What it opens | Who needs it |
| --- | --- | --- |
| SOPS age private key | The encrypted production vault, including other production credentials | Rafsi or the trusted Cogito operator responsible for the app |
| Three `OFFICE_*` connection secrets | Only the app-to-Office integration | The app backend and the Office backend |

The vault is `infra/secrets/prod.env` in the repository. Its values look like `ENC[...]` when opened normally. The age private key lets SOPS show their actual values in a local editor.

Office does not need a copy of the entire vault or its private key just to connect. Give the Office backend only the three connection secrets it needs. App and Office user logins stay separate from this connection.

**Status when this guide was prepared:** PR #365 is open. Its vault contains three generated, independent 32-byte Office secrets and `OFFICE_WRITES_ENABLED=true`. This is repository configuration; the deployed values, Rafsi's vault access, and the joint live test have not been verified here. Until the PR is merged, a fresh clone of `main` may not contain these settings.

## 2. Get the required access

Ask the current Cogito administrator for:

1. Access to the private `cogitoacademy/app` GitHub repository.
2. Access to the organization's password manager and the Office connection entry.
3. Either the existing Cogito age private key through the password manager, or registration of your own age public key as described below.
4. Permission to view GitHub Actions and, if you operate deployment, run the infra workflow.
5. Access to the Office backend's deployment settings. Coolify/Tailscale/SSH access is also needed if you will operate the main app manually.

Repository access alone does not open the vault. A Coolify password, SSH key, and age private key are different credentials.

Keep a recovery copy of the age private key in Cogito's password manager. GitHub Actions may hold `SOPS_AGE_KEY` for automation, but its secret settings are not a place to retrieve the original key for handover.

## 3. Set up your Windows computer once

Install Git and SOPS. If Scoop is already installed, use:

```powershell
scoop install git sops
```

Otherwise, use [Git for Windows](https://git-scm.com/downloads/win) and the Windows executable from the [official SOPS releases](https://github.com/getsops/sops/releases). Choose your computer's architecture, rename the downloaded executable to `sops.exe`, and put its folder on your user PATH. Close and reopen PowerShell afterwards. The official SOPS installation page points to these releases: [SOPS installation](https://getsops.io/docs/installation/).

Check both commands:

```powershell
git --version
sops --version
```

Clone the repository into a dedicated handover folder:

```powershell
git clone https://github.com/cogitoacademy/app.git cogito-app
Set-Location cogito-app
```

Authenticate with your own authorized GitHub account if prompted. Do not put a GitHub token in the clone URL.

For normal operations after PR #365 is merged:

```powershell
git switch main
git pull --ff-only origin main
```

Before the merge, the maintainer can provide the reviewed PR branch for inspection. Do not assume inspecting that branch has deployed it.

### Option A: use the existing organization age key

Receive the key file privately through Cogito's password manager. Store it outside the repository, for example at:

```text
C:\Users\YOUR_WINDOWS_USER\AppData\Roaming\sops\age\keys.txt
```

The file must contain the actual age private key, not a password-manager link and not just its public key. Set the file location in PowerShell:

```powershell
$env:SOPS_AGE_KEY_FILE = Join-Path $env:APPDATA "sops\age\keys.txt"
Test-Path -LiteralPath $env:SOPS_AGE_KEY_FILE
```

Expected result: `True`. This checks that the file exists; opening the vault in section 4 confirms it can decrypt.

### Option B: give Rafsi a separate age identity

Use this if Cogito wants a separate recovery/access key for Rafsi. It needs one action from someone who can already decrypt the vault.

On Rafsi's computer, install age using its [official Windows installation command](https://github.com/FiloSottile/age#installation):

```powershell
winget install --id FiloSottile.age --exact
```

Reopen PowerShell, then generate a key file once:

```powershell
$keyDirectory = Join-Path $env:APPDATA "sops\age"
$clientKeyFile = Join-Path $keyDirectory "cogito-rafsi.txt"
New-Item -ItemType Directory -Force -Path $keyDirectory | Out-Null
if (Test-Path -LiteralPath $clientKeyFile) { throw "Key file already exists; keep the existing key." }
age-keygen -o $clientKeyFile
age-keygen -y $clientKeyFile
```

The last command shows only the **public** key, beginning with `age1`. Send that public key to the current maintainer. Keep the private key file and its recovery copy within Cogito's approved storage.

The current maintainer must:

1. Add Rafsi's public key to the existing `age:` recipients in `.sops.yaml`, keeping the existing recipients, including the one used by deployment automation.
2. Run `sops updatekeys infra/secrets/prod.env` with an identity that already opens the vault.
3. Commit the updated `.sops.yaml` and encrypted vault through a PR. Adding a key to `.sops.yaml` alone does not update the existing vault.
4. Have Rafsi fetch the updated vault and confirm it opens using his key:

```powershell
$env:SOPS_AGE_KEY_FILE = Join-Path $env:APPDATA "sops\age\cogito-rafsi.txt"
```

Then follow section 4. Keep the existing operator access until Rafsi has confirmed both decryption and recovery. These file locations and recipient-update steps follow the [SOPS age documentation](https://getsops.io/docs/usage/identities/age/).

## 4. Open the env and find the Office values

From the repository folder, set the key location if needed, select an editor, and open the vault:

```powershell
$env:SOPS_AGE_KEY_FILE = Join-Path $env:APPDATA "sops\age\keys.txt"
$env:SOPS_EDITOR = "notepad.exe"
sops infra/secrets/prod.env
```

If you chose a separate age identity, use its file path instead of `keys.txt`. These environment settings last for the current PowerShell session; set them again in a new session.

SOPS opens readable values in the editor. Search for `OFFICE_`. The following shows the expected names, **not usable secret values**:

```dotenv
OFFICE_READ_KEY=<existing generated read secret>
OFFICE_WRITE_KEY=<existing generated write secret>
OFFICE_WEBHOOK_SECRET=<existing generated webhook secret>
OFFICE_WEBHOOK_URL=https://office.cogitoacademy.id/hooks/app
OFFICE_WRITES_ENABLED=true
```

Copy the existing three secret values into the private Office connection entry in the password manager. Reuse those values on both backends; do not independently generate another set for Office.

Close the editor after reading. If you edited, save first, close it, and wait for SOPS to finish. Do not use Save As to create a separate plaintext `.env` copy. SOPS manages the editor's temporary plaintext and writes the repository vault back in encrypted form.

If Notepad returns control to PowerShell before you finish editing, use an installed VS Code editor with `$env:SOPS_EDITOR = "code --wait"`, then reopen the vault through SOPS. An edit is complete only after SOPS has finished successfully.

## 5. Put the values in the correct place

| Setting | Main app backend (`cogito-api`) | Office backend |
| --- | --- | --- |
| `OFFICE_READ_KEY` | Validates summary requests | Uses the same value when requesting the summary |
| `OFFICE_WRITE_KEY` | Validates approved action requests | Uses the same value when submitting actions |
| `OFFICE_WEBHOOK_SECRET` | Signs outgoing events | Uses the same value to verify incoming events |
| `OFFICE_WEBHOOK_URL` | `https://office.cogitoacademy.id/hooks/app` | This is the receiver endpoint Office must serve |
| `OFFICE_WRITES_ENABLED` | The production vault explicitly sets `true` | This switch is enforced by the main app |
| Main app API base URL | Existing API deployment | `https://api.cogitoacademy.id` |

On the main app, the SOPS vault is the maintained source of configuration. Its declared Office variables are applied to `cogito-api` by the deployment workflow.

On Office, Rafsi or the Office maintainer enters the three secrets into its **backend** secret/environment settings and restarts or redeploys that backend using its deployment process. The Office repository and deployment UI were not inspected for this guide; its exact setting names and restart steps must be confirmed by that maintainer. The API base URL above is a configuration value, not a claim that Office expects a variable with a particular name.

Do not put these secrets in the app/web frontend, browser JavaScript, or variables beginning with `VITE_` or `NEXT_PUBLIC_`. Do not copy the entire main app env into Office.

## 6. Edit an env value and publish the change

Use a dedicated clean clone or worktree. Check first:

```powershell
git status --short
```

If files are already changed, preserve them and use a clean checkout for this operation. Start an env change from current main:

```powershell
git switch main
git pull --ff-only origin main
git switch -c ops/office-env-update
sops infra/secrets/prod.env
```

Edit only the intended value, save, close the editor, and wait for SOPS. Keep one `KEY=value` per line and no duplicate key names. Do not edit the `ENC[...]` text manually. The webhook URL is currently fixed by the application's validation; changing the receiver address also requires an application change.

For the five existing Office settings, encryption coverage and the Coolify allowlist are already included in PR #365. For a new variable, a maintainer must also update `.sops.yaml` `encrypted_regex`, `app_env_keys` in `infra/ansible/coolify-resources.yml`, and relevant env schema/examples. Adding a line to the vault alone does not deliver a new setting to the application.

With Bun and repository dependencies installed, verify encryption:

```powershell
bun scripts/check-sops-encrypted.ts infra/secrets/prod.env
```

Expected: `sops-plaintext-guard: OK`. This checks ciphertext storage, not whether the chosen values will work live. Stage the encrypted vault explicitly:

```powershell
git add -f -- infra/secrets/prod.env
git diff --cached --stat
git commit -m "ops: update Office environment"
git push -u origin ops/office-env-update
```

Create a PR to `main` on GitHub and describe the setting names and intended effect, without posting their values. Do not bypass failing commit or push hooks; the maintainer should resolve the failure. This repository's push hook requires the normal development dependencies for typecheck and lint.

### What happens after merge

**Merging a vault change can change production automatically.** A push to `main` touching `infra/secrets/**` triggers **Infra Apply (auto)**. It decrypts the vault using the GitHub Actions `SOPS_AGE_KEY` secret, applies the declared env to Coolify, and requests an API restart. Vault changes can also reapply other operations configuration; this is a production rollout, not just a file backup.

The automation needs its configured self-hosted production runner, valid age key, and Coolify access. A merged PR does not prove those steps succeeded.

1. Open [GitHub Actions](https://github.com/cogitoacademy/app/actions/workflows/infra-apply.yml).
2. Find the run for the merged commit. Check **Infra Apply (auto)**, not only PR checks or app deployment.
3. Confirm the Ansible apply and post-apply verification succeeded. A queued, skipped, failed, or missing run is not proof of updated env.
4. If app code also changed, check its production deployment workflow too.
5. Check [API health](https://api.cogitoacademy.id/health), then verify the actual Office operations in section 8. A healthy API alone does not prove key matching, webhook delivery, or writes.

For an env-only restart, the running image may retain its previous code version; do not require its version to equal a commit that changed only env/docs.

If the apply run fails or does not start, ask the operator to inspect it and rerun the failed job or use the documented manual fallback in [INFRA-PLAYBOOK](../INFRA-PLAYBOOK.md). A manual dispatch may run broader infrastructure steps; review its scope first.

### Manual Coolify changes during an incident

Connect using the approved Cogito Tailscale/SSH access and open the existing Coolify dashboard. Select the main app's **`cogito-api`** application, then its environment settings. Update the intended variable once, save, and restart/redeploy the API. Check health and the Office behavior afterwards. Do not select the web app or create duplicate env rows.

Record the same intended change in the encrypted vault and merge it afterwards. Otherwise a later automated apply can overwrite the manual setting. Detailed access/tunnel instructions are in [the infra apply runbook](../../infra/APPLY-RUNBOOK.md); use the operator's authorized SSH identity.

## 7. Rotate a key or stop Office writes

To stop Office actions while leaving reads available, set `OFFICE_WRITES_ENABLED=false` through SOPS and apply it using section 6. During an incident, use the manual Coolify path if waiting for a PR is unsuitable, then reconcile the vault. To restore writes, set `true`, apply, and recheck behavior.

Changing the vault file does not alter an already running process. Disabling writes does not stop snapshot reads or outgoing event delivery.

For planned secret rotation:

1. Arrange the change with the Office maintainer; the integration uses a single current value for each key, so a mismatch interrupts that capability.
2. Generate a fresh random 32-byte value in the approved password manager. Replace only the intended secret in the vault through SOPS.
3. Apply it to the main app, update the matching Office backend value, and restart the backends as needed.
4. Verify the affected operation. Store the new value in the password manager and retire the old value.

Read-key rotation affects summary reads; write-key rotation affects actions; webhook-secret rotation affects event verification. During webhook rotation, pending event retries must be checked after both sides match again. A key change becomes effective on each backend when its runtime configuration is updated.

## 8. Joint connection test with Rafsi

Use a separate non-production app and Office receiver for fixture writes, retries, and switch testing. Such a deployment was not verified for this guide. Do not point a staging app at the production Office receiver without an explicitly agreed test arrangement; the app currently validates a fixed webhook URL.

The main app's Office interface is server-to-server:

| Operation | Request |
| --- | --- |
| Read summary | `GET https://api.cogitoacademy.id/office/snapshot` with `Authorization: Bearer <read key>` |
| Approved action | `POST https://api.cogitoacademy.id/office/actions/<action name>` with `Authorization: Bearer <write key>` and a JSON action body |
| Receive event | App sends to `https://office.cogitoacademy.id/hooks/app` |

The `/office/*` routes take ordinary JSON; they do not use the separate `/rpc/*` JSON envelope. Keys stay in backend configuration; do not paste them into request examples, shell history, or screenshots. Browser requests are not the connection path and Office routes do not provide browser CORS headers.

Together, record these results without secret values:

- [ ] Missing/wrong read key is rejected; the correct read key returns the summary.
- [ ] Office Business and the app dashboard agree on the same 30-day WIB period. Allow for the snapshot's 120-second cache; unavailable metrics may be `null`.
- [ ] A controlled signup through a tagged link appears under the expected source. For campaign labels, see the note below.
- [ ] An agreed test support event arrives within one minute. Office verifies the timestamp and HMAC over the exact raw body and deduplicates event IDs.
- [ ] An approved KOL action is previewed with `dryRun=true`, then created and retired using the Office flow. The saved result and actor `office` appear in the app and Audit Log. Replaying the same actual request's idempotency key does not create another record.
- [ ] A blog draft created in Office appears as a draft in the app; publishing is a separate action.
- [ ] With writes disabled in the test deployment, a correctly authenticated action is rejected with `403` / `WRITES_DISABLED`; restore the intended setting afterwards.
- [ ] Restore the intended test configuration and retain the date, deployment version, non-secret event/action IDs, and pass/fail notes.

Action requests include `dryRun`, a UUID `idempotencyKey`, `officeItemId`, `requestedBy`, `approvedBy`, and `input`. The Office maintainer should use the exact schema from [the action definitions](../../packages/api/src/modules/office/office-actions.types.ts) and [OpenAPI definitions](../../apps/server/src/office/openapi.ts). Use separate preview and execution request IDs; reuse the execution ID for retries of that execution.

**Campaign-label note:** source tracking and campaign-label export are separate. Current code uses optional `OFFICE_CAMPAIGN_LABELS` to allow only approved, non-personal campaign labels in the snapshot; its default is `{}`, so campaign labels may be empty. It is additional configuration beyond the five connection variables. A maintainer must add its encryption and env-delivery declarations if configuring it through this vault. Follow [OFFICE-HANDOVER](../OFFICE-HANDOVER.md); never use a person's name as a campaign label.

Office actions cover approved campaigns and content only. They do not grant payment refunds, wallet changes, payouts, pricing changes, admin creation, or deletion. Knowledge Bank publishing remains in the app.

## 9. Common problems

| What you see | What to check |
| --- | --- |
| `sops` is not recognized | Install SOPS and reopen PowerShell; confirm its folder is on PATH. |
| `Could not run editor` | Set `$env:SOPS_EDITOR = "notepad.exe"` in the current terminal, then reopen through SOPS. |
| Failed to get the data key | Confirm `SOPS_AGE_KEY_FILE`, the private key file, and whether its public key was registered with `sops updatekeys`. A new identity cannot open an old vault until added. |
| You only see `ENC[...]` | The file was opened directly; open it using `sops infra/secrets/prod.env`. |
| `401 UNAUTHORIZED` | Check the backend key pair, the `Bearer` header, whitespace, and whether both backends restarted with the new value. Use the read key for snapshot and write key for actions. |
| `403 WRITES_DISABLED` | The running main app still has writes disabled; check the applied runtime env and restart result. |
| `403 ACTION_DENIED` | The requested action is outside the allowed action names. |
| `400 INVALID_REQUEST` | Check the action name, body schema, required IDs, and approved asset URLs. |
| `429 RATE_LIMITED` | The limits are 120 read requests/hour and 60 write requests/hour; avoid aggressive polling/retries. |
| `503 UNAVAILABLE` | The Office rate limiter is unavailable; check API/Redis health. |
| PR merged but connection unchanged | Check the corresponding Infra Apply run, Office backend settings, and restart results. |
| No webhook events | Check matching webhook secrets, the Office receiver, the running app scheduler/worker, Redis, and outbox retry status. |
| Dashboard changes appear late | Snapshot data is cached for up to 120 seconds. |

## 10. Handover completion for the connection request

Env setup covers only part of the original request. Keep the remaining items visible:

| Item | Required completion evidence |
| --- | --- |
| Vault independence | Rafsi opens the current vault using Cogito-controlled access and has a recovery copy. |
| Live connection | Joint read, tracking, event, action, and write-disable checks are recorded. |
| Security cleanup | Operators rotate the exposed Coolify/OVH passwords, remove credential-bearing documentation copies, and remove public-mailbox production test accounts/access. This guide does not perform those actions. |
| Service ownership | Cogito verifies ownership, recovery, billing and two-step access for GitHub, Coolify, OVH, Cloudflare/R2, Resend, Midtrans, Sanity, Google Cloud/Meet, Uptime Kuma and Discord alerts. |
| Non-production environment | Record its actual app/API/Office receiver, separate databases/Redis/storage and payment sandbox, or explicitly record that none exists. |
| Content and operations | Hand over Referrals/KOL, commissions, Economy Settings, Blog, Activities, FAQ and Audit Log. Verify deployed `CC_SOURCE` / `KB_SOURCE` before claiming Calendar/Knowledge Bank use the database rather than Sanity. |
| Payments and recovery | Use the existing runbook for backup restore, rollback and Midtrans live acceptance. Office keys do not configure payments. Mark the real-payment check complete only with actual operator evidence. |

Do not store secret values in this checklist. Successful local checks or an encrypted vault do not establish that these handover items are complete.
