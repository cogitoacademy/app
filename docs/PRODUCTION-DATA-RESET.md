# Production Data Reset

Use this procedure only for an explicitly approved prelaunch reset. It drops the
application schema, reapplies every migration, and reseeds canonical defaults.
It never deletes the PostgreSQL resource or volume in Coolify.

The reset creates no admin account. An operator address from `ADMIN_EMAILS`
must sign in after the reset; the signup hook or server boot promotes it.

## 1. Create and verify a recoverable backup

Run on the VPS:

```bash
sudo bash -c '
set -a
source /etc/cogito/backup.env
set +a
exec /usr/local/bin/cogito-backup.sh
'
```

The command must finish with `Done: uploaded backups/YYYY-MM-DD.sql.gz`.
Record that exact R2 key, then verify it exists:

```bash
sudo bash -c '
set -a
source /etc/cogito/backup.env
set +a
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
aws s3 ls "s3://${R2_BACKUP_BUCKET}/backups/" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --region auto
'
```

Do not continue unless the new object appears in the private backup bucket.

## 2. Stop the API and drop the application schemas

Stop `cogito-api` in Coolify first so schedulers and requests cannot write
during the reset. Keep PostgreSQL and Redis running. Then run on the VPS:

```bash
set -euo pipefail

DB_CONTAINER="$(
  sudo docker ps --format '{{.Names}}' |
  grep '^noxeaeuxfreq0axa9unpew5r' |
  head -1
)"

test -n "$DB_CONTAINER" || {
  echo "ERROR: database container not found"
  exit 1
}

sudo docker exec -i "$DB_CONTAINER" psql \
  -v ON_ERROR_STOP=1 \
  -U postgres \
  -d postgres <<'SQL'
BEGIN;
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
COMMIT;
SQL
```

Dropping `public` removes every application table. Dropping `drizzle` removes
the migration ledger; without that step `bun run db:migrate` would consider all
migrations applied and recreate nothing.

## 3. Clear Redis

This removes stale sessions, rate limits, circuit-breaker state, and BullMQ
jobs associated with deleted database rows:

```bash
set -euo pipefail

REDIS_CONTAINER="$(
  sudo docker ps --format '{{.Names}}' |
  grep '^qyzco4bhefhtet1luvpfwsnx' |
  head -1
)"

test -n "$REDIS_CONTAINER" || {
  echo "ERROR: Redis container not found"
  exit 1
}

REDIS_PASSWORD="$(
  sudo docker exec "$REDIS_CONTAINER" env |
  grep -iE '^(REDIS_PASSWORD|requirepass)=' |
  head -1 |
  cut -d= -f2-
)"

test -n "$REDIS_PASSWORD" || {
  echo "ERROR: Redis password not found"
  exit 1
}

sudo docker exec "$REDIS_CONTAINER" \
  redis-cli -a "$REDIS_PASSWORD" FLUSHDB >/dev/null

sudo docker exec "$REDIS_CONTAINER" \
  redis-cli -a "$REDIS_PASSWORD" DBSIZE 2>/dev/null

unset REDIS_PASSWORD
```

The final result must be `0`.

## 4. Reapply every migration

Preferred path: push to `main` so the CD pipeline snapshots, migrates, and
deploys with the normal gates.

Manual path from a machine with tunnel access to the database:

```bash
DATABASE_URL="$PROD_DATABASE_URL" ENV_FILE=/tmp/cogito-reset-no-env \
  bun --cwd packages/db run db:migrate
```

`ENV_FILE` points at a missing file on purpose. Without it, `drizzle.config.ts`
loads `apps/server/.env` with `override: true` and could replace the production
URL with a local one.

Verify the ledger and table count before continuing:

```bash
psql "$PROD_DATABASE_URL" -c \
  'select count(*) as migrations from drizzle.__drizzle_migrations;' \
  -c "select count(*) as tables from information_schema.tables where table_schema = 'public';"
```

## 5. Start the API

Start `cogito-api` in Coolify and wait for `/health` to return `status: ok`.

## 6. Run the production seed

