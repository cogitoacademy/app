# Cogito Blog Gap Fix Summary

Date: 2 November 2026
Related audit: `output/blog-user-stories-coverage.md`

## Fixed

### Launch blockers

- **Public API path.** The marketing client, rate limiter, router metadata, README, API reference, and runbook now use `/rpc/publicContent/blog/*`. The old `/rpc/public-content/blog/*` returned 404.
- **Real 404s.** Removed `apps/web/src/app/[locale]/loading.tsx`. Its streaming boundary made `notFound()` return HTTP 200. Unknown routes, unknown article slugs, mixed locale segments, and thin hubs now return HTTP 404. This was verified in both Next dev and a production `next build` + `next start`.
- **Article CTA.** Added a consultation block with the WhatsApp link and featured tutor name.
- **Related articles.** Added an admin picker for up to three articles. The API fills remaining slots from the newest published articles in the same subcategory.
- **Gallery alt text.** The editor now has per-image Indonesian and English alt fields. Gallery images can be published without hitting the hidden gate.

### Editorial and SEO

- Category introductions are editable and rendered on hubs. The API limit is 3000 characters to fit 150-300 words.
- F.A.Q. editing is available per language.
- Publish errors now return `data.missingFields` and the admin toast lists every missing field with a readable label.
- Version conflicts return `data.actualVersion`.
- The admin language filter now works without a status filter.
- Opening an unedited article no longer shows "Unsaved changes". Real edits still mark the article dirty.
- Publish and unpublish confirmations name the locale and public URL. Unpublish explains that the sibling alternate disappears.
- SEO title and meta description show character counters. Address shows the public canonical URL.
- Article cards use 4:3 images and H2 titles.
- TOC anchors are readable, for example `#why-this-matters-1`.
- Key facts render as a two-column table when the text contains `Label: value`.
- The blog home has category navigation and numbered pagination with self-canonical page URLs.
- The homepage shows the three newest articles.
- RSS feeds exist at `/id/blog/rss.xml` and `/en/blog/rss.xml`.
- The article JSON-LD includes `about` when a tutor is named.
- Public blog API responses now send `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- Embed URLs with query strings or fragments are rejected at write time.
- Category update rejects moving a parent with children under another root.

### UI spacing

The vertical translation line was using `pl-3` with no vertical padding, so it sat against labels and neighbouring sections. It now uses `pl-4`, `space-y-4`, and `py-1`, which gives visible horizontal and vertical breathing room.

## Verification

- API blog unit tests: 65 pass, 0 fail.
- Marketing blog tests: 10 pass, 0 fail.
- Marketing production build: passes.
- Marketing TypeScript check: passes.
- Admin blog TypeScript check: no blog-file errors. The project still reports unrelated pre-existing errors.
- Production 404 checks:
  - `/id/blog/xyz` returns 404.
  - `/id/xyz` returns 404.
  - `/en/blog/kategori/...` returns 404.
- Production 200 checks:
  - `/id/blog`, `/id/blog/audit-a`, `/blog-sitemap.xml`, and `/id/blog/rss.xml`.
- Missing-field wire response contains all required fields.
- Related fallback returned two same-category articles when none were chosen.
- Category intro appeared on the public hub.
- CTA and related blocks appeared on the public article.
- Homepage strip appeared with three cards.
- Admin save no longer leaves a false unsaved state; typing still sets it.

Test articles and the test category were deleted after verification. The original `sa` draft remains.

## Remaining

These need a product decision, external data, or a separate change:

1. `x-default` points to Indonesian. The spec asks for English; the plan chose Indonesian to match `defaultLocale`. Pick one.
2. The CTA is a generic consultation block. Tutor profile cards and program cards need public tutor profiles and program pages.
3. Student stories and consent are still deferred. A checkbox is not a consent model.
4. `in_review`, a ready-to-publish checkbox, and draft preview are not implemented.
5. Admin list pagination and category reorder UI are not implemented.
6. Tag pages and thin-tag `noindex` are deferred.
7. Three image crops and Person author URLs need an image transformation service and public tutor profiles.
8. Media ratio validation still needs server-side image decoding.
9. Admin E2E, the editorial rulebook, and the Kak Gita pilot are still missing.
10. Category hub pagination is not implemented; only the blog home is paginated.
11. The removed global loading spinner was a shared UI element. If the team wants it back, add per-route `loading.tsx` files but never under `app/[locale]` or under the blog route.

## What the user can help with

1. Choose `x-default` policy: Indonesian or English.
2. Confirm the public CTA target and provide tutor profile/program URLs when they exist.
3. Decide whether the global loading spinner should return via per-route files.
4. Provide the Kak Gita hero, gallery, F.A.Q., category introductions, and editorial checklist.
5. Confirm Vercel env values: `COGITO_APP_API_URL`, `NEXT_PUBLIC_SITE_URL=https://www.cogitoacademy.id`, `NEXT_PUBLIC_R2_HOST`.
6. Restart the local API and web app so `/admin-blog` uses the new API; the current app process on port 3000 still points to an older API build.
7. Provide a running test database at port 6769 for the integration suite and admin E2E.
