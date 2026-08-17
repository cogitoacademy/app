# PRD-GAPS Phase 2 — G4 (group repricing), G5 (series cancel), G6 (tutor reschedule), G7 (session notes)

Branch: `feat/prd-gaps-booking` (stacked on `feat/prd-gaps-support-lateness` → `test/backend-realignment` → main).

Read the gap specs:

- G4: .superpowers/sdd/BACKEND-HARDENING/gap-G4.md
- G5: .superpowers/sdd/BACKEND-HARDENING/gap-G5.md
- G6: .superpowers/sdd/BACKEND-HARDENING/gap-G6.md
- G7: .superpowers/sdd/BACKEND-HARDENING/gap-G7.md

## Verified code state (facts to build on)

### G4 — group repricing on headcount change

- `withdraw()` (booking.service.ts:948-1040): on pre-H2 group withdrawal it transitions to `AWAITING_RECONFIRMATION` but does NOT repricing. `reconfirm()` (901-947) only flips participant flags.
- `priceSnapshot` is fixed at creation (computeSplit at 695-703, group flow). `priceSnapshot.perStudent` = tutor price; `baseline` = baseline total (G19 semantics from PR C — this branch is BEFORE PR C merges; computeSplit here is the OLD 2-arg form `computeSplit(totalMarks, groupSize)`. When PR C merges it becomes 3-arg — but you're building on the pre-C state; keep using the existing 2-arg call and do NOT touch computeSplit signature. Repricing can use the existing priceSnapshot fields: perStudent (actual charge) and baseline).
- Implementation: on group pre-H2 withdrawal (the AWAITING_RECONFIRMATION branch), recalculate per-student price for the NEW headcount using the same pricing service (tutor price × new size), update `booking.holdAmount` and remaining participants' `heldAmount`, release excess for the withdrawn student (already released), adjust holds for remaining participants, and notify all current participants of the new price. On reconfirm-complete, if headcount changed, same recalc. Follow the PRD examples (4@28 → 3@35; 3@35 → 4@28).
- IMPORTANT: keep changes minimal and safe. If repricing increases a participant's hold beyond their available balance, decide + document the behavior (PRD doesn't specify; prefer: reject the withdrawal? or allow with insufficient-balance error surfaced at reconfirm). Recommend: on withdrawal-triggered repricing, if any remaining participant can't cover the new hold, throw an error that rolls back the withdrawal (documented in report).

### G5 — series cancellation rules + cancelSession

- Whole-booking `cancel()` enforces H-2 (391-405) and cascades `cancelAllSessions`. There is NO `cancelSession` endpoint for individual series sessions.
- Add `booking.cancelSession` (protectedProcedure, student): validates session belongs to a SERIES booking, session start > 2h from now, cancels that single `bookingSession` row, releases that session's hold (series holds are per-session — check how createSeries stores sessions/holds at 1084-1180), notifies.
- Group series: no individual cancellation (return disclaimer / reject). Add `disclaimer` to series booking responses (G15's backend piece: add a `disclaimer` field to the createSeries response and booking get response for group series). Note: G15 lives in Phase 5 — do ONLY the enforcement + response field here if cheap, else document.

### G6 — tutor reschedule with student approval

- `proposeReschedule` is CURRENTLY a student action (protectedProcedure, booking.router.ts:71-80; service hardcodes ACTOR_TYPE.STUDENT + "Student proposed a new time" at ~642-669). PRD FR-15 requires TUTOR proposes, STUDENT approves.
- Fix: change `proposeReschedule` to `tutorProcedure` (tutor-only) + service ACTOR_TYPE.TUTOR + notification copy. Add `acceptReschedule` + `rejectReschedule` (student-only, protectedProcedure):
  - accept: validates state `reschedule_proposed`, student is proposer, updates scheduledStartAt/EndAt to proposal values, transitions `reschedule_proposed → awaiting_reconfirmation` (per transitions table) or back to prior state if solo, updates meeting link if one exists (meeting port has only createEvent — if a meetingEvent row exists, update its meetingUrl is optional; prefer: re-create via meeting port if easy, else document), notifies tutor.
  - reject: marks proposal rejected (bookingRescheduleProposal table has a status? check schema — booking.ts:214-241), transitions back to the previous state, notifies tutor.
- Check `bookingRescheduleProposal` schema (packages/db/src/schema/booking.ts:214-241) for available columns (status/proposed times) and how proposeReschedule writes it.

### G7 — session notes

- Dead `sessionNote` input on `completeSessionInput` (booking.types.ts:107) discarded by handler. No storage, no endpoints, no sanitization.
- Implement minimal: add `sessionNotes` to `bookingSession` table? NO — prefer a new `sessionNote` table OR store on bookingParticipant. Spec allows either. Minimal choice: add `session_note` text column to `bookingSession` (series sessions) — but solo/group bookings have no session row... Booking itself is the session for solo/group. Recommend: add `sessionNote` text column to the `booking` table (nullable, author = tutor, single note per booking for Phase 0) OR a small `sessionNote` table with bookingId/authorId/content. Choose the table approach if you want author tracking; column approach is simpler. Document your choice.
- Endpoints: `booking.addSessionNote` (tutorProcedure for tutor / protected for either — spec says tutor OR student adds; keep tutor-only for simplicity? spec: "tutor or student adds note" — implement protected with role check: only after COMPLETED state), `booking.getSessionNotes` (both parties, only after completed).
- Sanitization: PRD requires sanitization (no <script>). Node has no DOMPurify; implement a minimal sanitizer (strip <script>, on* attributes, javascript: URLs) as a small lib function with unit tests. Document scope (no rich-text editor in Phase 0 — plain text + markdown-safe).

## Architecture patterns (MUST follow)

- 4-layer per module; DbOrTx; DomainError + withDomainMap; bounded zod.
- Reference achievement/room modules for structure; booking module for service patterns.
- Notifications: `deps.notification.write` / `writeBestEffort` with eventKey dedup (see booking.service.ts usage).
- Scheduler jobs NOT needed for this phase.
- Migrations via `bun run db:generate` + `bun run db:migrate`.

## Tests (real DB)

- G4: integration test — group of 4 at 28 → withdraw 1 → remaining 3, holds adjusted (released excess / increased hold), notification sent.
- G5: integration test — solo series cancel session 3h before → allowed; 1h before → rejected; group series → rejected with disclaimer.
- G6: integration test — tutor proposes → student accepts → time updated + both notified; student rejects → proposal rejected, booking unchanged.
- G7: integration test — tutor adds note after completed → stored + visible; attempt before completed → rejected; <script> injection → sanitized.
- Run full suite at the end: `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` — expect 0 fail (currently 1394).

## Constraints

- Conventional commits per gap: `feat(booking): group repricing on headcount change (G4)`, `feat(booking): series session cancellation rules (G5)`, `feat(booking): tutor reschedule with student approval (G6)`, `feat(booking): session notes with sanitization (G7)`.
- Backend only. No frontend.
- Do NOT modify computeSplit / pricing signature (PR C does that; it's not merged here).
- Keep the booking state machine changes minimal — prefer existing states.
