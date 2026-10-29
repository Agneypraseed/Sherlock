# Milestone: real local image upload

Add images in multiple chooser batches, import a whole folder, or remove a file
from the selection before upload. Duplicate selections are skipped. Folder
imports preserve relative paths such as `cats/train_01.jpg`, which lets later
label-aware work recover the folder structure. Browser directory selection
exposes files recursively and provides paths relative to the chosen directory;
see [MDN's directory picker reference](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory).
A migration fills the path field for image records saved before folder import was added.

The browser now sends actual image bytes to the API. PostgreSQL stores the
manifest and upload timestamps; `.data/images` stores the originals. Both remain
on this computer after the browser or API restarts. `.data` is ignored by Git.

## Request flow

1. `POST /api/datasets` creates the manifest and image records.
2. `GET /api/datasets/:id` returns ordered server image IDs and upload state.
3. The browser sends one file at a time with `PUT .../images/:imageId`.
4. A final GET confirms state and supplies preview URLs for uploaded originals.

Separate file requests give failures a small scope. If file 3 fails, files 1–2
remain stored. Retry reads upload timestamps and skips completed files. Changing
the selection or dataset name starts a new draft. Refreshing clears this form and
its resume reference; a dataset history screen is a future milestone.

## Files and responsibilities

| File | Why it exists |
| --- | --- |
| `server/uploads.ts` (new) | Owns byte-size/signature checks, temporary file writes, row locking, safe generated paths, and original-image responses. |
| `server/migrations/002_image_uploads.sql` (new) | Adds `uploaded_at` without rewriting the first migration or losing existing rows. |
| `server/migrations/003_image_relative_paths.sql` (new) | Preserves folder paths and backfills paths for existing image records. |
| `shared/datasets.ts` | Describes image IDs, positions, timestamps, preview URLs, and the three upload states. |
| `server/db.ts` | Applies both migrations and derives dataset state from persisted image timestamps. |
| `server/app.ts` | Registers upload routes alongside existing manifest routes. |
| `src/api/datasets.ts` | Keeps network requests and response errors out of presentation components. |
| `src/components/Dashboard.tsx` | Coordinates create → upload → confirm, stores progress in state, and retains the manifest ID in a ref for retry. |
| `src/components/DatasetUploader.tsx` | Adds incrementally, imports folders, removes individual picks, and displays progress, retry/success messages, and previews from the server. |
| `src/types.ts`, `src/index.css` | Extend the existing request-state union and provide a simple preview grid. |
| `server/datasets.test.ts` | Exercises real storage and PostgreSQL with isolated test data. |

State drives what React renders: updating the completed count redraws progress.
The retained manifest ID uses a ref because changing that value alone does not
need a render. The upload runs from the submit handler, not an effect, because
submission is a user action. No state library or upload dependency was added.

## Commands

- `npm run db:migrate`: applies the new timestamp column once, preserving data.
- `npm run dev:api` and `npm run dev`: start the API and browser app separately.
- `npm test`: checks validation, partial failure, safe retry, and persisted bytes
  using a unique database schema and temporary storage directory.
- `npm run build` / `npm run lint`: check TypeScript/build output and source rules.

## Deliberate limits and TODOs

- Container signatures identify formats; they do not prove an entire file decodes.
  TODO: full decoding, dimensions, corrupt-image reporting, and decompression limits.
- Upload requests buffer at most 100 MiB each. The browser sends them sequentially.
  Multiple clients can still use significant memory. TODO before hosting: streaming,
  concurrency limits, quotas, authentication, ownership, and private cloud storage.
- This is local disk storage. Moving only PostgreSQL to a cloud service does not
  move originals; files and metadata must be backed up together.
- Dataset creation has no idempotency key. Losing the initial POST response can
  leave an extra manifest. TODO: POST idempotency and abandoned-manifest cleanup.
- No ML, duplicate detection, labeling logic, or agent calls are implemented here.
  Those remain your learning work.

Fastify's buffer parser enforces body size before the upload handler runs; see
[the official content-type parser reference](https://fastify.dev/docs/latest/Reference/ContentTypeParser/).
