# Booking Flow Keyboard-Friendly Design

Date: 2026-09-09
Scope: booking flow v1 (list, detail, reschedule drawer, create) + Gmail-style global `g x` nav
Status: approved, ready for plan

## Goal

Full keyboard operation booking flow. No mouse needed. No conflict existing binds.

## Existing constraints (must keep)

- `D` theme toggle, `M/A` calendar view, `Escape` close popup.
- Pattern: `window keydown`, ignore `repeat/meta/ctrl/alt`, skip `input/textarea/contentEditable`.
- Reference: `apps/web/src/components/mode-toggle.tsx`, `competition-calendar.tsx`.
- Selia only: `@cogito-app/ui/components/selia/*`, CVA variants, `data-slot`, OKLCH tokens, `plain` when nesting, `use client`.

## Architecture

- Native-first base: real `Button/MenuItem`, visible focus ring, skip link, drawer/dialog focus trap + Escape + focus return.
- Scoped hotkey layer: single `useBookingHotkeys` hook, active only on booking routes, disabled in editable fields and when modal/drawer captures keys.
- Global `g x` leader: `g` starts 800ms window, second key navigates via TanStack Router. `g d` dashboard, `g b` bookings, `g c` calendar, `g t` tutors, `g ?` help. Ignored in inputs.

## Keymap v1

- List: `j/k` or arrows move card, `Enter/o` open detail, `/` focus search (if present).
- Detail: `r` propose reschedule, `c` complete (if eligible), `x` cancel, `?` help dialog.
- Drawer: `Enter` submit if valid, `Escape` close.
- All hints exposed in `title`/tooltip + `?` dialog.

## Data flow

- No API change. Navigation only via router. Actions trigger existing buttons (click via ref), not duplicated logic.

## Error handling

- Invalid target: no-op. Conflicting key (D/M/A): booking binds lose, existing wins. Timeout `g` window resets silently.

## Testing

- Keyboard-only walkthrough list -> detail -> reschedule -> submit.
- Focus trap + return check. Reduced-motion check. `bun run check`.

## Docs in same PR

- Update `docs/CONTEXT.md`, `docs/RUNBOOK.md` smoke check per AGENTS.md rule 11.

## Out of scope

- Calendar full remap, admin tables bulk binds, custom user key remapping.
