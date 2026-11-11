import pg from 'pg'

let pool: pg.Pool | undefined

export function db(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
    pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? undefined : { rejectUnauthorized: true } })
  }
  return pool
}

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await db().query<T>(text, params)
  return r.rows
}
