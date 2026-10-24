import { buildApp } from './app.ts'
import { createPool } from './db.ts'

const pool = createPool()
const app = buildApp(pool, true)
pool.on('error', (error) => app.log.error({ err: error }, 'Idle database connection failed'))
app.addHook('onClose', () => pool.end())

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close() })
}

try {
  await pool.query('SELECT 1')
  await app.listen({ host: process.env.API_HOST ?? '127.0.0.1', port: Number(process.env.API_PORT ?? 3001) })
} catch (error) {
  app.log.error(error)
  await app.close()
  process.exitCode = 1
}
