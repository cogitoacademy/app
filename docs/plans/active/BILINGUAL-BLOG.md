# Bilingual Blog — App-Managed Content Plan

Status: App slice implemented (database, API, admin UI); marketing renderer and release verification pending
Date: 2026-11-02
Primary repository: `cogito-app` (DB, API, admin, media)
Renderer repository: `cogito-acad` (public blog pages, metadata, sitemap)
Supersedes: `cogito-acad/docs/plans/active/BILINGUAL-BLOG.md`
Source: Cogito Blog Section Developer Spec & Site Re-check (2026-11-01)

## Implementation checkpoint (2026-11-02)

Branch `feat/bilingual-blog` now contains the app slice:

- Migration `0085_fresh_spirit.sql` creates the six blog tables and their constraints on top of `main` `b5e5ee58`.
- Modules `packages/api/src/modules/blog/` expose `adminBlog.*` and `publicContent.blog.*`, including publish gating, slug locking, archive, gallery and related replacement, media registration, and audit writes.
- Admin routes `/admin-blog` and `/admin-blog/$articleId` are wired into the sidebar with admin-only guards.
- `packages/api/src/tests/integration/blog.test.ts` covers the publish gate, slug lock, independent locale publishing, public projection, and archive. It passes against the local `cogito-test` database after applying 0085.
- Web and API typechecks pass for the blog files; the API project still reports its pre-existing test and JSON-module errors.

Deviations from the original Phase 3 sketch:

- The body editor is a structured block editor built from Selia fields, not TipTap. It stores the same block JSON and avoids a new rich-text dependency.
- The shared panel, version panel, and publish panel are composed inside `blog-editor-page.tsx`; separate panel files were not needed.
- F.A.Q. and related-article editing are supported by the API but have no admin controls yet.
- The marketing Phase 0 fixes and public pages remain in `cogito-acad` and are not part of this branch.

## Goal

Manage blog content directly in the Cogito app. Editors create articles in the app admin, store them in PostgreSQL, upload media through the existing storage flow, and publish each language independently. The public marketing site reads published content from a public app endpoint and renders it.

Sanity is not used for blog content. Sanity remains the source for competitions and student resources until a separate migration plan removes it. This plan does not attempt a full CMS shutdown.

## Architecture

```text
Admin UI (cogito-app /apps/web)
        |
        v
oRPC adminBlog procedures (adminProcedure)
        |
        v
blog service + repository
        |
        v
PostgreSQL (blog_article, blog_article_version, blog_category, blog_media)
        ^
        |
oRPC publicContent.blog procedures (publicProcedure)
        |
        v
Marketing site (cogito-acad) ISR pages
        |
        v
Search engines
```

Rules:

- The app is the only write path. No direct database edits, no Sanity writes for blog content.
- Public reads return published versions only. Drafts, internal notes, and editor identities never leave admin endpoints.
- Each language version has its own lifecycle. Publishing Indonesian does not publish English.
- The marketing site caches public responses for 60 seconds. No cross-service webhook in Phase 1.

## Success criteria

Phase 1 is done when all of the following are true:

1. An admin can create one article, upload a hero image, fill Indonesian and English versions, preview both, and publish each independently.
2. `/id/blog/manfaat-ikut-mun-kak-gita` and `/en/blog/benefits-of-model-un-gita` return 200 on `https://www.cogitoacademy.id`.
3. Each page has one `<h1>`, the full body in the HTML source, and the correct `<html lang>`.
4. Each page has a self canonical, a self `hreflang`, a sibling `hreflang` only when that sibling is published, and one `x-default` on the `www` host.
5. The language switch opens the sibling article, or is hidden when no sibling is published.
6. Unknown blog URLs return HTTP 404.
7. Rich Results Test passes for `BlogPosting` and `BreadcrumbList`.
8. `/blog-sitemap.xml` lists both versions with alternates and `lastmod` from the version `updatedAt`.
9. Unpublishing one version removes it from the public API, the other version's alternates, and the sitemap within two minutes.
10. Publishing rejects missing required fields, duplicate slugs, changed slugs after first publish, and direct database bypasses are not possible through the API.
11. Unit, integration, and admin E2E tests pass.
12. Mobile article page meets LCP below 2.5 s and CLS below 0.1.

Traffic targets are not part of the acceptance gate. Organic performance is reviewed after 8 to 12 weeks.

## Non-goals

- Student stories, student profiles, and student photos. No consent model exists, and a checkbox is not consent.
- Tutor profile pages. Byline shows the tutor name as text until public profiles ship.
- Program pages and a required related-program field.
- Subcategory hub pages beyond the pilot category.
- Tag pages, filtered lists, RSS, pagination UI, `VideoObject`, and custom analytics events.
- Full Sanity removal. Competitions and student resources stay on Sanity for now.
- Automated redirects for slug changes. Slugs are immutable after first publish instead.
- Draft preview on the marketing domain.

