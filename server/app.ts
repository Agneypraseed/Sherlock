import Fastify, { type FastifyError } from 'fastify'
import type { Pool } from 'pg'
import { createDataset, getDataset } from './db.ts'
import { IMAGE_MIME_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES } from '../shared/datasets.ts'
import type { CreateDatasetRequest } from '../shared/datasets.ts'
import { registerUploads } from './uploads.ts'

const datasetResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'name', 'status', 'imageCount', 'totalBytes', 'createdAt'],
  properties: {
    id: { type: 'string' }, name: { type: 'string' },
    status: { type: 'string', const: 'awaiting_upload' },
    imageCount: { type: 'integer' }, totalBytes: { type: 'integer' },
    createdAt: { type: 'string' },
  },
}

export function buildApp(pool: Pool, logger = false, uploadRoot?: string) {
  const app = Fastify({
    logger,
    bodyLimit: 1024 * 1024,
    // Reject invalid types/unknown fields rather than silently changing input.
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  })

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      const path = error.validation[0]?.instancePath ?? ''
      const message = path.endsWith('/mimeType')
        ? 'An image has an unsupported or missing file type. Choose JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC, or HEIF files.'
        : path.endsWith('/byteSize')
          ? 'Each image must have a whole-number size greater than zero and no larger than 100 MiB.'
          : path.endsWith('/filename')
            ? 'Each image needs a filename of 1–255 characters, without folder paths or control characters.'
            : path === '/name'
              ? 'Enter a dataset name of 1–120 characters, without control characters.'
              : 'Provide a dataset name and 1–1000 images, each with a filename, byte size, and image type. Unexpected fields are not accepted.'
      return reply.code(400).send({ error: { code: 'INVALID_DATASET', message } })
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: {
        code: 'INVALID_REQUEST',
        message: error.statusCode === 413 ? 'The request exceeds the size limit (100 MiB per image; 1 MiB per manifest).' : 'Send a valid request with the expected content type.',
      } })
    }
    request.log.error({ err: error }, 'Dataset request failed')
    return reply.code(503).send({ error: {
      code: 'DATASET_STORAGE_UNAVAILABLE',
      message: 'Dataset storage is unavailable. Please try again shortly.',
    } })
  })

  app.post<{ Body: CreateDatasetRequest }>('/api/datasets', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['name', 'images'],
        properties: {
          name: {
            type: 'string', minLength: 1, maxLength: 120,
            allOf: [{ pattern: '\\S' }, { pattern: '^[^\\u0000-\\u001f\\u007f]+$' }],
          },
          images: {
            type: 'array', minItems: 1, maxItems: MAX_IMAGES,
            items: {
              type: 'object', additionalProperties: false,
              required: ['filename', 'byteSize', 'mimeType'],
              properties: {
                filename: {
                  type: 'string', minLength: 1, maxLength: 255,
                  not: { enum: ['.', '..'] },
                  allOf: [{ pattern: '\\S' }, { pattern: '^[^/\\\\\\u0000-\\u001f\\u007f]+$' }],
                },
                relativePath: {
                  type: 'string', minLength: 1, maxLength: 1024,
                  pattern: '^[^/\\\\\\u0000-\\u001f\\u007f]+(?:/[^/\\\\\\u0000-\\u001f\\u007f]+)*$',
                  not: { pattern: '(^|/)\\.\\.?(/|$)' },
                },
                byteSize: { type: 'integer', minimum: 1, maximum: MAX_IMAGE_BYTES },
                mimeType: { type: 'string', enum: IMAGE_MIME_TYPES },
              },
            },
          },
        },
      },
      response: { 201: datasetResponseSchema },
    },
  }, async (request, reply) => {
    const dataset = await createDataset(pool, request.body)
    return reply.code(201).header('Location', `/api/datasets/${dataset.id}`).send(dataset)
  })

  app.get<{ Params: { id: string } }>('/api/datasets/:id', {
    schema: {
      params: {
        type: 'object', required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const dataset = await getDataset(pool, request.params.id)
    if (!dataset) return reply.code(404).send({ error: { code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' } })
    return dataset
  })

  registerUploads(app, pool, uploadRoot)
  return app
}
