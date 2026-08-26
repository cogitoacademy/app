# Cogito API Reference

Last updated: 2026-08-26

## Overview

All oRPC endpoints use **POST** method. Auth is via session cookies (Better Auth). Base path: `/rpc/{namespace}/{method}` — the path segments are the oRPC procedure keys (e.g. `POST /rpc/auth/me`, `POST /rpc/payment/createPurchase`; not the dotted identifiers used as section headers below). Request bodies must be wrapped in the `{"json": <input>}` protocol envelope. Responses are wrapped as `{"json": <data>, "meta": [...]}`. The protected Knowledge Bank file proxy is the documented exception and uses `GET`.

In production, API and frontend use separate hosts: `https://api.cogitoacademy.id` serves `/rpc`, `/api/auth`, `/health`, and `/webhooks`; `https://app.cogitoacademy.id` serves the SPA from Cloudflare Pages. The apex `https://cogitoacademy.id` remains the company profile and is not an API host.

The public `/health` result depends on the server's database and Redis boot
checks. When the API is linked to Coolify's bundled private PostgreSQL, set
`DB_SSL_ENABLED=false` in the API environment because that database does not
serve TLS. `DB_SSL_REJECT_UNAUTHORIZED` is only relevant when database TLS is
enabled.

Email/password sign-in and sign-up use Better Auth endpoints under `/api/auth`. The web client validates the email forms on the client and surfaces invalid fields with Selia's inline error state and danger outline, waits for the successful auth response and a fresh session read before entering an authenticated route, and the authenticated route guard also reads the non-cookie-cached session so role-based redirects do not briefly fall back to `/login`. This changes no request or response shape.

The web dashboard has no aggregate endpoint. Its role-specific views compose existing procedures: the shared booking list uses protected `booking.listMine` for student, tutor, and admin visibility (with admin seeing all bookings), while tutor discovery remains student-only (`tutors.listPublished`) and tutor/admin dashboards compose their remaining role-specific procedures. Student and tutor next-lesson sections derive the nearest future non-terminal, non-pending item client-side and reuse the booking-list card; the tutor dashboard's above-the-fold ordering of welcome/setup, review requests, and next lesson is presentation-only. Student and tutor welcome cards also share one frontend visual component with role-specific copy and links. On narrow screens, the rounded booking status-tab strip fills the available page width and only its inner tab list scrolls horizontally inside a scrollbar-hidden region. This adds no RPC endpoint or input/output change.

The authenticated `/guide` (`How Cogito Works`) route is frontend-only. Its typed journey content is bundled with the web app, is role-filtered in the route UI, and adds no RPC procedure, request input, response output, or persistence contract. The centered `max-w-6xl` shell, Selia-composed chapter rail, and bold timing callouts are presentation-only; the callouts restate existing 7-day, 12-hour, H-2, 15-minute, 24-hour, meeting-retry, and support-SLA rules. The development-only anti-slop Tweaks Bar is a static browser asset and does not change the production API surface.

The global route pending loader is also presentation-only. It composes the local Selia `Spinner` with a token-based loading ring and label for route, onboarding, and auth loading states, adding no RPC procedure, request input, response output, or persistence contract.

The authenticated shell's Light/Dark/System theme menu and its `D` keyboard shortcut are frontend-only. Pressing `D` outside editable fields toggles the rendered light/dark mode through `next-themes`; it adds no RPC procedure, request input, response output, or persistence contract.

The shared empty-state presentation is also frontend-only. Empty collections, filtered no-match results, and embedded no-data sections are rendered by `apps/web/src/components/empty-state.tsx` with density and tone variants; this changes no RPC procedure, request input, response output, or persistence contract.

The browser-native control refactor is presentation-only: Selia `Textarea`, `NumberField`, `DatePicker`, and minute-level time controls do not add or change an RPC procedure, input schema, output shape, or persistence contract. The availability range separator is visual only; time suggestions may render wider than their compact input, and modality triggers preserve their icon-label row without changing the weekly range payload. Portal-based date and select popups render above dialog layers so modal forms remain interactive.

## Authenticated Editorial Content (`content.*`)

Sanity is queried only by the API server. The browser receives normalized content through protected procedures; Knowledge Bank asset URLs are intentionally omitted from list responses.

### `content.listCompetitions`

- **Auth:** Protected
- **Input:** None
- **Output:** `[{ id, title, description, location, categories: [{ id, name, coreCategory }], educationLevels, startDate, endDate, scale, organizer, registrationDeadline, registrationLink, socialMediaLink }]`
- **Description:** Returns published competition calendar entries with English projections for every authenticated role. The app route is `GET /calendar` in the SPA; the read-only UI presents the data in month and 30-day agenda views and opens a responsive details modal without changing this API contract. The route uses a contained viewport layout so the calendar body handles vertical scrolling and the month grid handles horizontal scrolling.

### `content.listStudentResources`

- **Auth:** Student
- **Input:** None
- **Output:** `{ items: [{ id, title, description, category }], access: { eligible, balance, threshold } }`
- **Description:** Returns published Knowledge Bank metadata only when the student's total Marks balance meets the 35-Mark threshold. Held Marks count toward eligibility. Below the threshold, `items` is empty and the access state explains the lock.

### `GET /content/student-resources/:resourceId/file`

- **Auth:** Student with current total balance at or above the threshold
- **Input:** `resourceId` path parameter
- **Output:** Streamed Sanity file, normally `application/pdf`
- **Description:** Revalidates the session and Knowledge Bank eligibility, resolves the asset server-side, and streams it with `Cache-Control: private, no-store`. This is an Elysia file route, not an oRPC procedure.

### Verification

CI runs the API integration/unit suite together with the env, auth, and database package tests. The coverage gate requires 100% line coverage for `packages/api` and 100% line coverage overall; coverage is reported from the same lcov artifact used by `.github/scripts/coverage-comment.ts`.

### Auth Levels

| Level       | Description                                           |
| ----------- | ----------------------------------------------------- |
| `public`    | No auth required                                      |
| `protected` | Requires authenticated session                        |
| `student`   | Requires authenticated session with `role: "student"` |
| `admin`     | Requires authenticated session with `role: "admin"`   |
| `tutor`     | Requires authenticated session with `role: "tutor"`   |

---

## System

### `healthCheck`

- **Auth:** Public
- **Input:** None
- **Output:** `"OK"`
- **Description:** Returns OK if server is running