## Decisions

1. **Data model:** `blog_article` stores shared fields; `blog_article_version` stores per-language fields. Two versions maximum, one per locale, enforced by a unique constraint.
2. **Publish state:** lives on the version row (`draft`, `in_review`, `published`, `archived`). The shared article has no publish flag.
3. **Slug lock:** once a version has `publishedAt`, the service rejects any slug change. This is a real server-side guarantee, not an editorial convention.
4. **Tutors:** `featuredTutorId` and `reviewedByTutorId` are real foreign keys to `tutor_profile`. No duplicate person records, no cross-system ID strings. The public DTO includes the tutor name and a profile URL only when the tutor is publicly visible.
5. **Categories:** one row can be a root category or a subcategory through `parentId`, one level deep. Articles reference a root category and an optional subcategory that belongs to it.
6. **Media:** use the existing signed-upload flow. A `blog_media` row records the storage key, content type, uploader, and optional pixel dimensions. The public URL is derived with `StoragePort.resolvePublicUrl`. No image bytes pass through the app in Phase 1. Delivery uses the existing R2 public host and the marketing site's `next/image` optimizer. An app image proxy is a documented option, not a Phase 1 requirement.
7. **Freshness:** marketing pages use ISR with `revalidate = 60`. Publish and unpublish become visible within two minutes without a cross-service webhook. Add a webhook only if 60 seconds proves insufficient.
8. **`x-default`:** points to Indonesian, matching `defaultLocale: 'id'` in the marketing router. The source spec proposed English; that conflicts with the site's actual default.
9. **Body format:** JSONB Portable-Text-like blocks validated by Zod. No raw HTML column. Marketing renders blocks as React components and never uses `dangerouslySetInnerHTML`.
10. **Admin access:** `adminProcedure` only. No editor role in Phase 1. If a non-admin editor role is needed, that is a separate authorization change.
11. **Social embeds:** store a structured `{ provider, url, posterMediaId? }` object, never raw embed HTML. Validate the host and URL shape at write time. Render a facade first and load the provider only after a click. Do not call Meta oEmbed in Phase 1. Meta removed `thumbnail_url` from Instagram oEmbed responses in 2025, so the poster must be uploaded or omitted.
12. **Image delivery:** direct public R2 URL for Phase 1. Add a stable app media endpoint only if the bucket must become private or server-side transforms become necessary.

## Dependencies audit

The feature needs one new package. Most of the stack already exists.

Already installed and reused:

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm` 3.32.0 in `apps/web`. StarterKit v3 already bundles Link and Underline, checked in the local package source. Do not add `@tiptap/extension-link`.
- `@tanstack/react-form`, `zod`, Selia UI components, `date-fns`, and the oRPC client for the admin forms.
- `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` for the existing signed-upload flow.
- `next/image` and `next/og` for delivery and the social card. Both are built into Next 16.

Add:

- `@tiptap/extension-image` at the same 3.32.x line. Extend it with `mediaId`, `alt`, and `caption` attributes. This is the only new runtime dependency required by the editor.

Optional, decision-gated:

- `sitemap` in the marketing site if hand-written XML feels risky. The package supports `xhtml:link` alternates. A 40-line builder with an escaping helper is also acceptable and has no dependency. Pick one, do not add the package and then hand-roll.
- `@tiptap/extension-placeholder` for an empty-body hint. Cosmetic only.
- `sharp` in the app only if server-side EXIF stripping or derivative generation becomes required. It is a native dependency and increases server image size. Not needed for Phase 1 because the admin client normalizes images before upload.
- `image-size` only if the server must read dimensions from bytes. Not needed when the client sends dimensions at registration.

Do not add:

- `react-social-media-embed`, `react-instagram-embed`, or similar wrappers. They bundle provider scripts, age poorly, and hide third-party loading. Use a facade plus the provider's official iframe or embed script.
- `instagram-web-api`, scrapers, or oEmbed proxies. Meta removed thumbnail fields from oEmbed, and scraping Instagram HTML is fragile and terms-sensitive.
- `sanitize-html` or DOMPurify for article bodies. Bodies are JSON blocks, not HTML. If HTML ever enters the pipeline, stop and redesign rather than sanitize.
- `slugify`, `reading-time`, or `marked`. Slug normalization and reading time are short deterministic functions. Markdown is not a storage format here.

## Phase 0 — Foundation fixes in the marketing site

These are prerequisites because every blog URL inherits the current site head.

Tasks in `cogito-acad`:

- [ ] Fix the canonical host. `apps/web/src/lib/constants.ts` defaults to the apex domain while the site serves `www`. Set one constant to `https://www.cogitoacademy.id` and read it from a single environment variable.
- [ ] Align the environment variable. The code reads `NEXT_PUBLIC_SITE_URL`; the local `.env` defines `BASE_URL`. Rename and set it in Vercel, then delete the unused name.
- [ ] Make the apex redirect permanent (308), preserving path and query.
- [ ] Return real 404s. `apps/web/src/app/[locale]/[...rest]/page.tsx` renders the NotFound component without calling `notFound()`. Call `notFound()`.
- [ ] Remove `/_next/` from `apps/web/src/app/robots.ts`.
- [ ] Fix `apps/web/src/app/sitemap.ts`: replace `lastModified: new Date()` with real dates or omit it. Add `/faq` and `/activities` if they remain indexable.
- [ ] Add an H1 and page-specific title to the homepage. The live page currently has zero `<h1>` elements. Fix the `transformation` typo in the Indonesian description.
- [ ] Fix or hide the home FAQ section. Production currently renders its error state because the app request fails.
- [ ] Add `"test": "bun test"` to `apps/web/package.json`; `apps/web/tests` already uses `bun:test`.

