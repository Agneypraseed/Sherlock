import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import test from 'node:test'
import { Pool } from 'pg'
import { buildApp } from './app.ts'
import { createDataset, migrate } from './db.ts'
import { MAX_IMAGES, MAX_IMAGE_BYTES } from '../shared/datasets.ts'
import type { CreateDatasetRequest, DatasetRecord } from '../shared/datasets.ts'
import { inspectImage } from './image-intake.ts'

test('Dataset API against PostgreSQL', async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  assert.ok(connectionString, 'Set DATABASE_URL or TEST_DATABASE_URL and start PostgreSQL before running tests.')
  // A unique schema keeps test writes and cleanup away from application data.
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const uploadRoot = await mkdtemp(join(tmpdir(), 'sherlock-uploads-'))
  const admin = new Pool({ connectionString, connectionTimeoutMillis: 5000 })
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 })
  const app = buildApp(pool, false, uploadRoot)
  t.after(async () => {
    await app.close()
    await pool.end()
    try {
      // schema is generated above, never taken from user input.
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    } finally {
      await admin.end()
      // Remove only entries in the unique directory created by this test.
      for (const filename of await readdir(uploadRoot)) await unlink(join(uploadRoot, filename))
      await rmdir(uploadRoot)
    }
  })
  await admin.query(`CREATE SCHEMA ${schema}`)
  await migrate(pool)

  const manifest: CreateDatasetRequest = {
    name: " Wildlife '); DROP TABLE datasets; -- ",
    images: [
      { filename: "cat's photo.jpg", byteSize: 1234, mimeType: 'image/jpeg' },
      { filename: 'bird.png', byteSize: 5678, mimeType: 'image/png' },
    ],
  }
  let created: DatasetRecord

  await t.test('creates dataset and image rows atomically and preserves literal SQL-like text', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/datasets', payload: manifest })
    assert.equal(response.statusCode, 201, response.body)
    created = response.json<DatasetRecord>()
    assert.match(created.id, /^[0-9a-f-]{36}$/)
    assert.equal(created.name, manifest.name.trim())
    assert.equal(created.status, 'awaiting_upload')
    assert.equal(created.imageCount, 2)
    assert.equal(created.totalBytes, 6912)
    assert.ok(Number.isFinite(Date.parse(created.createdAt)))
    assert.equal(response.headers.location, `/api/datasets/${created.id}`)
    const stored = await pool.query('SELECT filename, byte_size::integer, mime_type FROM images WHERE dataset_id = $1 ORDER BY position', [created.id])
    assert.deepEqual(stored.rows, [
      { filename: "cat's photo.jpg", byte_size: 1234, mime_type: 'image/jpeg' },
      { filename: 'bird.png', byte_size: 5678, mime_type: 'image/png' },
    ])
  })

  await t.test('a new API instance reads the persisted record', async () => {
    const restartedApp = buildApp(pool)
    try {
      const response = await restartedApp.inject({ method: 'GET', url: `/api/datasets/${created.id}` })
      assert.equal(response.statusCode, 200)
      const { images, ...summary } = response.json()
      assert.deepEqual(summary, created)
      assert.equal(images.length, 2)
      assert.equal(images[0].uploadedAt, null)
    } finally {
      await restartedApp.close()
    }
  })

  const badManifests = [
    ['blank name', { ...manifest, name: '   ' }],
    ['wrong name type', { ...manifest, name: 123 }],
    ['overlong name', { ...manifest, name: 'x'.repeat(121) }],
    ['control character in name', { ...manifest, name: 'bad\u0000name' }],
    ['empty manifest', { ...manifest, images: [] }],
    ['too many images', { ...manifest, images: Array(MAX_IMAGES + 1).fill(manifest.images[0]) }],
    ['unexpected field', { ...manifest, status: 'audited' }],
    ...[
      ['non-image type', { mimeType: 'text/plain' }],
      ['empty MIME type', { mimeType: '' }],
      ['zero size', { byteSize: 0 }],
      ['negative size', { byteSize: -1 }],
      ['fractional size', { byteSize: 1.5 }],
      ['oversized image', { byteSize: MAX_IMAGE_BYTES + 1 }],
      ['numeric string size', { byteSize: '123' }],
      ['path instead of filename', { filename: '../cat.jpg' }],
      ['Windows path instead of filename', { filename: 'folder\\cat.jpg' }],
      ['blank filename', { filename: '  ' }],
      ['control character in filename', { filename: 'a\u0000.png' }],
      ['unexpected image field', { objectKey: 'already-uploaded' }],
    ].map(([name, override]) => [name, { ...manifest, images: [{ ...manifest.images[0], ...override as object }] }]),
  ] as const

  for (const [name, payload] of badManifests) {
    await t.test(`rejects ${name}`, async () => {
      const response = await app.inject({ method: 'POST', url: '/api/datasets', payload })
      assert.equal(response.statusCode, 400, response.body)
      assert.equal(response.json().error.code, 'INVALID_DATASET')
    })
  }

  await t.test('invalid requests do not persist any records', async () => {
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM datasets')).rows[0].count, 1)
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM images')).rows[0].count, 2)
  })

  await t.test('rolls back the dataset when an image insert violates a database constraint', async () => {
    await assert.rejects(createDataset(pool, {
      name: 'Must roll back',
      images: [manifest.images[0], { ...manifest.images[1], byteSize: 0 }],
    }))
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM datasets')).rows[0].count, 1)
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM images')).rows[0].count, 2)
  })

  await t.test('migration can be rerun without changing existing data', async () => {
    await migrate(pool)
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM schema_migrations')).rows[0].count, 4)
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM datasets')).rows[0].count, 1)
  })

  await t.test('handles invalid JSON and oversized bodies', async () => {
    const invalidJson = await app.inject({ method: 'POST', url: '/api/datasets', headers: { 'content-type': 'application/json' }, payload: '{' })
    assert.equal(invalidJson.statusCode, 400)
    const oversized = await app.inject({ method: 'POST', url: '/api/datasets', payload: { ...manifest, name: 'x'.repeat(1024 * 1024) } })
    assert.equal(oversized.statusCode, 413)
  })

  await t.test('returns 404 for absent datasets and 400 for malformed IDs', async () => {
    assert.equal((await app.inject(`/api/datasets/${randomUUID()}`)).statusCode, 404)
    assert.equal((await app.inject('/api/datasets/not-a-uuid')).statusCode, 400)
  })

  await t.test('database errors produce a useful response without leaking SQL details', async () => {
    // This connection deliberately has no application schema.
    const unavailablePool = new Pool({ connectionString, options: '-c search_path=pg_catalog' })
    const unavailableApp = buildApp(unavailablePool)
    try {
      const response = await unavailableApp.inject({ method: 'POST', url: '/api/datasets', payload: manifest })
      assert.equal(response.statusCode, 503)
      assert.equal(response.json().error.code, 'DATASET_STORAGE_UNAVAILABLE')
      assert.doesNotMatch(response.body, /relation|INSERT|postgresql:\/\//)
    } finally {
      await unavailableApp.close()
      await unavailablePool.end()
    }
  })

  await t.test('uploads persist, invalid bytes are rejected, and partial uploads can resume', async () => {
    const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: 'red' } }).png().toBuffer()
    const createdResponse = await app.inject({ method: 'POST', url: '/api/datasets', payload: {
      name: 'Upload test', images: [0, 1].map(() => ({ filename: 'same.png', byteSize: png.length, mimeType: 'image/png' })),
    } })
    const id = createdResponse.json().id
    const details = (await app.inject(`/api/datasets/${id}`)).json()
    const first = `/api/datasets/${id}/images/${details.images[0].id}`
    const second = `/api/datasets/${id}/images/${details.images[1].id}`
    const put = (url: string, payload: Buffer) => app.inject({ method: 'PUT', url, headers: { 'content-type': 'application/octet-stream' }, payload })
    assert.equal((await app.inject(first)).statusCode, 404)
    assert.equal((await put(first, png.subarray(1))).statusCode, 400, 'Wrong size rejected')
    assert.equal((await put(first, Buffer.alloc(png.length))).statusCode, 400, 'Spoofed image rejected')
    assert.equal((await app.inject({ method: 'PUT', url: first, headers: {
      'content-type': 'application/octet-stream', 'content-length': String(MAX_IMAGE_BYTES + 1),
    }, payload: png })).statusCode, 413, 'Oversized upload rejected before buffering')
    assert.equal((await put(`/api/datasets/${randomUUID()}/images/${details.images[0].id}`, png)).statusCode, 404)
    assert.equal((await put(first, png)).statusCode, 204)
    assert.equal((await app.inject(`/api/datasets/${id}`)).json().status, 'uploading')
    assert.equal((await put(second, Buffer.alloc(png.length))).statusCode, 400)
    const changedBytes = Buffer.from(png)
    changedBytes[changedBytes.length - 1] ^= 1
    assert.equal((await put(first, changedBytes)).statusCode, 204, 'Retry cannot replace an uploaded original')
    assert.equal((await put(second, png)).statusCode, 204)
    const restarted = buildApp(pool, false, uploadRoot)
    try {
      const persisted = (await restarted.inject(`/api/datasets/${id}`)).json()
      assert.equal(persisted.status, 'ready')
      assert.ok(persisted.images.every((image: { uploadedAt: string }) => image.uploadedAt))
      const original = await restarted.inject(persisted.images[0].url)
      assert.equal(original.statusCode, 200)
      assert.equal(original.headers['content-type'], 'image/png')
      assert.equal(original.headers['x-content-type-options'], 'nosniff')
      assert.deepEqual(original.rawPayload, png)
      assert.equal((await readdir(uploadRoot)).length, 2, 'No temporary files or duplicate retry files')
    } finally {
      await restarted.close()
    }
  })

  await t.test('lists, reopens, appends and repairs a dataset without losing existing originals', async () => {
    const png = await sharp({ create: { width: 7, height: 5, channels: 3, background: 'blue' } }).png().toBuffer()
    const entry = { filename: 'one.png', relativePath: 'cats/one.png', byteSize: png.length, mimeType: 'image/png' }
    const created = (await app.inject({ method: 'POST', url: '/api/datasets', payload: { name: 'Resume and extend', images: [entry] } })).json()
    let details = (await app.inject(`/api/datasets/${created.id}`)).json()
    const firstId = details.images[0].id
    const put = (imageId: string, payload: Buffer) => app.inject({ method: 'PUT', url: `/api/datasets/${created.id}/images/${imageId}`, headers: { 'content-type': 'application/octet-stream' }, payload })
    const corrupt = Buffer.from(png); corrupt.fill(0, 20)
    assert.equal((await put(firstId, corrupt)).statusCode, 400, 'Signature-valid corrupt pixels must be rejected')
    details = (await app.inject(`/api/datasets/${created.id}`)).json()
    assert.equal(details.status, 'needs_attention')
    assert.match(details.images[0].validationError, /decode/)
    assert.equal(details.images[0].url, null)
    assert.equal((await put(firstId, png)).statusCode, 204)
    const second = { ...entry, filename: 'two.png', relativePath: 'dogs/two.png' }
    const append = () => app.inject({ method: 'POST', url: `/api/datasets/${created.id}/images`, payload: { images: [second] } })
    assert.equal((await append()).statusCode, 200)
    assert.equal((await append()).json().imageCount, 2, 'Lost-response retry cannot duplicate manifest rows')
    const reopened = buildApp(pool, false, uploadRoot)
    try {
      details = (await reopened.inject(`/api/datasets/${created.id}`)).json()
      assert.equal(details.images[0].id, firstId)
      assert.equal(details.images[0].width, 7)
      assert.equal(details.images[0].height, 5)
      assert.equal(details.images[1].uploadedAt, null)
      assert.equal((await put(details.images[1].id, png)).statusCode, 204)
      const list = (await reopened.inject('/api/datasets')).json()
      const summary = list.find((dataset: DatasetRecord) => dataset.id === created.id)
      assert.equal(summary.imageCount, 2); assert.equal(summary.uploadedCount, 2); assert.equal(summary.status, 'ready')
      const conflict = await app.inject({ method: 'POST', url: `/api/datasets/${created.id}/images`, payload: { images: [{ ...entry, byteSize: png.length + 1 }] } })
      assert.equal(conflict.statusCode, 409)
      assert.deepEqual((await app.inject(details.images[0].url)).rawPayload, png)
      // Revalidation upgrades originals stored by older signature-only versions.
      await pool.query('UPDATE images SET verified_at=NULL,width=NULL,height=NULL WHERE dataset_id=$1', [created.id])
      const validated = (await app.inject({ method: 'POST', url: `/api/datasets/${created.id}/validate` })).json()
      assert.equal(validated.status, 'ready'); assert.equal(validated.images[0].width, 7)
    } finally { await reopened.close() }
  })

  await t.test('fully decodes supported formats and rejects unsupported declarations and MIME mismatches', async () => {
    for (const [format, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp'], ['gif', 'image/gif'], ['tiff', 'image/tiff'], ['avif', 'image/avif']] as const) {
      const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: 'green' } }).toFormat(format).toBuffer()
      const created = (await app.inject({ method: 'POST', url: '/api/datasets', payload: {
        name: `Decode ${format}`, images: [{ filename: `test.${format}`, byteSize: bytes.length, mimeType: mime }],
      } })).json()
      const details = (await app.inject(`/api/datasets/${created.id}`)).json()
      const upload = await app.inject({ method: 'PUT', url: `/api/datasets/${created.id}/images/${details.images[0].id}`, headers: { 'content-type': 'application/octet-stream' }, payload: bytes })
      assert.equal(upload.statusCode, 204, `${format}: ${upload.body}`)
      const saved = (await app.inject(`/api/datasets/${created.id}`)).json()
      assert.equal(saved.images[0].width, 8); assert.equal(saved.images[0].height, 6)
    }
    const unsupported = await app.inject({ method: 'POST', url: '/api/datasets', payload: { name: 'Unsupported', images: [{ filename: 'test.bmp', byteSize: 40, mimeType: 'image/bmp' }] } })
    assert.equal(unsupported.statusCode, 400)
    assert.match(unsupported.json().error.message, /not supported/)
    const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: 'green' } }).png().toBuffer()
    const wrong = (await app.inject({ method: 'POST', url: '/api/datasets', payload: { name: 'Wrong MIME', images: [{ filename: 'test.jpg', byteSize: bytes.length, mimeType: 'image/jpeg' }] } })).json()
    const imageId = (await app.inject(`/api/datasets/${wrong.id}`)).json().images[0].id
    const mismatch = await app.inject({ method: 'PUT', url: `/api/datasets/${wrong.id}/images/${imageId}`, headers: { 'content-type': 'application/octet-stream' }, payload: bytes })
    assert.equal(mismatch.statusCode, 400); assert.match(mismatch.json().error.message, /does not match/)
  })

  await t.test('rejects animated and over-limit images before accepting their pixels', async () => {
    const single = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')
    const animated = Buffer.concat([single.subarray(0, -1), single.subarray(single.indexOf(0x2c))])
    await assert.rejects(inspectImage(animated, 'image/gif'), /Animated and multi-page/)
    const huge = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: 'white' } }).png().toBuffer()
    await assert.rejects(inspectImage(huge, 'image/png'), /25-megapixel/)
  })

  await t.test('concurrent append requests cannot exceed the dataset image limit', async () => {
    const entry = { filename: 'one.png', byteSize: 10, mimeType: 'image/png' }
    const created = (await app.inject({ method: 'POST', url: '/api/datasets', payload: {
      name: 'Count limit', images: Array.from({ length: MAX_IMAGES - 1 }, (_, index) => ({ ...entry, relativePath: `cats/${index}.png` })),
    } })).json()
    const responses = await Promise.all(['a', 'b'].map((name) => app.inject({ method: 'POST', url: `/api/datasets/${created.id}/images`, payload: { images: [{ ...entry, relativePath: `cats/${name}.png` }] } })))
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409])
    assert.equal((await app.inject(`/api/datasets/${created.id}`)).json().imageCount, MAX_IMAGES)
  })
})
