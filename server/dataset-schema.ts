import { IMAGE_MIME_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES } from '../shared/datasets.ts'

export const datasetParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }
export const imagesSchema = {
  type: 'array', minItems: 1, maxItems: MAX_IMAGES,
  items: {
    type: 'object', additionalProperties: false, required: ['filename', 'byteSize', 'mimeType'],
    properties: {
      filename: { type: 'string', minLength: 1, maxLength: 255, not: { enum: ['.', '..'] },
        allOf: [{ pattern: '\\S' }, { pattern: '^[^/\\\\\\u0000-\\u001f\\u007f]+$' }] },
      relativePath: { type: 'string', minLength: 1, maxLength: 1024,
        pattern: '^[^/\\\\\\u0000-\\u001f\\u007f]+(?:/[^/\\\\\\u0000-\\u001f\\u007f]+)*$',
        not: { pattern: '(^|/)\\.\\.?(/|$)' } },
      byteSize: { type: 'integer', minimum: 1, maximum: MAX_IMAGE_BYTES },
      mimeType: { type: 'string', enum: IMAGE_MIME_TYPES },
    },
  },
}
export const datasetBody = {
  type: 'object', additionalProperties: false, required: ['name', 'images'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120,
      allOf: [{ pattern: '\\S' }, { pattern: '^[^\\u0000-\\u001f\\u007f]+$' }] },
    images: imagesSchema,
  },
}
