# Cogito Blog: User Stories and Coverage Audit

Date: 2 November 2026
Sources: `Cogito Blog Section Developer Spec & Site Re-check` (1 Nov 2026), `Cogito Article Anatomy`, `docs/plans/active/BILINGUAL-BLOG.md`, the app and marketing code, and a browser walkthrough of the running admin and public sites.

> Status note: this report describes the pre-fix state. A gap-fix wave landed later on 2 November 2026. See `output/blog-gap-fix-summary.md` for the changes and remaining open items.

## Verdict

96 user stories were derived from the spec. Against the implementation plan scope, 37 pass, 27 are partial, 27 fail, 3 are explicitly deferred, and 2 could not be verified in this environment.

The app data model, publish gate, slug lock, bilingual lifecycle, public DTO, and sitemap builder are solid. The public delivery path and the editorial workflow are not complete.

The five blockers that matter most before launch:

1. The marketing client calls `/rpc/public-content/blog/*`, but the live oRPC path is `/rpc/publicContent/blog/*`. Every marketing blog request returns 404, so the blog home renders an error state and `blog-sitemap.xml` returns 503.
2. Unknown marketing paths, including `/id/blog/xyz`, render the 404 page with HTTP status 200. That fails the "real 404" acceptance check and risks a soft-404 index.
3. The article page has no conversion block and no related-article block. The admin cannot choose related articles, and the public API never auto-fills them.
4. The admin cannot author category introductions, F.A.Q. entries, related articles, or gallery alt text. Gallery upload is therefore a publish trap: the publish gate requires gallery alt text that the UI cannot provide.
5. The admin list's language filter is ignored unless a status filter is also set. The publish error toast does not list missing fields, and the API envelope does not carry the field list either.

## Scope lens

The plan deliberately defers student stories, public tutor profiles, program pages, tag pages, RSS, pagination UI, and custom analytics. Those items are marked `DEFERRED`, not `FAIL`, when the plan explicitly excludes them. Items the plan claims to deliver but does not are marked `FAIL`.

Status meanings:

- `PASS`: implemented and observed working.
- `PARTIAL`: implemented, but a material requirement or edge case is missing.
- `FAIL`: missing or broken for a requirement that is in plan scope.
- `DEFERRED`: explicitly outside the current plan.
- `UNVERIFIED`: not testable in this environment.

## Actors

- Visitor: reads the blog in Indonesian or English.
- Search crawler: needs indexable HTML, canonical, hreflang, structured data, sitemap, and real status codes.
- Editor: writes drafts and translations in the admin.
- Reviewer: checks facts, byline, and publish readiness.
- Marketer: relies on cards, CTA, internal links, and sharing previews.
- Operator: runs migrations, seed, deploy, rollback, and monitoring.

## A. Public discovery

### A1. Resources menu entry

Story: As a visitor, I want Blog first in the Sumber menu, so that I can find it from any public page.

Positive: Blog appears first in both desktop and mobile Resources menus and is a real anchor.

Negative/edge: If the menu is client-rendered only, a crawler may miss it. The current menu renders anchors in the HTML.

Status: PASS. Evidence: `/id/blog` and `/id` both expose the Sumber menu with a Blog link.

### A2. Blog home in both languages

Story: As a visitor, I want `/id/blog` and `/en/blog` to open in my language, so that I can browse without switching after load.

Positive: Both return 200, have one H1, localized intro, localized cards, and the correct `<html lang>`.

Negative/edge: A locale outside `id` and `en` must not render the blog. The route guards this.

Status: PASS.

### A3. Newest-first article cards

Story: As a visitor, I want the newest published articles first, so that I see current content.

Positive: Cards are ordered by `publishedAt` descending and show category, title, excerpt, date, reading time, and tutor name.

Negative/edge: Unpublished, archived, and sibling-locale-only articles must not appear. They are filtered. The card is 16:9, not the specified 4:3; the card title is H3, not H2; and the tutor photo is missing.

Status: PARTIAL.

### A4. Homepage newest-article strip

Story: As a visitor, I want the three newest articles on the homepage, so that the blog gets internal links from the highest-authority page.

Positive: None.

Negative/edge: When the public API fails, the strip must disappear rather than show an empty section.

Status: FAIL. The homepage has no blog reference at all.

### A5. Article placement on tutor, program, and event pages

Story: As a visitor, I want relevant articles on tutor, program, and event pages, so that I can continue reading in context.

Positive: None.

Negative/edge: A tutor without a profile page cannot host an article list. An event recap needs a link only after the event ends.

Status: DEFERRED. Public tutor profiles, program pages, and event recap linkage are plan non-goals or not implemented.

### A6. Article-to-article language switch

Story: As a reader, I want EN/ID on an article to open the sibling article, so that I do not lose context.

Positive: The header switch and the inline "Baca dalam bahasa Inggris" link both point to the sibling slug. When the sibling is unpublished, both are hidden.

Negative/edge: The switch must never fall back to the other blog home.

Status: PASS. Verified on `/id/blog/e2e-blog-audit` and `/en/blog/e2e-blog-audit-en` during the walkthrough.

### A7. No automatic language redirect

Story: As a reader, I want the site to respect my chosen language, so that I am not redirected by IP or browser settings.

Positive: No redirect is performed. The article offers a link instead.