Exit gate: `/id` returns one `<h1>` and a `www` canonical; `/id/blog/xyz` returns 404; robots has no `_next` disallow.

## Phase 1 — Database

New file: `packages/db/src/schema/blog.ts`
Migration: next available number after `0085`, generated by Drizzle. Register the schema in `packages/db/src/schema/index.ts`.

### `blog_category`

- `id`: uuid primary key.
- `parentId`: uuid, nullable, self-reference, `onDelete: restrict`.
- `titleId`, `titleEn`: text, not null.
- `slugId`, `slugEn`: text, not null.
- `introId`, `introEn`: text, nullable. Marketing requires an intro only when the hub is indexable.
- `sortOrder`: integer, not null, default 0.
- `isActive`: boolean, not null, default true.
- `version`: integer, not null, default 1.
- `createdAt`, `updatedAt`.

Constraints and indexes:

- Unique `(slugId)` and `(slugEn)`.
- Check both titles and both slugs are non-empty after trim.
- Index `(isActive, parentId, sortOrder)`.

### `blog_article`

- `id`: uuid primary key.
- `categoryId`: uuid, not null, references `blog_category`, `onDelete: restrict`.
- `subcategoryId`: uuid, nullable, references `blog_category`, `onDelete: restrict`.
- `heroMediaId`: uuid, nullable, references `blog_media`, `onDelete: restrict`. Required by the publish gate, not by the insert.
- `featuredTutorId`: uuid, nullable, references `tutor_profile`, `onDelete: set null`.
- `reviewedByTutorId`: uuid, nullable, references `tutor_profile`, `onDelete: set null`.
- `internalNotes`: text, nullable.
- `archivedAt`: timestamp, nullable.
- `version`: integer, not null, default 1.
- `createdBy`, `updatedBy`: text, references `user`, `onDelete: set null`.
- `createdAt`, `updatedAt`.

Validation in the service: `subcategoryId`, when set, must have `parentId = categoryId`.

### `blog_article_version`

- `id`: uuid primary key.
- `articleId`: uuid, not null, references `blog_article`, `onDelete: cascade`.
- `locale`: text, not null. Check `locale in ('id','en')`.
- `slug`: text, not null.
- `title`, `seoTitle`, `metaDescription`, `lead`: text, not null.
- `mainKeyword`, `secondaryKeywords`: text and jsonb, nullable.
- `keyFacts`: jsonb, not null, default `[]`.
- `body`: jsonb, not null.
- `faq`: jsonb, not null, default `[]`.
- `heroAlt`: text, nullable. Required by the publish gate.
- `readingMinutes`: integer, not null, default 1.
- `status`: text, not null, default `draft`. Check in `('draft','in_review','published','archived')`.
- `publishedAt`: timestamp, nullable.
- `version`: integer, not null, default 1. Optimistic concurrency token.
- `createdAt`, `updatedAt`.

Constraints and indexes:

- Unique `(articleId, locale)`.
- Unique `(locale, slug)`. Archived rows keep their slug reserved.
- Check slug format: `^[a-z0-9]+(-[a-z0-9]+)*$`.
- Check `status = 'published'` implies `publishedAt is not null`.
- Check `version > 0` and `readingMinutes > 0`.
- Index `(status, locale, publishedAt desc)`.
- Index `(articleId)`.

### `blog_article_related`

