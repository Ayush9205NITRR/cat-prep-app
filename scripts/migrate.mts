import './env'
import { readFileSync } from 'node:fs'
import { db } from '../api/_lib/db'

const sql = readFileSync(new URL('../api/_lib/schema.sql', import.meta.url), 'utf8')
await db().query(sql)
console.log('Migrations done.')
await db().end()
