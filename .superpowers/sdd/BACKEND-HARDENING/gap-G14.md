### G14: Admin Room Approval

**PRD:** FR-22 (Offline Room Booking)

**Current state:** Room bookings have `requested` status but no admin endpoints to approve/relocate/cancel.

**Required:**

1. `POST /rpc/admin.approveRoom` — approve room booking
2. `POST /rpc/admin.relocateRoom` — move booking to different room
3. `POST /rpc/admin.cancelRoom` — cancel room booking (booking continues without room)

**Acceptance tests:**

- Admin approves room → status changes to `confirmed`, student notified
- Admin relocates room → booking updated with new room, student notified
- Admin cancels room → room freed, booking continues

---

### G15: Group Series No Opt-Out Disclaimer
