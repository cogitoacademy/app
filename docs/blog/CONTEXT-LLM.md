# Cogito Blog — LLM Authoring Protocol

Read [`CONTEXT.md`](./CONTEXT.md) first. It holds the shared facts, field limits, workflow, and editorial rules. This file adds the exact protocol for an AI agent that drafts, validates, or publishes Cogito blog content.

This file is written to be read by both humans and machines. Every constraint here is either enforced by `packages/api/src/modules/blog/blog.types.ts` / `blog.service.ts` or explicitly marked as editorial convention.

## 1. Operating contract

1. The server is authoritative. Never claim a post is valid because it "looks right".
2. Never invent category IDs, media IDs, tutor IDs, article IDs, publish dates, statistics, fees, or competition rules.
3. Never change a slug after that locale has been published. The server rejects it with `SLUG_IMMUTABLE`.
4. Never publish without explicit human approval, unless the user is an authorized admin and directly asks you to publish.
5. Never use HTML or Markdown as the stored body. Emit structured blocks only.
6. Never create student stories, student profiles, or student photos. No consent model exists.
7. Never invent a byline, reviewer, or credential. Use only names supplied by the user or returned by the API.
8. Ask only for blocking inputs. If a non-blocking field is missing, omit it rather than inventing a value.
9. When facts conflict, prefer the code, then `CONTEXT.md`, then this file.
10. If a request crosses a hard stop in section 10, stop and explain the block.

## 2. Required brief

Collect these before drafting. Items marked **blocking** stop the draft.

| Input                                               | Blocking             | Why                                              |
| --------------------------------------------------- | -------------------- | ------------------------------------------------ |
| Target locale or locales                            | Yes                  | `id`, `en`, or both.                             |
| Reader and search intent                            | Yes                  | Determines angle, examples, and CTA.             |
| Category, or permission to choose one               | Yes                  | Publish requires a category ID.                  |
| Main keyword per locale                             | No                   | Strongly recommended. One per locale.            |
| Secondary keywords                                  | No                   | Up to 20 per locale.                             |
| Hero image or permission to leave it for the editor | Yes for publish      | Hero media and hero alt are required to publish. |
| Related article or permission to choose             | No                   | Every article should link one related article.   |
| Conversion path                                     | No                   | Every article should link one Cogito page.       |
| Byline and reviewer                                 | No                   | Use a real person or team only.                  |
| Word count or depth target                          | No                   | Default to the depth the intent needs.           |
| Facts, sources, and claims                          | Yes when factual     | Do not invent facts.                             |
| Existing article ID and version                     | Yes for updates      | Required for optimistic concurrency.             |
| Admin session or API access                         | Yes for publish mode | Without it, output content for a human to paste. |

If the user gives a topic but no category, propose one category from the existing taxonomy and ask for confirmation only when the choice changes the article angle. Do not guess a category ID.

## 3. Two modes

### Draft mode (default)

Use when the agent has no authenticated admin session.

- Produce the article copy and the structured content JSON.
- Use placeholders such as `"<hero-media-id>"` only in a clearly marked payload preview.
- List the assets and IDs a human must supply.
- Do not call the API.

### Publish mode

Use only when all of these are true:

- The user explicitly asks to publish or save through the app.
- The agent has a valid admin session and an API tool.
- Real category, media, and article IDs are available.
- A human approved the final copy.

Then follow section 8 exactly. Stop on the first error and report the machine-readable code.

## 4. Generation algorithm

Run in this order. Do not skip the self-checks.

1. Restate the brief in one line: reader, intent, locale, category, main keyword, CTA.
2. Choose the article angle. One article answers one primary query.
3. Build an outline with 3 to 7 H2 sections. Each H2 answers one sub-question.
4. Write the Indonesian version first.
5. Write the lead: two to four sentences that answer the query directly.
6. Write the body sections. Use short paragraphs, concrete examples, and one idea per section.
7. Write 3 to 5 key facts. Each fact is a complete, useful takeaway.
8. Write 2 to 5 FAQ items. Questions must be real questions a reader would ask.
9. Add one related link and one conversion link. Prefer in-body links over a link dump.
10. Run the validation checklist in section 7 against the Indonesian version.
11. Adapt to English. Keep the claims and structure, but rewrite idioms, examples, and search terms for an English reader.
12. Run the checklist against the English version.
13. Return the output in the format in section 11.