Negative/edge: The spec asks for a small banner ("Read this in English"), not only an inline link in the byline row.

Status: PARTIAL.

### A8. Mobile navigation and public route behavior

Story: As a mobile visitor, I want the same navigation and a useful not-found page.

Positive: Mobile Resources includes Blog. The 404 page renders a localized message and a home link.

Negative/edge: The 404 page returns HTTP 200, so crawlers and link checkers do not see a real 404.

Status: PARTIAL.

## B. Blog home and category hubs

### B1. One H1 and localized introduction

Story: As a visitor or crawler, I want one descriptive H1 and an introduction per locale.

Positive: Both blog homes have one H1 and one intro paragraph. They differ by locale.

Negative/edge: The H1 is not the suggested "Blog Cogito: Cerita Juara & Panduan Lomba" text. That is an editorial choice, not a bug.

Status: PASS.

### B2. Article card anatomy

Story: As a visitor, I want each card to tell me what the article is and who wrote it.

Positive: Category, title, excerpt, date, reading time, and tutor name are present. The whole card is one link. No nested links.

Negative/edge: Required 4:3 hero is 16:9. Required H2 card title is H3. The featured tutor photo is absent. The excerpt uses up to three lines, not one.

Status: PARTIAL.

### B3. Category navigation on the blog home

Story: As a visitor, I want to browse categories from the blog home.

Positive: None.

Negative/edge: Category links must remain real links, not a client-side filter.

Status: FAIL. The blog home has no category strip or category links.

### B4. Pagination

Story: As a visitor, I want to reach older articles.

Positive: The public API supports a cursor, and `nextCursor` is returned.

Negative/edge: The marketing page ignores `nextCursor`. There is no `?page=2`, no "load more" with real links, and no page size control.

Status: FAIL. Only the first 12 articles are reachable.

### B5. Category hub content

Story: As a visitor, I want a category hub with its own H1, introduction, and article count.

Positive: H1 and article count render. The hub lists articles from the category and its subcategories.

Negative/edge: The intro is always null because the admin cannot enter one. The 150-300 word introduction required for indexability is therefore absent. The count is the number of visible cards, not the CMS category count, and is capped by the 24-item list.

Status: PARTIAL.

### B6. Hub thin-content rule and locale pairing

Story: As a crawler, I want thin hubs excluded and mixed locale/segment pairs rejected.

Positive: A hub with fewer than two published articles calls `notFound()`. `/id/blog/category/...` and `/en/blog/kategori/...` are rejected.

Negative/edge: Both cases still return HTTP 200 with a not-found body in local Next dev. The locale/segment guard is correct at the routing level, but the status code is wrong.

Status: PARTIAL.

### B7. Subcategory hubs

Story: As a visitor, I want subcategory hubs such as Cerita Tutor and Tutor Stories.

Positive: The same route handles subcategory slugs, and the list filters by root or subcategory slug.

Negative/edge: Subcategory article counts are always zero because the public category query only counts root-category assignments. Articles beyond the newest 24 in a locale can be missing. A subcategory with fewer than two visible articles returns not-found.

Status: PARTIAL.

### B8. Empty and API-failure states

Story: As a visitor, I want a clear state when there are no articles or the API is down.

Positive: The blog home has a localized empty state and a retry state. The article page has a retry state.

Negative/edge: On API failure the blog home returns HTTP 200 and is indexable. That is a soft-404. The article failure page is marked `noindex` in metadata, but still returns 200.

Status: FAIL.

## C. Article page

### C1. Breadcrumb, labels, and one H1

Story: As a visitor, I want to know where I am and what the article is about.

Positive: Breadcrumb Blog / Category, category and subcategory labels, and one H1 are present.

Negative/edge: The breadcrumb does not include the article itself. That matches the visual spec but not a full BreadcrumbList trail. JSON-LD does include the article.

Status: PASS.

### C2. Lead, byline, reviewer, dates, and reading time

Story: As a reader, I want to know who wrote and reviewed the article and when.

Positive: Lead, "Ditulis oleh Tim Cogito Academy bersama Kak ...", optional reviewer, published date, conditional updated date, and reading time are present. The strings are localized.

Negative/edge: Byline names do not link to tutor profiles because public profiles do not exist. The plan accepts text-only bylines. The updated date comparison is string equality; a save that changes only metadata still shows an updated date, which is acceptable.

Status: PASS.

### C3. Key facts table

Story: As a reader, I want the key facts in a scannable two-column table.

Positive: Key facts render and are visible.

Negative/edge: The data model stores only `{ text }`, so label/value pairs cannot be represented. The page renders a bullet list, not a two-column table. The admin prompt is "one per line", reinforcing the wrong shape.

Status: FAIL.

### C4. Table of contents

Story: As a reader, I want a TOC generated from H2 headings, collapsed on mobile.

Positive: H2 headings are collected. Desktop has a sticky TOC; mobile has a collapsed `<details>`.

Negative/edge: Anchor IDs are `section-0`, `section-1`, not readable IDs such as `#pelajaran-1`. The mobile and desktop TOCs duplicate the same links. There is no `aria-expanded` state beyond native `<details>`.

Status: PARTIAL.

### C5. Rich body blocks

Story: As an editor, I want headings, paragraphs, lists, quotes, links, images, and callouts.

Positive: H2, H3, paragraphs, ordered and unordered lists, quotes with attribution, callouts, links, and images render from structured JSON.

