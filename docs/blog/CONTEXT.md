# Cogito Blog — Context

Audience: human editors, writers, reviewers, and AI agents.
Scope: blog authoring in `cogito-app` and public rendering in `cogito-acad`.
Verified: 7 November 2026 against `packages/api/src/modules/blog/`, `apps/web/src/components/admin/blog/`, and the `cogito-acad` blog routes.

Use this file for shared facts, field limits, workflow, and editorial rules. AI agents that draft or publish posts should also read [`CONTEXT-LLM.md`](./CONTEXT-LLM.md) for the exact output protocol.

The server is the source of truth. If this document and the code disagree, the code wins. Update this document in the same change that alters blog behavior.

## Quick start

1. Open `/admin-blog`. Pick an existing article or create one.
2. Set the category, hero image, gallery, bylines, related articles, and internal notes in the shared panel.
3. Fill the Indonesian tab, then the English tab.
4. Add key facts, FAQ, and alt text for every image.
5. Save each locale. Fix every item in the publish-gate list.
6. Publish each locale separately, then open the public URL.

New editors should read sections 2 to 4, 8, and 9. AI agents should read the whole file, then use [`CONTEXT-LLM.md`](./CONTEXT-LLM.md).

## 1. What the blog is

Cogito Academy publishes bilingual articles for Indonesian parents and students. Articles live in the Cogito app database and render on the public marketing site.

- PostgreSQL is the only content store.
- Sanity is not used for blog content.
- The app is the only write path. Do not edit blog tables directly.
- Each article has one shared record and up to two language versions: Indonesian (`id`) and English (`en`).
- Each language version publishes and unpublishes independently.
- Public pages read published versions only. Drafts, internal notes, and editor identities never reach the public API.

Public URL patterns:

| Page         | Indonesian                 | English                    |
| ------------ | -------------------------- | -------------------------- |
| Blog home    | `/id/blog`                 | `/en/blog`                 |
| Article      | `/id/blog/<slug>`          | `/en/blog/<slug>`          |
| Category hub | `/id/blog/kategori/<slug>` | `/en/blog/category/<slug>` |
| RSS          | `/id/blog/rss.xml`         | `/en/blog/rss.xml`         |

The canonical host is `https://www.cogitoacademy.id`.

## 2. One article, two layers

| Layer            | Stores                                                                                                      | Shared across locales |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | --------------------- |
| Article          | category, subcategory, hero image, gallery, related articles, bylines, internal notes, archive state        | Yes                   |
| Language version | slug, title, SEO fields, lead, keywords, key facts, body, FAQ, hero alt, reading time, status, publish date | No                    |

Consequences:

- Category, hero image, gallery images, related articles, and bylines are shared. Changing them changes both locales.
- Hero alt text is per locale.
- Gallery alt text is per locale, per image.
- Slugs are per locale and may differ.
- Publishing one locale does not publish the other.

## 3. Authoring workflow

1. Confirm the category. Create the category first if it does not exist. An article can use one root category and, optionally, one subcategory that belongs to that root.
2. Open `/admin-blog` and create the article. Choose the category, hero image, byline, related articles, and internal notes.
3. Write the Indonesian version first. Fill every publish field and add body images with alt text.
4. Write the English version as an adaptation of the Indonesian article, not a literal translation. Use the English keyword research, not translated keywords.
5. Upload the hero image and gallery images. Add alt text for each locale.
6. Add key facts and FAQ entries.
7. Review both language tabs in the editor. Check headings, links, images, lists, and embeds.
8. Publish each locale separately. The editor saves the current draft before publishing.
9. Open the public URL. The marketing site revalidates every 60 seconds, so a new publish can take up to about two minutes to appear.

The editor supports per-locale tabs, a shared panel, publish-gate progress, slug lock after first publish, unsaved-change protection, and archive confirmation.

## 4. Fields and limits

### Article fields

| Field              | Required to publish | Limit                                   | Notes                                                                  |
| ------------------ | ------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Category           | Yes                 | Existing active category                | Root category. Publish fails without it.                               |
| Subcategory        | No                  | Existing child of the selected category | One level deep only.                                                   |
| Hero image         | Yes                 | Registered image                        | Shared by both locales.                                                |
| Featured tutor     | No                  | Existing tutor profile or manual name   | Manual name is shared. Does not create a tutor account.                |
| Reviewed by        | No                  | Existing tutor profile or manual name   | Public article prefers the linked reviewer name, then the manual name. |
| Gallery            | No                  | 20 images                               | Each image needs alt text in the locale being published.               |
| Related articles   | No                  | 3                                       | Used by the public article page.                                       |
| Internal notes     | No                  | 5,000 characters                        | Admin only. Never public.                                              |
| Manual byline name | No                  | 200 characters                          | Shared across locales. Only use a real person or team.                 |

