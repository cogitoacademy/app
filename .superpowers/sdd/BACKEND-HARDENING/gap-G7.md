### G7: Rich-Text Session Notes

**PRD:** FR-09 (Session Notes), DL-18 (Post-Session Documentation), PRD §Session Notes (prd.tex:1033-1043)

**Current state:** `_sessionNote` field exists in schema but is unused and undocumented. No sanitization.

**Required:**

1. Add `sessionNotes` field to `bookingParticipant` or create separate `sessionNote` table:
   - `id` (uuid PK)
   - `bookingId` (FK → booking)
   - `authorId` (FK → user)
   - `content` (text, rich-text/markdown)
   - `createdAt`, `updatedAt`

2. Endpoints:
   - `POST /rpc/booking.addSessionNote` — tutor or student adds note
   - `POST /rpc/booking.getSessionNotes` — both parties can view notes
   - Only visible after session is completed

3. **Sanitization (PRD requirement):** Rich-text content must be sanitized before storage or rendering. Allowed tags: paragraphs, headings, bullet lists, numbered lists, links, bold, italic. Use DOMPurify or similar. File upload, image embed, scoring fields, and rubric fields are out of Phase 0.

**Acceptance tests:**

- Tutor adds note after session → stored, visible to student
- Student views notes → sees tutor's notes
- Attempt to add note before session completed → rejected
- Attempt to inject `<script>` or disallowed tags → sanitized, no XSS
- Attempt to add image/file embed → rejected (out of scope)

---

### G8: Admin Override Queue with Urgency
