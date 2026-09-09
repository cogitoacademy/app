# Booking Flow Keyboard-Friendly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Booking list/detail/drawer fully keyboard-operable plus Gmail-style `g x` nav, no conflict with D/M/A.

**Architecture:** Shared editable-guard util + two scoped hooks (global `g x`, booking-local `j/k/Enter/r/c/x/?`). Native Selia focus first, hooks only trigger existing button refs/router nav.

**Tech Stack:** React 19, TanStack Router, Selia Dialog/Button, bun:test, oxlint/oxfmt, tsgo.

---

### Task 1: Shared keyboard guard

**Files:**
- Create: `apps/web/src/hooks/use-keyboard-guard.ts`
- Test: `apps/web/src/hooks/use-keyboard-guard.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { isEditableTarget, shouldIgnoreKeydown } from "./use-keyboard-guard";

describe("isEditableTarget", () => {
  test("returns false for body", () => {
    expect(isEditableTarget(document.body)).toBe(false);
  });
  test("returns true for input", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
  });
  test("returns true for textarea", () => {
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
  });
});

describe("shouldIgnoreKeydown", () => {
  test("ignores repeat and modifiers", () => {
    const base = { repeat: true, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false } as KeyboardEvent;
    expect(shouldIgnoreKeydown(base)).toBe(true);
    const mod = { repeat: false, metaKey: true, ctrlKey: false, altKey: false, defaultPrevented: false } as KeyboardEvent;
    expect(shouldIgnoreKeydown(mod)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `bun test apps/web/src/hooks/use-keyboard-guard.test.ts`
Expected: FAIL "Cannot find module './use-keyboard-guard'"

- [ ] **Step 3: Minimal implementation**

```ts
"use client";

export function isEditableTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return false;
}

