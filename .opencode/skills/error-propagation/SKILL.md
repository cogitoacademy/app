# Skill: error-propagation (no false greens)

Project skill for the Cogito repo. Load before writing or reviewing any task
that calls an external API, runs a subprocess, or reports success — especially
Ansible/Terraform/ops tooling.

Origin: the 2026-08-31 production env-switch false green (CI-SANITY F14). A
playbook reported `ok=44 failed=0` and printed "Applied 47 env vars" while
**zero** env writes reached the target and the running container kept
`PAYMENT_PROVIDER=stub` for hours. Every failure mode below was observed
live. The rule exists so agents stop trusting process success over verified
reality.

## The rule

**A tool's exit code is not evidence.** Green output only counts when the
EFFECT was verified against reality (the database, the running container, the
live API response — never the wrapper's own report).

## The error-propagation checklist (run before declaring any automation done)

1. **Loops that filter by `when:` can skip everything and still exit 0.**
   Any loop whose items are gated by a `when` condition MUST be followed by an
   assertion that the expected number of writes actually occurred
   (`applied == declared`). "Applied N" debug output that counts the _payload_
   instead of the _writes_ is a false-green generator (this exact bug: env.yml
   reported "Applied 47 env vars" while the DB showed 0 writes).

2. **`no_log: true` censors failures, not just secrets.** Any task that both
   hides its output AND has a fuzzy success condition (skip-if, ignore_errors,
   status_code lists) will hide real failures. Either drop `no_log` for
   non-secret output, or pair it with a post-task assertion that proves the
   intended side effect happened.

3. **Verify the END STATE, not the API answer.** After an env write, restart,
   or config apply: read the effect back from the source of truth:
   - container env: `docker exec <container> env | grep KEY=`
   - Coolify state: the resource GET (or the coolify-db table when the API
     token is under-scoped)
   - app surface: `/health` version field, or the specific env's effect.
     The playbook must include this read-back step; the lead must run it again
     after integration.

4. **Secrets vs surfacing:** `no_log: true` protects values, not success. When
   a task must hide secrets, still return a COUNT or a checksum of
   what changed and fail loudly on zero. Never let "censored" be the final
   word on success.

5. **Report facts, not intentions.** Debug messages like "Applied 47 env
   vars" must reflect writes that happened (count the `changed` results),
   never the payload size.

## Recovery patterns (also apply to the lead's own git work)

- **Stale rebase + uncommitted user edits:** stash the affected files FIRST
  (with a named message), `git rebase --abort`, `git reset --hard origin/main`,
  then `git stash pop`. If the stash is already dropped: `git fsck --unreachable`,
  find the 3-parent commit whose body matches the stash message, and `git
checkout <stash> -- <path>` (done twice this session — it works).
- **Vault/key files are never echoed** — verify changes by key names, value
  shapes (lengths), and API status codes only.

## Live examples (2026-08-31)

- coolify-resources.yml "ok=44 failed=0" while cogito-api env rows stayed at
  04:49 and the container ran `PAYMENT_PROVIDER=stub` for hours → fixed by
  asserting write counts + restarting the resource + reading /health after.
- The lead's own "verified green" claims were wrong twice in one session
  (plan skip in #126's era; env apply) — the lesson: after any playbook/CD
  run, read the EFFECT from the target system (DB row `updated_at`, container
  `env`, live endpoint), not from the tool's summary.
