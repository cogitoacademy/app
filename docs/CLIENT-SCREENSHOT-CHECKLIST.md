# Client Screenshot Checklist

Use this checklist to prepare a consistent visual review of the Cogito web app. Capture at **1440 × 1000** in light mode unless a row says otherwise. Keep the browser zoom at 100%, use seeded local data, and avoid showing browser devtools.

## Setup

1. Start Docker Desktop, then run `bun run db:start`.
2. Run `bun --env-file apps/server/.env apps/server/src/seed.ts` and `bun run dev`.
3. Use these local-only seeded accounts:
   - Student: `student.seed@cogitoacademy.id` / `student123`
   - Tutor: `tutor.seed@cogitoacademy.id` / `tutor123`
   - Admin: `admin@cogitoacademy.id` / `admin123`
4. Before each role, sign out instead of changing user data in the same session.

## Public and authentication

| ID   | Route/state                 | What the screenshot should prove                               |
| ---- | --------------------------- | -------------------------------------------------------------- |
| P-01 | `/` — top of page           | Positioning, tutor CTA, Marks concept, navigation              |
| P-02 | `/` — flow and achievements | Primary journey and achievement promotion direction            |
| P-03 | `/login` — sign in          | Google and email sign-in options                               |
| P-04 | `/login` — sign up          | Public registration creates a student account only             |
| P-05 | `/invite?token=…`           | Tutor invitation claim experience; create a fresh invite first |

## Student workspace

| ID   | Route/state                                   | What the screenshot should prove                         |
| ---- | --------------------------------------------- | -------------------------------------------------------- |
| S-01 | `/dashboard`                                  | Student overview, balance, and upcoming activity         |
| S-02 | `/tutors`                                     | Tutor discovery, filters, and published tutor cards      |
| S-03 | `/tutors/{tutorId}/book` — solo               | Slot selection, modality, pricing, and booking summary   |
| S-04 | `/tutors/{tutorId}/book` — group              | Participant search/invites and group pricing             |
| S-05 | `/tutors/{tutorId}/book` — series             | Multi-slot selection and series summary                  |
| S-06 | `/bookings`                                   | Booking list and status visibility                       |
| S-07 | `/bookings/{bookingId}` — scheduled           | Session details, lifecycle actions, and calendar export  |
| S-08 | `/bookings/{bookingId}` — proposed reschedule | Accept/reject reschedule controls                        |
| S-09 | `/bookings/{bookingId}` — completed/no-show   | Session notes or support-report state                    |
| S-10 | `/balance`                                    | Marks balance, packages, Knowledge Bank rule, and ledger |
| S-11 | `/achievements` — filled                      | Achievement cards and moderation statuses                |
| S-12 | `/achievements` — create/edit                 | Achievement submission form                              |
| S-13 | `/profile`                                    | Student profile data                                     |
| S-14 | `/notifications`                              | Notification center and read state                       |

## Tutor workspace

| ID   | Route/state                         | What the screenshot should prove                           |
| ---- | ----------------------------------- | ---------------------------------------------------------- |
| T-01 | `/dashboard`                        | Role-aware tutor overview                                  |
| T-02 | `/onboarding`                       | Tutor profile, credentials, pricing, and publication state |
| T-03 | `/availability`                     | Slot creation and availability management                  |
| T-04 | `/tutor-bookings`                   | Incoming and active bookings                               |
| T-05 | `/bookings/{bookingId}` — scheduled | Meet link, reschedule, lateness, and session-note actions  |

## Admin workspace

| ID   | Route/state                         | What the screenshot should prove                |
| ---- | ----------------------------------- | ----------------------------------------------- |
| A-01 | `/dashboard`                        | Role-aware admin overview                       |
| A-02 | `/admin-tutors`                     | Tutor invite and publication review workflow    |
| A-03 | `/admin-achievements`               | Achievement moderation queue                    |
| A-04 | `/admin-operations` — support       | Urgency, escalation, and support queue controls |
| A-05 | `/admin-operations` — overrides     | Preview/apply override workflow                 |
| A-06 | `/admin-operations` — finance/rooms | Wallet ledger lookup and room operations        |

## Responsive spot checks

Capture these again at **390 × 844**:

- Landing-page hero and CTA (`P-01`)
- Sign-in form (`P-03`)
- Student dashboard with the sidebar closed (`S-01`)
- Tutor discovery and filters (`S-02`)
- Booking detail and lifecycle actions (`S-07`)
- Admin operations (`A-04`)

## Review hygiene

- Use realistic seed names; do not show raw IDs unless the screen is explicitly operational/admin-facing.
- Let loading indicators settle before capture.
- Include empty, loading, error, and filled states in QA, but send the client the filled state unless the empty state is itself a feature.
- Check that no disabled-looking control is merely unfinished and that every visible link/button has a working destination.
- Redact invite tokens, private Meet links, personal emails, and support-ticket details before sending screenshots outside the project team.