---

## Auth (`auth.*`)

### `auth.me`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ user, profile, tutorProfile?, wallet }`
- **Description:** Returns current user with profile and wallet (lazily creates wallet)

### `auth.getProfile`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ user, profile, tutorProfile }`
- **Description:** Returns user profile

### `auth.updateProfile`

- **Auth:** Protected
- **Input:** `{ phoneNumber?, schoolName?, gradeLevel?, parentName?, parentPhone?, parentEmail? }`
- **Output:** `{ user, profile }`
- **Description:** Creates or updates the authenticated user's student profile fields
- **Account identity:** The student profile page also uses Better Auth `updateUser` to update the signed-in user's `name` and optional `image`; email remains read-only on this surface.

### `auth.searchStudents`

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F16)
- **Input:** `{ query, limit? }` (`query` 2–100 chars, `limit` 1–10 default 5)
- **Output:** `[{ id, name, email }]` — up to 10 students matching a name or email, excluding the requester
- **Description:** Student-only debounced student lookup used by the group-booking invite UI

---

## Password Reset (Better Auth — `/api/auth/*`)

Not part of the oRPC namespace. Mounted under `/api/auth` on the Elysia server.

### `POST /api/auth/request-password-reset`

- **Auth:** Public
- **Input:** `{ email, redirectTo? }`
- **Output:** `200 { status: true }` — identical for known and unknown emails (no enumeration)
- **Description:** Sends a reset email (category `auth`, via `setAuthEmailSender`). Link = `{BETTER_AUTH_URL}/reset-password/{token}?callbackURL={redirectTo}`. Rate-limited (10/min per IP, same limiter as other auth endpoints). Token valid 1 hour.

### `GET /api/auth/reset-password/{token}`

- **Auth:** Public
- **Description:** Validates token, redirects to `callbackURL?token=<token>` or `callbackURL?error=INVALID_TOKEN`.

### `POST /api/auth/reset-password`

- **Auth:** Public
- **Input:** `{ newPassword, token }`
- **Description:** Sets new password. Revokes all existing sessions (`revokeSessionsOnPasswordReset: true`). Used tokens are invalidated (replay fails).

### Frontend routes

- `/forgot-password` — email request form (always shows success state after submit)
- `/reset-password` — token entry + new password form; renders invalid/expired state on `error=INVALID_TOKEN`

---

## Admin (`admin.*`)

### `admin.listUsers`

- **Auth:** Admin
- **Input:** `{ limit?, offset? }` (`limit` default 50)
- **Output:** `{ users: User[], total, limit, offset }`
- **Description:** Paginated user list

### `admin.setRole`

- **Auth:** Admin
- **Input:** `{ userId, role, expectedRole }`
- **Output:** `{ user }`
- **Errors:** `USER_NOT_FOUND` (404), `LAST_ADMIN` (409), `OPTIMISTIC_LOCK` (409)
- **Description:** Changes user role; prevents removing last admin; optimistic lock via `expectedRole`

### `admin.getWallet`

- **Auth:** Admin
- **Input:** `{ userId }`
- **Output:** `{ id, totalBalance, heldBalance, availableBalance }`
- **Errors:** `WALLET_NOT_FOUND` (404)
- **Description:** Returns any user's Marks wallet (G9)

### `admin.listLedgerEntries`

- **Auth:** Admin
- **Input:** `{ walletId?|userId?, limit?, cursor?, bookingId?, entryType?, dateFrom?, dateTo? }` (`entryType` one of credit/hold/release/deduct/compensate_credit/compensate_deduct)
- **Output:** `{ items: LedgerEntry[], nextCursor }`
- **Errors:** `INVALID_LEDGER_FILTER` (400) — walletId and userId are mutually exclusive; exactly one required
- **Description:** Paginated ledger for any wallet, filterable by type, date range, or booking

### `admin.getTutorPayouts`

- **Auth:** Admin
- **Input:** `{ tutorId, dateFrom?, dateTo? }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }` (`tutorPayoutIdr` is summed from IDR tutor-honorarium snapshots; legacy pre-economy bookings use the compatibility path)
- **Errors:** `INVALID_LEDGER_FILTER` (400) — invalid date
- **Description:** Tutor payout summary from completed bookings in a date range. `totalMarks` reports the split basis (`priceSnapshot.baseline`), so `totalMarks === cogitoTake + tutorPayout`; per-student rounding surpluses (`actualMarksPooled ≥ baseline`) are not included.

### `admin.getEconomySettings`

- **Auth:** Admin
- **Input:** None
- **Output:** `{ id, markValueIdr, minTutorBaseRateIdr, onlineTutorIncrementIdr, offlineTutorIncrementIdr, onlineCogitoBaseIdr, onlineCogitoIncrementIdr, offlineCogitoBaseIdr, offlineCogitoIncrementIdr, version, updatedBy, createdAt, updatedAt }`
- **Description:** Returns the active Marks computational value and the online/offline tutor and Cogito schedules used for new booking snapshots.

### `admin.updateEconomySettings`

- **Auth:** Admin
- **Input:** `{ expectedVersion, onlineCogitoBaseIdr, onlineCogitoIncrementIdr, offlineCogitoBaseIdr, offlineCogitoIncrementIdr }` (IDR values use Rp 5,000 increments; bases are at least Rp 5,000; increments are non-negative)
- **Output:** The updated economy settings object; `version` increments only when at least one schedule value changes
- **Errors:** `ECONOMY_CONFIG_CONFLICT` (409) when `expectedVersion` is stale; validation errors (400) for unsupported values
- **Description:** Updates the active Cogito take schedule, records an audit event, and affects only future bookings and new repricing snapshots. Existing booking snapshots remain unchanged. Every user currently assigned the `tutor` role receives one durable in-app `system` notification per new economy version; the notification is deduplicated by version and tutor id. Saving identical values is a no-op and creates no new audit event or notification.

---

## Admin Tutor (`adminTutor.*`)

### `adminTutor.inspectInvitee`

- **Auth:** Admin
- **Input:** `{ email }`
- **Output:** `{ exists, email, name, role, providers, hasGoogle, hasPassword }`
- **Description:** Checks whether an invite email already belongs to a Better Auth user and reports linked authentication providers for clear admin guidance

### `adminTutor.createInvite`

