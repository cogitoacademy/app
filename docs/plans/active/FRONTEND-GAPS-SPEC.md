# Cogito Frontend — PRD Gaps Specification

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Status     | Planning reference                             |
| Branch     | `feature/frontend-gaps` (future)              |
| Created    | 2026-07-29                                     |
| Depends on | Backend PRD gaps (G1-G19) where API is needed  |
| Scope      | Frontend only (`apps/web/`)                    |

This document catalogs all PRD-required frontend surfaces that are not yet implemented. It runs in parallel with (or after) the backend PRD gaps spec — each frontend gap references the backend gap it depends on.

The backend spec is `docs/plans/active/PRD-GAPS-SPEC.md` (backend-only). This is the frontend counterpart.

---

## Current Frontend State

### Existing routes (`apps/web/src/routes/`)

| Route                  | Component                        | Status |
| ---------------------- | -------------------------------- | ------ |
| `/` (index)            | Landing redirect                 | Exists |
| `/login`               | sign-in-form.tsx                 | Exists |
| `/auth/callback`       | auth callback                    | Exists |
| `/invite`              | invite-claim-page.tsx            | Exists |
| `/_app`                | App layout + sidebar             | Exists |
| `/_app/dashboard`      | dashboard/page.tsx               | Exists (stats only) |
| `/_app/balance`        | balance-page.tsx                 | Exists (wallet + Knowledge Bank card) |
| `/_app/bookings`       | bookings-page.tsx               | Exists (list + cancel only) |
| `/_app/tutors`         | tutors-page-content.tsx          | Exists (discovery list) |
| `/_app/achievements`    | achivements-page.tsx             | Exists (submission + list) |
| `/_app/profile`        | profile-page.tsx                 | Exists (incl. parent contact fields) |
| `/_app/onboarding`     | onboarding-form.tsx              | Exists (tutor onboarding) |
| `/_app/tutor-bookings` | tutor-bookings-page.tsx          | Exists (accept/decline only) |
| `/_app/admin-tutors`   | admin tutor invite + review      | Exists |

### What's missing (no route, no component)

The PRD §Product Surfaces and Permissions (prd.tex:317-375) defines required screens. The following are **not implemented**:

---

## Frontend Gap Summary

| #   | Gap                                          | PRD Ref         | Depends on (backend) | Effort | Priority |
| --- | -------------------------------------------- | -------------- | -------------------- | ------ | -------- |
| F1  | Admin dashboard + override queue              | FR-10, OQ-04   | G8, G9, G10          | 3d     | High     |
| F2  | Admin override form with before/after preview | FR-10, prd.tex:717-728 | G10         | 2d     | High     |
| F3  | Report tutor lateness/no-show button         | FR-14, DL-26   | G1                   | 1d     | High     |
| F4  | Competition Calendar link                    | FR-11          | None (external link) | 0.5d   | Medium   |
| F5  | WhatsApp support button                      | FR-14, OQ-04   | None (external link) | 0.5d   | Medium   |
| F6  | Tutor reschedule proposal UI                 | FR-15          | G6                   | 1d     | Medium   |
| F7  | Student reschedule approval UI               | FR-15          | G6                   | 1d     | Medium   |
| F8  | Series session completion UI                 | FR-20          | G18                  | 1d     | Medium   |
| F9  | Session notes (rich-text) view + add         | FR-09, DL-18   | G7                   | 1.5d   | Low      |
| F10 | Notifications page                           | FR-17          | G17                  | 1.5d   | Medium   |
| F11 | Admin wallet/ledger view                     | FR-10          | G9                   | 1d     | Medium   |
| F12 | Admin room approval UI                       | FR-22          | G14                  | 1d     | Low      |
| F13 | Tutor payout view                             | DL-11          | G16                  | 0.5d   | Medium   |
| F14 | Group series no opt-out disclaimer display   | FR-20          | G15                  | 0.5d   | Low      |
| F15 | Knowledge Bank gating flow (full)            | FR-12          | Partial (wallet.knowledgeBankEligible exists) | 0.5d | Medium |
| F16 | Achievements public landing surfacing         | FR-18          | None (public site)   | 1d     | Low      |
| F17 | Booking detail page (full)                   | FR-07, FR-08   | G6, G11              | 2d     | High     |

**Total estimated effort: ~20 days (frontend)**

---

## Detailed Gap Specifications

### F1: Admin Dashboard + Override Queue

**PRD:** FR-10 (Admin Override), OQ-04 (SLA escalation), prd.tex:717-728

