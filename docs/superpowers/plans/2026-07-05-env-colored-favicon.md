# Environment-Colored Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and wire two SVG favicons so dev builds show a green icon and production/preview builds show the current orange Cogito icon.

**Architecture:** Two SVG files live in `apps/web/public/` and a small inline Vite plugin in `apps/web/vite.config.ts` swaps the `<link rel="icon">` href at build time using a `%FAVICON_HREF%` placeholder in `index.html`.

**Tech Stack:** Vite, SVG, Bun.

---

### Task 1: Create the production favicon SVG

**Files:**
- Create: `apps/web/public/favicon.svg`

- [ ] **Step 1: Write an SVG that reproduces the existing Cogito "C" mark**

Use the existing `apps/web/public/cogito-mark.png` / `c of cogito.png` as reference. The shape is a filled orange circle with a circular bite taken out of the right side, plus a smaller black/transparent circle inside the bite area.

Save this SVG to `apps/web/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#F97316"/>
  <path d="M50 2 A48 48 0 1 1 50 98 A48 48 0 1 1 50 2" fill="#F97316"/>
  <circle cx="78" cy="50" r="18" fill="white"/>
  <circle cx="72" cy="50" r="8" fill="#111827"/>
</svg>
```

Color choices:
- Outer "C" fill: `#F97316` (Tailwind orange-500, matches current logo).
- Bite background: `white` so it blends with browser tab backgrounds.
- Inner circle: `#111827` (gray-900, near-black).

- [ ] **Step 2: Verify the SVG renders locally**

Open `apps/web/public/favicon.svg` in a browser or image viewer and confirm it looks like the orange Cogito mark.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/favicon.svg
git commit -m "assets: add production orange favicon svg"
```

### Task 2: Create the development favicon SVG

**Files:**
- Create: `apps/web/public/favicon-dev.svg`

- [ ] **Step 1: Copy the production SVG and change the outer color to green**

Save this SVG to `apps/web/public/favicon-dev.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#22C55E"/>
  <path d="M50 2 A48 48 0 1 1 50 98 A48 48 0 1 1 50 2" fill="#22C55E"/>
  <circle cx="78" cy="50" r="18" fill="white"/>
  <circle cx="72" cy="50" r="8" fill="#111827"/>
</svg>
```

Color choices:
- Outer "C" fill: `#22C55E` (Tailwind green-500).
- Bite and inner circle unchanged.

- [ ] **Step 2: Verify the SVG renders locally**

Open `apps/web/public/favicon-dev.svg` in a browser or image viewer and confirm the icon is green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/favicon-dev.svg
git commit -m "assets: add development green favicon svg"
```

### Task 3: Add the favicon link placeholder to index.html

**Files:**
- Modify: `apps/web/index.html:5-6`

- [ ] **Step 1: Add the placeholder link inside `<head>`**

Replace:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cogito Digital</title>
```

with:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="%FAVICON_HREF%" />
    <title>Cogito Digital</title>
```

- [ ] **Step 2: Verify no syntax errors**

Open `apps/web/index.html` and confirm the `<head>` section is valid HTML.

- [ ] **Step 3: Commit**

```bash
git add apps/web/index.html
git commit -m "html: add favicon href placeholder"
```

### Task 4: Add the Vite plugin that swaps the favicon per mode

**Files:**
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Add a small inline plugin before the existing plugins array**

Modify `apps/web/vite.config.ts` so the config looks like:

```ts
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const faviconPlugin = () => ({
  name: "favicon-env-swap",
  transformIndexHtml: {
    order: "pre" as const,
    handler(html: string, ctx: { server?: { config?: { mode?: string } } }) {
      const mode = ctx.server?.config?.mode ?? process.env.NODE_ENV ?? "production";
      const href = mode === "development" ? "/favicon-dev.svg" : "/favicon.svg";
      return html.replace("%FAVICON_HREF%", href);
    },
  },
});

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    faviconPlugin(),
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
  ],
});
```

- [ ] **Step 2: Verify TypeScript is happy**

Run:

```bash
cd apps/web && bunx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "build: add vite plugin for env-specific favicon"
```

### Task 5: Verify the dev build shows the green favicon

**Files:**
- No file changes.

- [ ] **Step 1: Start the web dev server**

Run:

```bash
bun run dev:web
```

- [ ] **Step 2: Inspect the generated `index.html` and the browser tab**

Open `http://localhost:3000`. In DevTools → Elements → `<head>`, confirm:

```html
<link rel="icon" type="image/svg+xml" href="/favicon-dev.svg">
```

The browser tab should display the green Cogito icon.

- [ ] **Step 3: Stop the dev server**

Use `Ctrl+C` to stop the server.

### Task 6: Verify the production build shows the orange favicon

**Files:**
- No file changes.

- [ ] **Step 1: Build the web app for production**

Run:

```bash
bun run build --filter=web
```

- [ ] **Step 2: Check the dist index.html**

Open `apps/web/dist/index.html` and confirm the favicon link is:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

- [ ] **Step 3: Verify the SVG is copied to dist**

Confirm both files exist:

```bash
test -f apps/web/dist/favicon.svg && echo "prod favicon ok"
test -f apps/web/dist/favicon-dev.svg && echo "dev favicon ok"
```

Expected output:

```
prod favicon ok
dev favicon ok
```

- [ ] **Step 4: Serve the production build and visually confirm**

Run:

```bash
cd apps/web && bun run serve
```

Open `http://localhost:4173` (or the port Vite prints). The tab should show the orange Cogito icon.

- [ ] **Step 5: Stop the preview server**

Use `Ctrl+C` to stop the server.

- [ ] **Step 6: Commit any final changes**

If no additional changes were made, no commit is required. If the build generated untracked files, do not commit them (they should be ignored by `.gitignore`).

---

## Spec Coverage Check

| Spec requirement | Task |
| ---------------- | ---- |
| Create production SVG favicon (orange) | Task 1 |
| Create development SVG favicon (green) | Task 2 |
| `index.html` placeholder link | Task 3 |
| Vite plugin swaps href by build mode | Task 4 |
| Dev build shows green icon | Task 5 |
| Prod build shows orange icon | Task 6 |

## Placeholder Scan

No TBD/TODO/similar placeholders. Every step includes exact file paths, exact code, and exact commands.
