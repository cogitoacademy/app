# Blog client feedback — app studio evidence

Captured 23 November 2026 from the local app web (`http://localhost:3010`) against the isolated `cogito_blog_feedback` PostgreSQL database. The demo article is a published two-language student story with a different cover in each language, a table in both bodies, and a recorded consent entry. No production database, R2 bucket, or real student data was used.

| Area                       | Capture                          | Viewport                   |
| -------------------------- | -------------------------------- | -------------------------- |
| Per-language table editing | `01-editor-table-desktop.png`    | 1152 x 1200 (content area) |
| Indonesian cover uploader  | `02-editor-cover-id-desktop.png` | 1440 x 1200                |
| English cover uploader     | `03-editor-cover-en-desktop.png` | 1440 x 1200                |
| Consent record             | `04-editor-consent-desktop.png`  | 1440 x 1200                |
| Consent record, mobile     | `05-editor-consent-mobile.png`   | 390 x 844                  |
| Table tools menu           | `06-editor-table-tools.png`      | 1152 x 1200 (content area) |

The two cover screenshots show the same article with different preview images and cover descriptions, proving the per-language hero. The table screenshots show the TipTap table block rendered from the stored block JSON and the new table tools menu. The consent screenshots show the internal checkbox, date, note, and the warning that the field is not a legal consent gate.

Validation on the branch:

- API unit tests: blog types/service/errors/handler/repo, Office action schemas, and rich-text round trip.
- Blog PostgreSQL integration: 8 pass, including separate ID/EN covers, table body, and consent date enforcement.
- Office PostgreSQL integration: 3 pass on an isolated `cogito-test` database at port 6769.
- Web typecheck and server typecheck pass.
- Local screenshots were captured with Playwright Chromium; temporary fixture code was removed.