- **Auth:** Admin
- **Input:** `{ email, displayName, internalNotes? }`
- **Output:** `{ invite }`
- **Description:** Creates a tutor invite with a unique token and sends the branded tutor-onboarding email with an account-email reminder, UTC expiry, primary claim CTA, and fallback URL

### `adminTutor.listInvites`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Invite[], total, limit, offset }`

### `adminTutor.resendInvite`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** `{ invite }`
- **Description:** Regenerates token and expiry for manual copy (invalidates the previous token); does not send email

### `adminTutor.sendInviteAgain`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** Invite row with a new one-time plaintext token and `emailDelivery` (`sent`/`skipped`/`failed`)
- **Description:** Explicitly rotates the invite link and sends the replacement through Resend

### `adminTutor.revokeInvite`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** `{ invite }`

### `adminTutor.listTutorProfiles`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: TutorProfile[], total, limit, offset }`

### `adminTutor.reviewTutorProfile`

- **Auth:** Admin
- **Input:** `{ tutorProfileId, action, adminNote? }` (`action` one of request_changes/approve_unpublished/publish/unpublish/suspend/approve_edits/request_edit_changes)
- **Output:** `{ profile }`
- **Errors:** `TUTOR_PROFILE_NOT_FOUND` (404), `INVALID_INVITE_ACTION` (400) when the action is not allowed from the profile's current onboarding status (F25 state machine: publish only from `pending_review`/`changes_requested`/`approved_unpublished`; unpublish/suspend/approve_edits/request_edit_changes only from `published`; request_changes only from `pending_review`/`changes_requested`)

---

## Tutor (`tutor.*`)

### `tutor.getMyProfile`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ profile }`
- **Description:** Returns the authenticated tutor's profile

### `tutor.updateMyProfile`

- **Auth:** Tutor
- **Input:** `{ version, displayName?, shortBio?, credentialsSummary?, expertise?, subjectIds?, modality?, prices?, availabilitySummary?, proofUrls? }`
- **Output:** `{ profile, subjects: [{ id, slug, name, description?, isSelectable, parent: { id, slug, name } }] }`
- **Errors:** `OPTIMISTIC_LOCK` (409) on version mismatch, `INVALID_TUTOR_PRICING` (400) on floor-price violation, `INVALID_TUTOR_SUBJECT_SELECTION` (400) when ids are not active selectable child subjects or exceed 20
- **Description:** Updates the tutor profile with optimistic locking. `subjectIds` is the normalized child-category selection; draft selections are persisted atomically. For published profiles, trust-sensitive subject changes wait in `pendingProfileChanges` for admin approval. Archived legacy subjects remain readable but cannot be submitted as new selections.

### `tutor.submitForReview`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ profile }`
- **Description:** Submits a draft profile for admin review

### `tutor.listAvailability`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ items: AvailabilitySlot[] }`
- **Description:** Lists the tutor's active future availability slots

### `tutor.upsertAvailability`

- **Auth:** Tutor
- **Input:** `{ id?, startDate, endDate, modality, isRecurring?, recurrenceRule?, isActive? }`
- **Output:** `{ slot }`
- **Errors:** `AVAILABILITY_SLOT_OVERLAP` (409)
- **Description:** Creates or updates a single availability window

### `tutor.createWeeklyAvailability`

- **Auth:** Tutor
- **Input:** `{ startDate, endDate, repeatUntil, modality }`
- **Output:** `{ slots: AvailabilitySlot[] }`
- **Errors:** `WEEKLY_AVAILABILITY_RANGE` (400) if > 53 occurrences, `AVAILABILITY_SLOT_OVERLAP` (409)
- **Description:** Materializes weekly windows from `startDate` through `repeatUntil`

### `tutor.replaceWeeklyAvailability`

- **RPC path:** `/rpc/tutor/replaceWeeklyAvailability`
- **Auth:** Tutor
- **Input:** `{ effectiveFrom, repeatUntil, ranges: [{ dayOfWeek, startTime, endTime, modality }] }` (`dayOfWeek` 0–6, times use 24-hour `HH:mm`, max 21 weekly ranges, range up to 52 weeks)
- **Output:** `AvailabilitySlot[]`
- **Errors:** `AVAILABILITY_SLOT_OVERLAP` (409) for overlapping weekly ranges
- **Description:** Atomically deactivates future recurring windows from `effectiveFrom` and regenerates them from weekly hours. One-off date overrides are preserved and take priority over conflicting generated occurrences.

### `tutor.deleteAvailability`

- **Auth:** Tutor
- **Input:** `{ id }`
- **Output:** None (void)
- **Description:** Deactivates (soft-deletes) an availability slot

### `tutor.getMyPayouts`

- **Auth:** Tutor
- **Input:** `{ dateFrom?, dateTo? }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }`
- **Errors:** `INVALID_DATE_RANGE` (400)
- **Description:** The authenticated tutor's payout summary from completed bookings

---

## Tutor Discovery (`tutors.*`)

### `tutors.listSubjects`

- **Auth:** Public
- **Input:** None
- **Output:** `{ items: [{ id, slug, name, description?, children: [{ id, slug, name, description? }] }] }`
- **Description:** Returns the seven active competition categories and their 33 selectable child subjects used by tutor onboarding and student filters. The UIs submit child/category IDs for persistence or filtering but display category and subject names to users.

### `tutors.listPublished`

- **Auth:** Student
- **Input:** `{ search?, expertise?, categoryId?, subjectId?, categoryIds?, subjectIds?, modality?, limit?, offset? }` (`limit` default 20, max 50)
- **Output:** `{ items: TutorProfile[] }`; each profile includes `subjects: [{ id, slug, name, description?, isSelectable, parent }]` and computed `pricesByModality.online/offline` Marks maps when the profile has IDR base honoraria
- **Description:** `categoryId`/`subjectId` remain supported for single-value clients. `categoryIds` and `subjectIds` accept up to 50 unique values and match any selected value within that facet; when both facets are present, the same normalized child-subject relation must satisfy the selected parent and child constraints. Search matches normalized child subject names as well as legacy profile text; no matching normalized relation returns an empty `items` array. Marks prices are derived from the active economy config; tutor IDR base honoraria are not exposed in this student response.

### `tutors.getProfile`

