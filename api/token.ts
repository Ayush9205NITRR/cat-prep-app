import { decryptToken, requireUser, rotateToken } from './_lib/auth'
import { q } from './_lib/db'
import { baseUrl, fail, route } from './_lib/http'

// GET /api/token → the user's MCP token and URL · POST /api/token → make a new token (old one stops working)
export default route(async (req, res) => {
  const u = await requireUser(req, res)
  if (!u) return
  let token: string | null = null
  if (req.method === 'POST') token = await rotateToken(u.id)
  else if (req.method === 'GET') {
    const [row] = await q<{ token_enc: string | null }>('SELECT token_enc FROM users WHERE id = $1', [u.id])
    token = row?.token_enc ? decryptToken(row.token_enc) : null
    if (!token) token = await rotateToken(u.id)
  } else return fail(res, 405, 'Method not allowed')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ token, mcp_url: `${baseUrl(req)}/api/mcp` })
})
