# PostHog Browser Analytics

> **Status: Completed 2026-09-27.** Browser analytics, identity, exception
> capture, explicit web Logs, starter event contract, and Google/email auth
> outcome attribution are implemented. Delivery remains an operator
> browser-smoke check.

## Scope

- Initialize one provider-scoped `posthog-js` client in the web root from public
  Vite config values.
- Identify users with stable Better Auth `user.id`; reset on logout and direct
  account switch.
- Capture auth, booking, tutor-onboarding, lifecycle, and session-completion
  success events without personal data in event properties.
- Capture React boundary and browser exception failures through PostHog.
- Export only explicit `cogito-web` info Logs records; existing console output
  and Bun server logs remain outside this change.
- Attribute Google auth through Better Auth `newUserCallbackURL`, and email
  auth through the same session handoff, storing each outcome until identity
  exists before capturing the event.
- Pass public PostHog values into production web image builds through CD
  secrets; missing production config remains a no-op.
- Run browser E2E with Vite `test` mode, using the disabled client when public
  analytics values are absent so test infrastructure does not require a real
  PostHog project.

## Verification

- `bun install` passed before this plan.
- Targeted auth attribution tests passed.
- `bun run check-types` passed.
- `bun run build` passed.
- Browser delivery, CSP console inspection, PostHog Logs delivery, warehouse
  source setup, and Google event smoke remain operator-owned follow-up.