- **Auth:** Student
- **Input:** `{ tutorId }`
- **Output:** `{ profile }` with computed `pricesByModality` Marks maps
- **Description:** Returns the published tutor profile and future availability slots for the booking form. Marks prices use the active economy config for new IDR profiles; legacy profiles continue to return their stored Marks map.

---

## Invite (`invite.*`)

### `invite.verify`

- **Auth:** Public
- **Input:** `{ token }`
- **Output:** `{ invite }`
- **Description:** Returns invite details without claiming

### `invite.claim`

- **Auth:** Protected
- **Input:** `{ token }`
- **Output:** `{ profile }`
- **Errors:** `INVITE_NOT_FOUND` (404), `INVITE_EMAIL_MISMATCH` (400), `PROFILE_ALREADY_EXISTS` (409)
- **Description:** Claims the invite using the signed-in user's email and creates a tutor profile in `onboarding` status

---

## Achievement (`achievement.*`)

### `achievement.listApproved`

- **RPC path:** `/rpc/achievement/listApproved`
- **Auth:** Public
- **Input:** None
- **Output:** `{ items: Achievement[] }` — approved + visible achievements with the owner's `displayName` attached (public procedure retained for a future/public academy surface)
- **Description:** Returns approved and visible achievements; rejected/pending achievements are never exposed. The app root now redirects to login, so no active app landing page consumes this procedure.

### `achievement.list`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ items: Achievement[] }`

### `achievement.create`

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F17; FR-18 is student-facing)
- **Input:** `{ eventName, category, award, level, awardingDate?, location?, description?, subjects?, evidenceUrl?, documentationUrl? }`
- **Output:** `{ achievement }`
- **Description:** Submits a new achievement in `pending` status

### `achievement.update`

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F17)
- **Input:** `{ id, version, data: { ...achievementFields } }`
- **Output:** `{ achievement }`
- **Description:** Updates a pending achievement; optimistic locking via `version`

### `achievement.delete`

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F17)
- **Input:** `{ id, version }`
- **Output:** `{ deleted }`
- **Description:** Deletes a pending achievement; optimistic locking via `version`

### `achievement.adminList`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Achievement[], total, limit, offset }`

### `achievement.adminReview`

- **Auth:** Admin
- **Input:** `{ achievementId, status, adminNote? }` (`status` one of `approved`/`rejected`/`archived`)
- **Output:** `{ achievement }`
- **Description:** Moderation action per the transition table (F12): `pending`/`pending_review` → `approved`/`rejected`/`archived`; `approved`/`rejected` → `archived` (hide from public surfacing); `archived` → `approved`/`rejected` (restore). Other transitions throw `ACHIEVEMENT_NOT_EDITABLE`. Owner is notified and an `achievement_{status}` audit record is written.

---

## Wallet (`wallet.*`)

### `wallet.get`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ id, totalBalance, heldBalance, availableBalance }`
- **Description:** Returns the authenticated user's wallet (lazily created)

### `wallet.listLedger`

- **Auth:** Protected
- **Input:** `{ cursor?, limit?, bookingId?, eventKey? }`
- **Output:** `{ items: LedgerEntry[], nextCursor }`

### `wallet.listPackages`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ packages: MarkPackage[] }`
- **Description:** Returns active purchasable mark packages. Seeded values (PRD OQ-01): Starter Pack 50 Marks / Rp 312,500; Learner Pack 120 Marks / Rp 690,000; Explorer Pack 200 Marks / Rp 1,070,000; Pioneer Pack 400 Marks / Rp 2,000,000.

### `wallet.knowledgeBankEligible`

- **Auth:** Student
- **Input:** None
- **Output:** `{ eligible, balance, threshold }`
- **Description:** Checks Knowledge Bank gating (min balance threshold); eligibility and `balance` use the **total balance** (held Marks count toward the 35-Mark threshold, per PRD DL-16 / U13). No Marks are deducted.

> Note: `hold`/`release`/`deduct`/`credit`/`compensate` are service-layer methods only — they are not exposed over RPC; other modules call them via consumer-driven ports.

---

## Payment (`payment.*`)

