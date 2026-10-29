# Dataset and image upload API

Create a manifest, then upload each file to its image record. `awaiting_upload`
means no files are stored; `uploading` means some are stored; `ready` means all
are stored. None of these states indicates analysis has run.

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
- Declared MIME type: JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC, or HEIF.
- Unknown fields and incorrect JSON types are rejected, not coerced or silently removed.
- Manifest request body: at most 1 MiB. File requests have their own 100 MiB limit.

Success is `201 Created` with a `Location: /api/datasets/<id>` header:

```json
{
  "id": "<server-generated UUID>",
  "name": "Wildlife training set",
  "status": "awaiting_upload",
  "imageCount": 2,
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
(null until uploaded). Summary status is derived from successful uploads. A malformed
UUID returns `400`; a valid but absent UUID returns `404`. This supports retrieving
saved metadata after the API process or browser restarts. There is no list/history
UI yet.

## PUT /api/datasets/:id/images/:imageId

Send the original file as the raw request body, with content type
`application/octet-stream`. Use image IDs from the dataset GET response, not
filenames. Success returns `204 No Content`. The API checks actual length against
the manifest and verifies a matching container signature. Invalid data returns
`400 INVALID_IMAGE`; missing or unrelated image IDs return `404`. Files larger
than 100 MiB return `413`. Full image decoding is a later step.

An upload is buffered within the size limit, written to a temporary file, renamed
to `.data/images/<server image UUID>`, then marked uploaded in PostgreSQL. The row
is locked during the storage write, so concurrent retries cannot overwrite a
successful original. Repeated PUTs validate the incoming request and return 204
without replacing an already uploaded file. Earlier successful uploads survive a
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