The production seed inserts canonical content only: Marks packages, blog
taxonomy, FAQ, competition taxonomy and calendar, and the default V3 economy
revision. It creates no admin, tutor, or student account and needs no seed
passwords.

The deployed image does not include the seed entrypoint. Run the guarded helper
from a repo checkout over an SSH tunnel:

```bash
# Terminal 1: tunnel the private database container.
ssh -N -L 6543:noxeaeuxfreq0axa9unpew5r:5432 root@<vps>

# Terminal 2: from the repo root.
export PROD_DATABASE_URL='postgresql://postgres:<password>@localhost:6543/postgres'
bun scripts/seed-prod-db.ts --confirm=localhost --via-tunnel
```

The helper checks the migration ledger, runs `seed:prod` against that URL, and
prints the final user count. It never creates accounts. Re-runs on a database
that already has users require `ALLOW_NONEMPTY_PROD_SEED=true`.

The seed is idempotent: existing package, FAQ, category, and calendar rows are
left untouched, so operator edits are never overwritten. It logs
`Production seed ready: canonical defaults only`.

For UAT review accounts with a published tutor and demo students, use the
separate UAT/dev seed (`bun run --cwd apps/server seed`) against a UAT database.
Do not run it for a launch-ready database.

## 7. Sign in the operators and verify

Sign in once with each address listed in `ADMIN_EMAILS` (default
`itcogitoacademy01@gmail.com,cogitoacademy.id@gmail.com`). The signup hook
stores each account with `role = admin`; server boot promotes an existing
account.

```bash
DB_CONTAINER="$(
  sudo docker ps --format '{{.Names}}' |
  grep '^noxeaeuxfreq0axa9unpew5r' |
  head -1
)"

sudo docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c '
  SELECT name, email, role, email_verified
  FROM "user"
  ORDER BY role, email;
'

curl --fail --silent https://api.cogitoacademy.id/health
echo
```

Both operator rows must show `role = admin`. Verify package pricing, FAQ, and
the competition calendar in the UI.

To give a UAT reviewer admin access, sign up that address as a normal account,
then grant the role from Admin > Admins while signed in as a super admin
(`cogitoacademy.id@gmail.com` or `itcogitoacademy01@gmail.com`). Revoke it after
UAT: the account stays and returns to `student`.

## Restore the pre-reset backup

Use a maintenance window and stop the API before restoring. Replace
`YYYY-MM-DD` with the recorded backup key:

```bash
sudo bash -c '
set -euo pipefail
set -a
source /etc/cogito/backup.env
set +a
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
aws s3 cp \
  "s3://${R2_BACKUP_BUCKET}/backups/YYYY-MM-DD.sql.gz" \
  /tmp/cogito-restore.sql.gz \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --region auto
'
```

The nightly backup is a custom-format archive (`pg_dump -Fc | gzip`), so restore
with `pg_restore`, not `psql -f`. The archive includes the `drizzle` schema, so
drop both schemas before restoring:

```bash
gunzip -c /tmp/cogito-restore.sql.gz >/tmp/cogito-restore.dump

DB_CONTAINER="$(
  sudo docker ps --format '{{.Names}}' |
  grep '^noxeaeuxfreq0axa9unpew5r' |
  head -1
)"

sudo docker exec "$DB_CONTAINER" psql -U postgres -d postgres \
  -c 'DROP SCHEMA IF EXISTS drizzle CASCADE;' \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

sudo docker cp /tmp/cogito-restore.dump \
  "$DB_CONTAINER":/tmp/cogito-restore.dump

sudo docker exec "$DB_CONTAINER" pg_restore \
  -U postgres -d postgres --no-owner --no-acl \
  /tmp/cogito-restore.dump

sudo docker exec "$DB_CONTAINER" rm -f /tmp/cogito-restore.dump
rm -f /tmp/cogito-restore.sql.gz /tmp/cogito-restore.dump
```

The CD pre-migrate snapshots (`pre-migrate-<sha>.sql.gz`) are plain SQL instead.
Restore those with `psql -U postgres -d postgres -f /tmp/cogito-restore.dump`
after the same schema drop.

Start the API only after the restore finishes and the `user` table matches the
recorded pre-reset state.
