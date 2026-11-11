import { z } from 'zod'
import { checkLogin, clearSession, requireUser, setSession } from './_lib/auth'
import { fail, one, route } from './_lib/http'

// GET /api/auth → current user · POST /api/auth?action=login · POST /api/auth?action=logout
export default route(async (req, res) => {
  const action = one(req.query.action)
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
  if (action !== 'login') return fail(res, 400, 'Unknown action')
  const body = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }).safeParse(req.body)
  if (!body.success) return fail(res, 400, 'Enter a username and password')
  const u = await checkLogin(body.data.username, body.data.password)
  if (!u) return fail(res, 401, 'Wrong username or password')
  setSession(req, res, u.id)
  res.status(200).json({ user: u })
})
