# Cogito Runbook

Last updated: 2026-08-24

For manual tutor-invite delivery, copy the visible latest link. After reloading the page, use **Generate & copy link** on a pending invitation history entry; this safely rotates the token instead of persisting plaintext secrets.

**Generate & copy link** never sends email. Use the separate **Send again** action when an admin intentionally wants Resend to deliver a replacement link.

Tutor invitation delivery should be smoke-tested in both desktop and mobile email clients. Verify the **Accept invitation & set up profile** button and fallback URL lead to `/invite?token=…`, the invited account email is correct, and the displayed expiry is explicitly labeled UTC.

## Starting the Server

### Login/auth smoke check

Open `/login` in a clean browser and sign in as a student, tutor, and admin. The email button may show progress while the auth request and fresh session read complete; it must then go directly to `/dashboard`, `/onboarding`, or `/admin-tutors` without an intermediate `/login` navigation. Verify a wrong password returns the form with an error and the button is usable again. For a return link such as `/login?redirect=/bookings`, verify it lands on the validated target after the same handoff.

### Dashboard smoke check

After a web deployment, sign in once as each supported role and open `/dashboard`. Verify the sidebar user menu shows the authenticated profile image when one is configured and uses initials when it is not:

- Student: learning welcome, next lesson, Knowledge Bank/calendar, and tutor recommendations. Confirm the welcome card shows the SVG illustration and shared spacing/sizing used by the tutor dashboard. If a booking exists, confirm the next-lesson card matches the booking-list date tile, participant metadata, Marks display, status tooltip, and detail action.
- Tutor: the first dashboard row shows the same SVG welcome card visual plus teaching setup, and the next visible row shows requests to review plus next lesson before metrics/payout; actions link to `/bookings`, `/availability`, and `/onboarding`. Verify the review card keeps its empty/loading slot when there are no requests. When a tutor submits the initial onboarding form, confirm the app redirects to `/dashboard` and the browser Back button does not return to the submission form.
- Admin: open `/admin` for the admin workspace and verify priority operations/moderation counts and links to `/admin-operations`, `/admin-tutors`, `/admin-achievements`, and `/admin-economy`. In `/admin-operations`, verify category, urgency, and SLA-status filters; open a queue item and confirm its reported reason/source, affected-user count, OQ-04 deadline, time-since-report, escalated badge, and WhatsApp escalation link. Confirm the hydrated participant wallet/booking-ledger cards and state-history timeline load, then use **Open override** to reach the existing preview/apply flow. In `/admin-economy`, verify the active schedule loads, edits persist after reload, and the preview updates.
- In the Operations → Rooms tab, verify the pending offline room-approval queue loads. Use **Assign** for a requested room, **Choose another** to load a booking into the room form (which also exposes the existing relocate operation), and **Cancel** when no suitable room is available.

### Competition Calendar smoke check

As an authenticated user, open `/calendar` and confirm published Sanity competitions render in the month grid. Verify today, outside-month days, multi-day spans, and the `+N more` overflow popup; select an event from either the grid or popup and confirm the responsive details modal shows categories, level, scale, organizer, location, timeline, registration deadline, description, and the available external-link actions. Switch to **Agenda**, confirm the 30-day grouped list and rich event cards, use `M`/`A` to switch views, and verify previous/next period plus **Today** navigation. The calendar remains read-only and the browser console should remain free of runtime errors.

The route selects the dashboard from the authenticated session role. A tutor or admin must never receive student-only wallet or booking queries from this page.

### How Cogito Works guide smoke check

Open `/guide` after signing in as each supported role. Verify the guide loads without API requests beyond the existing authenticated shell, presents the correct journey by default, and exposes the following views:

- Student: Student only.
- Tutor: Tutor and Student.
- Admin: Admin, Tutor, and Student.

Select each available role view from the standalone control at the top and confirm the URL updates with `?view=...`, all step details are open on first load, and a disallowed view falls back to the role's default. On desktop, verify the guide content fills the available main column and the chapter navigation remains visible as a sticky secondary sidebar on the right while marking the chapter currently in view; on narrow screens, verify it stacks above the content without horizontal scrolling. Use the global Collapse/Expand details control and individual timeline buttons with both pointer and keyboard input; verify the height and content transitions are smooth, reduced-motion preferences remove the motion, and statuses, What if? branches, and CTAs remain readable. Check that CTAs open the existing tutor, booking, profile, operations, achievement, economy, calendar, balance, and resource surfaces.

Guide copy is maintained in `apps/web/src/components/guide/guide-content.ts`. When a booking state, role responsibility, or linked route changes, update the corresponding typed step/branch and the guide content test in the same change. The guide is intentionally code-managed in v1; no admin editor, CMS publish step, or API migration is required. During local visual refinement, toggle the development-only Tweaks Bar with `Ctrl/Cmd+Shift+.`; treat its values as exploration until the chosen change is copied deliberately into the guide styles.

The shared route pending state uses the Selia spinner from `apps/web/src/components/loader.tsx`. If a navigation smoke test catches a loading state, verify the spinner remains visible in both light and dark themes and stops animating under reduced-motion preferences.

### Notification inbox smoke check