- `articleId`, `relatedArticleId`, `sortOrder`.
- Primary key `(articleId, relatedArticleId)`.
- Check `articleId <> relatedArticleId`.
- Service enforces maximum 3 and published targets at read time.

### `blog_article_gallery`

- `articleId`, `mediaId`, `sortOrder`, `altId`, `altEn`.
- Primary key `(articleId, mediaId)`.
- Alt text required per locale when the image is used.

### `blog_media`

- `id`: uuid primary key.
- `storageKey`: text, not null, unique.
- `filename`: text, not null.
- `contentType`: text, not null. Check against the image allowlist.
- `width`, `height`: integer, nullable. Sent by the admin client after decoding the image. Used for reserved layout space and JSON-LD image dimensions.
- `byteSize`: integer, nullable. Sent by the client; the signed upload already enforces the 5 MiB cap.
- `createdBy`: text, references `user`, `onDelete: set null`.
- `createdAt`.

Media registration rule: the storage key must start with the uploading admin's user ID, matching the existing `createUploadUrl` key format. A key that belongs to another user is rejected.

Exit gate: migration applies on a scratch database, constraints reject duplicate locale/version pairs and invalid slugs, and a database dump restores.

## Phase 2 — API module

New module: `packages/api/src/modules/blog/`

Files:

- `blog.types.ts`
- `blog.errors.ts`
- `blog.repo.ts`
- `blog.service.ts`
- `blog.handler.ts`
- `blog.router.ts`
- `index.ts`

Register the module factory in `packages/api/src/services.ts` and the router in `packages/api/src/routers.ts`.

### Body block contract

Define a discriminated union and validate it in `blog.types.ts`:

```ts
type BlogBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; runs: BlogRun[] }
  | { type: "list"; style: "ordered" | "unordered"; items: BlogRun[][] }
  | { type: "quote"; runs: BlogRun[]; attribution?: string }
  | { type: "callout"; title: string; runs: BlogRun[] }
  | { type: "image"; mediaId: string; alt: string; caption?: string }
  | {
      type: "embed";
      provider: "instagram" | "tiktok";
      url: string;
      posterMediaId?: string;
    };
```

`BlogRun` supports `text`, `bold`, `italic`, and `href`. Links accept `http:` and `https:` only. Limits: 60 blocks per body, 5,000 characters per text run, 300 characters per heading, 500 characters per paragraph run set. Reject unknown block types and unknown keys with `.strict()`.

Embed validation:

- Instagram: host must be `instagram.com` or `www.instagram.com`, path must start with `/reel/`, `/reels/`, `/p/`, or `/tv/`, and the shortcode must be `[A-Za-z0-9_-]+`.
- TikTok: host must be `tiktok.com` or `www.tiktok.com`, path must match `/@<user>/video/<digits>`. Reject short links because they require a network round trip to resolve.
- Normalize the URL to `https://www.<provider>.com/...` at write time. Reject query strings, fragments, and redirects.
- `posterMediaId` is optional. When present, it must reference a `blog_media` row that belongs to the article or its uploader.
- No raw HTML, `<iframe>`, or script URL may be stored. The provider URL is data, not markup.

### Category endpoints

- `adminBlog.categories.list`
- `adminBlog.categories.create`
- `adminBlog.categories.update` with `expectedVersion`
- `adminBlog.categories.reorder`

Validate that a subcategory's parent is a root category and that a root category has no parent. Reject deactivation while published articles reference it.

### Article endpoints

- `adminBlog.list({ status?, locale?, cursor?, limit? })` returns article ID, title per locale, category, locale statuses, updated time, and publish state.
- `adminBlog.get({ articleId })` returns shared fields, both version drafts, gallery, related IDs, and media metadata.
- `adminBlog.createArticle({ categoryId, subcategoryId?, heroMediaId?, featuredTutorId?, reviewedByTutorId?, internalNotes? })` returns the new article ID.
- `adminBlog.updateArticle({ articleId, expectedArticleVersion, ...sharedFields })`.
- `adminBlog.saveVersion({ articleId, locale, expectedVersion, ...localeFields })`. Creates the row on first save.
- `adminBlog.publishVersion({ articleId, locale, expectedVersion })`.
- `adminBlog.unpublishVersion({ articleId, locale, expectedVersion })`. Sets status to `draft`, keeps `publishedAt`.
- `adminBlog.archiveArticle({ articleId, expectedArticleVersion })`. Archives both versions and sets `archivedAt`.
- `adminBlog.replaceRelated({ articleId, relatedArticleIds })`.
- `adminBlog.registerMedia({ storageKey, filename, contentType, width?, height?, byteSize? })`.

Validation rules:

