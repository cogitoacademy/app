# Not-found and Error UX

| Field  | Value                                                |
| ------ | ---------------------------------------------------- |
| Status | **COMPLETED** — implemented 2026-08-27               |
| Scope  | `apps/web` route fallback and user-facing error copy |

## Delivered

- Registered a branded root-level TanStack Router not-found component instead of the generic `Not Found` fallback.
- Added the ErrorOne-style status visual to both 404 and 500 states while preserving the existing Cogito background and recovery button treatment.
- Added a clear **Go back** recovery action to both status pages.
- Replaced browser/network exception text such as `Failed to fetch` with plain-language Cogito copy across the main query, auth, booking, admin, profile, and tutor flows.
- Kept server/domain messages available when they are already meaningful to the user, while recognizing nested Better Auth error shapes.

## Verification

- `bun run build:web`
- `bun test apps/web/src/lib/error-message.test.ts`
- `bun run lint`
- `bunx tsgo --noEmit -p apps/web/tsconfig.json`