As a signed-in student or tutor, open `/notifications` and confirm the list shows the notification title/body, a human-readable category badge, an exact date/time, relative age, unread emphasis, and a booking link when the notification has a booking. Select one row and verify **Mark as read** and **Mark as unread** both update the row and the shell bell count. Select multiple rows, use **Select all**, and verify both bulk actions update only the selected rows. Loading older notifications must keep the current selection model usable; changing read status must clear the selection after success. As another user, confirm a selected ID cannot change a notification owned by someone else.

### Economy rate-control smoke check

As an admin, open `/admin-economy`, confirm the Marks value, tutor minimum/increments,
and online/offline Cogito take schedule are visible. Change a Cogito base or increment
by a valid Rp 5,000 step, save, reload, and verify the version increments and the
preview for class sizes 1–6 changes. The save is optimistic-lock protected and affects
only future booking/repricing snapshots; existing booking snapshots must remain unchanged.
After a successful change, verify a `Cogito rate updated` in-app notification appears
for every current tutor. Re-saving the same values should not increment the version,
add an audit row, or create another notification.
As a student or tutor, opening `/admin-economy` must redirect away and direct
`admin.getEconomySettings`/update calls must return FORBIDDEN.

Tutor onboarding should show IDR base honorarium fields (online/offline), enforce the
Rp 50,000 minimum and Rp 5,000 steps, and must not describe Marks as cash-out. Student
tutor discovery and booking previews should show computed Marks per student for the
selected modality; legacy profiles without `baseRatesIdr` remain readable.

### Shared booking list smoke check

With seeded student, tutor, and admin sessions, open `/bookings` and verify the same list layout loads for each role. Students see proposer/participant bookings, tutors see assigned bookings with the Cogito mark icon before `Earns: X` and `Total: Y`, and admins see the full list with the icon before `Total X` and `Tutor Y`, with no lifecycle mutations. Verify the Upcoming/Pending/Recurring/Past/Cancelled/All tabs, that generic status badges are hidden outside All (except attention states), and that hovering/focusing a visible status badge shows its explanation. Confirm mobile rows keep date, location, and tutor name readable beside the booking summary, while desktop time/location/tutor metadata stays aligned and the action button remains at the far edge. For single-session group bookings, student `You pay` must show the per-student amount, and the participant avatar stack must not include the tutor. Open a row’s detail page to perform actions; list rows should not expose inline cancellation or reschedule mutations. `/tutor-bookings` should redirect to `/bookings`.

Verify the role-aware default tab: students open on Upcoming, tutors open on Pending when a pending request exists (otherwise Upcoming), and admins open on All. An explicit `?tab=` selection must override the default. Upcoming/Pending/Recurring/All rows should be ordered by the nearest scheduled date, while Past/Cancelled show the most recent history first.

### Booking detail smoke check

Open an online booking detail and verify the overview shows date/time first, then `Format & access` with the meeting CTA or pending/retry status, followed by participant rows with saved profile images (or initials), names, roles, and confirmation states. On desktop participants may use two columns; on narrow screens they stack without hiding names. When available, `Booking actions` appears above Marks in the sticky desktop rail and before Activity on narrow screens; session notes/support reports remain in the main flow. Every Marks amount has the Cogito mark prefix. The Activity card should read newest-first as a vertical timeline with a transition-specific icon, one destination-state badge, actor type, timestamp in the booking timezone, and any transition reason; the previous state is shown as muted context when available. After a tutor accepts an online booking, the link is generated immediately; a successful provider call moves the booking to `scheduled`. If provider creation fails, the booking remains `confirmed`, the detail overview says it is retrying, and the `retry-failed-meetings` scheduler retries every 5 minutes. Confirm that a manual admin URL becomes visible after `adminBooking.setMeetingLink`, including after multiple failed provider rows. For an offline booking, verify the same overview section shows the room name and location instead of a meeting CTA.

The overview row must show one `Date & time` field with the date and session hours merged beside `Format & access` in a two-column desktop grid; on narrow screens the two fields stack without horizontal overflow. For unavailable online meeting links, the `Format & access` section now shows only the compact info/warning trigger; activate it with mouse, keyboard, and touch to verify the Selia popover exposes the pending/failed explanation plus retry or admin setup status. Ready links must keep the `Ready` badge and meeting CTA. Confirm the Participants heading uses the matching Selia `IconBox`, and on desktop all eligible booking actions, including propose and complete, sit at the bottom of the right header column beneath the state badge.

### Form-control smoke check

On availability/profile/admin forms, verify dates use the Selia date picker, times use the 24-hour minute control, multiline fields use Selia Textarea, and IDR amounts use Selia NumberField. On `/availability`, confirm both weekly time fields stay compact and equal in width with a centered dash between them, while focusing a time field allows its suggestions to extend beyond the field when needed; confirm the modality trigger keeps its icon and label on one row. On the calendar, verify month/year dropdowns open as Selia selects and retain the selected value. No app-level raw date, time, number, select, or textarea control should appear, and the browser console should remain free of runtime errors.

### Achievement form smoke check

