# Phase 2: Tutor Discovery & Availability — Design Spec

**Date:** 2026-06-26  
**Source of truth:** `docs/planning-phase-0-backend-mvp/PLAN.md` §10 Phase 2  
**Scope:** Add `availabilitySlot` table, tutor availability CRUD, and enhance discovery listing/profile with availability data. No frontend wiring.

---

## 1. Goal

Tutors can manage their weekly availability windows. Students browsing discovery see availability summary and upcoming slots on tutor cards and the profile detail view.

## 2. New DB Table

### `availabilitySlot`

| Column         | Type         | Notes                                         |
| -------------- | ------------ | --------------------------------------------- |
| id             | uuid PK      | uuidPrimaryKey                                |
| tutorId        | text FK→user | cascade (tutor is a user)                     |
| startDate      | timestamptz  | Window start                                  |
| endDate        | timestamptz  | Window end                                    |
| modality       | text         | CHECK online/offline/both                     |
| isRecurring    | bool         | Default false                                 |
| recurrenceRule | text         | Nullable (RRULE-ish string; MVP display only) |
| isActive       | bool         | Default true                                  |
| createdAt      | timestamp    | default now                                   |
| updatedAt      | timestamp    | default now + onUpdate                        |

Indexes: `(tutorId, startDate)`.  
Unique: `(tutorId, startDate, endDate)` prevents duplicate windows.

Relations: `tutorProfile` ↔ `availabilitySlot` via `tutorId` = user id.

## 3. Tutor Availability CRUD

### Router (`tutorRouter`)

All protected + require tutor role.

- `listAvailability` → `POST /tutor/availability/list` → own slots, filter active, ordered by startDate.
- `upsertAvailability` → `POST /tutor/availability/upsert` → `{ id?, startDate, endDate, modality, isRecurring?, recurrenceRule?, isActive? }`. If `id` provided, update own slot if start/end not overlapping another slot (excluding itself). If no `id`, insert new slot if no overlap.
- `deleteAvailability` → `POST /tutor/availability/delete` → `{ id }` → soft-delete by setting `isActive=false` (or hard delete; prefer hard delete for simple windows).

### Service (`TutorService`)

- `listAvailability(userId)`
- `upsertAvailability(userId, input)`
- `deleteAvailability(userId, id)`

Overlap guard: check existing active slots for same tutor with `[startDate, endDate)` intersecting. Reject with `CONFLICT`.

## 4. Discovery Enhancement

### `discoveryRouter`

- `listPublished` already returns `availabilitySummary`. Add `upcomingSlots` (next 3 active slots starting from now) to each card.
- `getProfile` → `POST /tutors/profile/get` → `{ tutorId }` returns published profile + full user + all future active slots + prices.

### Service (`DiscoveryService`)

- `getProfile(tutorId)` — same as existing but include `slots`.
- `listPublished` — for each profile, fetch next 3 future active slots.

## 5. Pricing Floor

Already implemented: `PricingService.validatePrices` uses higher of online/offline floors when modality = `both`.

## 6. Tests

- `tutor-availability.test.ts` — create, update, overlap rejection, delete, list.
- `tutor-discovery.test.ts` — list returns required fields (TC-07), getProfile returns slots, only published profiles visible.

## 7. Out of Scope

- Booking using slots (Phase 3)
- Recurring expansion (recurrenceRule stored but not expanded)
- Frontend availability calendar UI (Phase 2 backend only)
- Real-time slot occupancy