Negative/edge: The spec allows tables; the block contract has no table block. There is no enforcement of "one callout per lesson". The body editor has no table control. Links are HTTP(S)-only and rejected at write time.

Status: PARTIAL.

### C6. Body images and gallery

Story: As a reader, I want captioned images with useful alt text.

Positive: Body images render with width, height, alt, and optional caption. The publish gate requires body image alt text. The gallery renders in a grid.

Negative/edge: Gallery alt text has no admin control. Any gallery image therefore blocks publishing with `galleryAltId` or `galleryAltEn`, and the editor cannot fix it. Hero images use one stored crop, not 16:9, 4:3, and 1:1 derivatives.

Status: PARTIAL.

### C7. Instagram and TikTok embeds

Story: As a reader, I want a fast, privacy-respecting social embed.

Positive: A facade loads first. The provider iframe mounts only after a click. A plain outbound link and a privacy note are present. No provider script runs on page load.

Negative/edge: The editor cannot attach a poster image, so the facade always uses a branded gradient. There is no transcript or `VideoObject`. There is no CSP allowlist because no CSP exists.

Status: PARTIAL.

### C8. F.A.Q.

Story: As a reader, I want questions and answers visible in the page HTML.

Positive: F.A.Q. items render as native `<details>` with visible question and answer text. The content is in the server HTML.

Negative/edge: The admin has no F.A.Q. editor, so this block is only reachable through the API. F.A.Q. rich-result markup is optional and not emitted, which matches the spec.

Status: PASS for rendering. The authoring path is covered by E16 and fails.

### C9. Conversion block

Story: As a reader, I want a relevant next step: the featured tutor's card or the related program, plus WhatsApp consultation.

Positive: None on the article body.

Negative/edge: For student stories the program card is required. For tutor stories the tutor card is required. A sticky bar alone cannot carry this block.

Status: FAIL. The article page has no CTA section, no featured tutor card, no program card, and no WhatsApp button outside the scroll-triggered sticky component.

### C10. Related articles

Story: As a reader, I want three related articles so I can continue reading.

Positive: The public DTO supports `related` and preserves the CMS order.

Negative/edge: There is no admin control to choose related articles. When empty, the service does not fall back to the newest same-subcategory articles. Related is always empty in practice.

Status: FAIL.

### C11. Sticky consultation

Story: As a mobile reader, I want a small consultation prompt after 50 percent scroll.

Positive: A dismissible fixed card appears after 50 percent scroll and hides near the end of the page so it does not cover the final block.

Negative/edge: On short articles it never appears because the page is already "near end". It is not restricted to mobile. There is no analytics event.

Status: PARTIAL.

### C12. Open Graph and JSON-LD

Story: As a sharer and crawler, I want the article's own title, description, image, and structured data.

Positive: `og:title`, `og:description`, `og:url`, and a generated 1200x630 `og:image` are present. `BlogPosting` and `BreadcrumbList` are emitted. The title, description, dates, locale, publisher, and breadcrumb are correct.

Negative/edge: `BlogPosting.image` has one hero entry, not three crops. `author` is always Organization, with no Person URL. `about` is missing. In local dev, the generated `og:image` URL uses the request host (`localhost:2001`), not the canonical www host. Production must be checked separately.

Status: PARTIAL.

### C13. Unknown article returns 404

Story: As a crawler, I want a made-up blog slug to return HTTP 404.

Positive: The 404 page body renders.

Negative/edge: The response status is 200. The same happens for `/id/xyz`. This fails the explicit acceptance check.

Status: FAIL.

### C14. Full body in the HTML source

Story: As a crawler, I want the full article text in the initial HTML.

Positive: The page is server-rendered. The body, F.A.Q., key facts, and gallery are in the HTML. No client fetch is required for the article.

Status: PASS.

## D. Bilingual and technical SEO

### D1. One record, two language versions

Story: As an editor, I want shared fields entered once and separate language fields.

Positive: `blog_article` stores shared fields; `blog_article_version` stores one row per locale. A unique constraint enforces one row per article and locale.

Status: PASS.

### D2. Own slug, title, and keywords per language

Story: As an editor, I want each language to have its own search intent.

Positive: Slug, title, SEO title, meta description, lead, main keyword, secondary keywords, key facts, body, F.A.Q., and hero alt are per version.

Negative/edge: The English version is a separate body, not a machine translation. That matches the spec.

Status: PASS.

### D3. Independent publication

Story: As an editor, I want to publish Indonesian without publishing English.

Positive: Publishing and unpublishing operate on one version. The integration test and the live walkthrough both confirm independent state.

Status: PASS.

### D4. Canonical, hreflang, and x-default

Story: As a crawler, I want each version to point to itself and to its published sibling.

Positive: Each version has a self canonical, self hreflang, sibling hreflang only when the sibling is published, and an `x-default` that points to the Indonesian sibling.

Negative/edge: The spec says `x-default` should point to English. The plan explicitly chooses Indonesian to match `defaultLocale: 'id'`. This is a deliberate deviation and should be recorded as such, not silently treated as a bug.

Status: PARTIAL.

### D5. One language per page and correct `<html lang>`

Story: As a crawler, I want one language per page.

Positive: `<html lang="id">` and `<html lang="en">` are correct. There are no side-by-side translations.

Status: PASS.

