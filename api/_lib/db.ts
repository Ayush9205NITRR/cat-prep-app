import { attachDatabasePool } from '@vercel/functions'
import pg from 'pg'

// Neon on Vercel: node-postgres with Fluid compute. attachDatabasePool lets Vercel close idle
// clients before a function instance is suspended, so connections are not leaked.
// DATABASE_URL is Neon's pooled (-pooler) string; migrations use DATABASE_URL_UNPOOLED.
let pool: pg.Pool | undefined

export function db(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
    pool = new pg.Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 5_000,
      ssl: local ? undefined : { rejectUnauthorized: true },
    })
    attachDatabasePool(pool)
  }
  return pool
}

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await db().query<T>(text, params)
  return r.rows
}
