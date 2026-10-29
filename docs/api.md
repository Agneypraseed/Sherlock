# Dataset and image upload API

Create a manifest, then upload each file to its image record. `awaiting_upload`
means no files are stored; `uploading` means incomplete/unverified; `ready` means all
are stored and decoded. `needs_attention` means validation failed. None indicates analysis has run.

## POST /api/datasets

Content type: `application/json`.

```json
{
  "name": "Wildlife training set",
  "images": [
    { "filename": "cat.jpg", "relativePath": "cats/train/cat.jpg", "byteSize": 184200, "mimeType": "image/jpeg" },
    { "filename": "bird.png", "relativePath": "birds/bird.png", "byteSize": 245100, "mimeType": "image/png" }
  ]
}
```

Constraints:

- Dataset name: 1–120 characters with non-whitespace content; no control characters.
  Leading/trailing whitespace is trimmed before persistence.
- Images: 1–1000 entries.
- Filename: 1–255 characters, no folder paths/control characters, and not `.` or `..`.
- Relative path: optional for single files (defaults to filename); for folders,
  forward slashes separate names. Maximum 1024 characters; no absolute path,
  backslashes, control characters, or `.`/`..` path components.
- Byte size: integer from 1 through 104857600 (100 MiB).
- Declared MIME type: JPEG, PNG, WebP, static GIF, single-page TIFF, or AVIF.
- Unknown fields and incorrect JSON types are rejected, not coerced or silently removed.
- Manifest request body: at most 1 MiB. File requests have their own 100 MiB limit.

Success is `201 Created` with a `Location: /api/datasets/<id>` header:

```json
{
  "id": "<server-generated UUID>",
  "name": "Wildlife training set",
  "status": "awaiting_upload",
  "imageCount": 2,
  "uploadedCount": 0,
  "totalBytes": 429300,
  "createdAt": "<server-generated ISO timestamp>"
}
```

All writes use one checked-out PostgreSQL connection and one transaction. If an
image insert fails, the entire dataset is rolled back. User strings are bound
parameters; bulk image rows are passed as a JSON parameter, not interpolated SQL.
Duplicate filenames are allowed: these are manifest entries with separate IDs
and positions, not object-storage paths or image identities.

## GET /api/datasets/:id

Returns the summary plus an ordered `images` array with `id`, `position`,
`filename`, `relativePath`, `byteSize`, `mimeType`, `uploadedAt` (null until uploaded), and `url`
(null until uploaded and verified). It also returns `width`, `height`, `format`,
`verifiedAt`, and `validationError` (nullable). Summary includes `uploadedCount`.
Status is derived from uploads and validation. A malformed
UUID returns `400`; a valid but absent UUID returns `404`. This supports retrieving
saved metadata after the API process or browser restarts.

## GET /api/datasets

Returns dataset summaries in newest-first order for the saved-dataset browser.
This local version is unpaginated.

## POST /api/datasets/:id/images

Accepts `{ "images": [...] }`, using the creation manifest's image schema. Returns
the updated dataset details. Matching paths reuse IDs, so a repeated append is
safe. Valid uploaded originals cannot be replaced: changed metadata at an existing
path returns `409`. Pending/rejected entries may be repaired with corrected metadata.
New paths append records. Dataset row locking enforces the 1,000-image total limit
under concurrent requests; an over-limit append rolls back entirely.

## POST /api/datasets/:id/validate

Decodes stored originals that do not yet have a verification timestamp, preserving
their bytes and recording dimensions or errors. Returns updated details. Use this
for files uploaded before full decoding was introduced.

## PUT /api/datasets/:id/images/:imageId

Send the original file as the raw request body, with content type
`application/octet-stream`. Use image IDs from the dataset GET response, not
filenames. Success returns `204 No Content`. The API checks actual length against
the manifest and fully decodes new/repaired files before accepting them. Invalid data returns
`400 INVALID_IMAGE`; missing or unrelated image IDs return `404`. Files larger
than 100 MiB return `413`. Decode limits: 25 million pixels, one frame/page, and a
20-second decoder timeout. Corrupt/unsupported files record a validation error.

An upload is buffered within the size limit, written to a temporary file, renamed
to `.data/images/<server image UUID>`, then marked uploaded in PostgreSQL. The row
is locked during the storage write, so concurrent retries cannot overwrite a
successful original. Repeated PUTs check size and return 204 for existing originals
without replacing them. Earlier successful uploads survive a
later failure. If the process stops after rename but before database commit, the
file may be present without an upload timestamp; retry safely replaces it.

## GET /api/datasets/:id/images/:imageId

Streams the stored original using its verified declared image content type and
`X-Content-Type-Options: nosniff`. Unuploaded or absent records return `404`.
Supported browser image formats render as previews; other formats link to the
original. Storage errors return `503` before response headers are sent.

## Errors

```json
{
  "error": {
    "code": "INVALID_DATASET",
    "message": "Enter a dataset name of 1–120 characters, without control characters."
  }
}
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid manifest, malformed JSON, or invalid dataset ID. |
| 404 | Dataset ID does not exist. |
| 409 | Path conflict or append would exceed the total image limit. |
| 413 | Manifest exceeds the request-body limit. |
| 415 | Unsupported request content type. |
| 503 | Storage operation failed; details are logged server-side. |

This development API has no authentication, ownership checks, analysis, or agent
execution. It defaults to `127.0.0.1`. Before public deployment,
add authenticated ownership and request limits appropriate to the hosted workload.
Keep the database connection string entirely on the server. Production frontend
hosting must route `/api` to the Node service, or introduce an explicit API origin
and CORS configuration; Vite's proxy exists only in development.

## References

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [node-postgres transactions](https://node-postgres.com/features/transactions)
- [node-postgres parameterized queries](https://node-postgres.com/features/queries)
- [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/)