**Current state:** No admin dashboard route exists. Only `_app.admin-tutors` (tutor invite + review). No booking monitor, no override queue, no urgency sorting.

**Required:**

1. New route `/_app/admin` — admin dashboard with:
   - Booking monitor: list all bookings (calls `adminBooking.listBookings`), sorted by urgency
   - Exception/override queue: bookings flagged for admin action, sorted by SLA deadline ascending
   - Filters: override category, urgency level, SLA status
   - Each queue item shows: booking id, session time, current state, affected users, held/deducted Marks, reported reason, report source, time since report, SLA status

2. Booking detail view (admin): full state history, participants, wallet impact, override action button

3. SLA escalation indicator: if SLA deadline passes without admin action, flag as escalated (OQ-04: 30 min business hours, 4 hours outside; escalate via WhatsApp +62 881-0119-90195)

**Acceptance:**

- Admin sees override queue sorted by urgency
- SLA-expired items flagged
- Filters work
- Clicking a queue item opens booking detail

---

### F2: Admin Override Form with Before/After Preview

**PRD:** FR-10, prd.tex:717-728 (Emergency Override UI/UX Requirements)

**Current state:** `applyOverride` endpoint exists but no UI.

**Required:**

Full override form per PRD §Emergency Override UI/UX:

1. Override category select: tutor no-show, student emergency, payment/wallet issue, platform error, offline room issue, admin correction
2. Reason (required, textarea, bounded)
3. Affected participant(s) (multi-select from booking participants)
4. Marks action select: no Marks change, release held Marks, add compensating Marks, reverse incorrect deduction, partial return, manual finance follow-up
5. User-visible note (sent to affected users)
6. Internal admin note (not shown to users)
7. **Before/after preview** (calls `admin.previewOverride` — G10): shows booking state before/after, wallet balance changes, participant impact
8. For payment/wallet overrides: display payment record, ledger entries, Marks credited, Marks spent, remaining balance, prior refund references (prd.tex:724)
9. Submit writes audit log + sends affected users in-app notification; email only if booking status/wallet/schedule changes

**Acceptance:**

- Admin opens override form → all required fields present
- Preview shows before/after booking state + wallet impact
- Submit creates audit entry + notification
- Cannot submit without reason + category

---

### F3: Report Tutor Lateness/No-Show Button

**PRD:** FR-14, DL-26, prd.tex:747

**Current state:** No report button on booking detail. Backend G1 not yet implemented.

**Required:**

1. On booking detail page (F17), after scheduled start time, show "Report tutor lateness / no-show" button
2. Button visible only when: booking is `scheduled`, current time > scheduled start time, user is the student (proposer)
3. Clicking opens a form: category (tutor_late / tutor_no_show / technical / payment / other), description
4. Calls `support.createTicket` (G1 backend)
5. After submission: show "Report submitted, admin will review" confirmation
6. Link to view ticket status

**Acceptance:**

- Button appears 15 min after scheduled start if tutor hasn't joined
- Student submits report → ticket created, confirmation shown
- Student can view ticket status

---

### F4: Competition Calendar Link

**PRD:** FR-11

**Current state:** No Competition Calendar link anywhere in the frontend. PRD requires it on public site + student dashboard.

**Required:**

1. Student dashboard: add Competition Calendar entry/link to `cogitoacademy.id/en/calendar`
2. Public landing page: link to calendar (if public site is part of this app)
3. No Marks condition — any signed-in student can open it

**Acceptance:**

- Student dashboard has visible Competition Calendar link
- Clicking opens external calendar at `cogitoacademy.id/en/calendar`

---

### F5: WhatsApp Support Button

**PRD:** FR-14, OQ-04, prd.tex:1260

**Current state:** No WhatsApp support button.

**Required:**

1. Add WhatsApp support button to student dashboard sidebar or footer
2. Links to `https://wa.me/6288101190195` (or equivalent wa.me link for +62 881-0119-90195)
3. Visible to all authenticated users

**Acceptance:**

- WhatsApp button visible on dashboard
- Clicking opens WhatsApp with the support number

---

### F6: Tutor Reschedule Proposal UI

**PRD:** FR-15

**Current state:** `proposeReschedule` exists but is student-action (wrong role — G6 backend fix needed). No tutor UI for proposing reschedule.

**Required (after G6 backend fix):**

1. On tutor booking detail (`_app.tutor-bookings`), add "Propose reschedule" action for bookings in `confirmed`/`scheduled` state
2. Form: new date/time picker, reason (optional)
3. Calls `booking.proposeReschedule` (tutor role, after G6 fix)
4. Shows pending status after submission

