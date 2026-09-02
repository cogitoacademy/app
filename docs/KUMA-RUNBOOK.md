# Uptime Kuma Operator Runbook

> Click-by-click operator runbook for the Uptime Kuma instance at
> `https://status.cogitoacademy.id` (Coolify service `cogito-uptime-kuma`,
> `louislam/uptime-kuma:2`, volume `uptime-kuma-data:/app/data`).
> Written 2026-09-02 from the live Kuma SQLite DB; the wiring described here
> was completed by the operator on 2026-09-02.

## Why this runbook exists

Kuma's monitors and notifications live in its own SQLite DB
(`/var/lib/docker/volumes/*uptime-kuma-data*/_data/kuma.db`) — the Coolify
API cannot express them. The Ansible playbook (`infra/ansible/uptime-kuma.yml`)
declares the service itself; everything in this runbook is a one-time UI pass
(revisit only when adding a monitor).

## Live state (verified 2026-09-02)

| Monitor          | Type              | Target                                | Interval | Retries | Keyword         |
| ---------------- | ----------------- | ------------------------------------- | -------- | ------- | --------------- |
| `api-health`     | HTTP(s) - Keyword | `https://api.cogitoacademy.id/health` | 60s      | 2       | `"status":"ok"` |
| `COGITO ACADEMY` | Group             | —                                     | 60s      | 0       | —               |
| `web-app`        | HTTP(s)           | `https://app.cogitoacademy.id`        | 60s      | 2       | —               |
| `DLQ DEPTH`      | HTTP(s) - Keyword | `https://api.cogitoacademy.id/health` | 60s      | 3       | `"dlqDepth":0`  |

- **Notification:** `COGITO ALERT` (Discord) — attached to **all four
  monitors** (`monitor_notification` non-empty; the 2026-09-02 fix).
- **Status page:** `cogito` published at `status.cogitoacademy.id` with the
  three service monitors (api-health, web-app, DLQ DEPTH).
- **Not created:** `api-cert` / `app-cert` certificate monitors (see
  "Add a monitor" below — recommended follow-up).

## The 503-flap root cause (why retries are set to 2)

10 down heartbeats on `api-health` at 09:01–12:05 UTC on 2026-09-02 correlate
1:1 with CD deploys (09:05, 09:08, 09:11, 09:17, 09:23, 09:28, 10:09, 12:01
UTC — `gh run list`). The API container restarts during a deploy; `/health`
returns 503 while the new image boots (the CD health poll allows up to
20×15s). With `maxretries=0` the first 503 was recorded as DOWN. The monitor
was **not** flapping randomly — it was correctly detecting deploy restarts.
Fix applied: `maxretries=2` + `retry_interval=60` (a 503 is accepted if the
next retry succeeds).

## The Discord-not-hitting root cause (why the attach matters)

The `COGITO ALERT` Discord notification existed in Kuma's DB but
`monitor_notification` was **empty** — no monitor was attached to it, so
nothing ever posted. The `DISCORD_WEBHOOK_URL` in `/etc/cogito/disk.env` is
for the **disk watchdog** (a different path that works independently). Fix
applied: notification #1 attached to every monitor in the Kuma UI.

## First-run setup (only if the service is ever recreated)

1. Open `https://status.cogitoacademy.id` → create the admin account
   (first-run screen).
2. **Notifications → Setup Notifications → Discord**: paste
   `DISCORD_WEBHOOK_URL` from the vault
   (`sops -d infra/secrets/prod.env | grep DISCORD_WEBHOOK_URL | cut -d= -f2-`)
   → **Test** (a message must land in the ops Discord channel) → Save.
3. **Add New Monitor** (each, 60s interval, "Apply on all existing…"
   unchecked; attach the Discord notification to each):
   - `api-health` — HTTP(s) - Keyword: `https://api.cogitoacademy.id/health`,
     keyword `"status":"ok"`, heartbeat retry **2** (deploy-restart
     tolerance — see the flap root cause above).
   - `web-app` — HTTP(s): `https://app.cogitoacademy.id`, heartbeat retry 2.
   - `api-cert` / `app-cert` — HTTP(s) - Certificate Info for
     `api.cogitoacademy.id` / `app.cogitoacademy.id` (alert before expiry).
   - `dlq-depth` — HTTP(s) - Keyword on
     `https://api.cogitoacademy.id/health`, keyword `"dlqDepth":0`, heartbeat
     retry 3 — DOWN = fresh DLQ failures exist (age-aware; stale entries
     never trip it).
4. **Test each monitor** — a Discord post should arrive.
5. **Status Pages → New Status Page** (slug `cogito`), add the monitors,
   publish — this is the dashboard served at `status.cogitoacademy.id`.

## Add a monitor (recurring task)

1. Kuma UI → **Add New Monitor** → configure (see the table above for the
   existing pattern).
2. **Attach the `COGITO ALERT` notification** to the new monitor
   (monitor edit → Notifications → select `COGITO ALERT`) — this is the step
   that was missed before 2026-09-02 and silently killed Discord alerting.
3. **Test** the monitor — a Discord post must arrive.
4. Optional: add it to the `cogito` status page.

## Read-only verification (from the VPS)

```bash
sudo -n cp /var/lib/docker/volumes/*uptime-kuma-data*/_data/kuma.db /tmp/kuma.db && sudo -n chmod 644 /tmp/kuma.db
python3 -c "
import sqlite3
db = sqlite3.connect('/tmp/kuma.db')
print('monitors:', [r[1] for r in db.execute('SELECT id, name FROM monitor')])
print('notifications:', [r[1] for r in db.execute('SELECT id, name FROM notification')])
print('attachments:', list(db.execute('SELECT * FROM monitor_notification')))
print('api-health retries:', db.execute('SELECT maxretries, retry_interval, keyword FROM monitor WHERE id=1').fetchone())
"
```

Expected (2026-09-02 state): 4 monitors, 1 notification, non-empty
`monitor_notification`, `maxretries=2`, keyword `"status":"ok"`.

## Kill-container drill (optional)

To prove Discord alerting end-to-end: stop the API container
(`sudo -n docker stop <api-container>`) → wait ~2 min → a DOWN alert must
land in Discord → restart the container → an UP alert must land. The
2026-09-02 wiring was verified via the real 503-flap heartbeats instead of a
kill drill; the drill remains a good periodic check.
