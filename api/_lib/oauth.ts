import crypto from 'node:crypto'
import { currentUser, hashToken } from './auth'
import { q } from './db'
import { baseUrl, one, type Req, type Res } from './http'

// OAuth 2.1 for MCP clients that cannot send a custom header, such as claude.ai custom connectors.
// Flow: Claude finds this server from the MCP 401 (resource metadata) → registers itself (RFC 7591)
// → sends the student to /oauth/authorize → the student logs in and clicks Allow → Claude swaps the
// code (with PKCE) for an access token at /oauth/token and refreshes it there later.
const ACCESS_TTL_S = 60 * 60 * 24 // 1 day
const REFRESH_TTL_S = 60 * 60 * 24 * 90 // 90 days
const CODE_TTL_S = 600
const SCOPE = 'mcp'

const rand = (prefix: string) => prefix + crypto.randomBytes(32).toString('base64url').slice(0, 43)

function cors(res: Res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function oauthError(res: Res, status: number, error: string, description: string) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json({ error, error_description: description })
}

function redirect(res: Res, to: string) {
  res.statusCode = 302
  res.setHeader('Location', to)
  res.end()
}

/** Where the MCP endpoint's 401 points clients to. */
export const resourceMetadataUrl = (req: Req) => `${baseUrl(req)}/.well-known/oauth-protected-resource`

// ---------- discovery ----------
export function protectedResourceMetadata(req: Req, res: Res) {
  cors(res)
  const base = baseUrl(req)
  res.status(200).json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'mbaprep',
  })
}

export function authorizationServerMetadata(req: Req, res: Res) {
  cors(res)
  const base = baseUrl(req)
  res.status(200).json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  })
}

// ---------- dynamic client registration (RFC 7591) ----------
function validRedirect(u: unknown): u is string {
  if (typeof u !== 'string' || u.length > 500) return false
  try {
    const url = new URL(u)
    if (url.hash) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export async function register(req: Req, res: Res) {
  cors(res)
  const body = (req.body ?? {}) as { client_name?: unknown; redirect_uris?: unknown }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect))
    return oauthError(res, 400, 'invalid_redirect_uri', 'redirect_uris must be 1–10 https URLs (http only for localhost)')
  const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : 'MCP client'
  const id = rand('cl_')
  await q('INSERT INTO oauth_clients (id, name, redirect_uris) VALUES ($1, $2, $3)', [id, name, JSON.stringify(uris)])
  res.setHeader('Cache-Control', 'no-store')
  res.status(201).json({
    client_id: id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  })
}

// ---------- authorize: log in, then Allow / Deny ----------
interface AuthzParams {
  client_id: string
  redirect_uri: string
  code_challenge: string
  state: string
  scope: string
}