**Acceptance:**

- Tutor can propose new time → booking enters `reschedule_proposed`
- Student notified (via G17 notification matrix)

---

### F7: Student Reschedule Approval UI

**PRD:** FR-15

**Current state:** No `acceptReschedule`/`rejectReschedule` endpoints (G6 backend) or UI.

**Required (after G6 backend):**

1. On booking detail (F17), if booking is in `reschedule_proposed` state and user is the proposer (student):
   - Show proposed new time + reason
   - "Accept" button → calls `booking.acceptReschedule`
   - "Reject" button → calls `booking.rejectReschedule`
2. After accept: booking time updated, confirmation shown
3. After reject: booking unchanged, notification sent to tutor

**Acceptance:**

- Student sees reschedule proposal with accept/reject
- Accept → booking time updates
- Reject → booking stays at original time

---

### F8: Series Session Completion UI

**PRD:** FR-20

**Current state:** `completeSession` exists for solo/group but rejects series (G18 backend). No UI for completing individual series sessions.

**Required (after G18 backend):**

1. On tutor booking detail for series bookings, list each session with its state
2. "Complete" button per session (enabled when session start time has passed)
3. Calls `booking.completeSession` with sessionId
4. After all sessions complete: booking shows `completed`

**Acceptance:**

- Tutor sees series sessions list with complete buttons
- Completing one session deducts that session's Marks
- All sessions complete → booking state `completed`

---

### F9: Session Notes (Rich-Text)

**PRD:** FR-09, DL-18, prd.tex:1033-1043

**Current state:** No session notes UI. Backend G7 not implemented.

**Required (after G7 backend):**

1. On booking detail (after session completed), "Add session note" section
2. Rich-text editor supporting: paragraphs, headings, bullet lists, numbered lists, links, bold, italic
3. Sanitize on render (DOMPurify)
4. "View notes" section showing all notes from both parties
5. Only visible after session is completed

**Acceptance:**

- Tutor adds note with formatting → renders correctly
- Student views notes → sees formatted content
- XSS attempt → sanitized

---

### F10: Notifications Page

**PRD:** FR-17

**Current state:** `notification-bell.tsx` component exists but no full notifications page/route.

**Required:**

1. New route `/_app/notifications` — full notification list
2. Calls `notification.list` with cursor pagination
3. Show: title, body, category badge, read/unread state, timestamp, booking link
4. "Mark as read" per notification + "Mark all as read"
5. Unread count badge in sidebar (already has `notification-bell.tsx`)
6. Filter by category (optional)

**Acceptance:**

- Notifications page lists all notifications
- Mark as read works
- Unread badge updates

---

### F11: Admin Wallet/Ledger View

**PRD:** FR-10

**Current state:** No admin wallet view. Backend G9 not implemented.

**Required (after G9 backend):**

1. In admin dashboard (F1), "Wallet view" section
2. Search by user → calls `admin.getWallet` → shows balance (total/held/available)
3. Ledger entries: paginated, filterable by entry type, date range, booking ID
4. Calls `admin.listLedgerEntries`

**Acceptance:**

- Admin searches user → sees wallet balance
- Admin views ledger → paginated, filterable
- Non-admin → 403

---

### F12: Admin Room Approval UI

**PRD:** FR-22

**Current state:** No admin room approval UI. Backend G14 not implemented.

**Required (after G14 backend):**

1. In admin dashboard, room approval queue for offline bookings in `awaiting_admin_room_approval`
2. Actions: approve room, relocate room (select from available), cancel room
3. Calls `admin.approveRoom`, `admin.relocateRoom`, `admin.cancelRoom`
4. Notifies tutor + students (via G17)

**Acceptance:**

- Admin sees room approval queue
- Approve → booking scheduled
- Relocate → booking updated, notified
- Cancel room → room freed, booking continues

---

### F13: Tutor Payout View

**PRD:** DL-11

**Current state:** No payout view. Backend G16 not implemented. Depends on G19 (pricing fix) for correct calculation.

**Required (after G16 + G19 backend):**

1. New route or section in tutor dashboard: "My payouts"
2. Calls `tutor.getMyPayouts` with date range
3. Shows: total completed sessions, total Marks earned, Cogito's take, tutor's payout amount (Marks × Rp 7,000)
4. Admin version: `admin.getTutorPayouts` for any tutor

**Acceptance:**

- Tutor sees own payouts with correct split (after G19 fix)
- Admin sees any tutor's payouts
- Cancelled sessions not included

---