- All text trimmed and length-limited. SEO title max 60 characters, meta description max 155.
- Slug format check, plus server-side uniqueness.
- Publish gate: title, SEO title, slug, meta description, lead, body, hero image, hero alt, category, at least one key fact for story articles. Missing field returns a structured error listing every missing field, not the first one.
- Slug change after first publish returns `SLUG_IMMUTABLE`.
- Version mismatch returns `VERSION_CONFLICT` with the current version.
- A version cannot be published when its article is archived.
- Reading time is computed from text word count at save and stored.
- Every `image` and `embed.posterMediaId` in the body must reference a registered `blog_media` row. Reject unknown media IDs at save time.
- An `embed` block without a poster is allowed, but the marketing renderer must show a branded placeholder. A poster is required when the provider post is the article's only visual.
- Width and height are optional at registration. When present, both must be positive and the ratio must match the decoded image within 1 percent. Reject nonsense values instead of trusting the client blindly.

### Public endpoints

Namespace: `publicContent.blog`.

- `list({ locale, cursor?, limit? })`: published versions only, newest first, default 12, max 24. Returns cards: article ID, slug, title, excerpt from meta description, hero URL, category slug and title, tutor name, published date, updated date, reading minutes.
- `get({ locale, slug })`: full published version plus shared article facts and alternate sibling `{ locale, slug } | null`. Returns 404-equivalent not-found error for unpublished, archived, or unknown slugs.
- `categories({ locale })`: active categories with counts of published versions in that locale. Marketing uses the count to decide indexability.
- `sitemap()`: all published versions across both locales with article ID, locale, slug, `updatedAt`, and sibling slug when published. Cap at 5,000 entries; add pagination if the cap is approached.

Public projection must exclude: `internalNotes`, `createdBy`, `updatedBy`, draft fields of unpublished versions, media storage keys, and tutor private fields. Return the resolved public media URL only, plus optional `width`, `height`, and the embed poster URL. Never return the R2 key.

Caching headers: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on public blog responses. Add the public blog routes to `apps/server/src/rate-limit-paths.ts` with a public-content budget, for example 120 requests per minute per IP for `get` and `list`, and 12 per minute for `sitemap`.

Error handling: use the existing error envelope. Public errors must not disclose whether an unpublished slug exists.

Exit gate: integration tests create an article, publish Indonesian only, and prove that public `get('en')` fails while `get('id')` succeeds and returns `alternate: null`.

## Phase 3 — Admin UI

New routes:

- `apps/web/src/routes/_app.admin-blog.tsx` (list)
- `apps/web/src/routes/_app.admin-blog_.$articleId.tsx` (editor)

Access: `admin` role only, matching `_app.admin-content.tsx`.

Components: `apps/web/src/components/admin/blog/`

- `blog-list-page.tsx`: filters by status and locale, shows ID/EN completion, updated time, publish state, and a link to the editor.
- `blog-editor-page.tsx`: shared panel plus Indonesian and English tabs. Tabs show unsaved state and validation errors.
- `blog-shared-panel.tsx`: category, subcategory, tutor selects, hero upload, gallery, related articles, internal notes.
- `blog-version-panel.tsx`: title, SEO title, slug, meta description, lead, keywords, key facts, FAQ, hero alt, body editor.
- `blog-body-editor.tsx`: TipTap with a constrained schema matching the block contract. Headings 2 and 3, paragraphs, lists, links, quotes, callout, image, Instagram or TikTok embed. No raw HTML. No pasted inline styles. Image and embed blocks open the media picker or the URL validator.
- `blog-publish-panel.tsx`: per-locale publish and unpublish actions, missing-field list, sibling state, and slug lock indicator.
- `blog-media-picker.tsx`: uploads through `upload.createUploadUrl`, then calls `adminBlog.registerMedia`. Before upload, decode the image in the browser, resize to at most 2,000 px on the long edge, re-encode as WebP at quality 0.82, and send the resulting width, height, and byte size. This strips EXIF metadata, including GPS, and keeps uploads under the 5 MiB cap. Reject non-image files and files above 5 MiB after normalization.
- `blog-embed-field.tsx`: validates Instagram and TikTok URLs client-side, lets the editor attach an optional poster image, and shows a preview card. It does not fetch oEmbed data.

UX rules:

- Publish buttons stay disabled until client-side validation passes, but the server remains authoritative.
- Show the canonical URL and SEO character counts next to the fields.
- Warn before leaving with unsaved changes.
- Publish confirmation names the locale and the public URL.
- Unpublish confirmation explains that the sibling page will drop its alternate within two minutes.
- No raw JSON textarea in the primary flow. Keep an advanced JSON view only for the body if the editor cannot represent a block.

