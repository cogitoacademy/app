# PRD + Wiring Audit — Gap List

> **Source:** Task 1 of `docs/superpowers/plans/2026-08-25-backend-production-readiness.md`.
> **Method:** Cross-checked every module in `packages/api/src/modules/` against `docs/prd.tex` (v1.7), `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md`, and `docs/CONTEXT.md`; verified every documented RPC exists in the routers with matching input/output; verified business rules against service code; ran the "can it boot with all moving parts" dependency-wiring check against `packages/env/src/server.ts`.
> **Status:** Phase 0 audit complete. Gaps below are the approved list that Tasks 2+ reference. All gaps map to an existing fix task in the plan; none require a new task.

## Gap Table

| # | Area | Gap | Evidence (file:line) | Severity | Fix owner (task #) |
|---|------|-----|----------------------|----------|--------------------|
| 1 | Auth / booking / payment | No email-verification gate on paid actions. `procedures.ts` has no `verifiedStudentProcedure`; the four booking-create procedures and `payment.createPurchase` run on `studentProcedure`/`protectedProcedure` with no `emailVerified` check, so an unverified student can book and purchase. | `packages/api/src/procedures.ts:45-62` (no verified middleware); `packages/api/src/modules/booking/booking.router.ts:36,150,162,173`; `packages/api/src/modules/payment/payment.router.ts:7` | High | Task 2 |
| 2 | Booking / notification | `withdrawInvite` interpolates the raw user-supplied `reason` into the notification/email body without `escapeHtml` — HTML-injection vector. | `packages/api/src/modules/booking/booking.service.ts:2559` | High | Task 3 |
| 3 | Content / SSRF | Sanity Knowledge Bank file proxy has no SSRF allowlist, no upstream timeout, no size cap, and no rate limit — a compromised/edited Sanity asset URL turns the server into an open proxy and can hang or stream unbounded bytes. | `apps/server/src/routes.ts:354-417` (bare `fetch(file.fileUrl)` at `:389`, no allowlist/timeout/cap) | High | Task 4 |
| 4 | Admin / payouts | `getTutorPayouts` sums `totalMarks` from `actualMarksPooled` while `cogitoTake`/`tutorPayout` sum from `baseline`/`tutorShare`; when per-student rounding makes `actualMarksPooled > baseline`, the invariant `totalMarks === cogitoTake + tutorPayout` breaks and the payout report is internally inconsistent. | `packages/api/src/modules/booking/booking.service.ts:3345,3355,3365` | Medium | Task 5 |
| 5 | Admin / queue | `listBookings` escalated pagination can return an empty page with a non-null `nextCursor` (or a short page) when escalated items sit beyond the first window — the admin override queue can appear empty or skip items. | `packages/api/src/modules/admin-booking/admin-booking.service.ts:480-527` | Medium | Task 6 |
| 6 | Admin / economy | `updateEconomySettings` writes the per-tutor rate-change notifications **inside** the config transaction (`notification.write({ db: tx, ... })`); a notification write failure rolls back the economy config change and audit row. | `packages/api/src/modules/admin/admin.service.ts:243-324` (write at `:304` with `db: tx`) | Medium | Task 7 |
| 7 | DB / migrations | Migrations `0027_subject_taxonomy.sql` and `0028_economy_config.sql` have no `-- down` path, so the schema cannot be rolled back manually. | `packages/db/src/migrations/0027_subject_taxonomy.sql`, `packages/db/src/migrations/0028_economy_config.sql` (no `-- down` section) | Low | Task 8 |
| 8 | Ops / scheduler | Scheduler boot does not fail-loud when `SCHEDULER_ENABLED=true` but Redis is unreachable — `initScheduler` logs `scheduler_skip` and silently never runs jobs; `/health` has no scheduler check. | `apps/server/src/scheduler.ts:19-27` (no Redis ping/throw); `packages/api/src/lib/db-health.ts` (no scheduler check) | Medium | Task 9 |
| 9 | Ops / Google Meet | No one-time OAuth refresh-token helper script exists and the RUNBOOK lacks the Google Cloud console setup steps for the Meet OAuth path. | `scripts/` (only `run-test-suite.mjs`; no `google-meet-auth.ts`); `docs/RUNBOOK.md` (no Google Cloud console section) | Low | Task 10 |
| 10 | Ops / Xendit | No dedicated "Xendit go-live checklist" section in the RUNBOOK and the `infra/.env.prod.example` Xendit block is minimal (placeholders only, no per-field instructions); the sandbox checklist exists but the live-switch procedure is not documented. | `docs/RUNBOOK.md:459-469` (sandbox only); `infra/.env.prod.example:14-19,40` | Low | Task 11 |

## Verified Sound

The following were cross-checked and found correct (no gap):