As a student, open `/achievements`, choose **Add Achievement**, and verify the Category and Level selects open above the modal and update their triggers. Open **Awarding Date**, confirm the calendar is visible above the modal, select a day, and verify the trigger shows the chosen date. Open the calendar month/year dropdowns as well; each popup must remain clickable and must not be hidden behind the dialog backdrop. This is a UI-only check; the existing `achievement.create` input and `awardingDate` contract remain unchanged.

On a completed booking, verify the Session notes card is visible to both tutor and student. Select text and exercise bold, italic, heading, paragraph, bullet, numbered-list, and safe-link actions; confirm the live preview matches the persisted note after reload, the author label distinguishes your note from the other participant's note, and an attempted `<script>` or `javascript:` link is removed by the render sanitizer.

For a group booking with a pending invite, verify the invitee sees **Accept invitation** and **Decline invitation** (decline is the pre-confirmation exit path). As the booking proposer, verify **Withdraw invite** opens an in-app confirmation dialog, optionally records a reason, marks only the selected pending invitee `withdrawn_pre_h2`, leaves confirmed headcount and Marks holds unchanged, and creates a notification for that invitee. A confirmed participant uses the separate participant `withdraw` flow; group-series no-opt-out rules still apply.

### Reschedule proposal smoke check

From a booking detail in `awaiting_tutor_review`, `confirmed`, or `scheduled`, verify that a student booking proposer submits through `/rpc/booking/reschedule/propose` and a tutor submits through `/rpc/tutor/booking/reschedule/propose`. Both should show the success toast and move the booking to `reschedule_proposed`; a tutor may choose a custom time outside the published availability window. A student proposal in `confirmed` or `scheduled` remains valid before H-2, while a proposal at or after H-2 must be rejected as not editable. A tutor receiving `403 Student access required` indicates the frontend is using the wrong procedure. Group bookings still in `awaiting_participant_confirmation` intentionally wait for invitees before rescheduling is enabled. Force-majeure requests after H-2 follow support/admin exception handling and require an auditable override decision rather than the normal reschedule mutation.

### Tutor subject taxonomy smoke check

Open `/onboarding` as a tutor and verify the subject selector loads active mother categories and their child subjects from `tutors.listSubjects`. After choosing a mother category, the selector trigger must show its human-readable name rather than the category UUID. Select at least one child subject, save a draft, and confirm the selected subjects reload with the profile. A submission with no child subject must be blocked; published tutor discovery should expose the selected subjects and allow students to filter by mother category or child subject. On the tutor list page, category, child-subject, and modality filter triggers must show their labels rather than raw IDs or values. Confirm the category and child-subject controls support selecting multiple values, show `+N more` when needed, retain overlapping subjects while categories are added, remove subjects that are no longer available after a category is removed, and wait about 300 ms after typing/toggling before `listPublished` runs.

### Profile UX smoke check

Open `/profile` as a student and `/onboarding` as a tutor at desktop and narrow widths. Verify the account card shows the current name, profile image (or initials), and read-only sign-in email; changing the name or image enables only the account save action. On the student page, learning and parent/guardian fields use separate sections with one learning-profile save action. On the tutor page, profile status and review feedback remain visible, fields are grouped into public profile/teaching setup/availability sections, and the sticky action area offers draft save plus submit-for-review only when the profile is editable. Confirm the browser console has no runtime errors and that no profile API contract changes are required.

The authenticated shell shows a session-expiry warning during the final 30 minutes of Better Auth's seven-day session. The warning includes a sign-in-again action; an API `401` remains the fallback redirect for expired sessions.

### Development

```bash
bun run dev              # Starts web + server (port 3001)
bun run dev:server       # Server only
bun run dev:web          # Web only (port 3000)
```

### Production

```bash
bun run build            # Build server + web
NODE_ENV=production bun apps/server/dist/index.js
```

The server runs on port 3001 by default (configurable via `PORT` env var).

## Database

### Start PostgreSQL (Docker)

```bash
bun run db:start         # Starts PostgreSQL (dev DB cogito-app) on port 6767
bun run db:test          # Starts isolated test PostgreSQL + Redis (docker-compose.test.yml) on port 6767
```

> Note: the dev and test PostgreSQL containers both map host port 6767 — do not run `db:start` and `db:test` simultaneously. `db:test` uses `docker-compose.test.yml` (repo root) and the test harness targets `cogito-test` via `apps/server/.env.test(.example)`.

> **Shutdown noise (C6):** stopping the Postgres container while the app still holds pooled connections prints `FATAL: terminating connection due to administrator command` lines — that is normal fast-shutdown, not a failure. Postgres has a `stop_grace_period: 30s` in both compose files; stop the app (or `docker compose stop` the app service) **before** the DB so connections drain cleanly. On Coolify, set a stop grace period ≥ 30s for the app so graceful shutdown (redis quit + DB drain) can finish before SIGKILL.

### Run Migrations

```bash
bun run db:migrate       # Apply pending migrations
bun run db:generate      # Generate new migration from schema changes
```

If tutor discovery returns `500` with a missing `subject_category` or
`tutor_profile_subject` relation, the local database is behind migration
`0027_subject_taxonomy.sql`. Apply that migration (or the equivalent reviewed
pending migration) and restart the server. `bun run db:push` can detect broad
schema drift and ask ambiguous rename questions; review those prompts instead
of accepting unrelated changes blindly.

