### G8: Admin Override Queue with Urgency

**PRD:** FR-10 (Admin Override)

**Current state:** `applyOverride` exists but `listBookings` returns null cursor (N9), no urgency sorting, no SLA tracking.

**Required:**

1. Fix `listBookings` pagination (N9)
2. Add urgency sorting: bookings sorted by (1) state urgency, (2) time-to-session
3. Add SLA tracking: admin override requests that haven't been addressed within 12 hours escalate
4. Add exception filters: filter by override category, urgency level, SLA status

**Acceptance tests:**

- Admin lists bookings → sorted by urgency (pending overrides first)
- Filter by category → shows only matching bookings
- SLA deadline passed → booking flagged as escalated

---

### G9: Admin Wallet/Ledger View
