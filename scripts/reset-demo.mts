// npm run db:reset-demo [-- <username>]   (default: demo)
// Deletes ALL content of one user in a single transaction and prints how many rows went from each table.
// Keeps the account itself: username, password, MCP token, Google link, exam date, Claude connections.
import './env'
import { db } from '../api/_lib/db'

const username = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'demo'
const client = await db().connect()
try {
  await client.query('BEGIN')
  const { rows: [user] } = await client.query('SELECT id FROM users WHERE username = $1 FOR UPDATE', [username])
  if (!user) throw new Error(`No user "${username}".`)
  const uid = user.id
  // Children before parents, so each count is that table's own rows (not hidden cascades).
  const steps: [string, string][] = [
    ['mock_uploads (inbox: uploaded mocks, assignments, notes)', 'DELETE FROM mock_uploads WHERE user_id = $1'],
    ['flashcards (cards and their review state)', 'DELETE FROM flashcards WHERE user_id = $1'],
    ['note_versions', 'DELETE FROM note_versions WHERE user_id = $1'],
    ['note_files', 'DELETE FROM note_files WHERE user_id = $1'],
    ['notes (incl. fix notes)', 'DELETE FROM notes WHERE user_id = $1'],
    ['attempts (practice answers and taps)', 'DELETE FROM attempts WHERE user_id = $1'],
    ['questions (mock/test rows and review taps)', 'DELETE FROM questions WHERE mock_id IN (SELECT id FROM mocks WHERE user_id = $1)'],
    ['mocks (mocks, tests, retests)', 'DELETE FROM mocks WHERE user_id = $1'],
    ['practice_questions (saved questions)', 'DELETE FROM practice_questions WHERE user_id = $1'],
  ]
  const counts: [string, number][] = []
  for (const [name, sql] of steps) counts.push([name, (await client.query(sql, [uid])).rowCount ?? 0])
  await client.query('COMMIT')
  console.log(`Reset "${username}" (user id ${uid}). Account, password and MCP token unchanged.`)
  for (const [name, n] of counts) console.log(`  ${String(n).padStart(5)}  ${name}`)
  console.log(`  ${String(counts.reduce((s, [, n]) => s + n, 0)).padStart(5)}  total`)
} catch (e) {
  await client.query('ROLLBACK')
  console.error('Nothing deleted:', (e as Error).message)
  process.exitCode = 1
} finally {
  client.release()
  await db().end()
}