Navigation: add a "Blog" entry to the admin navigation next to the existing content entry.

Exit gate: an admin can complete the full flow in a browser. A non-admin cannot open either route or call any `adminBlog` procedure.

## Phase 4 — Marketing site rendering

Repository: `cogito-acad`.

New files:

- `apps/web/src/lib/blog-api.ts`: Zod-validated client for the public endpoints, following the `faq-api.ts` pattern. Reject malformed responses instead of rendering an empty success.
- `apps/web/src/lib/blog-metadata.ts`: single metadata builder.
- `apps/web/src/app/[locale]/blog/page.tsx`
- `apps/web/src/app/[locale]/blog/[slug]/page.tsx`
- `apps/web/src/app/[locale]/blog/kategori/[slug]/page.tsx`
- `apps/web/src/app/[locale]/blog/category/[slug]/page.tsx`
- `apps/web/src/app/blog-sitemap.xml/route.ts`
- `apps/web/src/components/blog/*`
- `apps/web/src/messages/id.json`, `apps/web/src/messages/en.json`

Data rules:

- Fetch through `COGITO_APP_API_URL` with `next: { revalidate: 60, tags: ['blog'] }`.
- `dynamicParams = true`; new slugs resolve without a redeploy.
- Article page makes one `get` call. Blog home makes one `list` call. Category hub makes one `categories` plus one `list` call.
- On API failure, render a localized error state with a retry link. Never render an empty article or a 200 page with no content.
- Enforce locale-segment pairing: Indonesian uses `/id/blog/kategori/`, English uses `/en/blog/category/`. Mixed segment and locale returns 404.
- Category hub returns 404 when fewer than two published articles exist in that locale.
- Language switch links to the sibling from the payload and is hidden when `alternate` is null.

Head contract:

- One H1.
- Self canonical.
- Self `hreflang`.
- Sibling `hreflang` only when the sibling is published.
- `x-default` points to Indonesian when a sibling exists. For a single-language article, emit only the self alternate. Document this choice in the plan and the blog docs.
- `BlogPosting`: `headline`, `description`, `image` with 16:9, 4:3, and 1:1 entries, `datePublished`, `dateModified`, `inLanguage`, `author` (`Person` only when a public tutor profile URL exists, otherwise `Organization`), `publisher` with a raster logo and explicit width and height, `mainEntityOfPage`.
- `BreadcrumbList`: blog home, category, article.
- No `VideoObject`. No author URL that 404s.
- `og:url`, `og:title`, `og:description`, and `og:image` set per article.

Sitemap:

- Next's `MetadataRoute.Sitemap` cannot emit `xhtml:link`. Implement the route handler manually.
- One entry per published version. `lastmod` from `updatedAt`. Alternates only for published siblings.
- List `/blog-sitemap.xml` in `robots.ts`. Keep blog URLs out of `app/sitemap.ts`.

Images:

- Phase 1 delivery is the public R2 URL from the API payload. The app does not proxy image bytes.
- Add the R2 public host to `images.remotePatterns` in `apps/web/next.config.ts`. Do not add a wildcard host.
- Render inside a fixed aspect ratio frame, or pass the stored `width` and `height` to `next/image`. Either prevents CLS.
- Use `sizes` on every image so mobile does not download desktop-sized files.
- Alt text comes from the version payload. A missing alt fails the publish gate, so the renderer treats it as required.
- Do not build `og:image` from the raw 4:3 hero. Add `apps/web/src/app/[locale]/blog/[slug]/opengraph-image.tsx` using `ImageResponse` from `next/og` to render a 1200x630 card with the hero, title, category, and Cogito mark. This avoids cropped WhatsApp previews and needs no new package.
- An app media proxy is not required. Add `GET /public-content/blog/media/:mediaId` later only if the bucket becomes private, images must be gated by article state, or server-side transforms are needed. The proxy would add app egress, a storage `get` method, cache headers, and tests. Do not build it pre-emptively.

Embeds:

- Render a facade card with the uploaded poster, provider label, and a play button. If no poster exists, render a branded placeholder with the provider name.
- Load the provider only after the visitor clicks. Use the official Instagram embed script once per page, or the official iframe endpoint. Prefer the iframe when a single embed exists because it isolates third-party code; use the script when multiple embeds share a page.
- Set `loading="lazy"`, `allowfullscreen`, and a privacy note next to the facade. Keep a plain outbound link as the fallback.
- Add the provider origins to the CSP when a CSP is introduced. Do not relax `X-Frame-Options`; it controls framing this site, not outbound frames.
- Do not fetch oEmbed metadata at request time. Meta removed Instagram thumbnails from oEmbed in 2025, so the poster must come from the editor.

