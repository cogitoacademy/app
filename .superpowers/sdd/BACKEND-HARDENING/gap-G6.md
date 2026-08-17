### G6: Tutor Reschedule with Student Approval

**PRD:** FR-15 (Rescheduling)

**Current state:** `proposeReschedule` endpoint **already exists** (`booking.router.ts:71`, `booking.service.ts:619`) but is wired as a **student** action (`protectedProcedure`, `ACTOR_TYPE.STUDENT`). This **contradicts PRD FR-15**, which requires the **tutor** to propose and the **student** to approve. No `acceptReschedule` or `rejectReschedule` endpoints exist. The `bookingRescheduleProposal` table exists and is written to by the existing endpoint.

**Required:**

1. **Fix `proposeReschedule` role:** Change from `protectedProcedure` (student) to `tutorProcedure` (tutor). Change `ACTOR_TYPE.STUDENT` to `ACTOR_TYPE.TUTOR` in the service. This is a **breaking fix**, not a new endpoint.

2. `POST /rpc/booking.acceptReschedule` — student accepts the tutor's proposal
   - Validates: booking is in `reschedule_proposed` state, student is the proposer
   - Updates booking start/end time to the proposed values
   - Updates meeting link if needed (recreate Google Meet event or update manual link)
   - Transitions `reschedule_proposed` → `awaiting_reconfirmation` (per state machine) or directly to `confirmed`/`scheduled` if no other participants affected
   - Sends notification to tutor

3. `POST /rpc/booking.rejectReschedule` — student rejects
   - Marks proposal as `rejected`
   - Transitions back to the previous state (before `reschedule_proposed`)
   - Sends notification to tutor
   - Booking remains at original time

**Acceptance tests:**

- Tutor proposes reschedule → proposal created, student notified (existing endpoint, after role fix)
- Student accepts → booking time updated, both notified
- Student rejects → proposal rejected, booking unchanged, tutor notified
- Only tutor can propose (student attempt → 403), only student can accept/reject (tutor attempt → 403)
- **Regression:** existing student-initiated reschedule (if any UI depends on it) must be removed or redirected to cancel+rebook flow

---

### G7: Rich-Text Session Notes