### F14: Group Series No Opt-Out Disclaimer

**PRD:** FR-20, prd.tex:895-901

**Current state:** No disclaimer displayed. Backend G15 not implemented.

**Required (after G15 backend):**

1. On group series booking creation/confirmation, display disclaimer: "This is a full-series commitment. Once confirmed, you cannot opt out of this series. Individual sessions missed after the H-2 cutoff are non-refundable. By proceeding, you confirm you are available for all listed dates and times."
2. On invitee acceptance screen: show all session dates/times, per-student price, total Marks hold, disclaimer, accept/decline
3. Block any "cancel individual session" attempt for group series with the disclaimer

**Acceptance:**

- Group series creation shows disclaimer
- Invitee sees disclaimer before accepting
- Cancel individual session → blocked with message

---

### F15: Knowledge Bank Gating Flow (Full)

**PRD:** FR-12, DL-16

**Current state:** `balance-page.tsx` has a Knowledge Bank card that checks `wallet.knowledgeBankEligible` and shows an "Open Knowledge Bank" button. Partial implementation.

**Required:**

1. Verify the "Open Knowledge Bank" button links to the external Knowledge Bank URL
2. User-facing copy must say: "Knowledge Bank access requires at least 35 Marks in your wallet. You are not paying 35 Marks to open it." (DL-16)
3. If below 35 Marks: show "Top up your wallet to unlock the Knowledge Bank" with link to balance/top-up
4. Opening Knowledge Bank must NOT deduct Marks (verify no deduction entry created)

**Acceptance:**

- Student with ≥35 Marks → can open Knowledge Bank, no deduction
- Student with <35 Marks → blocked, prompted to top up
- Copy is parent-legible (prd.tex:315)

---

### F16: Achievements Public Landing Surfacing

**PRD:** FR-18

**Current state:** Achievement submission + moderation exists. No public landing page surfacing of approved achievements.

**Required:**

1. Public landing page (or section) showing approved achievements
2. Calls a public endpoint to list approved achievements (may need new public route in achievement router)
3. Display: title, category, summary, student name, date

**Acceptance:**

- Approved achievements visible on public page
- Rejected/pending not shown publicly
- Student sees own rejected with reason (existing)

---

### F17: Booking Detail Page (Full)

**PRD:** FR-07, FR-08, FR-14, FR-15, FR-21

**Current state:** `bookings-page.tsx` shows a list with cancel button. No detail page. No meeting link display. No reschedule actions. No report button.

**Required:**

1. New route `/_app/bookings/$bookingId` — booking detail
2. Shows: booking state, type, tutor, participants, scheduled time, meeting link (if created), room (if offline), price, hold amount, state history timeline
3. Student actions: cancel (pre-H-2), report lateness (F3), accept/reject reschedule (F7)
4. Tutor actions: accept/decline (existing in tutor-bookings), propose reschedule (F6), complete session (F8), add session notes (F9)
5. Meeting link visible only after all confirmations (G11 backend)
6. State history: timeline of all transitions with timestamps and actors

**Acceptance:**

- Clicking a booking in list → opens detail
- All role-appropriate actions visible
- Meeting link gated by confirmation state
- State history visible

---

## Implementation Pattern

Follow existing frontend conventions:

1. **Route file:** `apps/web/src/routes/_app.{feature}.tsx` (TanStack Router file-based)
2. **Page component:** `apps/web/src/components/dashboard/pages/{feature}-page.tsx`
3. **Sub-components:** `apps/web/src/components/{section}/{component}.tsx`
4. **Data fetching:** TanStack Query via `orpc.{module}.{method}.queryOptions({ input })`
5. **Mutations:** `orpc.{module}.{method}.mutationOptions({ onSuccess, onError })`
6. **UI:** Selia components from `@cogito-app/ui/components/selia/*` (see AGENTS.md)
7. **Toast:** `sonner` for success/error notifications
8. **Forms:** TanStack Form (`@tanstack/react-form`) with Zod validation

### Selia Components Available

Card, Button, Badge, Heading, Text, Stack, Input, Field, Select, Menu, Table, Item, Avatar, Divider, Separator, Checkbox, Chip, IconBox, InputGroup, Kbd, Sidebar, Toast. See AGENTS.md for full list + import paths.

---

### Version Notes

- v1.0 (2026-07-29): Created. 17 frontend gaps catalogued (F1-F17) with PRD references, backend dependencies, and acceptance criteria. Derived from PRD §Product Surfaces and audit of `apps/web/src/`. Runs parallel with backend PRD-GAPS-SPEC.md.