### `payment.createPurchase`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role **and** `emailVerified: true`; unverified students get `FORBIDDEN` "Email verification required")
- **Input:** `{ packageCode }`
- **Output:** `{ paymentId, providerReference, checkoutUrl }`
- **Errors:** `PACKAGE_NOT_FOUND` (404), `PACKAGE_ALREADY_PURCHASED` (409), `PAYMENT_PROVIDER_ERROR` (502)
- **Description:** Creates a purchase intent with the payment provider (reuses a pending intent; resets FAILED/EXPIRED payments to PENDING and re-creates the checkout — re-purchase, #46); on success the webhook credits the wallet

### `payment.getPurchase`

- **Auth:** Protected
- **Input:** `{ paymentId }`
- **Output:** `{ id, status, provider, providerReference, amountIdr, marks, receiptUrl, failureReason, createdAt }`
- **Errors:** `PAYMENT_NOT_FOUND` (404)
- **Description:** Returns the payment record if owned by the requesting user

### `POST /webhooks/payments/:provider` (external)

- **Auth:** Public (non-oRPC route)
- **Input:** Raw body; headers `x-callback-token` (xendit) / `x-webhook-signature`, `x-timestamp` (timestamp validation is **skipped for xendit** — the API documents only `x-callback-token`, P3.5/L4)
- **Output:** `{ ok: true }`
- **Errors:** 401 signature failure, 408 stale timestamp (> 5 min, non-xendit), 403 IP not allowlisted, 500 processing failure
- **Description:** Provider webhook; verifies signature, validates timestamp (provider-conditional), then atomically claims the idempotency key (keyed on the verified payload's event id — released on processing failure), calls `payment.confirmFromWebhook`, and updates payment status (`PENDING → PAID/SETTLED/FAILED/EXPIRED`; `PAID/SETTLED → REFUNDED`); credits the wallet on PAID/SETTLED and writes the payment notification (#46). Xendit idempotency keys are derived from `data.payment_id ?? data.payment_request_id` (2024-11-11 webhooks carry no `event_id` — P3.4). On re-purchase after FAILED/EXPIRED the `providerRequestId` is rotated to the new attempt while the previous `providerEventId` is retained as a stale-generation marker: a late FAILED/EXPIRED webhook for the OLD attempt is ignored so it cannot flip the re-purchased PENDING row terminal and strand the new purchase's credit (H3, wave-6b). A REFUNDED webhook reads the wallet through the transaction (`wallet.getByUserId(tx, ...)`, N4) and reverses the credited Marks from the **total balance** (`held + available`): held Marks are released back to available (`refund.{id}.release`) then the full payment Marks are reversed via `compensate_deduct` (`refund.{id}.reverse`) when total ≥ marks; if the Marks were already spent (`totalBalance < marks`, H4), the payment is still marked REFUNDED and a `refund_webhook_reconciliation` audit + `refund_record` row are written for admin (no reversal, no throw, no 500/retry loop — P2.7/H4, M1/N4 wave-6b)

### Provider refunds (X1, P3.6 — superseded by N1, 2026-08-19)

- ~~`adminRefund` initiates a provider-side refund via the active provider's `refund(paymentRequestId, amountIdr, reason?)` — Xendit `POST /v3/refunds` (`{payment_request_id, currency, amount, reason}` → `{id}`), stub returns `rfd-stub-{paymentRequestId}`. The provider refund is **best-effort**: a provider failure is logged and never rolls back the Marks reversal. The returned refund id is stored on `refund_record.provider_event_id`.~~ **REMOVED (N1):** `adminRefund` no longer calls the payment provider at all — admin refunds are in-app Marks credits only (PRD §677: purchased Marks are never convertible back to rupiah). `refund_record.amount_idr` is `0` and `provider_event_id` is `NULL` for admin refunds. The provider `refund()` port (Xendit `POST /v3/refunds`, migration 0025 `payment_record.provider_request_id`) remains on the provider/payment service for a future payment-error-only cash-refund flow, but `adminRefund` must never invoke it.

---

## Booking (`booking.*`)

### `booking.createSolo`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role with a verified email; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, availabilitySlotId, modality, scheduledStartAt, timezone?, learningGoal }` (`scheduledStartAt` must leave room for the server-fixed 90-minute session inside the availability window; `timezone` default `Asia/Jakarta`)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400), `BOOKING_CONFLICT` (409), `INSUFFICIENT_MARKS` (400)
- **Description:** Creates a solo booking and holds Marks; idempotency via `idempotency-key` header

### `booking.get`

- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ booking, participants, history, meetingStatus, meetingUrl }` — access-checked for the proposer, tutor, participants, or admin; participant user objects include the optional profile `image`, and history entries include `fromState`, `toState`, `actorType`, `reason`, and `createdAt`
- **Errors:** `BOOKING_NOT_FOUND` (404)
- **Description:** `meetingStatus` is `ready` only when a URL exists, `pending` while the booking is awaiting the tutor/participants or a tutor/admin fallback link, and `failed` when automatic Google Meet creation needs another retry. If tutor acceptance encounters a provider failure, the booking remains `confirmed` until retry or manual-link recovery; clients must not treat that state as `scheduled`.
- **Frontend note:** Booking activity presents the destination state as the primary badge and uses transition-specific icons for participant, scheduling, room, and terminal events. The detail page composes schedule, format/access, and participant profile/name/status information in the overview, places role-appropriate primary actions (including reschedule and completion when eligible) directly below the status badge, keeps contextual actions above Marks or in the main flow, and shows a live response-window notice for deadline-bound states. The API contract is unchanged.

**UI behavior note:** The booking detail surface uses compact accessible Selia `IconInfoSquareRounded` popover triggers for online-link explanations, retry/manual setup status, available meeting-room access, missing offline-room details, and tutor completion timing. Available links no longer render a `Ready` badge or standalone CTA; the popover contains the meeting-room action. The trigger supports hover, keyboard focus, click, and touch; the overview merges the date and hours into one `Date & time` field, places Format & access beside it in a responsive two-column grid that stacks on narrow screens, and does not change the `booking.get` response contract.

### `booking.listMine`

- **Auth:** Protected
- **Input:** `{ cursor?, limit?, states? }`
- **Output:** `{ items: Booking[], nextCursor }`
- **Description:** Shared role-aware booking list. Students see bookings where they are proposer or participant, tutors see bookings assigned to them, and admins see all bookings. `states` can narrow the result for server-side consumers; the web list applies its Upcoming/Pending/Recurring/Past/Cancelled/All presentation filters client-side, defaults to Upcoming for students, Pending for tutors with pending requests (otherwise Upcoming), and All for admins, unless an explicit `tab` query parameter is present. It sorts Upcoming/Pending/Recurring/All by nearest scheduled start, while Past/Cancelled remain newest-first. The web row presents Marks with the Cogito mark icon and keeps status explanations in the status-badge tooltip. On narrow screens, the rounded status-tab strip stays within the available page width while only its inner tab list scrolls horizontally without showing a native scrollbar. Dashboards reuse the same read model for their next-lesson card; no dashboard-specific endpoint is required.

### `booking.cancel`

- **Auth:** Student
- **Input:** `{ bookingId, cancellationReason? }`
- **Output:** `{ booking }`
- **Description:** Cancels booking and releases held Marks; late cancel within H-2 becomes `late_cancelled`

### `booking.acceptReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Records one acceptance on the active proposal. Partial acceptance does not change the schedule; unanimous tutor + active-student acceptance applies the proposed 90-minute time and restores the booking state that was active before the proposal. For an offline booking-level proposal, the active room assignment is moved with the booking when available; a room conflict or missing assignment returns the booking to `awaiting_admin_room_approval`.

### `booking.getRescheduleAvailability`

- **RPC path:** `/rpc/booking/getRescheduleAvailability`
- **Auth:** Protected; booking tutor, proposer, or participant
- **Input:** `{ bookingId }`
- **Output:** `AvailabilitySlot[]`
- **Description:** Returns active tutor availability for the booking-scoped reschedule picker. Access is checked against the booking rather than tutor discovery visibility.

### `booking.rejectReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Rejects the active proposal, preserves the original schedule, and restores the booking state that was active before the proposal. Offline booking-level proposals also restore the confirmed room assignment to the original window; a conflict or missing assignment falls back to `awaiting_admin_room_approval`.

### `booking.proposeReschedule`

- **Auth:** Student (booking proposer)
- **Input:** `{ bookingId, sessionId?, availabilitySlotId?, proposedStartAt, proposedEndAt?, reason? }`
- **Output:** `{ booking }`
- **Description:** Proposes a new fixed 90-minute time for one booking session; the booking proposer may use the route in the eligible pre-terminal states, including `confirmed` and `scheduled`. Student proposals must remain outside the current and proposed session's H-2 window; otherwise the API rejects the mutation as not editable. Proposals expire after 24 hours and require tutor plus all active-student approval. Force-majeure exceptions are handled through support/admin operations and an auditable admin override, not by bypassing this route.

### `booking.cancelSession`

- **Auth:** Student (proposer)
- **Input:** `{ sessionId }`
- **Output:** `{ booking }`
- **Description:** Student cancels an individual series session; pre-H-2 releases the session hold, post-H-2 forfeits it (per-session penalty, #46). Group-series sessions cannot be cancelled (no opt-out)

### `booking.addSessionNote`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId, content }` (`content` max 10,000 chars, sanitized)
- **Output:** `{ note }`
- **Description:** Adds a note to a completed session. The web editor sends allow-listed HTML for paragraphs/headings, emphasis, lists, and links; the API sanitizer remains authoritative before persistence.

### `booking.getSessionNotes`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId }`
- **Output:** `{ items: SessionNote[] }`
- **Description:** Returns all notes for the completed booking so both parties can read the shared session record. The web client applies a DOMPurify allow-list before rendering note HTML.

### `booking.createGroup`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role with a verified email; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, availabilitySlotId, modality, targetGroupSize, inviteeUserIds, scheduledStartAt, timezone?, learningGoal, requestedRoomId? }` (`targetGroupSize` 2–6, `inviteeUserIds` 1–5; duration is server-fixed to 90 minutes; `requestedRoomId` applies only to offline bookings)
- **Output:** `{ booking }`
- **Description:** Creates a group booking, holds the target headcount total from the proposer, invites participants, and releases the excess hold as invitees confirm; idempotency via `idempotency-key` header

### `booking.createSeries`

- **Auth:** Verified Student (`verifiedStudentProcedure`; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, availabilitySlotId, modality, sessions: [{ availabilitySlotId, scheduledStartAt }], timezone?, learningGoals }` (2–4 sessions; each session is fixed to 90 minutes)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400) if sessions < 2 or > 4
- **Description:** Creates a multi-session solo series booking

### `booking.createGroupSeries`

- **Auth:** Verified Student (`verifiedStudentProcedure` — unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, availabilitySlotId, modality, sessions: [...], targetGroupSize, inviteeUserIds, timezone? }` (`targetGroupSize` 2–6, `inviteeUserIds` 1–5, sessions 2–4)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400), `USER_NOT_FOUND` (400) for unknown invitees
- **Description:** Creates a group series with upfront per-participant holds for all sessions (FR-20, #46); invitees accept/decline the full-series package via `booking.confirmInvite`/`booking.declineInvite`

### `booking.confirmInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId }`
- **Output:** `{ confirmedHeadcount, targetGroupSize }`
- **Description:** Invitee confirms participation and holds Marks

### `booking.declineInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ declined: true }`

### `booking.withdrawInvite`

- **Auth:** Student (booking proposer)
- **Input:** `{ bookingId, inviteeUserId, reason? }`
- **Output:** `{ withdrawn: true, inviteeUserId }`
- **Description:** Withdraws one pending group or group-series invitation before confirmation. The target participant is marked `withdrawn_pre_h2`; confirmed headcount and Marks holds are unchanged, and the invitee receives a booking notification.

### `booking.reconfirm`

- **Auth:** Student (participant)
- **Input:** `{ bookingId, accept }`
- **Output:** `{ reconfirmed: boolean }`
- **Description:** Participant accepts or rejects the repriced offer

### `booking.withdraw`

- **Auth:** Student (participant)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ withdrawn: true, late: boolean }`
- **Description:** Participant withdraws; pre-H-2 releases held Marks, post-H-2 late-cancels. Group-series bookings (`type: "series"` with `targetGroupSize > 1`) are rejected with `CONFLICT` (`BOOKING_SERIES_NO_OPT_OUT`) — no opt-out from the series (U4)

### `booking.listSessions`

- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ sessions: BookingSession[] }`
- **Errors:** `BOOKING_NOT_EDITABLE` if not a series

---

## Tutor Actions (`tutorActions.*`)

### `tutorActions.listBookings`

- **RPC path:** `/rpc/tutorActions/listBookings`
- **Auth:** Tutor
- **Input:** `{ cursor?, limit?, states? }`
- **Output:** `{ items: Booking[], nextCursor }`
- **Description:** Returns bookings assigned to the signed-in tutor

### `tutorActions.proposeReschedule`

- **RPC path:** `/rpc/tutorActions/proposeReschedule`
- **Auth:** Tutor
- **Input:** `{ bookingId, sessionId?, availabilitySlotId?, proposedStartAt, proposedEndAt?, reason? }`
- **Output:** `{ booking }`
- **Description:** Tutor proposes a new fixed 90-minute time for one session; tutor proposals may be outside the original availability window and require every active student's acceptance

### `tutorActions.acceptBooking`

- **RPC path:** `/rpc/tutorActions/acceptBooking`
- **Auth:** Tutor
- **Input:** `{ bookingId }`
- **Output:** `{ booking, isOffline }`
- **Description:** Tutor accepts a booking; online attempts to create the meeting immediately and moves to `scheduled` when the attempt succeeds. If Google Meet creation fails, the booking remains `confirmed`, the proposer receives meeting-setup attention copy, and the `retry-failed-meetings` scheduler retries it every 5 minutes (up to 3 failed attempts); after that, the assigned tutor or an admin can add a manual link with `setMeetingLink`; offline goes `awaiting_admin_room_approval`.
- **Frontend note:** The tutor booking-detail flow presents a responsive confirmation summary before calling this unchanged procedure; the dialog does not change the input, output, or transition rules.

### `tutorActions.setMeetingLink`

- **RPC path:** `/rpc/tutorActions/setMeetingLink`
- **Auth:** Tutor (assigned tutor only)
- **Input:** `{ bookingId, url }` (`url` must be an `http://` or `https://` URL, max 2048 chars)
- **Output:** `{ bookingId, meetingUrl, status }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_OWNED` (403), `BOOKING_NOT_EDITABLE` (400) for offline, terminal, or not-yet-confirmed/scheduled bookings
- **Description:** Records a manual meeting URL when automatic Google Meet setup is unavailable. Only the assigned tutor can use it, and only for an online booking in `CONFIRMED` or `SCHEDULED`; it updates the active meeting-attempt row, notifies confirmed participants, and writes a `tutor_set_meeting_link` audit record.

### `tutorActions.declineBooking`

- **RPC path:** `/rpc/tutorActions/declineBooking`
- **Auth:** Tutor
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ booking }`
- **Description:** Tutor declines a booking and releases held Marks

### `tutorActions.completeSession`

- **RPC path:** `/rpc/tutorActions/completeSession`
- **Auth:** Tutor
- **Input:** `{ bookingId, sessionId? }` (`sessionId` required for series child sessions)
- **Output:** `{ booking }`
- **Description:** Marks a scheduled session completed and deducts held Marks
- **Frontend note:** Cancel and complete actions are confirmed with in-app Selia dialogs; mutation feedback is emitted through the global toast layer and does not change this RPC contract.

### `tutorActions.markAttendance`

- **RPC path:** `/rpc/tutorActions/markAttendance`
- **Auth:** Tutor
- **Input:** `{ bookingId, attendance }` (`attendance` one of `present`/`late`)
- **Output:** `{ bookingId, attendanceState }`
- **Description:** Marks tutor attendance; only allowed within ±15 minutes of the scheduled start (`BookingNotEditableError` otherwise, so tutors can't pre-mark to dodge lateness). There is no auto-cancel: an unmarked session is instead surfaced to the admin queue via `adminBooking.listBookings({ category: "tutor_lateness_pending" })`.

### `tutorActions.markParticipantNoShow`

- **RPC path:** `/rpc/tutorActions/markParticipantNoShow`
- **Auth:** Tutor
- **Input:** `{ bookingId, participantUserId, sessionId? }` (`sessionId` required for series child sessions)
- **Output:** `{ bookingId, participantUserId, sessionId, forfeitedMarks }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400) before start+15 min, `BOOKING_STATE_TRANSITION` (409) if not `scheduled`
- **Description:** Marks a participant as no-show 15 minutes after the session starts (U5/TC-30); their session hold is forfeited. A solo booking transitions to `no_show`; a group booking stays live and only the target's hold is forfeited (C1); a series session keeps its state so other participants are unaffected.

