### G2: 12-Hour Deadline Enforcement by Scheduler

**PRD:** DL-25 (12-Hour Confirmation Window)

**Current state:** Scheduler has `expireBookings` job but it's either not running or not processing correctly (N1 bug). Even after bug fix, there's no periodic enforcement of the 12-hour deadline.

**Required:**

1. Configure BullMQ repeatable job to run `expireBookings` every 5 minutes
2. Job queries: `SELECT * FROM booking WHERE status IN ('pending_confirmed', 'pending') AND deadline_at < NOW()`
3. For each expired booking: transition to `expired`, release held funds, send notification
4. Also expire series sessions with past `deadline_at` (N4 fix ensures they have deadlines)
5. Add logging/metrics for number of bookings expired per run

**Acceptance tests:**

- Booking created with 12h deadline → after 12h, scheduler expires it
- Held funds released when booking expires
- Series session with past deadline → expired by scheduler
- Notification sent when booking expires

---

### G3: 15-Minute Lateness Auto-Cancel
