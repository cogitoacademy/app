# Public Achievements Surfacing

| Field  | Value |
| ------ | ----- |
| Status | **COMPLETED** — public archive and homepage preview implemented 2026-08-27 |
| Scope  | Public `cogito-acad` integration plus API projection hardening |
| Repos  | `cogito-app`, `cogito-acad` |

## Delivered

- Added a server-side `cogito-acad` client for `POST /rpc/achievement/listApproved` with a two-minute cache and the required oRPC request envelope.
- Added localized Indonesian/English achievement archive pages, a homepage preview, record detail modal, search, and category/level/year filters.
- Added public navigation, quick navigation, sitemap coverage, and localized empty/error states.
- Kept the page aligned with the existing Cogito palette and UI primitives by reusing the tutors/events card-grid pattern and responsive detail modal. Public documentation images render in cards when available, with the medal visual as the fallback.
- Hardened the backend public projection to omit `userId` and private `evidenceUrl`; `documentationUrl` is the only evidence-adjacent field exposed publicly. Public-safe subjects are included for the record detail view.
- Added a regression assertion for the public projection and documented the public endpoint and smoke checks.

## Data contract

The archive consumes the standard oRPC response envelope from `/rpc/achievement/listApproved`. The endpoint returns at most 100 records, filtered to `status = approved` and `visibility = true`, ordered by `awardingDate` and `createdAt` descending. The public site never receives or renders private verification evidence.

## Verification

- `bunx tsc --noEmit --pretty false` in `cogito-acad/apps/web`
- `bun run build` in `cogito-acad/apps/web`
- `bunx oxfmt --check` for changed frontend and backend files
- `bun test packages/api/src/tests/unit/achievement.repo.test.ts` in `cogito-app`
- Integration coverage asserts public results exclude `userId` and `evidenceUrl`
