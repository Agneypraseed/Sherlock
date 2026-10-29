import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { MAX_IMAGES } from '../shared/datasets.ts'
import type { ImageManifestEntry } from '../shared/datasets.ts'
import { getDataset } from './db.ts'

export class DatasetRequestError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 409) { super(message); this.statusCode = statusCode }
}

// Lock the parent row so concurrent append requests cannot exceed the image limit.
// Matching paths reuse existing IDs, making a retry after a lost response safe.
export async function appendImages(pool: Pool, id: string, images: ImageManifestEntry[]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const dataset = await client.query('SELECT id FROM datasets WHERE id = $1 FOR UPDATE', [id])
    if (!dataset.rowCount) throw new DatasetRequestError('Dataset not found.', 404)
    const existing = await client.query<{
      id: string; relative_path: string; byte_size: string; mime_type: string;
      uploaded_at: Date | null; validation_error: string | null;
    }>('SELECT id, relative_path, byte_size, mime_type, uploaded_at, validation_error FROM images WHERE dataset_id = $1 ORDER BY position FOR UPDATE', [id])
    let count = existing.rows.length
    for (const image of images) {
      const path = image.relativePath ?? image.filename
      const match = existing.rows.find((entry) => entry.relative_path === path)
      if (match) {
        if (!match.uploaded_at || match.validation_error) {
          await client.query(`UPDATE images SET filename=$2, byte_size=$3, mime_type=$4,
            uploaded_at=NULL, width=NULL, height=NULL, format=NULL, verified_at=NULL, validation_error=NULL WHERE id=$1`,
          [match.id, image.filename, image.byteSize, image.mimeType])
          match.byte_size = String(image.byteSize)
          match.mime_type = image.mimeType
        } else if (Number(match.byte_size) !== image.byteSize || match.mime_type !== image.mimeType) {
          throw new DatasetRequestError(`An uploaded image already uses ${path}. Give the new file a different path or create another dataset.`)
        }
        continue
      }
      if (count >= MAX_IMAGES) throw new DatasetRequestError('This dataset would exceed the 1,000-image limit.')
      const imageId = randomUUID()
      await client.query(`INSERT INTO images (id,dataset_id,position,filename,relative_path,byte_size,mime_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [imageId, id, count++, image.filename, path, image.byteSize, image.mimeType])
      existing.rows.push({ id: imageId, relative_path: path, byte_size: String(image.byteSize), mime_type: image.mimeType, uploaded_at: null, validation_error: null })
    }
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
  return getDataset(pool, id)
}

export async function listDatasets(pool: Pool) {
  const result = await pool.query(`SELECT d.id, d.name, d.created_at,
    count(i.id)::integer AS image_count,
    count(i.uploaded_at)::integer AS uploaded_count,
    count(i.id) FILTER (WHERE i.validation_error IS NOT NULL)::integer AS invalid_count,
    count(i.id) FILTER (WHERE i.verified_at IS NOT NULL AND i.validation_error IS NULL)::integer AS valid_count,
    coalesce(sum(i.byte_size),0)::text AS total_bytes
    FROM datasets d LEFT JOIN images i ON d.id=i.dataset_id GROUP BY d.id ORDER BY d.created_at DESC, d.id`)
  return result.rows.map((row) => ({
    id: row.id, name: row.name, createdAt: row.created_at.toISOString(),
    imageCount: row.image_count, uploadedCount: row.uploaded_count, totalBytes: Number(row.total_bytes),
    status: row.invalid_count ? 'needs_attention' : row.valid_count === row.image_count ? 'ready'
      : row.uploaded_count > 0 ? 'uploading' : 'awaiting_upload',
  }))
}