export function shouldIgnoreKeydown(event: Pick<KeyboardEvent, "repeat" | "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented">): boolean {
  if (event.defaultPrevented) return true;
  if (event.repeat) return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  return false;
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `bun test apps/web/src/hooks/use-keyboard-guard.test.ts`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-keyboard-guard.ts apps/web/src/hooks/use-keyboard-guard.test.ts
git commit -m "feat(web): add keyboard guard util"
```

### Task 2: Global `g x` nav hook

**Files:**
- Create: `apps/web/src/hooks/use-global-nav-hotkeys.ts`
- Test: `apps/web/src/hooks/use-global-nav-hotkeys.test.ts` (pure map test)
- Modify: `apps/web/src/routes/_app.tsx` (mount once)

- [ ] **Step 1: Write failing test for route map**

```ts
import { describe, expect, test } from "bun:test";
import { GLOBAL_NAV_MAP } from "./use-global-nav-hotkeys";

describe("GLOBAL_NAV_MAP", () => {
  test("maps g d/b/c/t", () => {
    expect(GLOBAL_NAV_MAP["d"]).toBe("/dashboard");
    expect(GLOBAL_NAV_MAP["b"]).toBe("/bookings");
    expect(GLOBAL_NAV_MAP["c"]).toBe("/calendar");
    expect(GLOBAL_NAV_MAP["t"]).toBe("/tutors");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `bun test apps/web/src/hooks/use-global-nav-hotkeys.test.ts`
Expected: FAIL missing module

- [ ] **Step 3: Minimal hook**

```ts
"use client";

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { isEditableTarget, shouldIgnoreKeydown } from "./use-keyboard-guard";

export const GLOBAL_NAV_MAP: Record<string, string> = {
  d: "/dashboard",
  b: "/bookings",
  c: "/calendar",
  t: "/tutors",
};

export function useGlobalNavHotkeys(enabled = true) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled) return;
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disarm = () => { armed = false; if (timer) clearTimeout(timer); };
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKeydown(e) || isEditableTarget(e.target)) { disarm(); return; }
      const k = e.key.toLowerCase();
      if (!armed) {
        if (k === "g") { armed = true; timer = setTimeout(disarm, 800); }
        return;
      }
      const to = GLOBAL_NAV_MAP[k];
      disarm();
      if (!to) return;
      e.preventDefault();
      void navigate({ to });
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (timer) clearTimeout(timer); };
  }, [enabled, navigate]);
}
```

- [ ] **Step 4: Run pass**

Run: `bun test apps/web/src/hooks/use-global-nav-hotkeys.test.ts`
Expected: PASS

- [ ] **Step 5: Mount in `_app.tsx`, verify types**

Add `useGlobalNavHotkeys()` inside authenticated shell component. Run: `bunx tsgo --noEmit -p apps/web/tsconfig.json` (or `turbo run check-types --filter=web`). Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/use-global-nav-hotkeys.ts apps/web/src/hooks/use-global-nav-hotkeys.test.ts "apps/web/src/routes/_app.tsx"
git commit -m "feat(web): add g x global nav hotkeys"
```

### Task 3: Booking list j/k + Enter

**Files:**
- Modify: `apps/web/src/components/dashboard/pages/bookings-page.tsx`
- Test: `apps/web/src/components/dashboard/pages/bookings-hotkeys.test.ts` (pure index math)

Pure helper to keep TDD without DOM:

```ts
export function moveIndex(current: number, dir: 1 | -1, len: number): number {
  if (len <= 0) return 0;
  return (current + dir + len) % len;
}
```

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from "bun:test";
import { moveIndex } from "./bookings-page";

describe("moveIndex", () => {
  test("wraps", () => {
    expect(moveIndex(0, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run fail** `bun test apps/web/src/components/dashboard/pages/bookings-hotkeys.test.ts` FAIL missing export.
- [ ] **Step 3: Implement** export `moveIndex` in `bookings-page.tsx`, add list keydown: `j/k`/arrows move `activeIdx` state, `Enter/o` navigates to `/bookings/$bookingId` via `navigate({ to: "/bookings/$bookingId", params: { bookingId } })`, roving `tabIndex` + `data-active` ring on `BookingListCard` wrapper, skip when editable/modifier/repeat via guard. Guard `visibleBookings.length === 0`.
- [ ] **Step 4: Run pass** `bun test apps/web/src/components/dashboard/pages/bookings-hotkeys.test.ts` PASS.
- [ ] **Step 5: Lint** `bunx oxlint apps/web/src/components/dashboard/pages/bookings-page.tsx` clean.
- [ ] **Step 6: Commit** `git commit -m "feat(web): booking list keyboard nav"`

### Task 4: Booking detail r/c/x/?

**Files:**
- Modify: `apps/web/src/components/booking/booking-detail-page.tsx`

- [ ] **Step 1: Wire refs, no test (DOM behavior)** Add `rescheduleBtnRef`, `completeBtnRef`, `cancelBtnRef` passed to existing `BookingRescheduleAction` trigger / lifecycle buttons (only when eligible — reuse `canProposeBookingReschedule` / `canCancelBooking`). Keydown scoped to this page: `r` clicks reschedule, `c` clicks complete, `x` clicks cancel, `?` (shift+/) opens help. Guard editable/repeat/modifiers. Do nothing when corresponding action not eligible.
- [ ] **Step 2: Typecheck** `turbo run check-types --filter=web` PASS.
- [ ] **Step 3: Manual keyboard check** open booking detail, press r/c/x/?, verify only eligible fires, focus visible.
- [ ] **Step 4: Commit** `git commit -m "feat(web): booking detail hotkeys"`

### Task 5: Shortcuts help dialog

**Files:**
- Create: `apps/web/src/components/booking/shortcuts-help-dialog.tsx`

```tsx
"use client";
import { Dialog, DialogBody, DialogHeader, DialogPopup, DialogTitle } from "@cogito-app/ui/components/selia/dialog";
import { Kbd } from "@cogito-app/ui/components/selia/kbd";

export function ShortcutsHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const rows: Array<[string, string]> = [
    ["j / k", "Move between bookings"],
    ["Enter", "Open booking"],
    ["r", "Propose new time"],
    ["c", "Complete session"],
    ["x", "Cancel booking"],
    ["g then d/b/c/t", "Go dashboard/bookings/calendar/tutors"],
    ["?", "This help"],
    ["Esc", "Close dialog"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
        <DialogBody>
          <ul>{rows.map(([k, d]) => (<li key={k}><Kbd>{k}</Kbd> {d}</li>))}</ul>
        </DialogBody>
      </DialogPopup>
    </Dialog>
  );
}
```

- [ ] **Step 1: Create file, mount in bookings page + detail (`?` toggles, Esc closes via Dialog default).**
- [ ] **Step 2: Typecheck + lint pass.**
- [ ] **Step 3: Commit** `git commit -m "feat(web): add shortcuts help dialog"`

### Task 6: Drawer Enter/Esc + focus audit

**Files:**
- Modify: `apps/web/src/components/booking/booking-reschedule-action.tsx`

- [ ] **Step 1: Ensure form Enter submits only when valid (native submit, reason required), Esc closes, focus returns to trigger. No custom global Enter — rely on form.**
- [ ] **Step 2: Verify focus trap in Dialog/drawer via keyboard-only reschedule flow.**
- [ ] **Step 3: Commit** `git commit -m "fix(web): reschedule drawer keyboard submit and focus return"`

### Task 7: Docs + final verify

**Files:**
- Modify: `docs/CONTEXT.md`, `docs/RUNBOOK.md`

- [ ] **Step 1: Add keymap table to CONTEXT + RUNBOOK smoke (keyboard-only list->detail->reschedule).**
- [ ] **Step 2: Run** `bunx oxlint apps/web/src/hooks apps/web/src/components/booking apps/web/src/components/dashboard/pages/bookings-page.tsx` clean; `turbo run check-types --filter=web` pass; `bun test apps/web/src/hooks` pass. Verify reduced-motion respected (no custom animation, Selia defaults kept).
- [ ] **Step 3: Commit** `git commit -m "docs: booking keyboard shortcuts"`
