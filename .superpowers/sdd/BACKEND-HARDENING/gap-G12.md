### G12: Google Meet Attendee Automation

**PRD:** FR-21 (Meeting Link), OQ-05 (Calendar Integration)

**Current state:** Google Meet events are created but don't include student/tutor as attendees.

**Required:**

1. When creating Google Calendar event for a booking:
   - Add tutor email as attendee
   - Add student email as attendee
   - Both receive calendar invitation
2. When cancelling a booking:
   - Remove attendees from calendar event (or cancel event entirely)
3. When rescheduling:
   - Update calendar event with new time

**Acceptance tests:**

- Booking confirmed → tutor and student receive Google Calendar invite
- Booking cancelled → calendar event updated/cancelled
- Booking rescheduled → calendar event time updated

---

### G13: Offline Room Availability
