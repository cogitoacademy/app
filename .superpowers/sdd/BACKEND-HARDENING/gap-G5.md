### G5: Series Cancellation Rules

**PRD:** FR-20 (Series)

**Current state:** Series bookings can be cancelled but don't enforce the H-2 cancellation window.

**Required:**

1. **Individual session cancellation:** Student can cancel individual sessions up to 2 hours before start time
   - `POST /rpc/booking.cancelSession` with `sessionId`
   - Validation: session start time must be > 2 hours from now
   - Cancel session: release hold, send notification

2. **Group series no opt-out:** Group series bookings cannot have individual sessions cancelled
   - Return disclaimer text in booking response: "Group series bookings require attendance at all sessions. Individual sessions cannot be cancelled."
   - Enforce at service level: `canCancelSession(session)` returns false for group series

**Acceptance tests:**

- Solo series: cancel session 3 hours before start → allowed, funds released
- Solo series: cancel session 1 hour before start → rejected
- Group series: cancel session → rejected with disclaimer

---

### G6: Tutor Reschedule with Student Approval
