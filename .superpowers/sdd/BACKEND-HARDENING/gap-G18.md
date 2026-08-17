### G18: Series Session Completion

**PRD:** FR-20 (Series)

**Current state:** No endpoint to mark individual series sessions as completed. `completeSession` rejects series bookings.

**Required:**

1. `POST /rpc/booking.completeSession` — mark individual series session as completed
   - Validates: session exists, booking is a series, session start time has passed
   - Sets session state to `completed`
   - Deducts held funds for this session
   - Notifies both parties

2. After all sessions in series are completed:
   - Transition booking to `completed`
   - Release any remaining holds

**Acceptance tests:**

- Mark session 1 of 3 as completed → session state updated, funds deducted
- Mark all 3 sessions → booking state transitions to `completed`
- Attempt to complete future session → rejected
- Attempt to complete already-completed session → rejected

---

### G19: Pricing Extra-Take Rule (Above-Baseline Tutor Pricing)