### Language version fields

| Field              | Required to publish       | Limit                                                     | Notes                                                                                                      |
| ------------------ | ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Title              | Yes                       | 200 characters                                            | Rendered as the page H1 and card title.                                                                    |
| SEO title          | Yes                       | 60 characters                                             | Rendered as `<title>`, Open Graph title, and Twitter title. The editor fills it from the title when blank. |
| Slug               | Yes                       | 120 characters, lowercase letters, digits, single hyphens | Immutable after the first publish in that locale.                                                          |
| Meta description   | Yes                       | 155 characters                                            | Search and social description.                                                                             |
| Lead               | Yes                       | 1,000 characters                                          | Card excerpt and article introduction.                                                                     |
| Main keyword       | No                        | 200 characters                                            | One per locale.                                                                                            |
| Secondary keywords | No                        | 20 items, 100 characters each                             | Comma-separated in the editor.                                                                             |
| Key facts          | Yes                       | 10 items, 500 characters each                             | At least one is required. Three to five works best.                                                        |
| Body               | Yes                       | 60 blocks                                                 | At least one block.                                                                                        |
| FAQ                | No                        | 20 items                                                  | Question 300 characters, answer 5,000 characters.                                                          |
| Hero alt           | Yes                       | 500 characters                                            | Describe the image for the active locale.                                                                  |
| Gallery alt        | Yes when a gallery exists | 500 characters per image per locale                       | Publishing the locale fails if any gallery image lacks its alt.                                            |

### Category fields

| Field            | Required | Limit                           |
| ---------------- | -------- | ------------------------------- |
| Indonesian title | Yes      | 200 characters                  |
| English title    | Yes      | 200 characters                  |
| Indonesian slug  | Yes      | 120 characters, same slug rules |
| English slug     | Yes      | 120 characters, same slug rules |
| Indonesian intro | No       | 3,000 characters                |
| English intro    | No       | 3,000 characters                |
| Parent           | No       | One level only                  |

Category deletion is blocked when the category has children or any article reference, including drafts and archived articles. Move or delete those references first.

### Media rules

- Accepted types: PNG, JPEG, WebP, GIF.
- Maximum upload: 5 MiB after browser normalization.
- The browser resizes to at most 2,000 px on the long edge, re-encodes as WebP at quality 0.82, and strips EXIF metadata, including GPS.
- Every body image needs alt text before the version can save.
- A social embed poster is optional. Upload a poster when the provider page has no reliable preview image.
- Media registration is tied to the uploading admin account.

## 5. Body format

The body is structured JSON, never HTML and never Markdown. The admin editor produces this format. If a tool generates content, it must emit the same block objects.

Allowed blocks:

| Type        | Shape                                                                                            | Notes                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `heading`   | `{ "type": "heading", "level": 2 \| 3, "text": "..." }`                                          | H2 sections appear in the table of contents. H3 does not. Do not add H1. |
| `paragraph` | `{ "type": "paragraph", "runs": [{ "text": "..." }] }`                                           | Runs support `bold`, `italic`, and `href`.                               |
| `list`      | `{ "type": "list", "style": "ordered" \| "unordered", "items": [[run, ...]] }`                   | Each item is an array of runs.                                           |
| `quote`     | `{ "type": "quote", "runs": [...], "attribution": "..." }`                                       | Attribution is optional, up to 300 characters.                           |
| `callout`   | `{ "type": "callout", "title": "...", "runs": [...] }`                                           | Use for one practical tip or warning.                                    |
| `image`     | `{ "type": "image", "mediaId": "...", "alt": "...", "caption": "..." }`                          | Alt is required. Caption is optional.                                    |
| `embed`     | `{ "type": "embed", "provider": "instagram" \| "tiktok", "url": "...", "posterMediaId": "..." }` | Poster is optional.                                                      |

Run shape:

```json
{
  "text": "Visible text",
  "bold": true,
  "italic": false,
  "href": "https://www.cogitoacademy.id/id/calendar"
}
```

Rules:

