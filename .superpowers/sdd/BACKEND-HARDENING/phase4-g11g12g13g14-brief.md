# PRD-GAPS Phase 4 — G11 (meeting link gating), G12 (Meet attendees), G13 (room availability), G14 (admin room approval)

Branch: `feat/prd-gaps-meeting-room` (stacked on `feat/prd-gaps-admin` → ... → main).

Read the gap specs:

- G11: .superpowers/sdd/BACKEND-HARDENING/gap-G11.md
- G12: .superpowers/sdd/BACKEND-HARDENING/gap-G12.md
- G13: .superpowers/sdd/BACKEND-HARDENING/gap-G13.md
- G14: .superpowers/sdd/BACKEND-HARDENING/gap-G14.md

## Verified code state (facts to build on)

### G11 — Meeting link visibility gating

- The meeting link is created on tutor accept (`tutorAccept`, booking.service.ts:~589): `meeting.createEvent(...)`. For groups, tutor accept only happens after all participants confirmed (state machine). So the "all confirmed AND tutor accepted" gating is LARGELY satisfied by construction.
- PRD wants: before link creation show placeholder; after creation, visible to confirmed participants; withdrawal after link creation doesn't revoke.
- BACKEND piece: add a `meetingLinkStatus` (or reuse meetingEvent status) to the booking GET response — e.g. `meetingStatus: "pending" | "ready" | "failed"` + `meetingUrl: string | null`, so the frontend can render placeholder vs link. `meetingEvent` table already exists with status/meetingUrl columns; `findBookingById`/`findBookingWithParticipants` includes `meeting: true` relation (verify). Add a computed field in the booking response mapper (check where booking rows are mapped to responses — likely in the repo or service; find the mapper that returns tutor/proposer/participants and add meeting info).
- Do NOT change when createEvent fires (keep on tutor accept — it's already gated by construction). Just expose the status/URL in responses.

### G12 — Google Meet attendee automation

- `MeetingPort.createEvent(bookingId, start?, end?)` has NO attendee params. Google Calendar insert (`google-meeting.provider.ts:58-70`) has no `attendees` field. `meetingEvent.attendeeEmails` column EXISTS (schema booking.ts:337) but never populated.
- Extend: `MeetingPort.createEvent(bookingId, start?, end?, attendees?: { email: string; name?: string }[])`; Google provider adds `attendees: [{ email, displayName }]` to the calendar insert requestBody; persist `attendeeEmails` on the meetingEvent row; fallback provider unaffected (accept + ignore attendees).
- Update the booking call site (tutorAccept) to pass the tutor + confirmed participants' emails. Check how the service can get emails (user table — repo may need a `findUserEmails(ids)` method or the booking-with-participants query already includes `user.email` — verify the participant.user relation includes email).
- Note: G12's "cancel removes attendees / reschedule updates event" is OPTIONAL — the meeting port has only createEvent; document as deferred if adding update/cancel event methods is too large. Focus on attendee creation.
- Update google-meeting.provider.test.ts mocks for the new param.

### G13 — Offline room availability

- `room.service.checkAvailability(roomId, startAt, endAt, excludeBookingId?)` EXISTS but is NOT exposed via router/handler.
- Add `room.checkAvailability` (protectedProcedure): input `{ roomId, startAt, endAt }` → `{ available: boolean, conflictingBookings?: ... }`. Minimal: return `{ available }`.
- PRD also wants booking creation to check room availability for offline modality. The booking creation flow currently doesn't assign rooms at all (offline bookings go to AWAITING_ADMIN_ROOM_APPROVAL via state machine — verify how offline modality is handled at create; `room.assign` exists for admin). MINIMAL scope: expose the endpoint only; do NOT change the creation flow (auto-assign is out of Phase-0 scope per spec nuance — document).

### G14 — Admin room approval

- `room.assign` EXISTS (adminProcedure, confirms a room for a booking, conflict-checked). It's the approve-equivalent.
- Missing: `relocateRoom` (move booking to different room — validate new room, free old) and `cancelRoom` (cancel room booking, booking continues without room).
- Add `room.relocate` + `room.cancelBooking` (adminProcedure): follow `assignRoom` patterns; check `roomBooking` schema (booking.ts:297-326) for status values (requested/confirmed/relocated/cancelled) and repo methods (findRoomBookingsForUpdate etc.). Add repo methods if needed (update room booking status / reassign).
- Notify student on approve/relocate/cancel IF a notification port exists on room module — check room/index.ts; if not, document.

## Architecture patterns (MUST follow)

- 4-layer per module; DbOrTx; DomainError + withDomainMap; bounded zod; consumer-driven ports.
- Meeting: read `packages/api/src/modules/meeting/` fully (types, google provider, fallback provider, index). Booking: find where meeting.createEvent is called (~589) and how booking rows map to responses (find the mapper — search booking.service.ts/repo for the response shape with tutor/proposer/participants).
- Room: read `packages/api/src/modules/room/` fully.
- Update google-meeting.provider.test.ts for the new attendees param.
- No migrations expected (attendeeEmails column exists; meeting status is computed).

## Tests (real DB)

- G11: integration test — after tutor accept, booking GET includes meetingStatus/meetingUrl; before accept, null/pending.
- G12: unit test — google provider passes attendees to calendar insert (mock googleapis, assert requestBody.attendees); integration test — meetingEvent row has attendeeEmails populated after accept.
- G13: integration test — room.checkAvailability returns true for free slot, false for overlapping.
- G14: integration test — assign → relocate (old freed, new confirmed) → cancel (booking continues, room booking cancelled).
- Run full suite at the end: `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` — expect 0 fail (currently 1489).

## Constraints

- Conventional commits per gap: `feat(meeting): expose meeting link status on booking responses (G11)`, `feat(meeting): add Google Meet attendees (G12)`, `feat(room): expose room availability check (G13)`, `feat(room): admin room relocate and cancel (G14)`.
- Backend only. No frontend.
- Keep `createEvent` firing on tutor accept unchanged.
