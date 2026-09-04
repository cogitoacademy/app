# Server-backed table pagination

Status: **Completed locally 2026-09-04**

## Objective

Give every database-backed web table clear, reusable pagination controls while
ensuring page boundaries are enforced by the API/database rather than by
loading a complete collection in the browser.

## Delivered

- Added shared Selia-based pagination chrome with accessible previous/next
  controls, loading-state disabling, page summaries, reduced-motion-safe card
  scrolling, and empty-page handling.
- Added server-side achievement list filters and `limit`/`offset` pagination,
  plus aggregate student/admin status-count procedures.
- Added server-side `limit`/`offset` inputs for room catalog and pending room
  approvals while preserving the unpaginated room-selector compatibility path.
- Connected the admin booking queue and wallet ledger tables to their existing
  cursor-backed APIs, and retained independent server pagination for admin
  tutor invitations and profiles.
- Added pagination/filter reset behavior and `keepPreviousData` so table
  transitions remain stable and do not flash stale empty states.
- Documented endpoint contracts, module ownership, runbook checks, and the
  intentional exclusion of finite economy/pricing matrices.

## Verification

- `bun run check-types`
- Focused API suite: 142 passing tests across achievement and room handlers,
  repositories, services, routers, and schemas.