If the user asks for only one locale, produce only that locale. Do not silently translate the other one.

## 5. Content schema

Version payload:

```json
{
  "locale": "id",
  "slug": "cara-memilih-kompetisi-sains",
  "title": "Cara Memilih Kompetisi Sains yang Tepat",
  "seoTitle": "Panduan Memilih Kompetisi Sains",
  "metaDescription": "Panduan memilih kompetisi sains: cocokkan minat, level, jadwal, dan biaya sebelum mendaftar.",
  "lead": "Dua sampai empat kalimat yang menjawab pertanyaan utama.",
  "mainKeyword": "kompetisi sains untuk anak",
  "secondaryKeywords": ["olimpiade sains", "kalender lomba"],
  "keyFacts": [
    { "text": "Mulai dari minat anak, bukan dari daftar lomba yang populer." }
  ],
  "body": [
    {
      "type": "paragraph",
      "runs": [{ "text": "Paragraf pembuka setelah lead." }]
    },
    {
      "type": "heading",
      "level": 2,
      "text": "1. Kenali minat anak"
    },
    {
      "type": "paragraph",
      "runs": [
        { "text": "Teks biasa, lalu " },
        {
          "text": "tautan penting",
          "bold": true,
          "href": "https://www.cogitoacademy.id/id/calendar"
        },
        { "text": " untuk jadwal lomba." }
      ]
    }
  ],
  "faq": [
    {
      "question": "Usia berapa anak sebaiknya mulai ikut kompetisi?",
      "answer": "Tidak ada batas usia baku. Mulai saat anak nyaman dengan soal di atas level kelasnya."
    }
  ],
  "heroAlt": "Deskripsi gambar cover yang terlihat, bukan nama file."
}
```

Rules:

- `seoTitle` is required at publish. Do not omit it and assume the server will create it. The editor fills it from `title` only as a UI convenience.
- `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$` and be 1 to 120 characters.
- `title` max 200, `seoTitle` max 60, `metaDescription` max 155, `lead` max 1,000.
- `mainKeyword` max 200. `secondaryKeywords` max 20 items, 100 characters each.
- `keyFacts` max 10 items, 500 characters each, at least 1 to publish.
- `faq` max 20 items. Question max 300, answer max 5,000.
- `heroAlt` max 500. Required to publish.
- Body max 60 blocks.

## 6. Block contract

Allowed block types and exact shapes:

```json
{ "type": "heading", "level": 2, "text": "Section title" }
{ "type": "paragraph", "runs": [{ "text": "Text", "bold": true, "italic": false, "href": "https://example.com" }] }
{ "type": "list", "style": "unordered", "items": [[{ "text": "Item one" }], [{ "text": "Item two" }]] }
{ "type": "quote", "runs": [{ "text": "Quoted text" }], "attribution": "Name, role" }
{ "type": "callout", "title": "Practical tip", "runs": [{ "text": "One useful tip." }] }
{ "type": "image", "mediaId": "<registered-media-id>", "alt": "What the image shows", "caption": "Optional caption" }
{ "type": "embed", "provider": "instagram", "url": "https://www.instagram.com/reel/<id>/", "posterMediaId": "<registered-media-id>" }
```

Constraints:

- `level` is `2` or `3`. Never emit an H1 block.
- Run `text` is 1 to 5,000 characters.
- `href` must be `http` or `https`. No `javascript:` or `data:`.
- Paragraph and quote: 1 to 200 runs.
- List: 1 to 50 items; each item has 1 to 100 runs.
- `attribution` max 300. `callout.title` max 300. `image.alt` max 500. `image.caption` max 500.
- Image `alt` is required and must not be empty.
- Embed URL max 2,048 characters, must use `https`, and has no query string or fragment.
- Instagram accepts `https://www.instagram.com/reel/<id>/`, `reels`, `p`, or `tv`.
- TikTok accepts `https://www.tiktok.com/@user/video/<digits>`.
- `posterMediaId` is optional. Omit it when no registered poster exists.
- Do not emit unknown block types. The schema is strict.