---

## Room (`room.*`)

### `room.list`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ items: Room[] }` — active rooms
- **Description:** Lists active rooms for offline scheduling

### `room.listPendingApprovals`

- **Auth:** Admin
- **Input:** `{ limit? }` (1–100, default 50)
- **Output:** `PendingRoomApproval[]`
- **Description:** Lists offline bookings in `awaiting_admin_room_approval`, ordered by session start. Each item includes booking timing/participant summary and the optional requested room; bookings whose requested room was unavailable are included with `requestedRoomId: null`.

### `room.create`

- **Auth:** Admin
- **Input:** `{ name, location, capacity }`
- **Output:** `{ room }`

### `room.assign`

- **Auth:** Admin
- **Input:** `{ bookingId, roomId, startAt, endAt }`
- **Output:** `{ roomBooking }`
- **Description:** Confirms a room for an offline booking and transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED`; notifies tutor + confirmed students (G14, #46)

### `room.checkAvailability`

- **Auth:** Protected
- **Input:** `{ roomId, startAt, endAt }`
- **Output:** `{ available: boolean }`
- **Description:** Returns whether a room is free for a time slot; **known gap G13** — not yet integrated into booking creation (tracked U14 in `docs/plans/active/PRD-GAPS-PHASE3.md`)

### `room.relocate`

- **Auth:** Admin
- **Input:** `{ bookingId, roomId, startAt, endAt }`
- **Output:** `{ roomBooking }`
- **Description:** Moves a booking to a different room, freeing the previous one

### `room.cancelBooking`

- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ cancelled: true }`
- **Description:** Cancels a booking's room assignment. While the booking is awaiting room approval, this releases its holds and transitions it to `cancelled`; it also handles pending approvals that have no room-booking row because the requested room was unavailable.

