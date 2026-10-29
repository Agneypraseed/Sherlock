import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, unlink, writeFile, stat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { MAX_IMAGE_BYTES } from '../shared/datasets.ts'
import { inspectImage, InvalidImageError } from './image-intake.ts'
import { datasetParams } from './dataset-schema.ts'
import { getDataset } from './db.ts'

const paramsSchema = {
  type: 'object', required: ['id', 'imageId'],
  properties: { id: { type: 'string', format: 'uuid' }, imageId: { type: 'string', format: 'uuid' } },
}
type ImageParams = { id: string; imageId: string }

export function registerUploads(app: FastifyInstance, pool: Pool, root = resolve('.data/images')) {
  // Fastify enforces body size and Content-Length before the handler receives a buffer.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body))

  app.put<{ Params: ImageParams; Body: Buffer }>('/api/datasets/:id/images/:imageId', {
    bodyLimit: MAX_IMAGE_BYTES,
    schema: { params: paramsSchema },
  }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: { code: 'INVALID_IMAGE', message: 'Send image bytes as application/octet-stream.' } })
    const client = await pool.connect()
    let temporaryPath: string | undefined
    try {
      await client.query('BEGIN')
      // Serialize attempts for this image; successful uploads are immutable on retry.
      const result = await client.query<{ id: string; byte_size: string; mime_type: string; uploaded_at: Date | null; verified_at: Date | null; validation_error: string | null }>(
        'SELECT id, byte_size, mime_type, uploaded_at, verified_at, validation_error FROM images WHERE dataset_id = $1 AND id = $2 FOR UPDATE',
        [request.params.id, request.params.imageId],
      )
      const image = result.rows[0]
      if (!image) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: { code: 'IMAGE_NOT_FOUND', message: 'Image record not found.' } })
      }
      if (request.body.length !== Number(image.byte_size)) {
        await client.query('ROLLBACK')
        return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: 'The file size or image format does not match its metadata. Choose a valid image file.' } })
      }
      if (!image.uploaded_at || image.validation_error) {
        let decoded
        try { decoded = await inspectImage(request.body, image.mime_type) }
        catch (error) {
          if (!(error instanceof InvalidImageError)) throw error
          await client.query('UPDATE images SET validation_error=$2, verified_at=now() WHERE id=$1', [image.id, error.message])
          await client.query('COMMIT')
          return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: error.message } })
        }
        await mkdir(root, { recursive: true })
        temporaryPath = join(root, `${image.id}.${randomUUID()}.tmp`)
        await writeFile(temporaryPath, request.body, { flag: 'wx' })
        await rename(temporaryPath, join(root, image.id))
        temporaryPath = undefined
        await client.query(`UPDATE images SET uploaded_at=now(), width=$2, height=$3, format=$4,
          verified_at=now(), validation_error=NULL WHERE id=$1`, [image.id, decoded.width, decoded.height, decoded.format])
      }
      await client.query('COMMIT')
      return reply.code(204).send()
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (temporaryPath) await unlink(temporaryPath).catch(() => {})
      client.release()
    }
  })

  app.get<{ Params: ImageParams }>('/api/datasets/:id/images/:imageId', {
    schema: { params: paramsSchema },
  }, async (request, reply) => {
    const result = await pool.query<{ id: string; mime_type: string }>(
      'SELECT id, mime_type FROM images WHERE dataset_id = $1 AND id = $2 AND uploaded_at IS NOT NULL AND verified_at IS NOT NULL AND validation_error IS NULL',
      [request.params.id, request.params.imageId],
    )
    const image = result.rows[0]
    if (!image) return reply.code(404).send({ error: { code: 'IMAGE_NOT_FOUND', message: 'Uploaded image not found.' } })
    const path = join(root, image.id)
    await stat(path) // Surface missing storage as a service error before sending headers.
    return reply.type(image.mime_type).header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store').send(createReadStream(path))
  })

  // Explicitly validate originals saved by versions that only checked signatures.
  app.post<{ Params: { id: string } }>('/api/datasets/:id/validate', { schema: { params: datasetParams } }, async (request, reply) => {
    const dataset = await getDataset(pool, request.params.id)
    if (!dataset) return reply.code(404).send({ error: { code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' } })
    for (const image of dataset.images.filter((entry) => entry.uploadedAt && !entry.verifiedAt)) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const locked = await client.query('SELECT uploaded_at, verified_at FROM images WHERE id=$1 FOR UPDATE', [image.id])
        if (!locked.rows[0]?.uploaded_at || locked.rows[0]?.verified_at) { await client.query('COMMIT'); continue }
        try {
          const bytes = await readFile(join(root, image.id))
          if (bytes.length !== image.byteSize) throw new InvalidImageError('Stored file size does not match its metadata. Reselect the original to repair it.')
          const decoded = await inspectImage(bytes, image.mimeType)
          await client.query('UPDATE images SET width=$2,height=$3,format=$4,verified_at=now(),validation_error=NULL WHERE id=$1', [image.id, decoded.width, decoded.height, decoded.format])
        } catch (error) {
          const message = error instanceof InvalidImageError ? error.message : 'The stored file is unavailable. Reselect the original to repair it.'
          await client.query('UPDATE images SET verified_at=now(),validation_error=$2 WHERE id=$1', [image.id, message])
        }
        await client.query('COMMIT')
      } catch (error) { await client.query('ROLLBACK'); throw error }
      finally { client.release() }
    }
    return getDataset(pool, request.params.id)
  })
}