### D6. Single-version behavior

Story: As an editor, I want to publish one version alone without a broken sibling link.

Positive: The single version has `alternate: null`, no sibling hreflang, no `x-default`, and no language switch. Verified by unpublishing English and re-reading the Indonesian article.

Status: PASS.

### D7. Slug rules and immutability

Story: As an operator, I want stable URLs.

Positive: Slugs are lowercase, hyphenated, unique per locale, and locked after first publish. The server returns `SLUG_IMMUTABLE` on a rename attempt. The UI disables the slug field after publish. Duplicate slugs are rejected.

Negative/edge: The plan has no automatic 301 redirect for a forced slug change. That is accepted because the server forbids the change.

Status: PASS.

### D8. Blog sitemap

Story: As a crawler, I want one entry per published version with alternates and a real lastmod.

Positive: `/blog-sitemap.xml` lists each published version, `xhtml:link` alternates for published pairs, and `lastmod` from `updatedAt`. It is listed in `robots.txt`.

Negative/edge: The sitemap returns 503 whenever the public API fails. Because the marketing client currently uses the wrong path, that is the normal state in the deployed configuration.

Status: PASS for the builder; the runtime path bug is reported under D12.

### D9. Host, titles, and homepage H1

Story: As a crawler, I want one canonical host and page-specific titles.

Positive: Canonical and `og:url` use `https://www.cogitoacademy.id`. The apex host returns 308 to www with path and query preserved. The homepage has one H1, a page-specific title, and the "transformation" typo is fixed. `/_next/` is not blocked in robots.

Status: PASS.

### D10. Pagination on the public site

Story: As a crawler, I want plain `?page=` links.

Positive: The API supports a cursor.

Negative/edge: The marketing site has no pagination UI and no page links. The cursor is ignored.

Status: FAIL.

### D11. Tags and RSS

Story: As a publisher, I want tag pages with `noindex` until five articles and RSS feeds per locale.

Positive: None.

Negative/edge: Tag pages must not be indexed while thin. RSS should exist at `/id/blog/rss.xml` and `/en/blog/rss.xml`.

Status: DEFERRED. The plan lists tag pages and RSS as non-goals.

### D12. Public API cache headers and rate limits

Story: As an operator, I want bounded public traffic and cacheable responses.

Positive: The rate-limit table defines `publicBlog` and `blogSitemap` budgets. The marketing fetch uses a 60-second revalidation window.

Negative/edge: The rate-limit path matcher looks for `/rpc/public-content/blog/`, but the live path is `/rpc/publicContent/blog/`, so the blog budget never applies. Public responses have no `Cache-Control: public, s-maxage=60` header.

Status: FAIL.

### D13. Core Web Vitals

Story: As a visitor, I want a fast article page.

Positive: Hero uses `priority`, other images use `next/image` with `sizes`, body images reserve space, and embeds are click-to-load.

Negative/edge: No PageSpeed or Lighthouse run was possible here. LCP, INP, and CLS are unverified.

Status: UNVERIFIED.

## E. Admin authoring

### E1. Admin-only access

Story: As an operator, I want only admins to open the blog studio.

Positive: Both routes redirect non-admins to `/dashboard`. A student session receives HTTP 403 from `adminBlog.list`. The API uses `adminProcedure`.

Status: PASS.

### E2. Article list and status filter

Story: As an editor, I want to see every article and filter by status.

Positive: The list shows ID and EN status, category, title, and updated date. The status filter works.

Negative/edge: The table has no pagination and no category filter. It caps at 50 rows.

Status: PASS for the core list and status filter.

### E3. Language filter

Story: As an editor, I want to filter to articles that have an English version.

Positive: The filter control exists.

Negative/edge: The repository only applies `locale` when `status` is also set. Selecting Language = English with Status = All returns every article, including ID-only drafts.

Status: FAIL. Reproduced through the API: `{ locale: "en" }` returned ID-only rows.

### E4. List pagination

Story: As an editor, I want to reach older articles.

Positive: The API returns `nextCursor`.

Negative/edge: The UI ignores it and requests `limit: 50`. Article 51 and later are unreachable.

Status: FAIL.

### E5. Create an uncategorized draft

Story: As an editor, I want to start writing before choosing taxonomy.

Positive: New draft creates an article immediately and opens the editor. Publishing later requires a category.

Status: PASS.

### E6. Category create, edit, search, and delete in the UI

Story: As an editor, I want to manage the taxonomy.

Positive: Root and subcategory creation, search, expandable groups, edit, delete confirmation, and delete blocking for categories with articles or children all work.

Negative/edge: No drag-and-drop or reorder control. No intro field. No active toggle in the drawer; editing preserves the existing active state.

Status: PARTIAL.

### E7. Category introduction and ordering

Story: As an editor, I want a 150-300 word hub intro and a display order.

Positive: The API accepts `introId`, `introEn`, and `reorder`.

Negative/edge: The UI exposes neither. Every seeded hub has a null intro. The public hub is therefore thin even when it has two articles.

Status: FAIL.

### E8. Category nesting and deletion rules

Story: As an editor, I want one level of nesting and safe deletion.

Positive: The service rejects a third level on create and update. Delete is blocked while children or any article reference exist. Deactivation is blocked while a published article uses the category. Foreign keys guard concurrent references.