const SECRET = () => process.env.SESSION_SECRET ?? ''
/** Signs the consent form so only our own page, for this user and these exact params, can approve. */
function ticket(userId: number, p: AuthzParams, exp: number) {
  const data = [userId, exp, p.client_id, p.redirect_uri, p.code_challenge, p.state, p.scope].join('\n')
  return `${exp}.${crypto.createHmac('sha256', 'oauth-consent:' + SECRET()).update(data).digest('base64url')}`
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — mbaprep</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F9FAFB;color:#111827;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;padding:16px}
.card{width:100%;max-width:400px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.05);padding:24px}
h1{font-size:18px;margin:0 0 4px}p{color:#4B5563;margin:8px 0}.muted{color:#6B7280;font-size:12px}
ul{padding-left:18px;color:#374151;margin:12px 0}.row{display:flex;gap:8px;margin-top:20px}
button{flex:1;border-radius:6px;padding:9px;font:500 13px inherit;cursor:pointer;border:1px solid #D1D5DB;background:#fff;color:#374151}
button.primary{background:#111827;border-color:#111827;color:#fff}
</style></head><body><div class="card">${body}</div></body></html>`
}

function sendHtml(res: Res, status: number, html: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'")
  res.end(html)
}

function backTo(redirectUri: string, params: Record<string, string>) {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v)
  return u.toString()
}

export async function authorize(req: Req, res: Res) {
  const src: Record<string, any> = req.method === 'POST' ? (req.body ?? {}) : req.query
  const get = (k: string) => (typeof src[k] === 'string' ? src[k] : one(src[k])) ?? ''
  const p: AuthzParams = {
    client_id: get('client_id'),
    redirect_uri: get('redirect_uri'),
    code_challenge: get('code_challenge'),
    state: get('state'),
    scope: get('scope') || SCOPE,
  }

  // Never redirect to an unregistered URI: show the error here instead.
  const [client] = await q<{ id: string; name: string; redirect_uris: string[] }>('SELECT id, name, redirect_uris FROM oauth_clients WHERE id = $1', [p.client_id])
  if (!client) return sendHtml(res, 400, page('Unknown app', '<h1>Unknown app</h1><p>This connection request is not valid. Remove the connector in Claude and add it again.</p>'))
  if (!client.redirect_uris.includes(p.redirect_uri))
    return sendHtml(res, 400, page('Bad request', '<h1>Bad request</h1><p>The return address does not match this app.</p>'))

  if (req.method === 'GET') {
    if (get('response_type') !== 'code')
      return redirect(res, backTo(p.redirect_uri, { error: 'unsupported_response_type', state: p.state }))
    if (!p.code_challenge || get('code_challenge_method') !== 'S256')
      return redirect(res, backTo(p.redirect_uri, { error: 'invalid_request', error_description: 'PKCE with S256 is required', state: p.state }))
  }

  const user = await currentUser(req)
  if (!user) {
    // Log in first, then come back to this exact request.
    const next = '/oauth/authorize?' + new URLSearchParams({ ...p, response_type: 'code', code_challenge_method: 'S256' }).toString()
    return redirect(res, '/login?next=' + encodeURIComponent(next))
  }

  if (req.method === 'GET') {
    const exp = Math.floor(Date.now() / 1000) + 600
    const hidden = Object.entries({ ...p, ticket: ticket(user.id, p, exp) })
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`)
      .join('')
    const host = new URL(p.redirect_uri).host
    return sendHtml(
      res,
      200,
      page(
        'Allow access',
        `<h1>Connect ${esc(client.name)}?</h1>
<p><b>${esc(client.name)}</b> wants to use your mbaprep account <b>${esc(user.username)}</b>. It will be able to:</p>
<ul><li>save mocks you upload</li><li>read your mocks and their analysis</li></ul>
<p class="muted">After you choose, you go back to ${esc(host)}. Not you? <a href="/">Open mbaprep</a> and log out first.</p>
<form method="post" action="/oauth/authorize">${hidden}
<div class="row"><button name="decision" value="deny">Deny</button><button class="primary" name="decision" value="allow">Allow</button></div></form>`,
      ),
    )
  }

  // POST: the student's choice from the page above.
  const [expStr, mac] = get('ticket').split('.')
  const want = ticket(user.id, p, Number(expStr)).split('.')[1]
  const okTicket = mac && want && mac.length === want.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want)) && Number(expStr) > Date.now() / 1000
  if (!okTicket) return sendHtml(res, 400, page('Expired', '<h1>This request expired</h1><p>Go back to Claude and click Connect again.</p>'))
  if (get('decision') !== 'allow') return redirect(res, backTo(p.redirect_uri, { error: 'access_denied', state: p.state }))

  const code = rand('code_')
  await q(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [hashToken(code), p.client_id, user.id, p.redirect_uri, p.code_challenge, CODE_TTL_S],
  )
  redirect(res, backTo(p.redirect_uri, { code, state: p.state, iss: baseUrl(req) }))
}

// ---------- token ----------
async function issueTokens(clientId: string, userId: number) {
  const access = rand('oat_')
  const refresh = rand('ort_')
  await q(
    `INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, expires_at) VALUES
     ($1, 'access', $3, $4, now() + make_interval(secs => $5)),
     ($2, 'refresh', $3, $4, now() + make_interval(secs => $6))`,
    [hashToken(access), hashToken(refresh), clientId, userId, ACCESS_TTL_S, REFRESH_TTL_S],
  )
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE }
}

export async function token(req: Req, res: Res) {
  cors(res)
  res.setHeader('Cache-Control', 'no-store')
  const b = (req.body ?? {}) as Record<string, string | undefined>
  const clientId = b.client_id ?? ''

  if (b.grant_type === 'authorization_code') {
    if (!b.code || !b.code_verifier || !b.redirect_uri) return oauthError(res, 400, 'invalid_request', 'code, code_verifier and redirect_uri are required')
    // One-time use: delete as we read it.
    const [c] = await q<{ client_id: string; user_id: number; redirect_uri: string; code_challenge: string }>(
      'DELETE FROM oauth_codes WHERE code_hash = $1 AND expires_at > now() RETURNING client_id, user_id, redirect_uri, code_challenge',
      [hashToken(b.code)],
    )
    const challenge = crypto.createHash('sha256').update(b.code_verifier).digest('base64url')
    if (!c || c.client_id !== clientId || c.redirect_uri !== b.redirect_uri || c.code_challenge !== challenge)
      return oauthError(res, 400, 'invalid_grant', 'The code is wrong, used or expired')
    return res.status(200).json(await issueTokens(c.client_id, c.user_id))
  }

  if (b.grant_type === 'refresh_token') {
    if (!b.refresh_token) return oauthError(res, 400, 'invalid_request', 'refresh_token is required')
    // Rotate: the old refresh token stops working.
    const [t] = await q<{ client_id: string; user_id: number }>(
      `DELETE FROM oauth_tokens WHERE token_hash = $1 AND kind = 'refresh' AND expires_at > now() RETURNING client_id, user_id`,
      [hashToken(b.refresh_token)],
    )
    if (!t || (clientId && t.client_id !== clientId)) return oauthError(res, 400, 'invalid_grant', 'The refresh token is wrong or expired')
    return res.status(200).json(await issueTokens(t.client_id, t.user_id))
  }

  oauthError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token')
}