---

## Notification (`notification.*`)

### `notification.list`

- **Auth:** Protected
- **Input:** `{ unreadOnly?, limit?, cursor? }`
- **Output:** `{ items: Notification[], nextCursor }`

### `notification.getUnreadCount`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ count }`
- **Description:** Returns the number of unread notifications for the user

### `notification.markAsRead`

- **Auth:** Protected
- **Input:** `{ id }`
- **Output:** `{ notification }`

### `notification.updateReadStatus`

- **Auth:** Protected
- **Input:** `{ ids: string[], isRead: boolean }` — `ids` contains 1–100 notification IDs
- **Output:** `{ success: true }`
- **Description:** Updates the read state for selected notifications owned by the authenticated user; `isRead: false` marks them unread

### `notification.markAllAsRead`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ count }`

---

## Admin Booking (`adminBooking.*`)

### `adminBooking.applyOverride`

- **Auth:** Admin
- **Input:** `{ bookingId, category, reason, affectedParticipants?, marksAction?, userNote?, internalNote? }` (`category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel; `marksAction` one of release_holds/compensate_credit/compensate_deduct)
- **Output:** `{ booking }` — the updated booking
- **Errors:** `BOOKING_NOT_FOUND` (404), terminal-state override rejected
- **Description:** Force state transition bypassing the state machine; optionally adjusts held Marks per participant; records audit log + state history + participant notification

### `adminBooking.previewOverride`

- **Auth:** Admin
- **Input:** Same as `applyOverride`
- **Output:** `{ bookingId, currentState, projectedState, affectedParticipants, marksAction, perParticipantImpact }` — no persistence
- **Description:** Returns the projected booking state and per-participant wallet impact before applying

### `adminBooking.listBookings`

- **Auth:** Admin
- **Input:** `{ bookingId?, limit?, cursor?, category?, urgency?, escalated? }` (`category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel/tutor_lateness_pending — `tutor_lateness_pending` lists sessions flagged by the lateness sweep for admin review)
- **Output:** `{ items: Booking[] & { reportedAt: string | null, slaDeadline: string | null, escalated: boolean }[], nextCursor }`
- **Description:** Paginated booking list sorted by urgency. For override reports, `reportedAt` comes from `overrideMeta.overriddenAt`, `slaDeadline` applies OQ-04 (30 minutes Mon–Sat 09:00–21:00 WIB, otherwise 4 hours), and `escalated` is computed against that business-hours deadline.

