import './env'
import { decryptToken, hashPassword, rotateToken } from '../api/_lib/auth'
import { db, q } from '../api/_lib/db'
import { createMock } from '../api/_lib/mocks'
import { SAMPLE_MOCK, SAMPLE_ROWS } from '../shared/sample-mock'

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

console.log(`Demo account ready
  username: ${USERNAME}
  password: ${PASSWORD}
  MCP token: ${token}
  sample mock id: ${mockId}${existing ? ' (kept)' : ' (created)'}`)
await db().end()