- A run has 1 to 5,000 characters.
- Paragraph and quote blocks allow up to 200 runs.
- Lists allow up to 50 items; each item allows up to 100 runs.
- Links must use `http` or `https`. `javascript:` and `data:` URLs are rejected.
- Instagram embeds accept public reel, post, and TV URLs.
- TikTok embeds accept `https://www.tiktok.com/@user/video/<id>` URLs.
- Embed URLs must not contain query strings or fragments.
- Do not paste raw HTML, iframe markup, or inline styles.
- Reading time is computed on save from title, lead, body text, and FAQ at 220 words per minute, with a one-minute floor.

## 6. Bilingual rules

- Indonesian is written first. English is an adaptation for English-speaking readers, not a word-for-word translation.
- Keep the same claims, structure, and calls to action across locales, but localize examples, idioms, and search terms.
- Research the English main keyword separately. Do not translate the Indonesian keyword and assume it is the right query.
- One main keyword per article per locale. Record it in the editorial tracker.
- Slugs are independent. A good slug is short, descriptive, and stable.
- Once a locale has been published, its slug cannot change. A rename returns `SLUG_IMMUTABLE`; create a new article instead.
- The language switch appears only when the sibling locale is published.
- `x-default` points to the Indonesian URL when a published sibling exists.
- A single-language article emits only its own hreflang alternate.

## 7. SEO and public rendering

The marketing site handles metadata, structured data, sitemap, and caching.

| Output            | Source                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| Page H1           | `title`                                                                 |
| `<title>`         | `seoTitle`                                                              |
| Meta description  | `metaDescription`                                                       |
| Card excerpt      | `lead`                                                                  |
| Table of contents | H2 blocks                                                               |
| Canonical         | Self URL                                                                |
| `hreflang`        | Self, plus sibling only when the sibling is published                   |
| `x-default`       | Indonesian URL when a sibling is published                              |
| Structured data   | `BlogPosting` and `BreadcrumbList`                                      |
| Sitemap           | `/blog-sitemap.xml`, published versions only                            |
| Social image      | Generated 1200x630 card from the hero, title, category, and Cogito mark |

Additional rules:

- Each page has exactly one H1. The body must not contain another H1.
- FAQ answers are visible HTML, not JavaScript-only content.
- Article images use fixed frames or stored dimensions to avoid layout shift.
- Social embeds render a facade first and load the provider only after a click.
- Blog pages revalidate every 60 seconds. There is no publish webhook.
- Unpublishing removes that locale from the public API, sibling alternates, and the sitemap after the revalidation window.
- Archiving removes the whole article from public reads, related lists, and the sitemap.

## 8. Editorial house style

These rules are editorial convention. The server-enforced rules are in section 4.

- Write for a specific reader: a parent choosing a program, a student preparing for a competition, or a teacher looking for practice guidance. Do not write for "everyone".
- Open with the answer or the practical problem. Keep the lead to two to four sentences.
- Use short paragraphs and descriptive H2 headings. Use numbered H2 headings for step-by-step guides.
- Prefer concrete verbs and examples over adjectives and superlatives.
- Explain terms a parent may not know. Do not assume competition jargon.
- Use Indonesian that reads naturally for parents and students. Avoid stiff translated Indonesian and unnecessary English loanwords when a common Indonesian term exists.
- English must sound native, not translated. Rewrite sentence order when needed.
- Do not promise outcomes such as guaranteed wins, guaranteed admission, guaranteed income, or guaranteed improvement.
- Do not invent statistics, dates, fees, or competition rules. Link to a verified source or leave the detail out.
- No student stories, profiles, or photos until a separate consent plan exists. A checkbox is not consent.
- A tutor byline is only a name until public tutor profiles ship. Do not add an author URL that 404s.
- Every article links to at least one related article and one conversion path, such as the competition calendar, tutor discovery, or consultation.
- Two-person review is required before publish: one writer and one reviewer.
- Corrections change `updatedAt` only when the content changes. Do not bump timestamps for formatting-only edits.

Content structure that works for this blog:

1. Lead: answer the search intent in two to four sentences.
2. Key facts: three to five short takeaways.
3. H2 sections: one idea per section, with examples or a short list.
4. Callout or quote: one practical tip, not several.
5. FAQ: two to five real questions a parent or student would ask.
6. Closing: one next step, linked to a relevant Cogito page.

## 9. Pre-publish checklist

