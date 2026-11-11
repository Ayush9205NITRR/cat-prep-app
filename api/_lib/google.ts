import crypto from 'node:crypto'
import { createUser, setSession, type User } from './auth'
import { q } from './db'
import { baseUrl, type Req, type Res } from './http'

// "Continue with Google" — the OAuth 2.0 authorization-code flow, no library.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Without them the button is hidden.
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const STATE_COOKIE = 'g_state'

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

/** The redirect URI to register in Google Cloud: https://<app>/api/google */
export const redirectUri = (req: Req) => `${baseUrl(req)}/api/google`

const secure = (req: Req) => ((req.headers['x-forwarded-proto'] ?? '').toString().startsWith('https') ? '; Secure' : '')

function redirect(res: Res, to: string) {
  res.statusCode = 302
  res.setHeader('Location', to)
  res.end()
}

/** Step 1: send the browser to Google with a one-time state value (CSRF protection). */
export function startGoogle(req: Req, res: Res) {
  if (!googleConfigured()) return redirect(res, '/login?error=google_off')
  const state = crypto.randomBytes(24).toString('base64url')
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; HttpOnly; Path=/api/google; SameSite=Lax; Max-Age=600${secure(req)}`)
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account',
  }).toString()
  redirect(res, url.toString())
}

interface IdClaims {
  iss: string
  aud: string
  sub: string
  email?: string
  email_verified?: boolean
  exp: number
}

/**
 * Step 2: Google sends the browser back with ?code&state. Check the state, swap the code for an
 * ID token (straight from Google over HTTPS with our client secret, so its claims can be trusted
 * without checking the signature), then log in or create the account.
 */
export async function finishGoogle(req: Req, res: Res, code: string, state: string) {
  const cookieState = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1)
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; Path=/api/google; SameSite=Lax; Max-Age=0`)
  const a = Buffer.from(state)
  const b = Buffer.from(cookieState ?? '')
  if (!googleConfigured() || !cookieState || a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return redirect(res, '/login?error=google_state')

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  })
  const tokens = (await tokenRes.json().catch(() => ({}))) as { id_token?: string }
  if (!tokenRes.ok || !tokens.id_token) {
    console.error('Google token exchange failed', tokenRes.status, tokens)
    return redirect(res, '/login?error=google_failed')
  }
  const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()) as IdClaims
  const ok =
    (claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com') &&
    claims.aud === process.env.GOOGLE_CLIENT_ID &&
    claims.exp * 1000 > Date.now() &&
    claims.email &&
    claims.email_verified === true
  if (!ok) return redirect(res, '/login?error=google_failed')

  const { user, isNew } = await userForGoogle(claims.sub, claims.email!.toLowerCase())
  setSession(req, res, user.id)
  redirect(res, isNew ? '/connect' : '/')
}

/** Finds the account for this Google id, or creates one named after the email. */
async function userForGoogle(sub: string, email: string): Promise<{ user: User; isNew: boolean }> {
  const [found] = await q<User>('SELECT id, username FROM users WHERE google_sub = $1', [sub])
  if (found) return { user: found, isNew: false }
  // A password account may already use this email as its username. Anyone can type any
  // username, so never hand that account to a Google login: make a new name instead.
  for (let i = 0; i < 5; i++) {
    const name = i === 0 ? email : `${email}-${crypto.randomBytes(2).toString('hex')}`
    const u = await createUser(name, null, { sub, email })
    if (u) return { user: u, isNew: true }
  }
  throw new Error('Could not create a username for this Google account')
}
