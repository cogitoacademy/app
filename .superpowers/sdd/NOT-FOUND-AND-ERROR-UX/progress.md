# Not-found and Error UX — SDD Progress Ledger

Plan: `docs/plans/completed/NOT-FOUND-AND-ERROR-UX.md`.

## Status

**Completed 2026-08-27.**

- Added and registered the branded root-level not-found page.
- Replaced the 404 and 500 visual states with the shared ErrorOne-style status content while retaining the Cogito background and a single tertiary **Go back** action.
- Registered the shared error page as TanStack Router's default route error component and as the outer error-boundary fallback.
- Normalized browser/network errors to plain-language connection guidance.
- Added focused helper coverage and browser smoke verification for an invalid route.
- Verified the web build, repository lint, and type checks.