Negative/edge: The UI disables moving a parent with children, but the API does not re-check existing children. A direct API call can move a parent under another root and create a second level.

Status: PARTIAL.

### E9. Shared article fields

Story: As an editor, I want category, subcategory, people, hero, gallery, related, and internal notes.

Positive: Category, subcategory, tutor or manual name, reviewer or manual name, hero, gallery upload, and internal notes are present. The service validates that the subcategory belongs to the selected category.

Negative/edge: There is no related-article control. Internal notes are correctly excluded from public output.

Status: PASS.

### E10. Per-language fields

Story: As an editor, I want every language field to be authored separately.

Positive: Title, SEO title, slug, meta description, lead, main and secondary keywords, key facts, body, F.A.Q., and hero alt are per locale. Dates and status are per version.

Status: PASS.

### E11. Paired translation workflow and save

Story: As an editor, I want Indonesian first and an optional English field beside it.

Positive: Each field is paired vertically. English appears only when opened or already authored. Save writes both authored language drafts. Publication remains independent.

Negative/edge: A single global "Save article" saves Indonesian even when the editor is focused on English. That is acceptable but should be explicit in the UI.

Status: PASS.

### E12. SEO controls and defaults

Story: As an editor, I want enforced SEO limits and safe defaults.

Positive: SEO title is capped at 60, meta description at 155. The UI falls back to the title for SEO title and derives a slug from the title. The slug field locks after publish.

Negative/edge: No character counters, no canonical preview, no SERP preview. The effective page title adds the site suffix, so the rendered title can exceed 60 characters even when the field is at the limit.

Status: PARTIAL.

### E13. Rich body editor

Story: As an editor, I want a constrained editor that cannot emit raw HTML.

Positive: TipTap supports H2, H3, bold, italic, links, lists, quotes with attribution, callouts, images with alt and caption, and Instagram/TikTok embeds. It serializes to the validated JSON block contract. Raw HTML is not stored.

Negative/edge: No table block. No embed poster control. An image with empty alt is accepted into the document and rejected only on save with a generic error. There is no visible block-limit counter.

Status: PARTIAL.

### E14. Image upload and normalization

Story: As an editor, I want large phone photos to become safe WebP uploads.

Positive: The browser decodes, resizes the long edge to 2000 px, re-encodes as WebP at 0.82 quality, strips EXIF including GPS, and sends width, height, and byte size. The signed upload flow is reused.

Negative/edge: There is no post-normalization 5 MiB check in the client; the upload path enforces the hard limit. There is no test for the normalizer.

Status: PASS for the main flow.

### E15. Gallery alt text

Story: As an editor, I want to add gallery images and describe them per language.

Positive: Gallery images can be uploaded and the public page renders them.

Negative/edge: The UI has no alt fields. `replaceGallery` always sends `altId: null` and `altEn: null`. The publish gate then blocks the article. A gallery image cannot be published through the UI.

Status: FAIL.

### E16. F.A.Q. editor

Story: As an editor, I want to add three or four question and answer pairs per language.

Positive: The API and public renderer support F.A.Q.

Negative/edge: The admin has no F.A.Q. control at all.

Status: FAIL.

### E17. Related-article editor and fallback

Story: As an editor, I want to choose up to three related articles, with a same-subcategory fallback.

Positive: The API supports up to three unique IDs.

Negative/edge: The admin has no control. The service does not auto-fill. Related is always empty in practice.

Status: FAIL.

### E18. People and byline

Story: As an editor, I want to link a tutor or enter a manual name.

Positive: Featured tutor and reviewer can be selected from `tutor_profile` or entered manually. The public byline uses the linked tutor name first, then the manual name. Student stories can ship without a student entity.

Negative/edge: Conditional rules are not enforced: a guide can publish without a reviewer and a story can publish without a featured person.

Status: PASS for the field and byline behavior. The conditional rule is reported under F7.

### E19. Unsaved-changes guard

Story: As an editor, I want a warning before leaving unsaved work.

Positive: A navigation blocker and a discard dialog exist. The browser `beforeunload` prompt covers refresh and tab close. Archive has its own confirmation.

Negative/edge: Opening an unedited article already shows "Unsaved changes" and triggers the blocker. The cause is a hydration or editor-normalization mismatch. This creates a false positive on every read-only visit.

Status: PARTIAL.

### E20. Concurrent edits

Story: As an editor, I want the server to reject a stale save instead of overwriting another editor.

Positive: Article and version updates use compare-and-swap with `expectedVersion`. The server returns 409 on a mismatch.

Negative/edge: The wire response does not include the current version or a field-level diff, and the UI shows only a generic toast. Recovery requires a manual reload.

Status: PARTIAL.

### E21. Preview, canonical URL, and character counts

Story: As an editor, I want to see the page I am about to publish.

Positive: The admin can view the saved draft form.

Negative/edge: There is no public or draft preview, no canonical URL display, and no character counters. The marketer cannot confirm the final page before publishing.

Status: FAIL.

### E22. Publish and unpublish confirmations

Story: As an editor, I want a confirmation that names the locale and URL, and an unpublish warning about the sibling page.

Positive: Archive has a confirmation.

Negative/edge: Publish acts immediately. Unpublish acts immediately. Neither names the locale, URL, or the two-minute sibling effect.

Status: FAIL.

### E23. Review status and readiness

