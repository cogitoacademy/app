# Competition Calendar Type Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-select competition-type filter to the competition calendar toolbar so users see only chosen type(s) in both month and agenda views.

**Architecture:** Pure frontend. New pure helpers in `calendar-utils.ts` (options list + match function, fully unit-tested). State lives in `CompetitionCalendar`; a Selia checkbox Menu filters events before the existing sort, so both views respect it with zero view changes. No RPC, schema, or persistence change.

**Tech Stack:** React 19, Selia Menu/Badge/Button (Tailwind v4), Tabler icons, `bun:test`, oxlint/oxfmt.

---

## File structure

- Modify `apps/web/src/components/content/calendar-utils.ts` — add `competitionTypeOptions`, `filterEventsByCompetitionType`. Nothing else in the file changes.
- Create `apps/web/src/components/content/calendar-utils.test.ts` — unit tests for the two new exports. Mirrors `knowledge-bank-utils.test.ts` (`bun:test`).
- Modify `apps/web/src/components/content/competition-calendar.tsx` — selection state, toolbar filter Menu + count badge, filtered memo. Views untouched.
- Modify `docs/CONTEXT.md` — one sentence in the authenticated-calendar bullet. No API contract changed, so `API-REFERENCE.md`/`MODULE-REFERENCE.md`/`RUNBOOK.md` stay untouched.

## Conventions to follow

- Selia imports only from `@cogito-app/ui/components/selia/*`. Labels via existing `getCategoryLabel` (no new label map).
- Responsive pattern mirrors `tutors-page-content.tsx:248-271` (icon + `hidden sm:inline` label) and the existing view Menu in the same toolbar (`MenuTrigger render={...}`, `MenuPopup align="end" size="compact"`).
- PowerShell shell: no `head`; pipe to `Select-Object -First N`. Never use Read-output line prefixes in edits.

---

### Task 1: Filter helper + options export (TDD)

**Files:**

- Modify: `apps/web/src/components/content/calendar-utils.ts`
- Create: `apps/web/src/components/content/calendar-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/content/calendar-utils.test.ts` with exactly this content:

```ts
import { describe, expect, test } from "bun:test";

import {
  competitionTypeOptions,
  filterEventsByCompetitionType,
  getCategoryLabel,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";

function makeEvent(id: string, coreCategories: string[]): CalendarCompetition {
  return {
    id,
    title: id,
    description: null,
    start: new Date("2026-10-01T09:00:00+07:00"),
    end: new Date("2026-10-01T10:30:00+07:00"),
    location: null,
    categories: coreCategories.map((coreCategory) => ({
      name: coreCategory,
      coreCategory,
    })),
    educationLevels: [],
    scale: null,
    organizer: null,
    registrationDeadline: null,
    registrationLink: null,
    socialMediaLink: null,
  };
}

const ALL = new Set(competitionTypeOptions);

describe("competitionTypeOptions", () => {
  test("exposes the fixed 7 types with resolving labels", () => {
    expect([...competitionTypeOptions]).toEqual([
      "mun",
      "olimpiade",
      "wsc",
      "kti",
      "debat",
      "business",
      "pidato",
    ]);
    expect(getCategoryLabel("mun")).toBe("Model United Nations");
    for (const value of competitionTypeOptions) {
      expect(getCategoryLabel(value)).not.toBe(value);
    }
  });
});

describe("filterEventsByCompetitionType", () => {
  test("returns all events when every type is selected", () => {
    const events = [makeEvent("a", ["mun"]), makeEvent("b", ["debat"])];
    expect(filterEventsByCompetitionType(events, ALL)).toBe(events);
  });

  test("keeps events matching any selected type", () => {
    const events = [
      makeEvent("a", ["mun"]),
      makeEvent("b", ["mun", "debat"]),
      makeEvent("c", ["debat"]),
    ];
    const result = filterEventsByCompetitionType(events, new Set(["mun"]));
    expect(result.map((event) => event.id)).toEqual(["a", "b"]);
  });

  test("hides events with no categories under a partial selection", () => {
    const events = [makeEvent("a", []), makeEvent("b", ["mun"])];
    const result = filterEventsByCompetitionType(events, new Set(["mun"]));
    expect(result.map((event) => event.id)).toEqual(["b"]);
  });

  test("hides unknown categories under a partial selection", () => {
    const events = [makeEvent("a", ["mystery"]), makeEvent("b", ["wsc"])];
    const result = filterEventsByCompetitionType(events, new Set(["wsc"]));
    expect(result.map((event) => event.id)).toEqual(["b"]);
  });

  test("empty selection matches nothing", () => {
    const events = [makeEvent("a", ["mun"])];
    expect(filterEventsByCompetitionType(events, new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/components/content/calendar-utils.test.ts --timeout 30000`
