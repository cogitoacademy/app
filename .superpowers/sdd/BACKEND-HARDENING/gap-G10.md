### G10: Before/After Override Preview

**PRD:** FR-10 (Admin Override)

**Current state:** `applyOverride` applies changes directly. No preview.

**Required:**

1. `POST /rpc/admin.previewOverride` — returns projected state changes without applying them
   - Shows: booking state before/after, wallet balance changes, participant impact
   - Does NOT persist any changes

**Acceptance tests:**

- Admin previews override → sees before/after booking state
- Admin previews override → sees wallet balance impact
- Preview does not modify any data

---

### G11: Meeting Link Visibility Gating