Components:

- `article-card.tsx`: one link, no nested links.
- `article-body.tsx`: block renderer. Links get `rel="noopener noreferrer"` and `target="_blank"` only for external URLs.
- `social-embed.tsx`: facade, click-to-load, poster, and fallback link.
- `table-of-contents.tsx`: generated from H2 blocks, collapsed on mobile with `aria-expanded`.
- `article-json-ld.tsx`
- `sticky-consultation.tsx`: dismissible, appears after 50 percent scroll, must not cover the final block.
- `blog-faq.tsx`: visible questions and answers, no JavaScript-only content.

Exit gate: `next build` succeeds with zero published articles. Every blog URL returns 404 until the first version is published.

## Phase 5 — Content and editorial rules

Content:

- Indonesian Kak Gita article, written first.
- English adaptation, not a literal translation.
- One root category and one subcategory in the pilot.
- Hero image and gallery images with per-locale alt text.

Editorial document: `docs/BLOG-EDITORIAL.md` in `cogito-app`.

- One main keyword per article per locale, recorded in a keyword table.
- Every article links to one related article and one conversion path.
- Two-person review before publish.
- Publish checklist mirrors the server gate.
- Slug never changes after first publish.
- Corrections update `updatedAt` only when content changes.
- No student story is accepted until a separate consent plan exists.

Exit gate: both versions pass the publish gate and the editorial checklist.

## Phase 6 — Tests and documentation

Unit tests, `packages/api/src/tests/unit/blog/`:

- Publish gate returns every missing field in one error.
- Slug change after publish returns `SLUG_IMMUTABLE`.
- Version conflict returns the current version.
- Public projection excludes drafts, internal notes, and private tutor fields.
- Body schema rejects HTML, unknown blocks, invalid links, and oversized fields.
- Embed block rejects wrong hosts, short links, query strings, fragments, and non-provider URLs. Accepts valid Instagram reel, post, and TV URLs plus valid TikTok video URLs.
- Embed block rejects a `posterMediaId` that is not a registered `blog_media` row.
- Media registration rejects a storage key owned by another user, a non-image content type, and dimensions outside 1 percent of the true ratio.
- Reading time calculation is stable for mixed Indonesian and English text.

Integration tests, `packages/api/src/tests/integration/blog.test.ts`:

- Create, save both versions, publish Indonesian, read public ID, confirm EN is not found and ID alternate is null.
- Publish EN, confirm both alternates and sitemap entries.
- Unpublish EN, confirm the ID alternate disappears.
- Archive, confirm both publics fail and both sitemap entries disappear.
- Duplicate `(articleId, locale)` and duplicate `(locale, slug)` are rejected by the database.
- Media key from another user is rejected.

Admin E2E, `packages/e2e/src/specs/blog-admin.spec.ts`:

- Admin creates an article, uploads an image, fills both locales, publishes ID, verifies the public marketing URL when the preview environment is configured.
- Non-admin is redirected and receives 403 from the API.

Marketing tests, `cogito-acad/apps/web/tests/`:

- Metadata builder emits canonical, self alternate, sibling alternate, and `x-default` correctly for paired, unpaired, and unpublished-sibling cases.
- Sitemap builder emits alternates only for published pairs.
- Adapter rejects malformed API payloads.

Documentation updates, required by `AGENTS.md`:

- `docs/CONTEXT.md`: new blog module, data ownership, publish rules, known limits.
- `docs/API-REFERENCE.md`: every `adminBlog` and `publicContent.blog` procedure, inputs, outputs, errors.
- `docs/MODULE-REFERENCE.md`: service rules, publish gate, slug lock, media ownership.
- `docs/RUNBOOK.md`: migration command, media storage requirement, ISR freshness, rollback.
- `docs/plans/active/BILINGUAL-BLOG.md`: status updates during delivery.
- Marketing `README.md`: blog routes and the app dependency.

Exit gate: all suites pass, docs match the code, and no undocumented procedure exists.

## Security and privacy

- Admin endpoints use `adminProcedure` and the existing session checks. Do not add a second authorization path.
- Public endpoints return only published rows and a fixed DTO. Do not return database rows directly.
- Rich text is JSON, never HTML. Marketing renders known blocks only. Reject `javascript:` and `data:` links at write time and again at render time.
- Media keys must belong to the uploading admin. Reject path traversal and absolute paths.
- Social embeds are stored as `{ provider, url, posterMediaId? }`, never raw HTML or iframe markup. Validate the provider host and path server-side. The marketing renderer mounts the provider iframe only after a visitor click, so no third-party script runs on page load.
- Uploads are normalized in the browser before signing: WebP, long edge at most 2,000 px, EXIF stripped. The server still enforces the 5 MiB cap and the content-type allowlist; client-side normalization is a quality measure, not a security control.
- No student data in Phase 1. No consent checkbox is treated as a publication control.
- Log publish, unpublish, archive, and media registration actions to the existing audit log with actor, article ID, locale, and previous status.

