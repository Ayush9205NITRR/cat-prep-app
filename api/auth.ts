import { z } from 'zod'
import { checkLogin, clearSession, createUser, requireUser, setSession } from './_lib/auth'
import { googleConfigured } from './_lib/google'
import { q } from './_lib/db'
import { fail, one, route } from './_lib/http'

export const SignupInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.@+-]{3,60}$/, 'Username: 3–60 characters: letters, numbers, or . _ - @ + (an email works)'),
  password: z.string().min(8, 'Password: at least 8 characters').max(200),
})

// GET /api/auth → current user · GET /api/auth?action=providers · POST /api/auth?action=login | signup | logout
export default route(async (req, res) => {
  const action = one(req.query.action)
  if (req.method === 'GET' && action === 'providers') {
    res.status(200).json({ google: googleConfigured() })
    return
  }
  if (action === 'profile') {
    // The student's CAT date, used by get_profile.
    const u = await requireUser(req, res)
    if (!u) return
    if (req.method === 'POST') {
      const b = z.object({ exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).safeParse(req.body)
      if (!b.success) return fail(res, 400, 'Pick a date')
      await q('UPDATE users SET exam_date = $2 WHERE id = $1', [u.id, b.data.exam_date])
    }
    const [r] = await q<{ exam_date: string | null }>("SELECT to_char(exam_date, 'YYYY-MM-DD') AS exam_date FROM users WHERE id = $1", [u.id])
    res.status(200).json(r)
    return
  }
  if (req.method === 'GET') {
    const u = await requireUser(req, res)
    if (u) res.status(200).json({ user: u })
    return
  }
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')
  if (action === 'logout') {
    clearSession(res)
    res.status(200).json({ ok: true })
    return
  }
  if (action === 'signup') {
    const body = SignupInput.safeParse(req.body)
    if (!body.success) return fail(res, 400, body.error.issues[0].message)
    const u = await createUser(body.data.username, body.data.password)
    if (!u) return fail(res, 409, 'That username is taken')
    setSession(req, res, u.id)
    res.status(201).json({ user: u })
    return
  }
  if (action !== 'login') return fail(res, 400, 'Unknown action')
  const body = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }).safeParse(req.body)
  if (!body.success) return fail(res, 400, 'Enter a username and password')
  const u = await checkLogin(body.data.username, body.data.password)
  if (!u) return fail(res, 401, 'Wrong username or password')
  setSession(req, res, u.id)
  res.status(200).json({ user: u })
})