Expected: FAIL — `competitionTypeOptions` / `filterEventsByCompetitionType` not exported.

- [ ] **Step 3: Write minimal implementation**

Read `apps/web/src/components/content/calendar-utils.ts` first (edit tool requires it), then append exactly this at the end of the file:

```ts
export const competitionTypeOptions = [
  "mun",
  "olimpiade",
  "wsc",
  "kti",
  "debat",
  "business",
  "pidato",
] as const;

export function filterEventsByCompetitionType(
  events: CalendarCompetition[],
  selected: ReadonlySet<string>,
): CalendarCompetition[] {
  if (selected.size >= competitionTypeOptions.length) return events;
  return events.filter((event) =>
    event.categories.some((category) => selected.has(category.coreCategory)),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/components/content/calendar-utils.test.ts --timeout 30000`
Expected: PASS — 6 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/components/content/calendar-utils.ts apps/web/src/components/content/calendar-utils.test.ts
rtk git commit -m "feat(calendar): add competition type filter helper"
```

---

### Task 2: Toolbar filter UI in CompetitionCalendar

**Files:**

- Modify: `apps/web/src/components/content/competition-calendar.tsx`

- [ ] **Step 1: Read the file**

Read `apps/web/src/components/content/competition-calendar.tsx` in full. Confirm these anchors exist: the tabler import block (`IconArrowLeft`, `IconArrowRight`, `IconCalendarCheck`, `IconChevronDown`), the menu import block (`Menu`, `MenuPopup`, `MenuRadioGroup`, `MenuRadioItem`, `MenuTrigger`), the `sortedEvents` memo, and the `<div className="ml-auto">` view-menu wrapper.

- [ ] **Step 2: Extend imports**

Apply all four import edits:

```tsx
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconArrowRight,
  IconCalendarCheck,
  IconChevronDown,
} from "@tabler/icons-react";
```

```tsx
import { Badge } from "@cogito-app/ui/components/selia/badge";
```

```tsx
import {
  Menu,
  MenuCheckboxItem,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
```

```tsx
import { AGENDA_DAYS_TO_SHOW, EVENT_GAP, EVENT_HEIGHT } from "./calendar-utils";
```

becomes:

```tsx
import {
  AGENDA_DAYS_TO_SHOW,
  EVENT_GAP,
  EVENT_HEIGHT,
  competitionTypeOptions,
  filterEventsByCompetitionType,
  getCategoryLabel,
} from "./calendar-utils";
```

- [ ] **Step 3: Add selection state + filtered memo**

After the `selectedEvent` state, add:

```tsx
const [selectedTypes, setSelectedTypes] = useState<ReadonlySet<string>>(
  () => new Set(competitionTypeOptions),
);
```

Replace the `sortedEvents` memo source so filtering happens before sorting:

```tsx
const sortedEvents = useMemo(
  () =>
    filterEventsByCompetitionType(events, selectedTypes).toSorted(
      (left, right) => left.start.getTime() - right.start.getTime(),
    ),
  [events, selectedTypes],
);
```

After `handleViewChange`, add:

```tsx
const isFiltered = selectedTypes.size < competitionTypeOptions.length;

const filterLabel = isFiltered
  ? `Filter by competition type, ${selectedTypes.size} of ${competitionTypeOptions.length} types shown`
  : "Filter by competition type";

function handleTypeToggle(value: string, checked: boolean) {
  setSelectedTypes((prev) => {
    const next = new Set(prev);
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    return next;
  });
}

function handleResetTypes() {
  setSelectedTypes(new Set(competitionTypeOptions));
}
```

- [ ] **Step 4: Add the filter menu to the toolbar**

Insert this block immediately before the `<div className="ml-auto">` view-menu wrapper:

```tsx
<div className="relative ml-auto">
  <Menu>
    <MenuTrigger
      render={
        <Button
          variant="secondary"
          size="sm"
          aria-label={filterLabel}
          className="w-fit"
        />
      }
    >
      <IconAdjustmentsHorizontal />
      <span className="max-[479px]:sr-only">Filter</span>
      <IconChevronDown className="hidden min-[366px]:block" />
    </MenuTrigger>
    <MenuPopup align="end" size="compact">
      <MenuGroupLabel>Competition type</MenuGroupLabel>
      {competitionTypeOptions.map((value) => (
        <MenuCheckboxItem
          key={value}
          checked={selectedTypes.has(value)}
          onCheckedChange={(checked) =>
            handleTypeToggle(value, checked === true)
          }
        >
          {getCategoryLabel(value)}
        </MenuCheckboxItem>
      ))}
      <MenuSeparator />
      <MenuItem onClick={handleResetTypes} disabled={!isFiltered}>
        Reset
      </MenuItem>
    </MenuPopup>
  </Menu>
  {isFiltered ? (
    <Badge
      variant="primary"
      size="sm"
      pill
      className="absolute -top-2 -right-2 px-1 text-[10px] tabular-nums"
    >
      {`${selectedTypes.size}/${competitionTypeOptions.length}`}
    </Badge>
  ) : null}
</div>
```

And change the view-menu wrapper from `<div className="ml-auto">` to `<div>` (the filter wrapper now owns the right alignment).

- [ ] **Step 5: Verify — tests, lint, format, typecheck**

Run (PowerShell, from repo root):

```bash
bun test apps/web/src/components/content --timeout 30000
```

Expected: all pass, 0 fail.

```bash
bunx oxlint apps/web/src/components/content/competition-calendar.tsx apps/web/src/components/content/calendar-utils.ts apps/web/src/components/content/calendar-utils.test.ts
```

Expected: no output (clean).

```bash
bunx oxfmt --check apps/web/src/components/content/competition-calendar.tsx apps/web/src/components/content/calendar-utils.ts apps/web/src/components/content/calendar-utils.test.ts
```

Expected: `All matched files use the correct format.` If not, run `bunx oxfmt --write` on those files and re-check.

```bash
bun run check-types --filter=web
```

Expected: pass. (If the sandbox OOMs here, note it and rely on CI; do not skip the other checks.)

Manual: `bun run dev:web`, open `/calendar` at desktop width and ~360px width. Confirm: Filter button sits left of the view menu; unchecking types hides events in both Month and Agenda; badge `n/7` appears only when partial; Reset restores all; popup lists 7 labeled checkboxes.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/components/content/competition-calendar.tsx
rtk git commit -m "feat(calendar): add competition type filter to toolbar"
```

---

### Task 3: Docs follow code (AGENTS.md rule 11)

**Files:**

- Modify: `docs/CONTEXT.md`

- [ ] **Step 1: Read then extend the calendar bullet**

Find the authenticated-calendar bullet ("The authenticated calendar keeps the academy's full read-only interaction model: month view with multi-day event spans and overflow popup, 30-day agenda view, keyboard shortcuts (`M`/`A`), period navigation, and a responsive event-details modal."). Append this sentence to that bullet (edit, do not rewrite the bullet):

```text
 A toolbar type filter (multi-select across the seven competition fields, all-on by default) narrows both the month and agenda views; it is presentation-only and changes no RPC or persisted data contract.
```

`API-REFERENCE.md`, `MODULE-REFERENCE.md`, `RUNBOOK.md` stay untouched (no contract change). No plan-table change (this is unplanned small scope; the spec at `docs/superpowers/specs/2026-09-17-competition-calendar-type-filter-design.md` is the record).

- [ ] **Step 2: Verify formatting + commit**

Run: `bunx oxfmt --check docs/CONTEXT.md`
Expected: correct format.

```bash
rtk git add docs/CONTEXT.md
rtk git commit -m "docs(calendar): document competition type filter"
```

---

## Self-review (run by plan author)

- Spec coverage: multi checkbox ✓ (Task 2 menu), fixed 7 ✓ (Task 1 options), toolbar placement + mobile icon-only + badge ✓ (Task 2 step 4), any-category match + all-bypass ✓ (Task 1 helper + tests), empty grid stays + Reset recovery ✓ (no view change; Reset item), no persistence ✓ (local state only), no backend ✓ (no API file touched).
- Placeholders: none — every step has exact code, exact commands, exact expected output.
- Type consistency: `competitionTypeOptions` (`readonly ["mun", …]` tuple) → `ReadonlySet<string>` state → `filterEventsByCompetitionType(events, selected)` signature; `getCategoryLabel(value: string)` accepts the option values; `MenuCheckboxItem` `checked`/`onCheckedChange`, `MenuItem` `onClick`/`disabled`, `Badge` `variant/size/pill` all mirror existing call sites (`tutors-page-content.tsx`, view Menu in the same file).
