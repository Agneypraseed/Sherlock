import Fastify, { type FastifyError } from 'fastify'
import type { Pool } from 'pg'
import { createDataset, getDataset } from './db.ts'
import type { CreateDatasetRequest } from '../shared/datasets.ts'
import { registerUploads } from './uploads.ts'
import { appendImages, DatasetRequestError, listDatasets } from './dataset-management.ts'
import { datasetBody, datasetParams, imagesSchema } from './dataset-schema.ts'
import type { ImageManifestEntry } from '../shared/datasets.ts'

const datasetResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'name', 'status', 'imageCount', 'uploadedCount', 'totalBytes', 'createdAt'],
  properties: {
    id: { type: 'string' }, name: { type: 'string' },
    status: { type: 'string', const: 'awaiting_upload' },
    imageCount: { type: 'integer' }, totalBytes: { type: 'integer' },
    uploadedCount: { type: 'integer' },
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
    if (error instanceof DatasetRequestError) return reply.code(error.statusCode).send({ error: { code: 'DATASET_REQUEST_FAILED', message: error.message } })
    if (error.validation) {
      const path = error.validation[0]?.instancePath ?? ''
      const message = path.endsWith('/mimeType')
        ? 'Unsupported image type. Choose JPEG, PNG, WebP, static GIF, single-page TIFF, or AVIF. BMP and HEIC/HEIF are not supported.'
        : path.endsWith('/byteSize')
          ? 'Each image must have a whole-number size greater than zero and no larger than 100 MiB.'
          : path.endsWith('/relativePath')
            ? 'Use a relative folder path up to 1024 characters, without empty, dot, or parent-directory components.'
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

  app.get('/api/datasets', async () => listDatasets(pool))
  app.post<{ Params: { id: string }; Body: { images: ImageManifestEntry[] } }>('/api/datasets/:id/images', {
    schema: { params: datasetParams, body: {
      type: 'object', additionalProperties: false, required: ['images'], properties: { images: imagesSchema },
    } },
  }, async (request) => appendImages(pool, request.params.id, request.body.images))

  app.post<{ Body: CreateDatasetRequest }>('/api/datasets', {
    schema: {
      body: datasetBody,
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
