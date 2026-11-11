import './env'
import { decryptToken, hashPassword, rotateToken } from '../api/_lib/auth'
import { db, q } from '../api/_lib/db'
import { createMock } from '../api/_lib/mocks'
import { SAMPLE_MOCK, SAMPLE_ROWS } from '../shared/sample-mock'
import { SAMPLE_NOTE, SAMPLE_PRACTICE } from '../shared/sample-practice'
import { saveQuestion } from '../api/_lib/practice'
import { saveNotes } from '../api/_lib/notes'

// The reviewer test account. Runs on every production deploy: it resets the password, keeps the
// token (--new-token makes a new one) and keeps the sample mock, so its id and links stay the same.
// Pass --reset-sample to replace the sample mock with a fresh copy.
const USERNAME = 'demo'
const PASSWORD = 'catprep-demo-2026'

const hash = await hashPassword(PASSWORD)
const [user] = await q<{ id: number; token_enc: string | null }>(
  `INSERT INTO users (username, password_hash) VALUES ($1, $2)
   ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
   RETURNING id, token_enc`,
  [USERNAME, hash],
)

let token = user.token_enc ? decryptToken(user.token_enc) : null
if (!token || process.argv.includes('--new-token')) token = await rotateToken(user.id)

if (process.argv.includes('--reset-sample'))
  await q('DELETE FROM mocks WHERE user_id = $1 AND name = $2', [user.id, SAMPLE_MOCK.name])
const [existing] = await q<{ id: number }>('SELECT id FROM mocks WHERE user_id = $1 AND name = $2 ORDER BY id LIMIT 1', [user.id, SAMPLE_MOCK.name])
const mockId = existing ? existing.id : await createMock(user.id, SAMPLE_MOCK, SAMPLE_ROWS as any)

// Tier 2 / 3 samples, only when the demo account has none.
const [{ n: nq }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM practice_questions WHERE user_id = $1 AND source = 'Sample set'`, [user.id])
if (!nq) for (const x of SAMPLE_PRACTICE) await saveQuestion(user.id, x as any)
const [note] = await q<{ id: number }>('SELECT id FROM notes WHERE user_id = $1 AND title = $2', [user.id, SAMPLE_NOTE.title])
const noteId = note ? note.id : await saveNotes(user.id, SAMPLE_NOTE as any)

console.log(`Demo account ready
  username: ${USERNAME}
  password: ${PASSWORD}
  MCP token: ${token}
  sample mock id: ${mockId}${existing ? ' (kept)' : ' (created)'}
  sample practice questions: ${nq ? 'kept' : SAMPLE_PRACTICE.length + ' created'}
  sample note id: ${noteId}${note ? ' (kept)' : ' (created)'}`)
await db().end()
