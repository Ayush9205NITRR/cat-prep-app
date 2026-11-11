import './env'
import { decryptToken, hashPassword, rotateToken } from '../api/_lib/auth'
import { db, q } from '../api/_lib/db'
import { createMock } from '../api/_lib/mocks'
import { SAMPLE_MOCK, SAMPLE_ROWS } from '../shared/sample-mock'

// The reviewer test account. Running the seed again resets the password and
// the sample mock, and keeps the token (pass --new-token to make a new one).
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

await q('DELETE FROM mocks WHERE user_id = $1 AND name = $2', [user.id, SAMPLE_MOCK.name])
const mockId = await createMock(user.id, SAMPLE_MOCK, SAMPLE_ROWS as any)

console.log(`Demo account ready
  username: ${USERNAME}
  password: ${PASSWORD}
  MCP token: ${token}
  sample mock id: ${mockId}`)
await db().end()