- **RPC surface:** Every procedure documented in `docs/API-REFERENCE.md` exists in the routers with matching auth level, input, and output. Verified across `auth`, `admin`, `adminTutor`, `tutor`, `tutors` (discovery), `invite`, `achievement`, `wallet`, `payment`, `booking`, `tutorActions`, `room`, `notification`, `adminBooking`, `refund`, `support`, `upload`, `content` (`packages/api/src/routers.ts:45-75` and each `*.router.ts`). The `content.*` file proxy is the documented `GET` exception (`apps/server/src/routes.ts:354`).
- **Economy defaults** match the PRD blueprint: Rp 5,000 mark value, Rp 50,000 min base, online/offline tutor increments Rp 30k/40k, Cogito take online Rp 50k+20k and offline Rp 90k+40k (`packages/api/src/modules/economy/economy.types.ts:21-32`).
- **Pricing formulas** match PRD §Session Pricing: `computeEconomics` computes tutor honorarium, Cogito take, total IDR, total Marks, per-student ceiling, and pooled Marks (`packages/api/src/modules/pricing/pricing.service.ts:216-269`); base-rate validation enforces Rp 5,000 increments and the Rp 50,000 floor (`:181-214`).
- **Booking constants** match PRD: 12h response window, H-2 = 2h, 15-min lateness, 90-min sessions, min group headcount 2, series 2–4 sessions, group-series no-opt-out disclaimer (`packages/api/src/shared/constants.ts:7-23`).
- **Knowledge Bank gate** uses **total** balance (held Marks count) per DL-16/U13 (`packages/api/src/modules/wallet/wallet.service.ts:426-438`); the RPC is student-only per FR-12/M9 (`wallet.router.ts:37`).
- **Group-series no-opt-out** enforced (`BOOKING_SERIES_NO_OPT_OUT`) and the required disclaimer constant exists (`booking.service.ts`, `constants.ts:22-23`).
- **adminRefund** is in-app Marks credit only (N1): `amountIdr = 0`, no `providerEventId`, provider never called (`admin-booking.service.ts:552-616`).
- **Webhook hardening** present: signature verification, IP allowlist, timestamp validation (skipped for xendit per L4), atomic idempotency claim, permanent-vs-transient error classification (`apps/server/src/webhooks/payments.ts`).
- **Scheduler wiring:** all 6 repeatable jobs registered and gated on `SCHEDULER_ENABLED` + `REDIS_URL` (`apps/server/src/scheduler.ts:19-53`).
- **Provider selection is env-driven** for every external dependency (see wiring table below).
- **Env schema fail-loud guards** present for xendit, Resend (prod/staging), Google Meet, and R2 (`packages/env/src/server.ts:89-211`).
- **RUNBOOK env table is current** (L5 from CONTEXT is resolved): `EMAIL_FROM`, `R2_*`, `GOOGLE_MEET_*`, `GOOGLE_IMPERSONATED_USER`, `WEBHOOK_ALLOWED_IPS`, `SEED_*` all present (`docs/RUNBOOK.md:410-443`).

## Dependency Wiring Table

| Dependency | Env var(s) in `packages/env/src/server.ts` | Provider selection (env-driven) | Failure mode documented |
|------------|---------------------------------------------|---------------------------------|-------------------------|
| Postgres | `DATABASE_URL` (required), `DB_SSL_ENABLED`, `DB_SSL_REJECT_UNAUTHORIZED` (`server.ts:36,79-80`) | N/A (single driver) | `/health` DB check + boot `SELECT 1`; non-TLS Coolify DB via `DB_SSL_ENABLED=false` (`CONTEXT.md:15-19`) |
| Redis / BullMQ | `REDIS_URL` (required, `server.ts:66`) | N/A (single client) | In-memory defensive fallback per-process; scheduler gated on `SCHEDULER_ENABLED`+`REDIS_URL` (`CONTEXT.md:682-702`) |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` (`server.ts:76-77`) | `resendApiKey` present → Resend, else stub (`email/index.ts`) | Required in prod/staging + verified `EMAIL_FROM` (superRefine `server.ts:130-147`); circuit breaker + 30s timeout (`MODULE-REFERENCE.md:368-369`) |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`server.ts:61-62`) | Both set → enabled; partial disables provider (`MODULE-REFERENCE.md:9`) | Documented (`CONTEXT.md:391`) |
| Google Meet | `GOOGLE_MEET_ENABLED`, `GOOGLE_MEET_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_IMPERSONATED_USER`, `GOOGLE_CALENDAR_ID` (`server.ts:68-75`) | `googleMeetEnabled && config` → Google, else manual-link fallback (`meeting/index.ts`) | Complete credential set required (superRefine `server.ts:153-178`); boot `probe()`; circuit breaker; manual-link fallback (`MODULE-REFERENCE.md:401-429`) |
| Xendit | `PAYMENT_PROVIDER`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_SUCCESS/FAILURE_REDIRECT_URL`, `XENDIT_DEFAULT_PAYMENT_METHOD` (`server.ts:43,54-60`) | `PAYMENT_PROVIDER === "xendit"` → Xendit, else stub; refuses silent stub fallback (`payment/index.ts:80-84`) | Credentials required when xendit (superRefine `server.ts:90-122`); webhook signature/IP/timestamp (`payments.ts`) |
| Sanity | `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_VERSION`, `SANITY_API_TOKEN` (`server.ts:46-52`) | N/A (server-side client, `published` perspective) | Server-side token only; asset URLs never exposed in list responses (`content.service.ts:53-59`, `MODULE-REFERENCE.md:71-76`) |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `UPLOAD_DIR` (`server.ts:81-86`) | All four `R2_*` set → R2, else local `UPLOAD_DIR` (`storage.ts:185-206`) | All `R2_*` + `R2_PUBLIC_URL` required in prod/staging (superRefine `server.ts:185-210`) |

## Notes

- All 10 gaps map to an existing fix task (Tasks 2–11). No gap required a new task.
- Gap 10 (Xendit go-live) is a docs-completeness gap: the sandbox checklist exists (`RUNBOOK.md:459-469`) but the live-switch procedure and per-field env annotations are not yet written.
- The `room.checkAvailability` G13 gap is **closed** (U14 implemented via `requestRoomForBooking` at booking creation, `booking.service.ts:849-859`); it is not re-listed.
