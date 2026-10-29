import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, unlink, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { MAX_IMAGE_BYTES } from '../shared/datasets.ts'

// Check container signatures, not filenames. Full decoding and dimensions are a later milestone.
function hasImageSignature(bytes: Buffer, mime: string): boolean {
  const hex = bytes.subarray(0, 16).toString('hex')
  const text = (start: number, end: number) => bytes.toString('ascii', start, end)
  switch (mime) {
    case 'image/png': return hex.startsWith('89504e470d0a1a0a')
    case 'image/jpeg': return hex.startsWith('ffd8ff')
    case 'image/gif': return ['GIF87a', 'GIF89a'].includes(text(0, 6))
    case 'image/webp': return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP'
    case 'image/bmp': return text(0, 2) === 'BM'
    case 'image/tiff': return hex.startsWith('49492a00') || hex.startsWith('4d4d002a')
    case 'image/avif': return text(4, 8) === 'ftyp' && ['avif', 'avis'].includes(text(8, 12))
    case 'image/heic': return text(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx'].includes(text(8, 12))
    case 'image/heif': return text(4, 8) === 'ftyp' && ['mif1', 'msf1', 'heic', 'heix'].includes(text(8, 12))
    default: return false
  }
}

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
      const result = await client.query<{ id: string; byte_size: string; mime_type: string; uploaded_at: Date | null }>(
        'SELECT id, byte_size, mime_type, uploaded_at FROM images WHERE dataset_id = $1 AND id = $2 FOR UPDATE',
        [request.params.id, request.params.imageId],
      )
      const image = result.rows[0]
      if (!image) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: { code: 'IMAGE_NOT_FOUND', message: 'Image record not found.' } })
      }
      if (request.body.length !== Number(image.byte_size) || !hasImageSignature(request.body, image.mime_type)) {
        await client.query('ROLLBACK')
        return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: 'The file size or image format does not match its metadata. Choose a valid image file.' } })
      }
      if (!image.uploaded_at) {
        await mkdir(root, { recursive: true })
        temporaryPath = join(root, `${image.id}.${randomUUID()}.tmp`)
        await writeFile(temporaryPath, request.body, { flag: 'wx' })
        await rename(temporaryPath, join(root, image.id))
        temporaryPath = undefined
        await client.query('UPDATE images SET uploaded_at = now() WHERE id = $1', [image.id])
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
      'SELECT id, mime_type FROM images WHERE dataset_id = $1 AND id = $2 AND uploaded_at IS NOT NULL',
      [request.params.id, request.params.imageId],
    )
    const image = result.rows[0]
    if (!image) return reply.code(404).send({ error: { code: 'IMAGE_NOT_FOUND', message: 'Uploaded image not found.' } })
    const path = join(root, image.id)
    await stat(path) // Surface missing storage as a service error before sending headers.
    return reply.type(image.mime_type).header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store').send(createReadStream(path))
  })
}
