import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import type { CreateDatasetRequest, DatasetDetails, DatasetRecord } from '../shared/datasets.ts'

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required. Copy .env.example to .env and start PostgreSQL.')
  return new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
}

export async function migrate(pool: Pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialize concurrent migration commands; schema changes happen once.
    await client.query('SELECT pg_advisory_xact_lock(73104812)')
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const version of ['001_datasets', '002_image_uploads', '003_image_relative_paths']) {
      const applied = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [version])
      if (applied.rowCount === 0) {
        const sql = await readFile(new URL(`./migrations/${version}.sql`, import.meta.url), 'utf8')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function createDataset(pool: Pool, input: CreateDatasetRequest): Promise<DatasetRecord> {
  const client = await pool.connect()
  try {
    // Both tables must use the same connection and transaction.
    await client.query('BEGIN')
    const id = randomUUID()
    const dataset = await client.query<{ name: string; created_at: Date }>(
      'INSERT INTO datasets (id, name) VALUES ($1, $2) RETURNING name, created_at',
      [id, input.name.trim()],
    )
    const images = input.images.map((image, position) => ({
      id: randomUUID(), position, filename: image.filename,
      relative_path: image.relativePath ?? image.filename,
      byte_size: image.byteSize, mime_type: image.mimeType,
    }))
    await client.query(
      `INSERT INTO images (id, dataset_id, position, filename, relative_path, byte_size, mime_type)
       SELECT image.id, $1, image.position, image.filename, image.relative_path, image.byte_size, image.mime_type
       FROM jsonb_to_recordset($2::jsonb) AS image(id uuid, position integer, filename text, relative_path text, byte_size bigint, mime_type text)`,
      [id, JSON.stringify(images)],
    )
    await client.query('COMMIT')
    return {
      id, name: dataset.rows[0].name, status: 'awaiting_upload',
      imageCount: images.length,
      totalBytes: input.images.reduce((sum, image) => sum + image.byteSize, 0),
      createdAt: dataset.rows[0].created_at.toISOString(),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getDataset(pool: Pool, id: string): Promise<DatasetDetails | null> {
  const result = await pool.query<{
    id: string; name: string; status: 'awaiting_upload'; created_at: Date;
    image_count: number; total_bytes: string;
  }>(
    `SELECT d.id, d.name, d.status, d.created_at,
            count(i.id)::integer AS image_count, coalesce(sum(i.byte_size), 0)::text AS total_bytes
     FROM datasets d LEFT JOIN images i ON i.dataset_id = d.id
     WHERE d.id = $1 GROUP BY d.id`,
    [id],
  )
  const row = result.rows[0]
  if (!row) return null
  const stored = await pool.query<{
    id: string; position: number; filename: string; relative_path: string; byte_size: string; mime_type: string; uploaded_at: Date | null
  }>('SELECT id, position, filename, relative_path, byte_size, mime_type, uploaded_at FROM images WHERE dataset_id = $1 ORDER BY position', [id])
  const images = stored.rows.map((image) => ({
    id: image.id, position: image.position, filename: image.filename,
    relativePath: image.relative_path,
    byteSize: Number(image.byte_size), mimeType: image.mime_type,
    uploadedAt: image.uploaded_at?.toISOString() ?? null,
    url: image.uploaded_at ? `/api/datasets/${id}/images/${image.id}` : null,
  }))
  const uploadedCount = images.filter((image) => image.uploadedAt).length
  return {
    id: row.id, name: row.name,
    status: uploadedCount === images.length ? 'ready' : uploadedCount > 0 ? 'uploading' : 'awaiting_upload',
    imageCount: row.image_count, totalBytes: Number(row.total_bytes),
    createdAt: row.created_at.toISOString(),
    images,
  }
}