Story: As a reviewer, I want an "in review" state and a "ready to publish" checkbox.

Positive: The database enum includes `in_review`. The list filter exposes it.

Negative/edge: No API transition sets `in_review`. There is no readiness checkbox. The publish button is always enabled and relies on a server rejection. The status filter can never find an in-review article.

Status: FAIL.

### E24. Archive

Story: As an admin, I want to archive an article and stop all public serving.

Positive: Archive stamps `archivedAt`, sets both versions to `archived`, blocks edits, and removes the article from public reads. The action is confirmed.

Status: PASS.

## F. Publishing rules

### F1. Publish gate

Story: As an operator, I want incomplete articles blocked.

Positive: Publish requires title, SEO title, slug, meta description, lead, non-empty body, category, hero image, hero alt, at least one key fact, and locale alt text for every gallery image. The server remains authoritative.

Negative/edge: The gate is stricter than the spec for key facts (all articles, not only stories), but that is a safe choice.

Status: PASS.

### F2. Missing-field error payload

Story: As an editor, I want the error to list every missing field.

Positive: The service builds a `missingFields` array.

Negative/edge: The oRPC error factory puts the cause in `cause`, not in serialized `data`. The client receives only "Complete the required fields before publishing." The UI toast shows no list. This fails the plan's structured-error requirement.

Status: FAIL.

### F3. Slug lock and duplicate slug

Story: As an operator, I want published URLs to stay stable and slugs to remain unique.

Positive: A published slug cannot change. A duplicate slug in the same locale returns 409. Both the UI and the service enforce the lock.

Status: PASS.

### F4. Version conflict

Story: As an editor, I want a clear conflict response.

Positive: The server returns 409 and does not overwrite.

Negative/edge: The response has no actual version, no changed-field summary, and the UI does not refresh or offer a merge.

Status: PARTIAL.

### F5. Unpublish

Story: As an editor, I want unpublish to remove the page, sitemap entry, and sibling alternate.

Positive: Unpublish sets the version to draft, removes it from public reads, removes the sitemap entry, and clears the sibling alternate. Verified live.

Status: PASS.

### F6. Archive public effect

Story: As an operator, I want archiving to remove both language versions.

Positive: The repository marks both versions archived; public queries exclude archived articles; edits are rejected. Covered by integration tests and service code.

Status: PASS.

### F7. Story and guide conditions

Story: As an editor, I want stories to require a featured person and guides to require a reviewer.

Positive: Both fields exist.

Negative/edge: Neither condition is enforced. The category tree has no article-type flag.

Status: PARTIAL.

### F8. Consent for student stories

Story: As a publisher, I want parent consent recorded before a student story can publish.

Positive: None.

Negative/edge: A checkbox is not consent. The plan explicitly avoids student stories until a legal process exists.

Status: DEFERRED.

### F9. Related program

Story: As a marketer, I want every article linked to a related program or competition.

Positive: None.

Negative/edge: Without a related program, the CTA block cannot be built and the reader has no program path.

Status: FAIL.

## G. Media

### G1. Normalize, resize, and strip EXIF

Story: As an editor, I want phone photos to be safe and fast.

Positive: Browser-side decode, 2000 px long edge, WebP 0.82, EXIF strip, and dimension capture are implemented.

Status: PASS.

### G2. Five MiB limit

Story: As an operator, I want uploads bounded.

Positive: `blog_media` and the signed upload enforce 5 MiB. The API input also caps `byteSize`.

Negative/edge: The client does not re-check the normalized size before signing. A pathological image fails later in the upload.

Status: PARTIAL.

### G3. Ownership and content-type allowlist

Story: As an operator, I want an admin to register only their own image.

Positive: The storage key must start with the session user ID. Another admin's key is rejected. Content type must be PNG, JPEG, WebP, or GIF. Path traversal is rejected.

Status: PASS.

### G4. Dimensions and ratio

Story: As an operator, I want nonsense dimensions rejected.

Positive: Width and height must both be present or both absent, positive, and at most 20000.

Negative/edge: The plan requires the ratio to match the decoded image within 1 percent. The server does not decode the image, so it cannot validate the ratio. A client can send any consistent pair.

Status: FAIL.

### G5. Public media projection

Story: As a crawler, I want public image URLs without storage keys.

Positive: Public DTOs expose `url`, `width`, `height`, `alt`, `filename`, `contentType`, and `byteSize`. Storage keys never leave the server.

Status: PASS.

### G6. AVIF and embed posters

Story: As a performance owner, I want AVIF support and a poster for social embeds.

Positive: WebP delivery works. The embed renderer supports a poster if one is present in the data.

Negative/edge: The content-type allowlist has no AVIF. The editor cannot attach a poster, so the poster path is never populated.

Status: PARTIAL.

## H. Categories and data integrity

### H1. Seed taxonomy

Story: As an editor, I want the four categories and seventeen subcategories from the spec.

Positive: The seed creates four roots and seventeen subcategories with stable IDs and idempotent inserts. Renamed titles and slugs are preserved.

Negative/edge: The local database also contains an extra "Pablo/Pabla" category from testing. That is data, not a seed defect.

Status: PASS.

### H2. Exactly two locales

Story: As an operator, I want at most one version per language.

Positive: `(articleId, locale)` is unique and the locale check accepts only `id` and `en`.

Status: PASS.

### H3. Category and subcategory referential integrity

