# Interactive How Cogito Works Guide

## Status

Completed — 2026-08-24

## Delivered

- Added authenticated `/guide` route with `view=student|tutor|admin` search state.
- Enforced role visibility: student → Student; tutor → Tutor + Student; admin → Admin + Tutor + Student.
- Added Selia-based responsive journey timeline with role tabs, chapter navigation, expandable steps, statuses, exception branches, and internal CTAs.
- Refined the visual hierarchy into a flat journey surface with global step numbering, animated expand/collapse, and reduced-motion support.
- Separated the top-level role selector from the guide introduction and changed chapter navigation into a right-side sticky desktop secondary sidebar with a centered `max-w-6xl` content shell, a stacked mobile layout, and active-chapter state.
- Refined the desktop chapter sidebar into a restrained Scandinavian index rail with a progress index, numbered `Item` rows, a badge-like semantic `ItemMedia` tint, step counts, and token-based active states.
- Made step details open by default for read-through use, with a single global Collapse/Expand details control for scan mode.
- Refined the visual direction into a Scandinavian treatment: neutral sans-serif hierarchy, restrained borders, purposeful whitespace, and less card-heavy timeline grouping for learners ages 5–18 and adult operators.
- Added a development-only anti-slop Tweaks Bar at `apps/web/public/tweaks-bar.js` for iterative visual tuning; it is not a production API or content surface.
- Added typed, code-managed guide content covering student, tutor, and admin lifecycles plus supporting product features.
- Added explicit, bold timing callouts to remove ambiguity around 7-day invites, 12-hour response windows, H-2 self-service cutoffs, 24-hour reschedule proposals, 15-minute lateness, meeting retries, and support SLAs.
- Added guide access/content tests and updated the sidebar, route title, context, API reference, module reference, and runbook.

## Verification

- `bun run check-types`
- Guide content/access tests
- Production web build through the web check-types script
- Browser smoke check for the student route, role fallback, keyboard-expandable steps, smooth transition, active chapter navigation, and no horizontal overflow on desktop/mobile layouts
- Anti-slop copy scan for the guide source; remaining triads are intentional domain/status groupings
