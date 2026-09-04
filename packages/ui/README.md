# @cogito-app/ui

The Selia-based component library for Cogito — opinionated UI components built on TailwindCSS v4 + `@base-ui/react` v1.

## Import path

Components are imported directly from the package using its export map:

```ts
import { Button } from "@cogito-app/ui/components/selia/button";
import { cn } from "@cogito-app/ui/lib/utils";
```

The package also exports `globals.css` (design tokens) and `postcss.config`.

## Design tokens

All tokens are OKLCH CSS variables defined in `src/styles/globals.css` and mapped into Tailwind v4 via `@theme inline`:

- **Colors**: `bg-background`, `text-foreground`, `bg-accent`, `text-muted`, `text-dimmed`, `border-border`, `bg-card`/`border-card-border`, `bg-item`/`border-item-border`, `bg-popover`/`border-popover-border`.
- **Semantic variants** (`primary`, `secondary`, `tertiary`, `danger`, `warning`, `success`, `info`): each provides `bg-{variant}`, `text-{variant}-foreground`, `border-{variant}-border`.
- **Radii**: `rounded` (0.75rem), `rounded-xs` (5px) through `rounded-xl`.
- **Shadows**: `shadow` (default), `shadow-card`, `shadow-input`, `shadow-popover`.
- **Typography**: `font-sans` (Inter Variable), `font-mono` (JetBrains Mono), with a denser text scale (`text-sm` = 0.75rem, `text-base` = 0.875rem, …).

## Components (`components/selia/`, 32 files)

`Avatar` (Image/Fallback), `Badge`, `Button`, `Calendar`, `Card` (Header/HeaderAction/Title/Description/Body/Footer), `Checkbox`, `Chip`, `DatePicker`, `Dialog`, `Divider`, `Drawer`, `Field` (Label/Description/Error/Control), `Heading`, `IconBox`, `Input`, `InputGroup` (Addon), `Item` (Content/Title/Description/Meta/Media/Action), `Kbd`, `Menu` (Trigger/Popup/Item/Separator/Submenu/Group/CheckboxItem/RadioGroup/RadioItem), `NumberField`, `Pagination`, `Popover`, `Select` (Trigger/Value/Popup/List/Item), `Separator`, `Sidebar` (Header/Content/Logo/Footer/Menu/List/Item/ItemButton/ItemAction/Group/GroupTitle/GroupAction/Submenu/Collapsible…), `Spinner`, `Stack`, `Table` (Container/Header/Head/Body/Row/Cell), `Tabs`, `Text` (TextLink), `Textarea`, `Toast` (toastManager).

## Conventions

- **Use client directive** — all component files are `"use client"`.
- **Variant system** — components use `class-variance-authority` (CVA) with `variant`/`size` props and sensible defaults (default-first: components look complete out of the box).
- **`data-slot`** — every component root carries `data-slot="kebab-case-name"`; parent components style children contextually via high-specificity selectors like `[&_[data-slot=...]]`.
- **`variant="plain"`** — use when nesting a component that shouldn't have its own background/border (e.g. Button inside Card headers).
- **`render` prop** — components that render a native element accept a `render` prop for custom tags/Router links (may override `data-slot`).
- **Compose, don't create** — build layouts from existing pieces (Card + Stack + Item) before adding new components; `cn()` (`src/lib/utils.ts`) merges class names.

Full component API and usage: selia.earth docs; see `AGENTS.md` for the repo's Selia design rules.
