import './env'
import { readFileSync } from 'node:fs'

// Schema changes go over Neon's direct (non-pooled) connection, as Neon recommends.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED
const { db } = await import('../api/_lib/db')

const sql = readFileSync(new URL('../api/_lib/schema.sql', import.meta.url), 'utf8')
await db().query(sql)
console.log('Migrations done.')
await db().end()
