# Production Data Reset

Use this procedure only for an explicitly approved prelaunch reset. It deletes
all application users and transactional data while preserving migrations,
subject taxonomy, and the Marks package catalog. Never delete the PostgreSQL
resource or volume in Coolify.

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

## 2. Stop the API and truncate application data

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

TRUNCATE TABLE
  "booking_state_history",
  "contact_request",
  "booking_participant",
  "booking_reschedule_proposal",
  "booking_session",
  "session_note",
  "session_completion_feedback",
  "booking",
  "notification_dispatch",
  "notification",
  "payment_record",
  "refund_record",
  "ledger_entry",
  "availability_slot",
  "meeting_event",
  "room_booking",
  "room",
  "tutor_profile_subject",
  "tutor_profile",
  "tutor_invite",
  "tutor_payout",
  "wallet",
  "achievement",
  "audit_log",
  "support_ticket",
  "knowledge_bank_access_grant",
  "student_profile",
  "account",
  "session",
  "verification",
  "user"
CASCADE;

INSERT INTO "economy_config" (
  "id",
  "mark_value_idr",
  "min_tutor_base_rate_idr",
  "online_tutor_increment_idr",
  "offline_tutor_increment_idr",
  "online_cogito_base_idr",
  "online_cogito_increment_idr",
  "offline_cogito_base_idr",
  "offline_cogito_increment_idr",
  "version",
  "updated_by"
)
VALUES (
  'default', 5000, 50000, 30000, 40000,
  50000, 20000, 90000, 40000, 1, NULL
)
ON CONFLICT ("id") DO UPDATE SET
  "mark_value_idr" = EXCLUDED."mark_value_idr",
  "min_tutor_base_rate_idr" = EXCLUDED."min_tutor_base_rate_idr",
  "online_tutor_increment_idr" = EXCLUDED."online_tutor_increment_idr",
  "offline_tutor_increment_idr" = EXCLUDED."offline_tutor_increment_idr",
  "online_cogito_base_idr" = EXCLUDED."online_cogito_base_idr",
  "online_cogito_increment_idr" = EXCLUDED."online_cogito_increment_idr",
  "offline_cogito_base_idr" = EXCLUDED."offline_cogito_base_idr",
  "offline_cogito_increment_idr" = EXCLUDED."offline_cogito_increment_idr",
  "version" = EXCLUDED."version",
  "updated_by" = NULL;

COMMIT;
SQL
```

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

## 4. Start API and run the guarded seed

Start `cogito-api` in Coolify and wait for `/health` to return `status: ok`.
Use unique temporary passwords of at least 12 characters. Never put passwords
in this document, shell history, Coolify environment, or chat. The review admin
must not be an address listed in `ADMIN_EMAILS`.

Run on the VPS:

```bash
set -euo pipefail

API_CONTAINER="$(
  sudo docker ps --format '{{.Names}}' |
  grep '^6ophpbzmsblhvetxi47gqd7e' |
  head -1
)"

test -n "$API_CONTAINER" || {
  echo "ERROR: cogito-api container not running"
  exit 1
}

read -rp "Review admin email: " ADMIN_EMAIL
read -rsp "Admin password (12+ characters): " ADMIN_PASSWORD; echo
read -rsp "Tutor password (12+ characters): " TUTOR_PASSWORD; echo
read -rsp "Student password (12+ characters): " STUDENT_PASSWORD; echo

if [ "${#ADMIN_PASSWORD}" -lt 12 ] ||
   [ "${#TUTOR_PASSWORD}" -lt 12 ] ||
   [ "${#STUDENT_PASSWORD}" -lt 12 ]; then
  echo "ERROR: every password must contain at least 12 characters"
  exit 1
fi

SEED_FILE="$(mktemp)"
cleanup() {
  rm -f "$SEED_FILE"
  sudo docker exec --user root "$API_CONTAINER" \
    rm -f /app/apps/server/seed-production.ts 2>/dev/null || true
  unset ADMIN_PASSWORD TUTOR_PASSWORD STUDENT_PASSWORD
}
trap cleanup EXIT

curl --fail --silent --show-error --location \
  "https://raw.githubusercontent.com/cogitoacademy/app/main/apps/server/src/seed/seed.ts" \
  --output "$SEED_FILE"

sudo docker cp "$SEED_FILE" \
  "$API_CONTAINER:/app/apps/server/seed-production.ts"

printf '%s\n%s\n%s\n%s\n' \
  "$ADMIN_EMAIL" \
  "$ADMIN_PASSWORD" \
  "$TUTOR_PASSWORD" \
  "$STUDENT_PASSWORD" |
sudo docker exec -i --workdir /app "$API_CONTAINER" sh -c '
  set -eu
  IFS= read -r SEED_REVIEW_ADMIN_EMAIL
  IFS= read -r SEED_ADMIN_PASSWORD
  IFS= read -r SEED_TUTOR_PASSWORD
  IFS= read -r SEED_STUDENT_PASSWORD
  export SEED_REVIEW_ADMIN_EMAIL SEED_ADMIN_PASSWORD
  export SEED_TUTOR_PASSWORD SEED_STUDENT_PASSWORD
  export SEED_ALLOWED_IN_PROD=true
  export SEED_REVIEW_TUTOR_EMAIL=cogito.diego@yopmail.com
  export SEED_REVIEW_STUDENT_EMAIL=cogito.andre@yopmail.com
  bun run /app/apps/server/seed-production.ts
'
```

The launch seed creates one review admin, Diego as the published tutor, and
Andre, Argya, and Athena as verified students with 200 Marks each. Seed
warnings that verification email delivery is not configured are expected: the
script marks these deterministic review accounts verified after signup.

## 5. Verify and rotate credentials

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

Then verify admin login, tutor discovery, future tutor availability, each
student's 200-Mark wallet, and one booking flow. Sign up the operator address
listed in `ADMIN_EMAILS` separately; server boot/signup promotion makes it an
admin. Rotate every temporary seed password before public launch.

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

gunzip -c /tmp/cogito-restore.sql.gz >/tmp/cogito-restore.dump

DB_CONTAINER="$(
  sudo docker ps --format '{{.Names}}' |
  grep '^noxeaeuxfreq0axa9unpew5r' |
  head -1
)"

sudo docker exec "$DB_CONTAINER" psql -U postgres -d postgres \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

sudo docker cp /tmp/cogito-restore.dump \
  "$DB_CONTAINER:/tmp/cogito-restore.dump"

sudo docker exec "$DB_CONTAINER" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  -U postgres \
  -d postgres \
  /tmp/cogito-restore.dump
```

Clear Redis again, restart the API, and verify `/health`, user counts, wallet
balances, and recent bookings before ending the maintenance window.