### `adminBooking.getBookingStateHistory`

- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ items: BookingStateHistory[] }`
- **Description:** Returns full state transition history for a booking. The admin operations detail view uses this procedure to render the chronological review timeline.

### `adminBooking.adminRefund`

- **Auth:** Admin
- **Input:** `{ paymentId, reason }`
- **Output:** `{ correction }`
- **Description:** Issues a compensating ledger entry for a payment error. **In-app Marks credit only (N1, PRD §677):** credits the payer's wallet with the spend-adjusted refundable Marks, marks the payment REFUNDED, and writes a `refund_record` with `amount_idr = 0` and no `provider_event_id`. The payment provider is **never** called (purchased Marks are not convertible back to rupiah; no cash moves). **Per-payment FIFO attribution (F11):** spend is attributed to the user's credit-state payments oldest-first (`listCreditStatePaymentsForUser`), so refunding a payment whose own Marks were spent rejects with `REFUND_SPEND_EXHAUSTED`, while an unspent payment refunds its full remaining Marks (capped at the wallet's current available balance) — a refund never credits Marks that belonged to a different, already-spent payment. Errors: `BOOKING_NOT_FOUND` (404) for unknown payment/wallet, `INVALID_REFUND_STATE` (400) unless the payment is PAID/SETTLED, `REFUND_SPEND_EXHAUSTED` for fully-spent payments.

### `adminBooking.setMeetingLink`

- **RPC path:** `/rpc/adminBooking/setMeetingLink`
- **Auth:** Admin
- **Input:** `{ bookingId, url }` (`url` must be an `http://` or `https://` URL, max 2048 chars)
- **Output:** `{ bookingId, meetingUrl, status }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400) unless the booking is online and `SCHEDULED`/`CONFIRMED`
- **Description:** Records or replaces a manual meeting URL on an online booking as fallback when Google Meet generation failed or is disabled (U1/FR-21); only `SCHEDULED`/`CONFIRMED` bookings are editable. It updates the newest meeting-attempt row so the booking detail reads the active link, notifies confirmed participants, and writes an `admin_set_meeting_link` audit record.

### `adminBooking.cancelSeriesSession`

- **RPC path:** `/rpc/adminBooking/cancelSeriesSession`
- **Auth:** Admin
- **Input:** `{ sessionId, marksAction, amount? }` (`marksAction` one of `release`/`forfeit`/`partial`; `amount` required when `partial`, max 1000)
- **Output:** `{ sessionId, currentState: "cancelled", marksAction, affectedParticipants }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_STATE_TRANSITION` (409) if the session is not `scheduled`
- **Description:** Cancels a single series session; the session hold is released, forfeited, or partially returned per `marksAction` (U6/TC-31); records audit + participant notifications

---

## Refund (`refund.*`)

### `refund.createCorrection`

- **Auth:** Admin
- **Input:** `{ walletId, amount, type, reason, bookingId? }` (`type` one of `compensate_credit`/`compensate_deduct`, `amount` > 0)
- **Output:** `{ walletId, type, amount }`
- **Errors:** `WALLET_NOT_FOUND` (404)
- **Description:** Admin-only: creates a compensating ledger entry for wallet corrections; records a `refund_record` + audit log

### `refund.listCorrections`

- **Auth:** Admin
- **Input:** `{ walletId, limit?, cursor? }`
- **Output:** `{ items: LedgerEntry[], nextCursor }` — only `compensate_credit`/`compensate_deduct` entries

---

## Support (`support.*`)

### `support.createTicket`

- **Auth:** Protected
- **Input:** `{ category, bookingId?, description }` (`category` one of tutor_late/tutor_no_show/technical/payment/other; `description` max 2,000 chars)
- **Output:** `{ ticket }`
- **Errors:** `SUPPORT_BOOKING_ACCESS` (400) — lateness categories require the reporter to be a participant; `LATENESS_REPORT_TOO_EARLY` (400) — booking must have started > 15 min ago
- **Description:** Reports a tutoring lateness/no-show or another issue; lateness/no-show categories require an associated booking started > 15 minutes ago

### `support.listTickets`

- **Auth:** Protected
- **Input:** `{ status?, limit? }`
- **Output:** `{ items: Ticket[] }`
- **Description:** Returns the authenticated user's support tickets

### `support.adminListTickets`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Ticket[], total, limit, offset }`
- **Description:** Returns all support tickets sorted by SLA urgency (earliest deadline first)

### `support.adminResolveTicket`

- **Auth:** Admin
- **Input:** `{ ticketId, resolution }` (`resolution` max 2,000 chars)
- **Output:** `{ ticket }`
- **Errors:** `SUPPORT_TICKET_NOT_FOUND` (404), `SUPPORT_TICKET_ALREADY_RESOLVED` (409)
- **Description:** Resolves a ticket, assigns the admin, notifies the reporter, and records an audit log

> SLA auto-escalation: the `escalate-support-tickets` scheduler job (15 min) marks open tickets past `slaDeadline` as `in_progress` + escalated (OQ-04 in-app part, #46). Business-hours SLA windows (30 min / 4 h) + WhatsApp escalation tracked U9 in `PRD-GAPS-PHASE3.md`.

---

## Upload (`upload.*`)

### `upload.createUploadUrl`

- **Auth:** Protected (F19 — intentionally NOT student-only: any authenticated role may mint a bounded upload URL; the tutor proof-file path needs it)
- **Input:** `{ filename, contentType }` (`contentType` one of `image/png`/`image/jpeg`/`image/webp`/`image/gif`/`application/pdf`; `filename` max 255 chars, no `..`/leading `/`)
- **Output:** `{ uploadUrl, key, publicUrl, contentType, maxBytes, method, fields }` (`maxBytes` 5 MB; `method: "POST"`; `fields` carries the S3/R2 presigned-POST policy fields — or is `{}` in local mode)
- **Errors:** `INVALID_CONTENT_TYPE` (400), `INVALID_FILENAME` (400)
- **Description:** Returns a presigned POST URL (Cloudflare R2, size-bounded via `content-length-range` in the policy) or a local URL (dev, `POST /uploads/*` with a session) for uploading a file; uploaded objects are referenced by `key`/`publicUrl` (e.g. private achievement `evidenceUrl`, public `documentationUrl`, or user avatar). Local files are served via `GET /uploads/*` when `R2_PUBLIC_URL` is unset