Run this for each locale separately.

- [ ] Category belongs to the article; subcategory belongs to that category.
- [ ] Title, SEO title, slug, meta description, and lead are complete.
- [ ] SEO title is at most 60 characters; meta description is at most 155.
- [ ] Slug is short, descriptive, and will not need to change.
- [ ] Body has at least one block and no H1.
- [ ] Every body image has descriptive alt text in this locale.
- [ ] Hero image exists and has alt text in this locale.
- [ ] Every gallery image has alt text in this locale.
- [ ] At least one key fact exists; three to five preferred.
- [ ] FAQ answers are complete sentences and not keyword stuffing.
- [ ] Every link resolves and uses `https` where the destination supports it.
- [ ] Embeds use a valid Instagram or TikTok URL; a poster is attached when needed.
- [ ] Related articles are set; at most three.
- [ ] The article has one related link and one conversion path.
- [ ] English is an adaptation, not a literal translation.
- [ ] A second person reviewed facts, links, and claims.
- [ ] Both locale drafts look correct in the editor, and the published pages look correct on mobile and desktop after publishing.
- [ ] Publish only the locales that are ready.

## 10. Errors and recovery

| Code                                                   | Meaning                                                | Action                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `BAD_REQUEST` with `missingFields` (`PUBLISH_INVALID`) | The publish gate is incomplete.                        | Fill the named fields for that locale, then publish again.                |
| `CONFLICT` (`SLUG_IMMUTABLE`)                          | The locale was already published and the slug changed. | Restore the old slug. Create a new article if a new URL is required.      |
| `CONFLICT` (`SLUG_TAKEN`)                              | Another version in the same locale uses the slug.      | Choose a different slug.                                                  |
| `CONFLICT` with `actualVersion` (`VERSION_CONFLICT`)   | Another admin saved a newer version.                   | Reload the editor, review the newer content, then reapply your change.    |
| `CONFLICT` (`BLOG_ARTICLE_ARCHIVED`)                   | The article is archived and rejects edits.             | Unarchive is not supported in the editor. Create a new article if needed. |
| `CONFLICT` (`BLOG_CATEGORY_IN_USE`)                    | The category still has articles or children.           | Move or delete the references, refresh, then delete.                      |
| `BAD_REQUEST` (`BLOG_CATEGORY_INVALID`)                | The category or subcategory is invalid.                | Check that the subcategory belongs to the selected root category.         |
| `BAD_REQUEST` (`BLOG_MEDIA_INVALID`)                   | The media upload or registration is invalid.           | Re-upload through the editor. Check type, size, and ownership.            |

## 11. Known limits

- No full-page draft preview. The editor shows the body as formatted content; the public page is visible only after publish.
- No automated redirects for slug changes. Slugs are immutable after first publish instead.
- No publish webhook. Public changes appear after the 60-second revalidation window.
- No student stories or student photos until a consent model exists.
- No author profile URL until public tutor profiles exist.
- Category hubs show articles from the published locale only. A locale with no published articles has an empty blog home.
- A category hub returns 404 until that locale has at least two published articles in the category.
- The category hub lists up to 24 newest articles in that locale. Older articles may be absent from a hub.
- There is no editor role. Blog access requires the `admin` role.

## 12. Source of truth

| Area                                       | File                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| Input validation, limits, block contract   | `packages/api/src/modules/blog/blog.types.ts`               |
| Publish gate, slug lock, public projection | `packages/api/src/modules/blog/blog.service.ts`             |
| Database schema                            | `packages/db/src/schema/blog.ts`                            |
| Admin editor                               | `apps/web/src/components/admin/blog/`                       |
| Image normalization                        | `apps/web/src/lib/blog-image.ts`                            |
| Public API client                          | `cogito-acad/apps/web/src/lib/blog-api.ts`                  |
| Metadata and alternates                    | `cogito-acad/apps/web/src/lib/blog-metadata.ts`             |
| Body renderer                              | `cogito-acad/apps/web/src/components/blog/article-body.tsx` |
| Full delivery plan                         | `docs/plans/active/BILINGUAL-BLOG.md`                       |
| API procedures                             | `docs/API-REFERENCE.md`                                     |
| Module rules                               | `docs/MODULE-REFERENCE.md`                                  |
| Operations                                 | `docs/RUNBOOK.md`                                           |

If a rule changes, update this file and `CONTEXT-LLM.md` in the same pull request.
