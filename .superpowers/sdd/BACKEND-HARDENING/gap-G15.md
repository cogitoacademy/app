### G15: Group Series No Opt-Out Disclaimer

**PRD:** FR-20 (Series)

**Current state:** No disclaimer text returned in series booking API response.

**Required:**

1. Add `disclaimer` field to series booking response:
   - "Group series bookings require attendance at all sessions. Individual sessions cannot be cancelled."
2. Enforce at service level: `canCancelSession(session)` returns false for group series

**Acceptance tests:**

- Create group series → response includes disclaimer text
- Attempt to cancel individual session → rejected with disclaimer reference

---

### G16: Tutor Payout Calculation