The IDR economy and admin rate-control surface require migration
`0028_economy_config.sql`. Run `bun run db:migrate` before starting the server;
it adds `tutor_profile.base_rates_idr`, creates the singleton
`economy_config` row with client-approved defaults, and is safe to rerun.

With the migration present, selecting a mother category or child subject
should execute the normalized relation filter and return either matching
tutors or an empty list—not a `500`. If only filtered requests fail, restart
the server after the latest API build and inspect the emitted SQL for the
`tutor_profile_subject`/`subject_category` filter aliases.

If `support.listTickets` returns `500` and the server log reports a missing
`support_ticket` relation, apply migration `0013_grey_sphinx.sql` and restart
the server. The procedure reads this table directly; a missing relation is a
database migration problem, not an empty ticket list.

For isolated local test runs, the test runner migrates `cogito-test` automatically
using `apps/server/.env.test` or `apps/server/.env.test.example`.

### Seed the Database

```bash
bun run seed-packages          # Seeds mark packages and test data
```

Production guard: `NODE_ENV=production bun run seed-packages` will exit with error.

### Reset the Database

```bash
# Stop and remove the Docker container, then recreate:
docker compose down -v
bun run db:start
bun run db:migrate
bun run seed-packages
```

Test database reset:

```bash
docker compose -f docker-compose.test.yml down -v
bun run db:test
```

### Drizzle Studio (Database GUI)

```bash
bun run db:studio        # Opens Drizzle Studio on port 4983
```

## Redis

### Check Redis Connection

```bash
redis-cli ping           # Should return PONG
redis-cli info server    # Server info
```

### Application Health Check

```bash
curl http://localhost:3001/health
# Returns: { "status": "ok", "checks": { "database": "ok", "redis": "ok" }, "timestamp": "..." }
```

