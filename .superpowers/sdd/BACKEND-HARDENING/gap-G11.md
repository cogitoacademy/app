### G11: Meeting Link Visibility Gating

**PRD:** FR-21 (Meeting Link)

**Current state:** Meeting link created immediately on booking confirmation, regardless of participant status.

**Required:**

1. Create meeting link only when all participants have confirmed AND tutor has accepted
2. Before link creation: show "Meeting link will be available once all participants confirm"
3. After link creation: show link to all confirmed participants
4. If participant withdraws after link creation: don't revoke link (tutor may still want to use it)

**Acceptance tests:**

- Booking confirmed by student, waiting for tutor → no meeting link
- Tutor accepts → meeting link created, visible to both
- Group booking: 3 of 4 confirmed → no link yet
- Group booking: all confirmed → link created

---

### G12: Google Meet Attendee Automation
