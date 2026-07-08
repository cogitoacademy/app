# Environment-Colored Favicon Design

## Goal

Make it easy to distinguish development vs production Cogito app tabs/windows at a glance by changing the favicon color based on the build environment.

## Approach

Build-time favicon swap via a small Vite plugin. No runtime JavaScript, no extra request logic in the browser.

## Favicon Assets

Create two SVG favicons in `apps/web/public/`:

- `favicon.svg` — production favicon, keeps current Cogito orange color.
- `favicon-dev.svg` — development favicon, green tint.

Both are derived from the existing `cogito-mark.png` / `c of cogito.png` logo geometry.

## Build-Time Injection

`apps/web/index.html` will contain a placeholder:

```html
<link rel="icon" type="image/svg+xml" href="%FAVICON_HREF%" />
```

A Vite plugin in `apps/web/vite.config.ts` will replace `%FAVICON_HREF%` during dev and build:

- `import.meta.env.MODE === 'development'` → `/favicon-dev.svg`
- any other mode (production, staging, preview) → `/favicon.svg`

This keeps the decision at build time and avoids client-side environment checks.

## Out of Scope

- Staging-specific color. If a staging mode is added later, a third SVG and plugin branch can be added.
- ICO fallback for very old browsers. SVG favicons are supported by all modern browsers used by the team.

## Verification

- `bun run dev:web` shows a green favicon.
- `bun run build` + `bun run serve` shows the orange favicon.
- `index.html` output in `dist/` points to the correct SVG file.
