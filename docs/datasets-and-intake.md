# Dataset management and reliable image intake

## Current workflow

The saved-dataset list comes from PostgreSQL. Open a row to view uploaded images
and dimensions, complete an interrupted upload, or add images to the same dataset.
The current dataset ID is kept in `?dataset=<id>`. Refresh loads that record from
the server. Browsers do not retain local File objects on refresh: reselect the
original files/folder for missing records, with the same relative paths.

Appending reuses matching paths. Valid stored originals are immutable; a changed
size/type at the same uploaded path returns a conflict. Use a new path for a new
version. Pending or rejected files can be corrected by reselecting a replacement.
New paths receive new IDs and positions. A parent-row lock serializes appends,
including concurrent count-limit checks. Repeating an append request is safe.
Creation POST still has no idempotency key: if its response is lost, reopen the
new record from the list before retrying creation.

## Decoding

Each new upload must match its declared size and pass Sharp's decoder. Metadata
reads only headers, so intake also materializes the pixels to detect damaged or
truncated content. See [Sharp's input metadata](https://sharp.pixelplumbing.com/api-input/)
and [raw output](https://sharp.pixelplumbing.com/api-output/#raw) references.

Accepted: JPEG, PNG, WebP, static GIF, single-page TIFF, and AVIF. SVG, BMP, HEIC,
HEIF/HEVC, animation, and multi-page inputs are rejected. The per-file limits are
100 MiB and 25 million pixels, with a 20-second decoder timeout. Dimensions describe
encoded pixels; EXIF orientation is not applied. TIFF originals can be downloaded
but this browser UI does not generate TIFF thumbnails.

PostgreSQL stores width, height, decoder format, verification time, and any
validation error. Rejected uploads are shown as needing attention and are not
served as previews. Originals saved by earlier versions are unverified; open
their dataset and use **Validate stored images**. This reads and validates local
bytes and updates metadata; it does not change the source files. It also records
missing/corrupt originals as repairable errors.

## Files

| File | Responsibility |
| --- | --- |
| `src/components/DatasetLibrary.tsx` | Saved list, opened dataset, missing-file guidance, dimensions and validation feedback. |
| `src/components/Dashboard.tsx` | Load/open state, URL restoration, create/append/upload coordination and retry. |
| `src/components/DatasetUploader.tsx` | File/folder picker and upload progress for a new or existing dataset. |
| `server/dataset-management.ts` | Listing, atomic appends, path matching, replacement of rejected records and conflict errors. |
| `server/dataset-schema.ts` | Shared runtime schemas for creation and append requests. |
| `server/image-intake.ts` | Bounded full decoding, format checks, dimensions and user-facing decode errors. |
| `server/uploads.ts` | Store validated originals, serve verified images and validate legacy originals. |
| `server/migrations/004_image_validation.sql` | Add dimension and validation fields while preserving old records. |

React state represents the dataset selected from the server separately from the
local files waiting to upload. Adding files updates the selected dataset instead
of creating another record. The effect on mount restores the URL's dataset; the
submit handler owns uploads because they are user actions. A generation counter
prevents an old open request from replacing a newer selection.

## Verification

`npm run build` checks frontend/API TypeScript and creates the Vite bundle.
`npm run lint` checks source rules. `npm test` uses a unique PostgreSQL schema
and temporary files. Coverage includes reopening, append retry, conflicts,
concurrent count limits, full format decoding, corrupt inputs, MIME mismatch,
animation/pixel limits and legacy validation. Browser verification resumed an
empty manifest, reloaded its saved preview/dimensions, appended another image,
and reloaded again with the same dataset ID.

## Remaining work

The user is implementing the audit algorithms. Begin with the
[one-file hashing exercise](exercises/01-content-hash.md). Exact-duplicate groups,
visual neighbors and label checks remain open work in the active goal. Findings
are still fictional demo data. No LLM or agent execution is implemented.

This local server still buffers upload bodies, has no authentication/quotas, and
keeps originals on disk. Hosted usage needs streaming/concurrency controls,
ownership/authentication, persistent private storage and background work queues.
Listing is local and unpaginated. New-file identity currently uses path and
metadata, not a content fingerprint; detecting byte equality is the next exercise.
