# Achievements Page Design

## Overview

Competition achievements portfolio page. Students submit their competition achievements (MUN, WSC, olympiads, etc.), admins review and approve/reject. Approved achievements are displayed on cogitoacademy.id.

## Data Model

**Table: `achievements`**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, defaultRandom | Unique ID |
| userId | text | FK → authUser.id, not null | Owner |
| eventName | text | not null | Competition/event name ("JoinMUN 2025") |
| category | text | not null | Category tag ("MUN", "WSC", "Olympiad") |
| award | text | not null | Result/award ("Best Delegate", "Juara 1") |
| level | text | not null | Competition level ("international", "national", "regional") |
| eventDate | date | nullable | When the competition happened |
| location | text | nullable | Event location |
| description | text | nullable | Optional details |
| subjects | jsonb | default [] | Skills/subjects tags (string array) |
| imageUrl | text | nullable | Certificate or photo URL |
| status | text | not null, default "pending" | "pending" \| "approved" \| "rejected" |
| adminNote | text | nullable | Admin feedback on rejection |
| createdAt | timestamp | defaultNow() | Created timestamp |
| updatedAt | timestamp | defaultNow() | Updated timestamp |

Category and level are free-text, not enums. Students compete in diverse events; rigid enums fight the data. Categories are tag-like with suggestions.

## API Router

**File:** `packages/api/src/routers/achievement.ts`

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| list | query | protected | Get current user's achievements, ordered by eventDate desc |
| create | mutation | protected | Submit new achievement (zod validation) |
| update | mutation | protected | Edit own achievement (only if status=pending) |
| delete | mutation | protected | Remove own achievement (only if status=pending) |
| adminList | query | admin | All achievements, filterable by status |
| adminReview | mutation | admin | Approve/reject with optional note |

**Zod input schemas:**

- `createAchievementSchema`: eventName*, category*, award*, level*, eventDate, location, description, subjects (array), imageUrl
- `updateAchievementSchema`: id* + any fields from create
- `adminReviewSchema`: achievementId*, status* ("approved"|"rejected"), adminNote

## UI Design

### Layout: Card Grid + Modal Form

**Page header:**
- DefaultPage pattern: Heading + Text description
- "Add Achievement" Button (variant=primary) in header action area

**Stats row (3 StatCards):**
- Total achievements count
- Approved count (variant=success)
- Pending count (variant=warning)

**Filter bar:**
- Select for category filter (All / MUN / WSC / Olympiad / etc.)
- Select for status filter (All / Pending / Approved / Rejected)

**Card grid:**
- Responsive: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`
- Each card (Card variant=default):
  - Top: optional image if imageUrl exists
  - CardBody:
    - Category badge (variant=secondary)
    - Level badge (variant=tertiary)
    - Event name as Heading (size=sm)
    - Award result as Text (font-semibold)
    - Date + location as Text (text-muted)
    - Status badge: pending=warning, approved=success, rejected=danger
  - CardFooter:
    - If status=pending: Edit + Delete buttons (variant=plain)
    - If status=rejected: reason shown from adminNote

**Add/Edit Modal:**
- Selia Dialog + DialogPopup component (from `@cogito-app/ui/components/selia/dialog`)
- DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose
- DialogTrigger wraps the trigger button
- Form fields:
  - eventName* (Input)
  - category* (Input with dropdown suggestions)
  - award* (Input)
  - level* (Select: international/national/regional/provincial/district/school)
  - eventDate (Input type=date)
  - location (Input)
  - description (Textarea or Input)
  - subjects (Chip input — type and press enter to add)
  - imageUrl (text Input — URL input for MVP, file upload deferred)
- Submit Button (variant=primary), Cancel Button (variant=secondary)

### Engagement Hooks

**Empty state (no achievements yet):**
- Full-height Card with centered content replacing the card grid
- IconBox with IconTrophy (variant=primary, size=lg)
- Heading: "No achievements yet"
- Text: "Add your competition achievements and they'll be showcased on cogitoacademy.id for everyone to see."
- Primary Button: "Add Your First Achievement"

**Partial state (has some, no approved yet):**
- Small banner Card at top of card grid (variant=outlined, bg-accent)
- Text: "Your achievements are being reviewed. We'll notify you once they're approved and live on cogitoacademy.id."
- Dismissible — user can close it, stays hidden in session (localStorage)

**All approved state:**
- Small banner Card (variant=success tone)
- Text: "All your achievements are live on cogitoacademy.id. Keep adding more to build your portfolio!"
- Link to cogitoacademy.id profile (future)

**Rejected achievement:**
- Badge variant=danger on card
- Inline alert in CardFooter: adminNote text shown italic
- "Edit & Resubmit" Button (variant=plain) — reopens form pre-filled, resets status to pending on submit

**After submit (toast):**
- Toast notification: "Achievement submitted! It'll appear on cogitoacademy.id once approved."
- Achievement card appears immediately in grid with "Pending" badge (optimistic UI)

### Component Structure

```
apps/web/src/components/dashboard/
  pages/achivements-page.tsx      # Main page (rewrite from stub)
  achievement-card.tsx             # Individual achievement card
  achievement-form.tsx             # Modal form for add/edit
  achievement-filters.tsx          # Category + status filter bar
  achievement-stats.tsx            # Stat cards row
  achievement-empty-state.tsx     # Empty state CTA card
  achievement-banner.tsx           # Partial/all-approved banner

packages/db/src/schema/achievement.ts   # DB schema
packages/api/src/routers/achievement.ts  # API router
```

## User Flows

### Student submits achievement
1. Sees empty state CTA (or "Add Achievement" button)
2. Clicks → modal opens
3. Fills form, submits → toast: "Achievement submitted! It'll appear on cogitoacademy.id once approved."
4. Card appears in grid with "Pending" badge (optimistic)
5. If partial state banner visible: "Your achievements are being reviewed..."

### Student edits rejected achievement
1. Sees card with red "Rejected" badge + adminNote
2. Clicks "Edit & Resubmit" → modal opens pre-filled
3. Edits and submits → status resets to "pending", toast shown

### Admin reviews achievement
1. Admin views achievements via adminList (future: admin dashboard)
2. Clicks approve or reject
3. If rejected, adds adminNote
4. Student sees status update on their achievement card

## Status Badges

| Status | Badge variant | Color |
|--------|--------------|-------|
| pending | warning | Yellow |
| approved | success | Green |
| rejected | danger | Red |

## Level Values

Suggested select options for level field:
- International
- National
- Regional
- Provincial
- District
- School

## Category Suggestions

Pre-populated suggestions in the form dropdown:
- MUN
- WSC
- Olympiad
- Debate
- Science
- Arts
- Sports
- Academic
- Leadership

Custom categories allowed — free-text input.

## Out of Scope (Future)

- Admin dashboard UI for reviewing achievements (adminList/adminReview API exists, UI deferred)
- Image upload to file storage (imageUrl as text input for MVP)
- Public profile page showing approved achievements only
- Achievements on cogitoacademy.id website
- Notification when achievement is approved/rejected