import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Pool } from 'pg'
import { buildApp } from './app.ts'
import { createDataset, migrate } from './db.ts'
import { MAX_IMAGES, MAX_IMAGE_BYTES } from '../shared/datasets.ts'
import type { CreateDatasetRequest, DatasetRecord } from '../shared/datasets.ts'

test('Dataset API against PostgreSQL', async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  assert.ok(connectionString, 'Set DATABASE_URL or TEST_DATABASE_URL and start PostgreSQL before running tests.')
  // A unique schema keeps test writes and cleanup away from application data.
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const admin = new Pool({ connectionString, connectionTimeoutMillis: 5000 })
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 })
  const app = buildApp(pool)
  t.after(async () => {
    await app.close()
    await pool.end()
    try {
      // schema is generated above, never taken from user input.
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    } finally {
      await admin.end()
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
      assert.deepEqual(response.json(), created)
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
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM schema_migrations')).rows[0].count, 1)
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
})