## Operational plan

1. Apply the migration to a scratch database. Run integration tests. Restore a dump to confirm rollback.
2. Deploy the API and admin UI with no published content. Verify every public blog route returns not-found.
3. Deploy the marketing routes. Verify every blog URL returns 404.
4. Publish Indonesian. Verify page, head, API payload, and sitemap.
5. Publish English. Verify both heads, the switch, and the sitemap alternates.
6. Submit `/blog-sitemap.xml` in Search Console.
7. Add the blog link to the Resources menu after the first pair is live.

Rollback:

- Unpublish both versions. Marketing drops the pages within 60 seconds; the sitemap follows.
- If the API is faulty, revert the deployment. Published rows remain; content is not lost.
- If the migration must be reverted, restore the pre-migration dump. Do not drop blog tables while media rows still reference storage keys.

Monitoring:

- Watch public blog error rate and p95 latency after launch.
- Log a warning when a published version's sibling is missing for more than 7 days.
- Alert on migration failure and on repeated public rate-limit rejections.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| App becomes a second CMS with no editorial discipline | Content quality drops and slugs drift | Publish gate, slug lock, audit log, two-person review |
| Marketing caches stale content | Unpublish stays visible | 60-second ISR, verified in acceptance check 9 |
| Admin uploads an image from another user | Media ownership bypass | Key prefix check against the session user ID |
| Rich text injection | Stored XSS on the public site | JSON-only blocks, allowlisted link protocols, React rendering |
| Large body payload slows the article page | Poor LCP | Body size limits, single request per article, ISR |
| Third-party embed scripts slow the page or track visitors before consent | Poor CWV and privacy exposure | Click-to-load facade, optional poster, no oEmbed fetch, CSP allowlist when CSP ships |
| Browser-side image normalization fails on an unusual file | Upload blocked | Show a clear error, allow retry, keep the 5 MiB cap as the hard limit; no server-side `sharp` in Phase 1 |
| Draft content leaks through the public API | Confidential or unapproved content is indexed | Public queries filter `status = 'published'`; integration tests assert it |
| Sanity and app both claim to own content | Editors edit the wrong system | Blog is app-only; Sanity docs state blog is out of scope until full migration |
| Schema change breaks existing content modules | Migration risk | Separate migration, scratch restore, no changes to existing tables |
| Full Sanity removal assumed | Scope explosion | Explicit non-goal; separate plan if requested |

## Deferred

| Item | Reason | Revisit when |
| --- | --- | --- |
| Student stories | No consent model or student entity | Legal review and offline consent process exist |
| Public tutor profiles | Decision D2 unresolved | Profile route ships |
| Program pages and program CTA | No public program routes | Program pages ship |
| Subcategory hubs | Thin pages | A subcategory has two published articles |
| Tag pages | Thin pages | A tag has five published articles |
| RSS | No indexing need for the pilot | Cadence is stable |
| `VideoObject` | No valid video source | Self-hosted or YouTube video with transcript exists |
| Custom analytics events | No analytics product or consent flow | Analytics owner exists |
| Non-admin editor role | Needs authorization design | More than one editor is hired |
| Cross-service publish webhook | 60-second ISR is sufficient | Freshness requirement tightens |
| Full Sanity removal | Competitions and resources still depend on it | Separate migration approved |

## Estimate

Phase 0, marketing foundation: 1 day.
Phase 1, schema and migration: 2 days.
Phase 2, API module and tests: 3 to 4 days.
Phase 3, admin UI: 5 to 6 days, including browser-side image normalization and the embed field.
Phase 4, marketing pages and head contract: 4 to 5 days, including the facade embed and the `next/og` social card.
Phase 5, content and review: 2 days plus editorial.
Phase 6, tests, docs, rollout: 2 days.

Total: roughly 19 to 22 engineering days, plus content review. This is larger than the Sanity version because the app must now provide editing, media, publication, and audit behavior that the CMS previously supplied.

## Open decisions

1. Who are the first admin editor and reviewer?
2. Is the single-admin restriction acceptable for launch?
3. Does the pilot use a root category plus subcategory, or only a root category?
4. Is 60-second staleness acceptable, or is a publish webhook required?
5. Which analytics tool will read consultation clicks, and who owns the dashboard?
6. When does full Sanity removal start, and does it cover competitions and student resources in the same migration?
