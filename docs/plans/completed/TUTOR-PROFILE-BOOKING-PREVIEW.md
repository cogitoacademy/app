# Tutor profile preview from booking

Status: Completed locally on 2026-09-08.

## Objective

Let a student reopen the selected tutor's public profile while filling out a
booking request, without leaving `/tutors/:tutorId/book` or losing form state.

## Implementation

- Added a **View tutor profile** action beside the booking heading.
- Reused `TutorDrawer` with the already-loaded `tutors.getProfile` response.
- Added a drawer mode that replaces the directory's **Book a session** CTA with
  **Back to booking**.
- Kept the behavior frontend-only; no RPC, schema, or persistence changes.

## Verification

- `bunx turbo run check-types --filter=web`
- `bunx oxlint apps/web/src/components/booking/create-booking-page.tsx apps/web/src/components/tutor/tutor-drawer.tsx`
- `bunx oxfmt --check apps/web/src/components/booking/create-booking-page.tsx apps/web/src/components/tutor/tutor-drawer.tsx`
