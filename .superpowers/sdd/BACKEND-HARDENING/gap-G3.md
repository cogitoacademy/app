### G3: 15-Minute Lateness Auto-Cancel

**PRD:** DL-26 (Lateness Tolerance), OQ-07 (15-Minute Rule)

**Current state:** No automatic detection of tutor lateness. Student must manually report.

**Required:**

1. **New scheduler job:** `checkTutorLateness`
   - Runs every 5 minutes
   - Queries bookings where `start_time + 15 minutes < NOW()` AND `tutor_attendance = 'unknown'`
   - For each: set `tutor_attendance = 'absent'`, transition booking to `auto_cancelled`
   - Release student's held funds
   - Send notification to both student and tutor

2. **Attendance tracking:**
   - Add `tutorAttendance` field to `bookingParticipant` (enum: `unknown`, `present`, `late`, `absent`)
   - When tutor joins meeting link: set `tutorAttendance = 'present'`
   - When 15 minutes pass without joining: scheduler sets `tutorAttendance = 'absent'`

**Acceptance tests:**

- Booking starts, tutor doesn't join within 15 minutes → auto-cancelled, funds released
- Tutor joins at minute 5 → attendance set to `present`, no auto-cancel
- Student notified of auto-cancellation

---

### G4: Group Repricing Recalculation
