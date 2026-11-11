import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { q } from './db'
import { fail, type Req, type Res } from './http'

export interface User {
  id: number
  username: string
}

const COOKIE = 'sid'
const MAX_AGE_S = 60 * 60 * 24 * 30

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) throw new Error('SESSION_SECRET must be set (16+ characters)')
  return s
}

// ---------- passwords ----------
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10)

export async function checkLogin(username: string, password: string): Promise<User | null> {
  const [u] = await q<{ id: number; username: string; password_hash: string }>(
    'SELECT id, username, password_hash FROM users WHERE username = $1',
    [username.trim().toLowerCase()],
  )
  if (!u) {
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva') // same timing
    return null
  }
  return (await bcrypt.compare(password, u.password_hash)) ? { id: u.id, username: u.username } : null
}

// ---------- session cookie: "<userId>.<expires>.<hmac>" ----------
const sign = (data: string) => crypto.createHmac('sha256', secret()).update(data).digest('base64url')

export function setSession(req: Req, res: Res, userId: number) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S
  const data = `${userId}.${exp}`
  const secure = (req.headers['x-forwarded-proto'] ?? '').toString().startsWith('https') ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE}=${data}.${sign(data)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure}`)
}

export function clearSession(res: Res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`)
}

function sessionUserId(req: Req): number | null {
  const raw = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))
  if (!raw) return null
  const [id, exp, mac] = raw.slice(COOKIE.length + 1).split('.')
  if (!id || !exp || !mac) return null
  const want = Buffer.from(sign(`${id}.${exp}`))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null
  if (Number(exp) < Date.now() / 1000) return null
  return Number(id)
}

/** Returns the logged-in user, or sends 401 and returns null. */
export async function requireUser(req: Req, res: Res): Promise<User | null> {
  const id = sessionUserId(req)
  const [u] = id ? await q<User>('SELECT id, username FROM users WHERE id = $1', [id]) : []
  if (!u) {
    fail(res, 401, 'Not logged in')
    return null
  }
  return u
}

// ---------- MCP token: "tok_" + 32 random chars; SHA-256 hash for lookup ----------
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export function newToken(): string {
  const bytes = crypto.randomBytes(32)
  return 'tok_' + [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}
export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

const encKey = () => crypto.createHash('sha256').update('token-enc:' + secret()).digest()
export function encryptToken(t: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const ct = Buffer.concat([c.update(t, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.')
}
export function decryptToken(s: string): string | null {
  try {
    const [iv, tag, ct] = s.split('.').map((p) => Buffer.from(p, 'base64url'))
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Creates a fresh token for the user (the old one stops working) and returns it. */
export async function rotateToken(userId: number): Promise<string> {
  const t = newToken()
  await q('UPDATE users SET token_hash = $1, token_enc = $2 WHERE id = $3', [hashToken(t), encryptToken(t), userId])
  return t
}

export async function userFromBearer(header: string | undefined): Promise<User | null> {
  const m = /^Bearer\s+(tok_[A-Za-z0-9]{32})\s*$/.exec(header ?? '')
  if (!m) return null
  const [u] = await q<User>('SELECT id, username FROM users WHERE token_hash = $1', [hashToken(m[1])])
  return u ?? null
}