Story: As an editor, I want a subcategory that belongs to the chosen root.

Positive: The service validates the parent-child relationship on create and update. The database uses restrictive foreign keys.

Status: PASS.

### H4. Public projection filters

Story: As a visitor, I should never see drafts, internal notes, or archived content.

Positive: Public queries filter `status = 'published'` and `archivedAt IS NULL`. The DTO excludes internal notes, creator IDs, storage keys, and tutor private fields.

Status: PASS.

### H5. Input validation and XSS

Story: As an operator, I want structured content only.

Positive: Links must be HTTP(S). `javascript:` links are rejected. Embed hosts and path shapes are validated. Unknown block types and unknown keys are rejected. React renders blocks without `dangerouslySetInnerHTML`.

Negative/edge: Instagram URLs with query strings are accepted and silently normalized, although the spec says query strings and fragments must be rejected. The embed URL is data, not markup, so this is not XSS.

Status: PARTIAL.

### H6. Audit log

Story: As an operator, I want publish, unpublish, archive, and media registration recorded.

Positive: Those four actions write an audit record with actor, target, and before/after status.

Negative/edge: Save, update, category changes, and related/gallery replacement are not audited.

Status: PARTIAL.

## I. Testing, operations, and content

### I1. Migration and rollback

Story: As an operator, I want an additive migration and a tested rollback.

Positive: Migration 0086 creates the six tables; 0087 and 0088 add the nullable category and manual-name fields. The tables exist in the local database.

Negative/edge: No dump-and-restore rollback was exercised in this audit. The plan requires it.

Status: PARTIAL.

### I2. Unit and marketing tests

Story: As a maintainer, I want fast tests around the contract.

Positive: 67 blog unit tests pass. 10 marketing API and metadata tests pass.

Status: PASS. Evidence: `bun test` on the five blog unit files and the two marketing test files.

### I3. Integration tests

Story: As a maintainer, I want the full publish, unpublish, archive, and media-ownership flow tested against PostgreSQL.

Positive: The integration suite exists and covers the main lifecycle.

Negative/edge: The test database at port 6769 was not running, so the suite could not be executed in this environment. The plan reports it as passing after applying 0085.

Status: UNVERIFIED.

### I4. Admin browser E2E

Story: As a maintainer, I want a browser test for the full admin flow.

Positive: The plan specifies `packages/e2e/src/specs/blog-admin.spec.ts`.

Negative/edge: The file does not exist. There is no browser regression for the editor, publish gate, or non-admin guard.

Status: FAIL.

### I5. Editorial rulebook

Story: As an editor, I want the house rules, keyword bank, and publish checklist.

Positive: The plan requires `docs/BLOG-EDITORIAL.md`.

Negative/edge: The file does not exist.

Status: FAIL.

### I6. Documentation accuracy

Story: As a developer, I want docs that match the wire contract.

Positive: The blog module, data ownership, and public DTO are documented.

Negative/edge: `docs/API-REFERENCE.md` uses `/rpc/public-content/blog/*`, which is 404. It says publish errors include a missing-field list, which the wire does not. It says public blog rate limits apply, which the path mismatch prevents. `cogito-acad/README.md` repeats the wrong endpoint behavior.

Status: FAIL.

### I7. Content pilot

Story: As a marketer, I want the Kak Gita article in Indonesian and English.

Positive: The data model and renderer can hold it.

Negative/edge: The pilot content is not in the repository or the database. The only local article is a draft named "sa".

Status: FAIL.

### I8. Monitoring, deploy order, and launch checklist

Story: As an operator, I want a safe rollout and a measured launch.

Positive: The runbook describes deploy order, ISR freshness, and rollback. Sitemap failures are logged.

Negative/edge: There is no warning when a published version has no sibling for more than seven days. There is no dashboard or alert for public blog error rate or rate-limit rejections. The acceptance checklist has multiple failing items and no executed result table.

Status: FAIL.

## Coverage summary

| Epic | Stories | Pass | Partial | Fail | Deferred | Unverified |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A. Public discovery | 8 | 3 | 3 | 1 | 1 | 0 |
| B. Blog home and hubs | 8 | 1 | 4 | 3 | 0 | 0 |
| C. Article page | 14 | 4 | 6 | 4 | 0 | 0 |
| D. Bilingual and technical SEO | 13 | 8 | 1 | 2 | 1 | 1 |
| E. Admin authoring | 24 | 9 | 6 | 9 | 0 | 0 |
| F. Publishing rules | 9 | 4 | 2 | 2 | 1 | 0 |
| G. Media | 6 | 3 | 2 | 1 | 0 | 0 |
| H. Categories and integrity | 6 | 4 | 2 | 0 | 0 | 0 |
| I. Testing and operations | 8 | 1 | 1 | 5 | 0 | 1 |
| **Total** | **96** | **37** | **27** | **27** | **3** | **2** |

## Defects and gaps by priority

### P0. Launch blockers

1. Marketing blog API path is wrong.
   - Marketing: `/rpc/public-content/blog/list`.
   - Live oRPC: `/rpc/publicContent/blog/list`.
   - Observed: marketing returns 404; blog home shows "Articles could not be loaded"; `blog-sitemap.xml` returns 503.
   - Expected: one path, used by the Zod client, rate-limit matcher, docs, and tests.

