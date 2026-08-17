### G13: Offline Room Availability

**PRD:** FR-22 (Offline Room Booking)

**Current state:** No room availability checking during booking creation.

**Required:**

1. When creating offline booking:
   - Check room availability for requested time slot
   - If room available: auto-approve room request
   - If room unavailable: allow booking without room (student arranges own venue)
   - If room partially available (different room): suggest alternatives
2. Room availability query:
   - `POST /rpc/room.checkAvailability` — check if room is free for a time slot

**Acceptance tests:**

- Offline booking with available room → room auto-assigned
- Offline booking with unavailable room → booking created without room
- Room availability check for overlapping time → returns conflict

---

### G14: Admin Room Approval
