import sharp from 'sharp'

export const MAX_IMAGE_PIXELS = 25_000_000
export class InvalidImageError extends Error {}

export async function inspectImage(bytes: Buffer, declaredMime: string) {
  try {
    const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS })
    const metadata = await decoder.metadata()
    const mime: Record<string, string> = {
      jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', tiff: 'image/tiff',
    }
    const detectedMime = metadata.format === 'heif' && metadata.compression === 'av1' ? 'image/avif' : mime[metadata.format ?? '']
    if (!detectedMime) throw new InvalidImageError('Unsupported image format. Use JPEG, PNG, WebP, static GIF, single-page TIFF, or AVIF. BMP and HEIC/HEIF are not supported.')
    if (detectedMime !== declaredMime) throw new InvalidImageError('The decoded image format does not match the declared file type.')
    if ((metadata.pages ?? 1) !== 1) throw new InvalidImageError('Animated and multi-page images are not supported. Export one frame per file.')
    // metadata() only reads headers. Materialize all pixels to detect truncated/corrupt data.
    const { info } = await decoder.timeout({ seconds: 20 }).raw().toBuffer({ resolveWithObject: true })
    return { width: info.width, height: info.height, format: metadata.format! }
  } catch (error) {
    if (error instanceof InvalidImageError) throw error
    throw new InvalidImageError('The image could not be fully decoded. It may be corrupt, truncated, unsupported, or exceed the 25-megapixel limit.')
  }
}