2. Public 404s return HTTP 200.
   - `/id/blog/xyz`, `/id/xyz`, `/id/blog/kategori/...` with too few articles, and mixed locale/segment pairs all render a not-found body with status 200.
   - Expected: HTTP 404 for unknown routes, unknown articles, and thin hubs.

3. No article CTA block.
   - No featured tutor card, no program card, no WhatsApp consultation button in the article body.
   - Expected: the block described in the spec, with the sticky bar as a supplement only.

4. No related articles.
   - No admin control and no same-subcategory fallback.
   - Expected: up to three chosen articles, or the newest from the same subcategory.

5. Gallery alt text cannot be authored.
   - The upload adds `altId: null` and `altEn: null`; the publish gate rejects the article.
   - Expected: per-locale alt inputs, or block gallery upload until they exist.

### P1. Editorial and SEO gaps

6. Category intro cannot be authored, so every hub is thin.
7. F.A.Q. cannot be authored in the admin.
8. Publish error does not expose the missing-field list on the wire or in the toast.
9. Language filter is ignored unless status is also set.
10. Opening an unedited article shows "Unsaved changes".
11. No homepage newest-article strip.
12. No blog pagination on the home or hubs.
13. No category navigation on the blog home.
14. Article card uses 16:9 and H3, not 4:3 and H2.
15. TOC anchors are `#section-N`, not readable IDs.
16. Key facts render as a list, not a two-column table.
17. No `in_review` transition and no ready-to-publish checkbox.
18. No publish or unpublish confirmation naming locale, URL, or sibling effect.
19. No preview, canonical URL, or character counters.
20. No RSS.
21. No analytics events for consultation, tutor-profile, or program clicks.
22. Blog home API failure returns an indexable 200 soft-404.

### P2. Hardening and operations

23. Rate-limit path matcher uses the wrong path, so blog budgets never apply.
24. Public blog responses lack cache headers.
25. Embed query strings are normalized instead of rejected.
26. Category update does not re-check existing children, so the one-level invariant can be bypassed through the API.
27. Media ratio is not validated within the 1 percent tolerance.
28. Integration test could not run because the test database was unavailable.
29. No admin E2E spec.
30. No editorial rulebook.
31. No content pilot.
32. Docs repeat the wrong endpoint, the missing-field claim, and the rate-limit claim.
33. Local `.env.local` lacks `NEXT_PUBLIC_R2_HOST`; without it, `next/image` rejects blog images.

## Walkthrough evidence

Environment: local app at `http://localhost:3003` with a fresh API at `http://localhost:3002`, marketing at `http://localhost:2001` with a temporary proxy that only translated the kebab path to the live camel path. The proxy was removed after the check. Test articles were deleted; the original "sa" draft remains.

Admin:

- `/admin-blog` returned the seeded list and category groups.
- `/admin-blog/{id}` opened the editor with ID/EN status, shared fields, paired translation fields, body editor, hero, gallery, and archive.
- Publish with an incomplete article showed "Complete the required fields before publishing." with no field list.
- Opening an unedited article showed "Unsaved changes".
- Language filter with Status = All returned ID-only rows.
- Category drawer had parent, titles, and slugs only.
- No F.A.Q., related, gallery alt, preview, character count, or readiness controls.
- Student session was redirected from `/admin-blog` to `/dashboard` and received 403 from `adminBlog.list`.

Public:

- `/id/blog` and `/en/blog` returned 200, one H1, correct lang, canonical, hreflang, and cards.
- After the temporary path proxy, `/id/blog/e2e-blog-audit` and `/en/blog/e2e-blog-audit-en` rendered the full body, F.A.Q., gallery, TOC, byline, OG tags, `BlogPosting`, and `BreadcrumbList`.
- The language switch opened the sibling article.
- Unpublishing English removed the alternate and the English page.
- `/id/blog/kategori/pablo` rendered two cards; the English hub returned a not-found body because it had one article.
- `/id/blog/xyz` and `/id/xyz` rendered the not-found page with HTTP 200.
- `/blog-sitemap.xml` returned 503 before the temporary proxy and listed both versions with alternates after it.

API:

- `/rpc/publicContent/blog/list` returned 200.
- `/rpc/public-content/blog/list` returned 404.
- `publishVersion` on a complete version returned 200.
- A changed slug after publish returned 409 `CONFLICT`.
- A duplicate slug returned 409 `CONFLICT`.
- `javascript:` link returned 400 `BAD_REQUEST`.
- A fake Instagram host returned 400 `BAD_REQUEST`.
- An Instagram URL with `?utm=1` was accepted and normalized, contrary to the spec.
- `publishVersion` on an incomplete version returned 400 with no serialized `missingFields`.

## Recommended order

1. Fix the marketing endpoint path and make it a single constant shared by the client, rate-limit matcher, docs, and tests.
2. Make unknown routes, unknown articles, and thin hubs return HTTP 404.
3. Add the article CTA block and related-article block.
4. Add gallery alt inputs, F.A.Q. editor, related picker, and category intro editor.
5. Serialize the missing-field list and version-conflict details in the error envelope; show them in the toast.
6. Fix the language filter and the initial unsaved flag.
7. Add homepage strip, category navigation, pagination, and RSS only after the P0 items are stable.
8. Add the admin E2E spec, editorial rulebook, Kak Gita pilot, and a launch checklist result table.