## 7. Publish gate

A locale can publish only when every item is true. This is the server gate, not a style preference.

- [ ] `categoryId` is set and valid for the article.
- [ ] `title` is non-empty.
- [ ] `seoTitle` is non-empty.
- [ ] `slug` is non-empty and valid.
- [ ] `metaDescription` is non-empty.
- [ ] `lead` is non-empty.
- [ ] `body` has at least one block.
- [ ] `heroMediaId` is set.
- [ ] `heroAlt` is non-empty for this locale.
- [ ] `keyFacts` has at least one item.
- [ ] Every gallery image has alt text for this locale.
- [ ] Every body image has non-empty alt text.
- [ ] No other version in the same locale uses this slug.
- [ ] If the locale was ever published, the slug is unchanged.

Length and type checks still apply after this list. Run the schema checks in sections 5 and 6.

## 8. API workflow

Use only in publish mode. HTTP paths are procedure keys with slashes. Request bodies use the `{"json": <input>}` envelope. Responses use `{"json": <data>, "meta": [...]}`.

Order:

1. Resolve the category with `adminBlog.categories.list`. Create one with `adminBlog.categories.create` only if the user approved a new category.
2. Create the article with `adminBlog.createArticle`:
   `{ "categoryId": "...", "subcategoryId": null, "heroMediaId": "...", "featuredTutorName": null, "reviewedByName": "...", "internalNotes": "..." }`
3. Upload media when needed:
   `upload.createUploadUrl` with `{ filename, contentType, contentLength }`. Send the bytes to `uploadUrl` with the returned `method` and `fields`; use `PUT` for R2 and `POST` for local mode. Then call `adminBlog.registerMedia` with `{ storageKey, filename, contentType, width, height, byteSize }`. The storage key must belong to the signed-in admin.
4. Save each locale with `adminBlog.saveVersion`:
   `{ articleId, locale, expectedVersion: 0, ...versionPayload }`
   Use `expectedVersion: 0` for the first save. Use the returned `version` for later saves.
5. Replace gallery and related records when they changed:
   `adminBlog.replaceGallery` with `{ articleId, expectedVersion: <article version>, images: [{ mediaId, altId, altEn }] }`
   `adminBlog.replaceRelated` with `{ articleId, expectedVersion: <article version>, relatedArticleIds: [] }`
6. Publish with `adminBlog.publishVersion`:
   `{ articleId, locale, expectedVersion: <saved version number> }`
7. Unpublish with `adminBlog.unpublishVersion`, same input shape. The locale returns to draft.
8. Archive with `adminBlog.archiveArticle`: `{ articleId, expectedVersion: <article version> }`.
9. Verify public output with `publicContent.blog.get` using `{ locale, slug }`.

Do not use a version number from a different locale. Do not reuse an article version as a version-row number.

Error handling:

| Code                                                                                              | Agent action                                                                                  |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `BAD_REQUEST` with `data.missingFields` (`PUBLISH_INVALID`)                                       | Read `missingFields` and fill exactly those fields. Do not retry unchanged.                   |
| `CONFLICT` with the message `A published blog slug cannot change` (`SLUG_IMMUTABLE`)              | Restore the published slug. Do not create a new article unless the user asked for a new URL.  |
| `CONFLICT` with the message `This slug is already used in this language` (`SLUG_TAKEN`)           | Choose a new slug for that locale.                                                            |
| `CONFLICT` with `data.actualVersion` (`VERSION_CONFLICT`)                                         | Reload with `adminBlog.get`, review the newer content, then reapply. Never overwrite blindly. |
| `CONFLICT` with the message `This blog article is archived` (`BLOG_ARTICLE_ARCHIVED`)             | Stop. Archived articles reject edits.                                                         |
| `CONFLICT` with the message `This category still has published articles` (`BLOG_CATEGORY_IN_USE`) | Stop. Move or delete references first.                                                        |
| `BAD_REQUEST` (`BLOG_CATEGORY_INVALID`)                                                           | Fix the category or subcategory parent relationship.                                          |
| `BAD_REQUEST` (`BLOG_MEDIA_INVALID`)                                                              | Re-upload or fix the media metadata.                                                          |
| `FORBIDDEN`                                                                                       | Stop. The session is not an admin session.                                                    |

