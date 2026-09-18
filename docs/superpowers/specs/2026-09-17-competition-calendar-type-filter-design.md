# Competition Calendar Type Filter — Design

Date: 2026-09-17. Status: approved by user. Scope: frontend-only, no RPC/schema/persistence change.

## Goal

Let users show only chosen competition type(s) on the competition calendar (`/_app/calendar`). Default shows all.

## Decisions (locked)

- Mode: multi-select checkboxes. Default all 7 on (= no filtering).
- Options: fixed 7 types from `calendar-utils.ts` `categoryLabels` keys: `mun`, `olimpiade`, `wsc`, `kti`, `debat`, `business`, `pidato`. Labels via existing `getCategoryLabel`.
- Placement: funnel button in `CompetitionCalendar` toolbar, left of the Month/Agenda menu. Follows existing responsive pattern: labeled button on wide screens, icon-only on narrow. Title truncates so it absorbs space.
- Active-filter signal: count badge (`n/7`) on the button when selection is partial.
- Menu content: group label + 7 `MenuCheckboxItem` + separator + `Reset` item (re-checks all).
- Matching: event visible iff ANY of its `categories[].coreCategory` is selected. All-selected bypasses filtering. Events with zero categories, or only unknown categories, hide under a partial selection and show when all selected.
- Empty result: month grid keeps rendering (existing empty-month rule); agenda renders its normal empty output. Badge + one-tap Reset is the recovery path. No extra empty copy.
- No persistence of selection (YAGNI). No backend change: `content.listCompetitions` already returns `categories[].coreCategory`.

## Architecture

- State: `useState<Set<string>>` of selected `coreCategory` keys in `CompetitionCalendar`, default = all 7.
- Pipe: `events → filter(selected) → existing sort → sortedEvents` (both `CalendarMonthView` and `CalendarAgendaView` consume `sortedEvents`, so both views respect the filter with zero view changes).
- Helper: export ordered type options from `calendar-utils.ts` (keys + `getCategoryLabel`), single source with the existing label map. No new module.
- Components: Selia `Menu`, `MenuTrigger` (render Button), `MenuPopup`, `MenuCheckboxItem`, `MenuSeparator`, `MenuItem` (Reset) — all exist. Funnel icon from `@tabler/icons-react`.

## Testing

- Unit: matching helper (any-category match, empty categories, unknown category, all-selected bypass) + options export (7 entries, labels resolve).
- Component/render: partial selection hides non-matching events in both views; Reset restores; badge shows `n/7` only when partial.
- Existing calendar tests keep passing. Manual narrow-viewport check (~360px): toolbar fits, button icon-only, popup usable.
