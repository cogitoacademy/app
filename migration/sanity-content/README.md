# Knowledge Bank and Competition Calendar migration

Status: source inventory and KB asset verification complete; DB/admin/import and
consumer cutover are not implemented. Activities are deferred.

## Working snapshot and verification

The ignored `tmp/v3-content/20261024-123211/sanity-published.json` snapshot was
read from project `skfmwuke`, dataset `development`, API `2024-03-01`, using
published perspective and query `*[!(_id in path("drafts.**"))]`. This is a local
working copy, not a durable full backup. Drafts/history are excluded.

The interrupted broad asset download was resumed with bounded requests. All 16
CDN files are now present locally and have a download SHA-256 manifest at
`assets-manifest.json`; only the four PDFs match the original source size/SHA-1.
All twelve CDN image responses differ from source metadata in both size/hash,
including fresh downloads. They are retained as candidates, explicitly failed
source verification, and must not be represented as verified original images.
This does not affect the three referenced KB PDFs, which remain verified.

Run from the repository root, with Python 3.12+ (standard library only):

```sh
python -m unittest discover -s migration/sanity-content -p test_audit.py
python migration/sanity-content/audit.py tmp/v3-content/20261024-123211/sanity-published.json --download-kb
```

The audit retains raw documents unchanged and writes `kb-calendar-audit.json`
alongside them. It checks source references, timezone-aware date ranges and
nonempty title presence. Downloads are limited to referenced KB assets; existing
files are verified too. Source byte length and SHA-1 must match, and SHA-256 is
recorded for destination reconciliation. Download failures produce a nonzero exit.
It also writes `kb-calendar-prepared.json` after successful asset/source checks:
single-value fields for 3 resources and 63 competitions, retaining source IDs.
It does not import data, write to Sanity, or determine that content is approved.

24 October result: 63 competitions, 11 source competition categories, 3 KB
resources. All three KB PDFs verified (867191, 746087 and 832019 bytes). No missing
references in KB/calendar documents; all 63 timestamp ranges valid. The owner
confirmed one language-neutral input per field. Four competitions without
English titles are valid with their existing titles; no translation is needed.
Eighty legacy locale fields have differing values. The prepared manifest records
their selected and original values for review; the raw snapshot stays intact.

## Source-to-destination mapping proposal

- KB: retain `_id` as a unique source identity; title -> required title
  in its existing language, description -> optional description, category -> current
  resource category, file reference -> private storage key plus original name,
  MIME, size and SHA-256. Legacy scalar title/description have no locale metadata;
  do not infer language automatically. Add active,
  order, version and timestamps following existing FAQ conventions.
- Calendar: retain `_id` as unique source identity; title, description and
  location become single values matching the existing displayed content
  (nonempty English then first nonempty). Keep all source locale arrays in the
  archive and selection manifest, without translation. Preserve start/end
  instants and registration deadline; map category source IDs explicitly to the
  app catalog, not by display name. Preserve education levels, scale, organizer,
  registration/social links. Keep source category metadata in the mapping for
  review. Use source ID + displayed calendar date for agenda deduplication;
  distinct source IDs must not be merged because title/date match. End dates are
  inclusive for existing daily display, preserving current behavior.
- Do not import Activities/tutors as part of this slice. Keep source references
  and mapping manifests outside public DTOs.

## Existing behavior to preserve

`content.service.ts` currently reads Sanity. `content.listStudentResources`
checks `wallet.knowledgeBankEligible`; ineligible users get no resources. The
file route `/content/knowledge-bank/:resourceId/file` independently checks
session, supported role and eligibility, then proxies bytes with private/no-store
headers. Preserve the 35-Mark/admin-grant gate and tutor/admin eligibility.
Calendar listing currently requires authentication. Website resource redirect
and future anonymous calendar DTO must never disclose KB file URLs or keys.

## Implementation order

1. Add private storage read/write support for KB. Existing generic upload
   returns a public URL; do not reuse that path for protected PDFs.
2. Add KB/calendar tables and versioned admin live-save CRUD, using existing
   service/repo/handler patterns and audit conventions. Generate/review additive
   migrations separately; no migration application is part of this checkpoint.
3. Prepare a deterministic dry-run import with stable source mapping and
   reference/file/selected-text/date validation. Review legacy text selections and
   source-to-app category mapping. No automatic merge of source documents.
4. Import to a separately verified target, upload PDFs privately, then compare
   counts, hashes, links and role/eligibility denial paths. Preserve current
   resource IDs/links or provide explicit mapping before switching consumers.
5. Switch KB first, calendar second. Test multiple-day appearances, same-ID/date
   duplication, distinct same-title events, WIB boundaries and protected files.
   Verify website redirect and rehearse rollback. Retain source reads until
   acceptance; do not remove Sanity globally while Activities still uses it.

No DB/provider writes, upload, runtime cutover or production changes have run.