Redis is **mandatory** (`REDIS_URL` is required — the server won't boot without it). The in-memory stores are defensive fallbacks only when a configured Redis call fails at runtime; they are per-process and degrade cross-instance guarantees.

### Clear Rate Limit Keys

```bash
redis-cli KEYS "cogito:rl:*"       # List rate limit keys
redis-cli DEL "cogito:rl:127.0.0.1" # Clear specific key
redis-cli --scan --pattern "cogito:rl:*" | xargs redis-cli DEL  # Clear all
```

### Reset Circuit Breaker State

```bash
redis-cli KEYS "cogito:cb:*"       # List circuit breaker keys
redis-cli DEL "cogito:cb:google_meet"  # Reset Google Meet circuit
redis-cli DEL "cogito:cb:resend"       # Reset Resend circuit
redis-cli DEL "cogito:cb:xendit"       # Reset Xendit circuit
```

### Monitor BullMQ Jobs

```bash
redis-cli KEYS "cogito-jobs:*"     # List all job keys
redis-cli LLEN "cogito-jobs:wait"  # Jobs waiting
redis-cli LLEN "cogito-jobs:failed" # Failed jobs
redis-cli ZCARD "cogito-jobs:delayed" # Delayed jobs
```

## Test and Coverage

Run the CI-equivalent coverage suite from the repository root after starting the test Postgres and Redis services:

```bash
bun test --coverage --timeout 30000 packages/api/src/tests/ packages/env/src/ packages/auth/src/ packages/db/src/ apps/server/src/openapi.test.ts
```

The workflow also runs the server suite in a separate process because its webhook test uses module mocking. The coverage comment script enforces 100% line coverage for `packages/api` and 100% line coverage overall from `coverage/lcov.info`; the Bun command's own function/statement threshold is a separate diagnostic and is not the CI gate.

## Common Errors

### `BOOKING_CONFLICT` (409)

Two bookings overlap the same tutor time slot. The overlap check uses an exclusion constraint on `tutor_id` + time range. Wait for the other booking to expire or cancel.

### `INSUFFICIENT_BALANCE` / `INSUFFICIENT_MARKS` (400)

Student's `availableBalance` is less than the required hold amount. Check wallet balance via `wallet.getOrCreate`.

### `BOOKING_STATE_TRANSITION` (409)

Invalid state machine transition. Check `booking-transitions.ts` for valid transitions.

For rescheduling, `reschedule_proposed` must return to the state captured in `booking.previousState` after unanimous acceptance or rejection. A partial acceptance must leave both the current schedule and `reschedule_proposed` state unchanged. If a decision reports that no pending proposal exists, refresh booking detail: the supplied `proposalId` may belong to a superseded proposal.

When a 24-hour reschedule proposal deadline passes, expire only the proposal. Keep the original schedule and wallet holds, restore `booking.previousState`, and do not cancel the provider meeting event.

### `BOOKING_NOT_EDITABLE` while creating a booking (400)

Confirm the chosen start is inside the selected tutor availability window and leaves the full server-fixed 90 minutes before the window ends. The web form shows the valid start range and blocks invalid submissions. Also verify the availability is active and that no non-terminal booking overlaps the requested session; declined, cancelled, and expired bookings should not keep the time blocked.

### `LAST_ADMIN` (409)

Attempted to remove the last admin role. Promote another user to admin first.

### `OPTIMISTIC_LOCK` (409)

Concurrent modification conflict. The `version` field didn't match. Retry the operation.

### Circuit Breaker Open Errors

- `Email service unavailable: 503` — Resend circuit breaker is open. Wait 2 minutes or reset manually.
- `Google Meet API timeout after 30s` — Google Meet circuit breaker is open. Wait 1 minute or reset manually.
- `Payment provider error` — Xendit circuit breaker is open. Wait 30 seconds or reset manually.

### Database Connection Errors

- `ECONNREFUSED` — PostgreSQL not running. Run `bun run db:start`.
- `ECONNREFUSED` during tests — Start the isolated test DB with `bun run db:test`.
- `connection timeout` — Check `DATABASE_URL` in `.env`.

### Test Safety Guard

- `Refusing to run tests against a non-test database` — The test harness detected a `DATABASE_URL` whose database name does not include `test`.
- `resetDatabase() is blocked outside a dedicated test database` — An integration test tried to truncate tables while pointed at a non-test database.

### Role-boundary errors

- `FORBIDDEN: Student access required` is expected when tutor/admin sessions call tutor-discovery or student booking mutations. Use protected `booking.listMine`/`booking.get` for the shared booking read surface, `tutorActions.*` for tutor fulfillment, and `adminTutor.*`/`adminBooking.*` for admin review.

### Redis Connection Errors

- `ECONNREFUSED` — Redis not running. Start it (`bun run db:start` brings up postgres + redis). Redis is required; the server fails fast on env validation if `REDIS_URL` is missing.

## Rollback a Deployment

Deployments are Coolify auto-deploys from GHCR images (`ghcr.io/cogitoacademy/app/{server,web}`). Rollback is done in Coolify:

1. Open the Coolify dashboard → the service (server / web)
2. Use **Rollback to previous release** (Coolify keeps the previous image/version)
3. Verify health: `curl https://cogitoacademy.id/health`
4. If a database migration was part of the deployment, check migration status:
   ```bash
   bun run db:studio  # Check migration table
   ```
5. Roll back migrations if needed (rare — coordinate with DBA)

## Agent Herd

Parallel development with a lead agent and skill-gated worker agents on top of Herdr. Prereqs: `herdr` + `herd` installed (`~/.local/bin/`), you are inside a Herdr-managed pane (`echo $HERDR_ENV` → `1`).

Roles:

- **Lead** (`~/.config/opencode/agents/lead.md`): plans, proposes the per-goal worker roster, spawns/monitors/verifies workers. The lead never spawns workers without user approval and never resolves a worker `blocked` state on its own — it escalates to the user first.
- **Workers** (`.opencode/agents/worker-*.md`): `worker-frontend` (frontend-design), `worker-review` (code-review, read-only), `worker-feature` (feature-workflow), `worker-core` (engineering-core), `worker-prod` (production-reliability). Each is skill-gated via `permission.skill` (`*` denied, one allowed) so unrelated skill bodies never load in its context, and carries anti-loop rules (never re-run a command that already produced output).

### Dispatch one goal across workers

```bash
# 1. Per unit of work, create an isolated worktree + branch (required for parallel
#    write-capable workers — they must never share a working directory)
herd worktree feat/f1-admin-dashboard    # cwd defaults to the repo; creates workspace + pane

# 2. Spawn a worker pinned to its role (passes --agent <role> to the opencode process)
herd-spawn-worker w-frontend worker-frontend /path/to/worktree

# 3. Submit a self-contained brief (goal / scope / constraints / acceptance criteria /
#    WORKER-REPORT.md contract / escalation rule — workers cannot see the lead's conversation)
herd prompt w-frontend "Implement F1 per docs/plans/active/FRONTEND-GAPS-SPEC.md. Scope: apps/web. Use the frontend-design skill. Write WORKER-REPORT.md at repo root; stop and report rather than guess."

# 4. Monitor — block, never sleep-poll
herdr agent wait w-frontend --timeout 300000   # blocks until idle/done/blocked
herd read w-frontend                            # inspect output / a blocked question

# 5. User answers a blocked worker directly, e.g. to type a password
herd attach w-frontend                         # detach: ctrl+b q

# 6. Verify before integrating (never trust "done"): read WORKER-REPORT.md,
#    run bun run check + bun run check-types per worker, review the diff,
#    diff worker file sets against each other to catch overlaps.
```

### Integration (PR + CI + squash-merge)

Worker branches are never merged directly into main:

```bash
# 1. Rebuild the wave as a clean feature branch from origin/main with
#    Conventional Commits (type(scope): short description + body)
git checkout -b fix/waveN-<area> origin/main
# ... apply the verified changes in logical commits ...

# 2. Push + PR with a full body (Summary/Why/Implementation/Testing/Risks/Rollback/Notes)
git push -u origin fix/waveN-<area>
gh pr create --title "..." --body "..."

# 3. Wait for CI (blocking watch, never sleep-wait)
gh pr checks <n> --watch

# 4. Squash-merge when green
gh pr merge <n> --squash --delete-branch
```

Findings/concerns discovered during a wave are documented in `docs/plans/active/` in the same PR (planning-first, AGENTS.md rule 11).

### Lifecycle

- Detach the TUI (`ctrl+b q`) and the Herdr server keeps all panes/agents running headless; reattach with `herdr`. Remote/multi-device attach: `herdr --remote <ssh-target>` (see herdr docs, "Persistence and remote access").
- Worker approval/`blocked` states wait for a user; there is no fully unattended flow by design.
- Agent names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents.
- Cleanup: `herd` never closes panes/workspaces it didn't create; close finished worker panes explicitly.

## Environment Variables

Student account name/image editing uses the existing Better Auth session and requires no additional environment variables or database migration.

Key environment variables (see `.env.example` for full list):

| Variable                                                                                      | Required | Description                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                                | Yes      | PostgreSQL connection string                                                                                                                                 |
| `BETTER_AUTH_SECRET`                                                                          | Yes      | Auth secret key                                                                                                                                              |
| `BETTER_AUTH_URL`                                                                             | Yes      | Base URL for auth cookies                                                                                                                                    |
| `CORS_ORIGIN`                                                                                 | Yes      | Allowed CORS origin                                                                                                                                          |
| `PAYMENT_WEBHOOK_SECRET`                                                                      | Yes      | Webhook verification secret (provider-agnostic)                                                                                                              |
| `REDIS_URL`                                                                                   | Yes      | Redis URL (required since #48 — mandatory for boot)                                                                                                          |
| `GOOGLE_CLIENT_EMAIL`                                                                         | No       | Google service account email                                                                                                                                 |
| `GOOGLE_PRIVATE_KEY`                                                                          | No       | Google service account private key                                                                                                                           |
| `GOOGLE_CALENDAR_ID`                                                                          | No       | Google Calendar ID for meeting creation                                                                                                                      |
| `GOOGLE_IMPERSONATED_USER`                                                                    | No       | SA-mode impersonation address (REVIEW-FIXES-4 P4.2)                                                                                                          |
| `GOOGLE_MEET_ENABLED`                                                                         | No       | Enables Google Meet provider (default false)                                                                                                                 |
| `GOOGLE_MEET_CLIENT_ID`/`GOOGLE_MEET_CLIENT_SECRET`/`GOOGLE_MEET_REFRESH_TOKEN`               | No       | OAuth path credentials for Google Meet                                                                                                                       |
| `RESEND_API_KEY`                                                                              | No       | Resend API key (required in production/staging — P4.1)                                                                                                       |
| `EMAIL_FROM`                                                                                  | No       | Sender address (default `noreply@cogitoacademy.id`; must be a verified Resend domain in prod/staging)                                                        |
| `XENDIT_SECRET_KEY`                                                                           | No       | Xendit API secret key (required when `PAYMENT_PROVIDER=xendit`)                                                                                              |
| `XENDIT_WEBHOOK_TOKEN`                                                                        | No       | Xendit webhook verification token                                                                                                                            |
| `XENDIT_SUCCESS_REDIRECT_URL` / `XENDIT_FAILURE_REDIRECT_URL`                                 | No       | Required when `PAYMENT_PROVIDER=xendit` (P3.7)                                                                                                               |
| `WEBHOOK_ALLOWED_IPS`                                                                         | No       | Webhook source IP allowlist (comma-separated)                                                                                                                |
| `TRUST_PROXY`                                                                                 | No       | Trust `x-forwarded-for` first hop for client IP (default false) — required behind a reverse proxy so rate limiting and webhook IP checks see real client IPs |
| `DB_SSL_REJECT_UNAUTHORIZED`                                                                  | No       | Reject unauthorized TLS certificates on the DB connection (default true)                                                                                     |
| `METRICS_TOKEN`                                                                               | No       | Bearer token for the metrics endpoint                                                                                                                        |
| `UPLOAD_DIR`                                                                                  | No       | Local upload directory when R2 is not configured (default `./uploads`)                                                                                       |
| `SANITY_PROJECT_ID`                                                                           | No       | Sanity project id (defaults to the Cogito Academy project; set explicitly per deployment)                                                                    |
| `SANITY_DATASET`                                                                              | No       | Sanity dataset (defaults to `development`; production/staging must set the intended published dataset)                                                       |
| `SANITY_API_VERSION`                                                                          | No       | Sanity API version in `YYYY-MM-DD` format (default `2024-03-01`)                                                                                              |
| `SANITY_API_TOKEN`                                                                            | No       | Server-only token for private Sanity datasets; never add it to `apps/web`/`VITE_*` variables                                                                 |
| `XENDIT_DEFAULT_PAYMENT_METHOD`                                                               | No       | Default Xendit channel (`ewallet_ovo`/`qris`/`va_bca`; default `ewallet_ovo`)                                                                                |
| `SESSION_COOKIE_CACHE_MAX_AGE`                                                                | No       | Better Auth session-cookie cache max age in seconds (default 60)                                                                                             |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` | No       | Cloudflare R2 upload backend (required in production/staging — P4.3)                                                                                         |
| `SEED_ALLOWED_IN_PROD`                                                                        | No       | Seed-script production guard                                                                                                                                 |
| `STUB_WEBHOOK_ALLOWED`                                                                        | No       | Stub-checkout E2E flag; the stub checkout endpoint only serves `development`/`test` — staging always returns 404 (prod-fixes C2)                             |

## Real-Provider Swap (Resend / Xendit / Google Meet / R2)

The app defaults to dev-safe stand-ins (stub email, stub payments, manual Meet fallback, local-disk uploads). Before a production launch these must be swapped for real providers. What fails **loud** vs **silent**, and what each swap requires:

| Provider    | Dev default          | Silent-failure mode if misconfigured                                                                                                  | Prod requirement (fail-loud guard PR)                                                                                     |
| ----------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Resend      | Stub (no-op email)   | **Silent** — `RESEND_API_KEY` optional, no `NODE_ENV` check; critical emails suppressed with no alert                                 | `RESEND_API_KEY` required when `NODE_ENV` is production/staging + verified `EMAIL_FROM` domain (P4.1)                     |
| Xendit      | Stub provider        | Webhook 408/500 loops if OTP-paths or status mapping mismatch                                                                         | `XENDIT_SECRET_KEY`+`XENDIT_WEBHOOK_TOKEN`+redirect URLs when `PAYMENT_PROVIDER=xendit`; sandbox E2E before enabling (P3) |
| Google Meet | Manual link fallback | **Silent** — `GOOGLE_MEET_ENABLED=true` with broken creds falls back to manual links, events land on the wrong calendar               | Complete credential set + `GOOGLE_IMPERSONATED_USER` (SA mode) + boot probe (P4.2)                                        |
| R2          | Local `UPLOAD_DIR`   | **Silent** — prod without R2 writes to container-local disk, lost on redeploy; R2 set but `R2_PUBLIC_URL` unset → objects unreachable | All `R2_*` + `R2_PUBLIC_URL` required in production/staging (P4.3)                                                        |

> **P3 status (2026-08-17):** the Xendit provider was rewritten for `api-version: 2024-11-11` — `request_amount`/`channel_code`/`channel_properties`, top-level response with `actions[].value` (REDIRECT_CUSTOMER → PRESENT_TO_CUSTOMER), statuses SUCCEEDED/REQUIRES_ACTION/AUTHORIZED/CANCELED, webhook idempotency keys from `data.payment_id`/`payment_request_id` (fixes the `xendit:no-event-id` collision), and a provider `refund()` port (migration 0025 adds `payment_record.provider_request_id`). Timestamp validation is provider-conditional (skipped for xendit — L4). `XENDIT_SUCCESS/FAILURE_REDIRECT_URL` are required by the env schema when `PAYMENT_PROVIDER=xendit` (P3.7). **N1 (2026-08-19):** the provider `refund()` port is **no longer wired into `adminRefund`** — admin refunds are in-app Marks credits only (`refund_record.amount_idr = 0`, `provider_event_id` NULL); no Xendit cash refund is ever issued from `adminRefund` (PRD §677: Marks not convertible to rupiah).

### Xendit sandbox verification checklist (L4)

Steps to validate the Xendit integration against the sandbox before enabling `PAYMENT_PROVIDER=xendit` in production:

1. Set `PAYMENT_PROVIDER=xendit`, `XENDIT_SECRET_KEY`/`XENDIT_WEBHOOK_TOKEN` to the sandbox values, and `XENDIT_SUCCESS_REDIRECT_URL`/`XENDIT_FAILURE_REDIRECT_URL` (now required by the env schema, P3.7).
2. Create a purchase with `XENDIT_DEFAULT_PAYMENT_METHOD=ewallet_ovo` → confirm the returned action URL redirects to an OVO sandbox flow.
3. Verify `STUB_WEBHOOK_ALLOWED=false`; deliver a sandbox webhook with `api-version: 2024-11-11` payload shape (`data.payment_id`, `status=SUCCEEDED`) → confirm the payment transitions to PAID and Marks are credited once (idempotency key no longer collapses to `xendit:no-event-id`).
4. Webhook timestamp validation is **skipped for xendit** (the API documents only `x-callback-token`; no `Date`/`x-timestamp` header — P3.5/L4). Revisit if Xendit starts sending a timestamp header.
5. Test a REFUNDED webhook with spent Marks → payment marked REFUNDED + reconciliation row, no 500/retry loop (P2.7/H4).
6. ~~Trigger a provider refund from `adminRefund` → `refund_record.provider_event_id` populated with the Xendit `rfd-...` id (P3.6); the provider refund is best-effort — the Marks reversal never rolls back on provider refund failure.~~ **REMOVED (N1, 2026-08-19):** `adminRefund` no longer triggers any provider refund — verify instead that an `adminRefund` writes `refund_record` with `amount_idr = 0` and `provider_event_id` NULL and never issues a Xendit cash refund (PRD §677: in-app Marks credit only).
7. Only after the full sandbox E2E passes, enable in production.

### Google Meet refresh-token acquisition (X3)

For the OAuth path (`GOOGLE_MEET_CLIENT_ID` + `GOOGLE_MEET_CLIENT_SECRET` + `GOOGLE_MEET_REFRESH_TOKEN`):

1. Google Cloud Console → credentials for the workspace user → create an OAuth Client (Web).
2. Use the out-of-band flow to get a one-time code for the scopes: `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/calendar.events`.
3. Exchange the code for tokens (returns `refresh_token`):
   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d client_id=$GOOGLE_MEET_CLIENT_ID \
     -d client_secret=$GOOGLE_MEET_CLIENT_SECRET \
     -d code=$CODE \
     -d grant_type=authorization_code \
     -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
   ```
4. The `refresh_token` (not the access token) goes into `GOOGLE_MEET_REFRESH_TOKEN`; the token cache refreshes access tokens automatically at runtime.
5. Alternative: service-account mode with domain-wide delegation — set `GOOGLE_CLIENT_EMAIL` (SA), `GOOGLE_PRIVATE_KEY`, `GOOGLE_IMPERSONATED_USER` (delegated attendee), `GOOGLE_MEET_ENABLED=true`. Without `GOOGLE_IMPERSONATED_USER` events land on the SA's own calendar and never produce a Meet URL (P4.2 guard).
6. Verify the boot probe logs a successful `calendarList.get` before enabling in prod.

### Resend domain verification (X2 / P4.1)

The production env schema requires `RESEND_API_KEY` and a non-default `EMAIL_FROM` (the dev default `noreply@cogitoacademy.id` is rejected). Before enabling production email:

1. Resend dashboard → **Domains** → add `cogitoacademy.id` (and `staging.cogitoacademy.id` for staging).
2. Add the DNS records Resend provides (SPF/DKIM) at the DNS provider; wait for verification.
3. Set `EMAIL_FROM` to a verified address, e.g. `noreply@cogitoacademy.id` — the env schema rejects the dev default when `NODE_ENV` is production/staging, so the verified domain's address is fine.
4. Send a test invite/refund email on staging before enabling production email.

### R2 bucket + API-token setup (X4 / P4.3)

The production env schema requires all four `R2_*` vars together **and** `R2_PUBLIC_URL` when R2 is configured (partial config or a missing public URL fails loudly — no container-local disk fallback, no unreachable objects).

1. Cloudflare dashboard → **R2** → create a bucket (region `auto`).
2. **Manage R2 API Tokens** → create a token with Object Read & Write on the bucket → copy `ACCESS_KEY_ID` + `SECRET_ACCESS_KEY` into `R2_ACCOUNT_ID` (your Cloudflare account id), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. Set `R2_PUBLIC_URL` to the public object URL (e.g. `https://media.cogitoacademy.id` via a custom domain, or the `r2.cloudflarestorage.com` endpoint). `GET /uploads/*` is disabled whenever `R2_PUBLIC_URL` is set (objects are served from R2 instead).
4. Verify an upload → the returned key resolves under `R2_PUBLIC_URL`.

## Deploy Secrets (CD webhooks)

The CD workflows (`cd-staging.yml` / `cd-prod.yml`) trigger Coolify deploys via webhook. Since P4 (C3) the trigger **fails loudly** (`curl --fail --max-time 30`, no `|| true`) — if the webhook secret is missing or the request fails, the build goes red instead of silently doing nothing.

**Setup (one-time, user action):**

1. Coolify → your service → **Webhooks** tab → copy the **Deploy webhook** URL.
2. GitHub → repo **Settings → Secrets and variables → Actions**:
   - `COOLIFY_STAGING_WEBHOOK` — staging service webhook URL
   - `COOLIFY_PROD_WEBHOOK` — production service webhook URL
3. Push to `staging` (or `main`) and verify the "Trigger Coolify deploy" step is green.

Until the secrets are set, CD pushes will fail at the trigger step by design (a silent no-op deploy is worse than a red build).

## Test Environment

Tracked template:

```bash
apps/server/.env.test.example
```

Optional local override:

```bash
apps/server/.env.test
```

Default local test ports:

- Web: `3100`
- Server: `3101`
- PostgreSQL: `6767` (test container; shared with dev container — see note above)

Economy role checks:

```bash
bun scripts/run-test-suite.mjs api packages/api/src/tests/integration/economy-roles.test.ts
bun scripts/run-test-suite.mjs e2e --grep economy --reporter=line
```

The role suite covers student, tutor, and admin authorization plus the
admin-update → future-booking snapshot path. The E2E runner starts the isolated
web/server ports above and seeds deterministic role credentials.

## GHCR / Docker Deploy (CD)

The CD workflows (`cd-prod.yml`, `cd-staging.yml`) build both images (`apps/server/Dockerfile`, `apps/web/Dockerfile`) and push to `ghcr.io/cogitoacademy/app/{server,web}`.

If a push fails with `denied: installation not allowed to Create organization package`:

1. **Workflow permission (code, already fixed):** the job must declare `permissions: { contents: read, packages: write }` so the `GITHUB_TOKEN` can write to GHCR.
2. **Org-level (requires an org admin):** the `cogitoacademy` org must allow GitHub Actions to create packages. Either enable it in **Org Settings → Actions → General → Workflow permissions → "Read and write permissions"** (with "Allow GitHub Actions to create and approve pull requests" as needed), or initialize the packages once by pushing any image under `ghcr.io/cogitoacademy/app/{server,web}` with an org member account:
   ```bash
   docker pull oven/bun:1.3.14
   docker tag oven/bun:1.3.14 ghcr.io/cogitoacademy/app/server:init
   docker push ghcr.io/cogitoacademy/app/server:init   # repeat for /web
   ```
   After the packages exist, the workflows push without org changes.
