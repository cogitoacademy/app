# Agent D — BACKEND-HARDENING-PHASE2 Implementation Report

Date: 2026-08-14 · Worktree: `/Users/miapalovaara/cogito/wt-upload` · Branch: `fix/file-upload` (never pushed)
Base: `6de2527` · Head: `38c1368`

## Summary

Implemented Task 4.1 (storage lib + 4-layer upload module + wiring) and Task 6.6 (`.env.example`). Global Constraints followed verbatim (import paths, 4-layer pattern, `DomainError` + `withDomainMap`, bounded zod, conventional commits per green step, backend only). All gates green on final HEAD: `check-types` pass, `lint` 0 errors (46 pre-existing warnings), targeted tests **31 pass / 0 fail**, full suite **1586 pass / 1 skip / 0 fail** (baseline at fork was 1566/1/0 → +20 new tests).

## Per-Task Status

### Task 4.1 — Upload storage abstraction + signed-URL endpoint — DONE

- **Deps:** Added `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (`^3.1110.0`) as real (non-dev) dependencies of `packages/api` via `bun add` (Agent A had not added them — confirmed absent from the workspace). `bun.lock` updated.
- **`packages/api/src/lib/storage.ts` (new):** `StoragePort` (`put`, `getSignedUploadUrl`, `resolvePublicUrl`), `createLocalStorage({ dir, baseUrl })` (Bun.write + `mkdir` recursive; rejects non-`isValidUploadKey` keys via `InvalidStorageKeyError`; baseUrl defaults `/uploads`), `createR2Storage({ accountId, accessKeyId, secretAccessKey, bucket, publicUrl? })` (`S3Client` region `auto`, endpoint `https://{accountId}.r2.cloudflarestorage.com`, `PutObjectCommand`, `getSignedUrl` with `expiresIn: 300`, publicUrl prefix when set), and `createStorage(envLike)` factory (R2 when all 4 R2 credential vars present, else local from `UPLOAD_DIR` default `./uploads`).
- **`packages/api/src/modules/upload/` (new, 4-layer):**
  - `upload.types.ts`: `ALLOWED_CONTENT_TYPES` (png/jpeg/webp/gif/pdf), `MAX_UPLOAD_BYTES = 5MB`, `createUploadUrlInput` (filename min 1 / max 255, rejects `..` and leading `/`; `contentType` enum).
  - `upload.errors.ts`: `InvalidFilenameError`, `UnsupportedContentTypeError`, `mapUploadError`.
  - `upload.service.ts`: `createUploadUrl(userId, input)` → key `{userId}/{uuid}-{sanitized}` (defensive allowlist + filename checks, `sanitizeFilename` strips path separators / unsafe chars / caps at 100) → returns `{ uploadUrl, key, publicUrl, contentType, maxBytes, method }`; plus `resolvePublicUrl(key)` helper.
  - `upload.handler.ts` / `upload.router.ts`: `protectedProcedure` at path `/upload/create-url`.
  - `index.ts`: `createUploadModule({ db?, storage })`.
- **Wiring:** `packages/api/src/services.ts` — added `createStorage({...env})` + `createUploadModule` (upload added to `ServiceRegistry` + `HandlerRegistry`); `packages/api/src/routers.ts` — added `createUploadRouter(handlers.upload)` + `upload: uploadRouter`.
- **Tests (new):** `packages/api/src/lib/storage.test.ts` (11 tests: local put/getSignedUploadUrl/resolvePublicUrl/traversal-reject, R2 resolvePublicUrl + real presigned-URL shape with X-Amz-Signature, `createStorage` factory selection) and `packages/api/src/tests/unit/upload.{service,types,errors,handler}.test.ts` (20 tests: key shape regex, sanitization, content-type allowlist, size cap, zod bounds, error mapping, handler session-user wiring).
- **Key shape contract** with the existing `GET /uploads/*` route (`{userId}/{uuid}-{filename}`) is preserved; the module was NOT wired into achievement/user-avatar flows (frontend tracked in FRONTEND-GAPS per brief).

### Task 6.6 — `.env.example` missing security flags — DONE

- Added to `apps/server/.env.example` with short comments: `WEBHOOK_ALLOWED_IPS`, `STUB_WEBHOOK_ALLOWED`, `TRUST_PROXY`, `SEED_ALLOWED_IN_PROD`, `SEED_ADMIN_PASSWORD`, `REDIS_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `UPLOAD_DIR`.

## Tests Run (pass counts)

- Targeted (storage + upload module, per brief's `REDIS_URL=redis://localhost:6382 bun test --env-file apps/server/.env.test.local <files>`): **31 pass / 0 fail**.
- `bun run check-types`: **pass** (3/3 turbo tasks).
- `bun run lint`: **0 errors** (46 pre-existing warnings, same as baseline).
- `bunx oxfmt --check` on all owned files: **clean**.
- Final full suite (`REDIS_URL=redis://localhost:6382 bun test --env-file apps/server/.env.test.local packages/api/src/tests/ apps/server/src/openapi.test.ts`): **1586 pass / 1 skip / 0 fail** (baseline 1566/1/0; all new upload tests included in the gate run).

## Deviations

1. **`StoragePort` has a third method `resolvePublicUrl(key): string`** beyond the brief's `put` + `getSignedUploadUrl`. The service must return a `publicUrl` distinct from the (signed/parametrized) upload URL for R2-with-public-URL, and local storage's signed URL _is_ the direct serve URL. A `resolvePublicUrl` on the port is the clean way to satisfy `{ uploadUrl, key, publicUrl, contentType, maxBytes }` without the service guessing storage internals.
2. **Local `put`/`getSignedUploadUrl` ignore `contentType`** (local dev has no MIME enforcement at write time); params prefixed `_contentType` to satisfy TS `noUnusedParameters`. R2 passes it through to `PutObjectCommand`.
3. **`createUploadUrl` also returns `method: "PUT"`** (additive field from `getSignedUploadUrl`) so the client knows the verb to use.
4. Committed via 3 conventional commits (see range) rather than 1: the `feat` commit's staged blobs were reformatted by lefthook's pre-commit `oxfmt --write` _after_ staging, leaving unformatted content in the commit; fixed with a follow-up `style` commit (lefthook does not re-stage in this config). `oxfmt --check` now clean.

## Concerns

- None blocking. All failures are 0; the 1 skip is the pre-existing TC-09 email-mismatch test (same as baseline). I did not modify any files outside my owned set. `apps/web/src/routeTree.gen.ts` was regenerated by the `web:check-types` build during verification and reverted (`git checkout --`) to keep the diff clean — it is a generated file, not touched by my work.

## Commit Range (base..head)

`6de2527..38c1368` — 3 commits, all mine, not pushed:

- `ad98881 feat(upload): signed-URL uploads with Cloudflare R2 and local dev fallback`
- `4147b9e docs(server): document new security, upload, and redis env vars in .env.example`
- `38c1368 style(upload): apply oxfmt formatting to upload module`
