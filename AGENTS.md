# Selia Design Rules

UI library: [Selia](https://selia.earth/) — opinionated, built on TailwindCSS v4 + `@base-ui/react` v1.

## Import Path

```
@cogito-app/ui/components/selia/{component}
@cogito-app/ui/lib/utils           # cn() utility
```

## Components (22)

| Component | File | Sub-parts |
|-----------|------|-----------|
| Avatar | `avatar.tsx` | AvatarImage, AvatarFallback |
| Badge | `badge.tsx` | — |
| Button | `button.tsx` | — (wraps BaseButton) |
| Card | `card.tsx` | CardHeader, CardHeaderAction, CardTitle, CardDescription, CardBody, CardFooter |
| Checkbox | `checkbox.tsx` | — |
| Chip | `chip.tsx` | — |
| Divider | `divider.tsx` | — |
| Field | `field.tsx` | FieldLabel, FieldDescription, FieldError, FieldControl |
| Heading | `heading.tsx` | — |
| IconBox | `icon-box.tsx` | — |
| Input | `input.tsx` | — (wraps BaseInput, variants: default/subtle) |
| InputGroup | `input-group.tsx` | InputGroupAddon |
| Item | `item.tsx` | ItemContent, ItemTitle, ItemDescription, ItemMeta, ItemMedia, ItemAction |
| Kbd | `kbd.tsx` | — |
| Menu | `menu.tsx` | MenuTrigger, MenuPopup, MenuItem, MenuSeparator, MenuSubmenu, MenuSubmenuTrigger, MenuSubmenuPopup, MenuGroup, MenuGroupLabel, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem |
| Select | `select.tsx` | SelectTrigger, SelectValue, SelectPopup, SelectList, SelectItem |
| Separator | `separator.tsx` | — |
| Sidebar | `sidebar.tsx` | SidebarHeader, SidebarContent, SidebarLogo, SidebarFooter, SidebarMenu, SidebarList, SidebarItem, SidebarItemButton, SidebarItemAction, SidebarGroup, SidebarGroupTitle, SidebarGroupAction, SidebarSubmenu, SidebarCollapsible, SidebarCollapsibleTrigger, SidebarCollapsiblePanel |
| Stack | `stack.tsx` | — (direction: row/column, spacing: sm/md/lg) |
| Table | `table.tsx` | TableContainer, TableHeader, TableHead, TableBody, TableRow, TableCell |
| Text | `text.tsx` | TextLink |
| Toast | `toast.tsx` | toastManager |

## Design Principles

### 1. Default-First
Components look complete out of the box. Don't add extra utility classes just to make them acceptable in common contexts. If a component needs adjustments in a specific context (e.g., Button inside Card header), that's **contextual** — Selia handles it via `data-slot` attributes.

### 2. Contextual Styling via data-slot
Parent components style children through `data-slot` attributes. High-specificity CSS selectors like `[&_[data-slot=...]]` apply context-aware styles automatically.

### 3. Plain Variant
Use `variant="plain"` when nesting a component inside another:
- `Button` plain: removes background, adds hover emphasis
- `InputGroup` plain: strips styling for composition inside Command/other

### 4. Override Escape Hatch
Contextual styling has high specificity. Two override paths:
- **Global refinement**: Modify component source if same override appears repeatedly
- **Escape hatch**: Use `!` important modifier (`p-4! rounded-full!`) for rare one-off cases

### 5. Compose, Don't Create New
Before creating a new component, compose existing Selia components. Example: comment layout = `Item` (media object pattern) with `Avatar`, `Text`, timestamps.

## Design Tokens

OKLCH color space via CSS variables. All mapped as Tailwind v4 `@theme` tokens.

### Colors
```
bg-background, text-foreground, bg-accent, text-muted, text-dimmed,
border-border, bg-card, border-card-border, bg-item, border-item-border,
bg-popover, border-popover-border
```

### Semantic Variants
```
primary, secondary, tertiary, danger, warning, success, info
```
Each has: `bg-{variant}`, `text-{variant}-foreground`, `border-{variant}-border`
Use with Badge, Item, Button, etc. via `variant` prop.

### Borders
```
border-border          # Default border
border-card-border     # Card boundary
border-item-border     # Item boundary
border-input-border    # Input default
border-input-accent-border  # Input hover
```

### Radii
```
--radius: 0.75rem
--radius-xs: 5px, --radius-sm, --radius-md, --radius-lg, --radius-xl
```
Use `rounded`, `rounded-sm`, `rounded-lg`, `rounded-xl`.

### Shadows
```
shadow        # Default
shadow-card   # Card elevation
shadow-input  # Input inner
shadow-popover # Modal/dropdown
```

### Typography
```
text-xs: 0.625rem, text-sm: 0.75rem, text-base: 0.875rem
text-lg: 1rem, text-xl: 1.125rem ... text-9xl: 6rem
font-sans: "Inter Variable"
font-mono: "JetBrains Mono"
```

## Component Patterns

### Variant System
All variants use `class-variance-authority` (CVA):
```tsx
export const buttonVariants = cva("base classes", {
  variants: {
    variant: { primary: "...", secondary: "..." },
    size: { sm: "...", md: "..." },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
```

### Render Prop
Components that render a native element support `render` prop for custom tags (e.g., `<a>` or React Router `<Link>`):
```tsx
<Button render={<Link />} nativeButton={false} to="/page" />
```
Warning: `render` may override `data-slot` — set `data-slot` explicitly if needed.

### data-slot Convention
Every component root element has `data-slot` attribute matching component name in kebab-case: `data-slot="card"`, `data-slot="sidebar-item-button"`.

## File Structure

```
packages/ui/
  components/selia/       # 22 component files
  src/
    styles/globals.css    # All CSS variables, @theme, @utility
    lib/utils.ts          # cn() utility
apps/web/
  src/
    routes/               # TanStack Router route files
    components/           # App-specific page components
      dashboard/          # page, layout, app-sidebar, chart, stat-card
      sign-in-form.tsx
      sign-up-form.tsx
      user-menu.tsx
      mode-toggle.tsx
```

## Existing Page Patterns (Reference)

### Dashboard Page
Uses Card grid, stat-cards with IconBox+Bade, Stack layout, Table for orders, Item for best-sellers list, Select for period filter.

### Dashboard Sidebar
Uses Sidebar with collapsible groups, InputGroup+Kbd for search, Menu+Avatar for user menu.

### Login/Signup
Uses Card + Field + Input + Button pattern with Divider for OAuth options.

### Todo CRUD
Uses Card + Input + Button + Checkbox pattern with simple state management.

## Rules for Agents

1. Always import from `@cogito-app/ui/components/selia/*` — never from shadcn or elsewhere
2. Use existing Selia components before creating new ones
3. Follow CVA variant pattern for new component variants
4. Use `data-slot` attributes for contextual styling
5. Use OKLCH CSS variables / Tailwind theme colors — never hardcode colors
6. Prefer Card + Stack + Item composition for layout
7. Use `plain` variant when nesting components that shouldn't have their own background/border
8. Use `!` important modifier only for one-off overrides (rare)
9. Use `use client` directive on all component files
10. Reference selia.earth docs for component API details
