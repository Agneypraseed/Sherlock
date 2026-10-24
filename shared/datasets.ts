// Small shared API contract. The server validates it at runtime with JSON Schema.
export const MAX_IMAGES = 1000
export const MAX_IMAGE_BYTES = 100 * 1024 * 1024
export const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
  'image/tiff', 'image/avif', 'image/heic', 'image/heif',
] as const

export interface ImageManifestEntry {
  filename: string
  byteSize: number
  mimeType: string
}

export interface CreateDatasetRequest {
  name: string
  images: ImageManifestEntry[]
}

export interface DatasetRecord {
  id: string
  name: string
  status: 'awaiting_upload'
  imageCount: number
  totalBytes: number
  createdAt: string
}
