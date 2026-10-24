import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'

// Development only. Production uses an externally managed DATABASE_URL.
const databaseDir = fileURLToPath(new URL('../.data/postgres', import.meta.url))
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'sherlock', password: 'sherlock_local_only', port: 54329,
  persistent: true,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8'],
  postgresFlags: ['-h', '127.0.0.1'],
})

if (!existsSync(`${databaseDir}/PG_VERSION`)) await postgres.initialise()
await postgres.start()
const client = postgres.getPgClient('postgres', '127.0.0.1')
try {
  await client.connect()
  const database = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['sherlock'])
  if (database.rowCount === 0) await client.query('CREATE DATABASE sherlock')
  console.log('Local PostgreSQL is ready on 127.0.0.1:54329. Data persists in .data/postgres. Stop with Ctrl+C.')
} finally {
  await client.end()
}

// The helper owns this child process and stops it when this script exits.
