# Dataset metadata API

This milestone records metadata. `awaiting_upload` means no image bytes are
stored and no analysis has run.

## POST /api/datasets

Content type: `application/json`.

```json
{
  "name": "Wildlife training set",
  "images": [
    { "filename": "cat.jpg", "byteSize": 184200, "mimeType": "image/jpeg" },
    { "filename": "bird.png", "byteSize": 245100, "mimeType": "image/png" }
  ]
}
```

Constraints:

- Dataset name: 1–120 characters with non-whitespace content; no control characters.
  Leading/trailing whitespace is trimmed before persistence.
- Images: 1–1000 entries.
- Filename: 1–255 characters, no folder paths/control characters, and not `.` or `..`.
- Byte size: integer from 1 through 104857600 (100 MiB).
- Declared MIME type: JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC, or HEIF.
- Unknown fields and incorrect JSON types are rejected, not coerced or silently removed.
- Request body: at most 1 MiB. Actual image content validation is deferred to uploads.

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

Returns the same summary with `200 OK`, derived from persisted rows. A malformed
UUID returns `400`; a valid but absent UUID returns `404`. This supports retrieving
saved metadata after the API process or browser restarts. There is no list/history
UI yet.

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

This development API has no authentication, ownership checks, image-byte upload,
analysis, or agent execution. It defaults to `127.0.0.1`. Before public deployment,
add authenticated ownership and request limits appropriate to the hosted workload.
Keep the database connection string entirely on the server. Production frontend
hosting must route `/api` to the Node service, or introduce an explicit API origin
and CORS configuration; Vite's proxy exists only in development.

## References

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [node-postgres transactions](https://node-postgres.com/features/transactions)
- [node-postgres parameterized queries](https://node-postgres.com/features/queries)
- [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/)
