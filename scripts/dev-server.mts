// Local dev: serves the /api handlers the way Vercel does, plus the Vite UI.
import './env'
import http from 'node:http'
import { createServer as createVite } from 'vite'
import type { Handler, Req, Res } from '../api/_lib/http'
import auth from '../api/auth'
import mcp from '../api/mcp'
import mocks from '../api/mocks'
import questions from '../api/questions'
import token from '../api/token'
import google from '../api/google'
import oauth from '../api/oauth'

// The api files are CommonJS (as on Vercel), so the default export can arrive wrapped.
const unwrap = (m: any): Handler => (typeof m === 'function' ? m : m.default)
const routes: Record<string, Handler> = Object.fromEntries(
  Object.entries({ auth, mcp, mocks, questions, token, google, oauth }).map(([k, m]) => [k, unwrap(m)]),
)
const port = Number(process.env.PORT ?? 3000)
const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' })

http
  .createServer(async (rawReq, rawRes) => {
    const url = new URL(rawReq.url ?? '/', `http://${rawReq.headers.host}`)
    // Same rewrites as vercel.json for the OAuth paths.
    const wk = /^\/\.well-known\/(oauth-protected-resource|oauth-authorization-server|openid-configuration)(\/.*)?$/.exec(url.pathname)
    const oa = /^\/oauth\/(register|authorize|token)$/.exec(url.pathname)
    if (wk || oa) {
      url.searchParams.set('step', oa ? oa[1] : wk![1] === 'oauth-protected-resource' ? 'resource' : 'metadata')
      url.pathname = '/api/oauth'
    }
    const m = /^\/api\/([a-z]+)\/?$/.exec(url.pathname)
    if (!m) return vite.middlewares(rawReq, rawRes)
    const handler = routes[m[1]]
    const req = rawReq as Req
    const res = rawRes as Res
    req.query = Object.fromEntries(url.searchParams)
    res.status = (c) => ((res.statusCode = c), res)
    res.json = (b) => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(b)), res)
    res.send = (b) => (res.end(b), res)
    if (!handler) return res.status(404).json({ error: 'Not found' })
    const chunks: Buffer[] = []
    for await (const c of rawReq) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString()
    try {
      const type = req.headers['content-type'] ?? ''
      req.body = !raw ? undefined
        : type.includes('json') ? JSON.parse(raw)
        : type.includes('x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) // like Vercel
        : raw
    } catch {
      return res.status(400).json({ error: 'Bad JSON' })
    }
    try {
      await handler(req, res)
    } catch (e) {
      console.error(e)
      if (!res.headersSent) res.status(500).json({ error: 'Server error' })
    }
  })
  .listen(port, () => console.log(`http://localhost:${port}`))
