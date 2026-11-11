import { finishGoogle, startGoogle } from './_lib/google'
import { one, route } from './_lib/http'

// GET /api/google → off to Google · GET /api/google?code&state → back from Google
export default route(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const code = one(req.query.code)
  const state = one(req.query.state)
  if (one(req.query.error)) {
    res.statusCode = 302
    res.setHeader('Location', '/login?error=google_cancelled')
    res.end()
    return
  }
  if (code && state) return finishGoogle(req, res, code, state)
  startGoogle(req, res)
})
