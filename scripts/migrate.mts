import './env'
import { readFileSync } from 'node:fs'

// Schema changes go over Neon's direct (non-pooled) connection, as Neon recommends.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED
const { db } = await import('../api/_lib/db')

const sql = readFileSync(new URL('../api/_lib/schema.sql', import.meta.url), 'utf8')
await db().query(sql)
// Backfill: mocks saved before sections existed get the section most of their rows belong to.
const { majoritySection } = await import('../shared/topics')
const { rows: missing } = await db().query(`SELECT m.id, array_agg(q.topic) AS topics FROM mocks m JOIN questions q ON q.mock_id = m.id WHERE m.section IS NULL GROUP BY m.id`)
for (const m of missing) await db().query('UPDATE mocks SET section = $2 WHERE id = $1', [m.id, majoritySection(m.topics)])
if (missing.length) console.log(`Set the section on ${missing.length} older mock(s).`)
console.log('Migrations done.')
await db().end()