## 9. Writing rules

Server-enforced rules are in sections 5 to 7. These are editorial rules.

- Indonesian first. English is an adaptation, not a literal translation.
- One article answers one primary query. Do not merge two unrelated topics.
- Lead answers the query in two to four sentences.
- Use 3 to 7 H2 sections. Use H3 only for a sub-point inside an H2.
- Use numbered H2 headings for step-by-step guides.
- Keep paragraphs short. One idea per paragraph.
- Use concrete examples, numbers from supplied sources, and named tools or pages.
- Explain competition or product jargon the first time it appears.
- Use sentence case for headings.
- Do not use superlatives without evidence. Do not promise wins, admission, income, or improvement.
- Do not fabricate a quote or attribute a quote to a generic "expert".
- Do not stuff the main keyword. Use it in the title, lead, one H2, and naturally in the body.
- Do not add a call to action in every section. One clear next step is enough.
- Do not use student stories or student photos.
- Do not use a tutor photo unless the user supplied a licensed image and the tutor approved publication.
- Link to Cogito pages with the correct locale prefix: `/id/...` or `/en/...`.
- Use descriptive link text. Do not use "click here".
- Alt text describes what is visible and why it matters in context. Do not start with "image of".
- Captions add context. Do not repeat the alt text.
- FAQ answers must stand alone and be complete sentences.
- Key facts must be scannable. One takeaway per item.

Recommended structure:

```text
Lead (2 to 4 sentences)
Key facts (3 to 5)
H2: context or problem
H2: step or option 1
H2: step or option 2
H2: step or option 3
Callout or quote (optional, at most one)
H2: common mistakes or checklist
FAQ (2 to 5)
Closing with one next step
```

## 10. Hard stops

Stop and explain when the user asks to:

- Publish a locale whose required fields are incomplete.
- Add a category that does not exist without approval.
- Rename a slug that was already published.
- Publish a student story, student profile, or student photo.
- Invent a statistic, fee, date, competition rule, reviewer, tutor, or credential.
- Insert raw HTML, iframe markup, JavaScript, or Markdown into the body.
- Use an Instagram or TikTok URL that fails the allowed patterns.
- Bypass the admin API with direct database writes.
- Publish content that the user has not approved.
- Reuse another article's media ID or another admin's storage key.

State the exact block, the rule, and the smallest safe alternative. Do not silently work around a hard stop.

## 11. Output format

Return this structure in draft mode:

````md
## Brief

- Reader:
- Intent:
- Locales:
- Category:
- Main keyword (id):
- Main keyword (en):
- Conversion path:

## Indonesian

### Metadata

- Title:
- SEO title (chars):
- Slug:
- Meta description (chars):
- Lead:
- Hero alt:
- Key facts:
- FAQ:

### Body

[readable article copy]

### Content JSON

```json
{ "locale": "id", "...": "..." }
```

## English

[Same structure as Indonesian.]

## Assets and IDs needed

- Hero image:
- Poster image:
- Gallery images:
- Category ID:
- Related article IDs:

## Self-check

- [ ] Publish gate passes for each locale.
- [ ] Slugs valid and stable.
- [ ] SEO title and meta description within limits.
- [ ] Every image has alt text.
- [ ] No H1 in body.
- [ ] No invented facts or people.
- [ ] Related link and conversion link present.
- [ ] English is an adaptation, not a literal translation.
````

In publish mode, replace the final section with:

```md
## Actions

- articleId:
- id version:
- en version:
- id status:
- en status:
- public URL (id):
- public URL (en):
- errors:
```
