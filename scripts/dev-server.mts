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

// The api files are CommonJS (as on Vercel), so the default export can arrive wrapped.
const unwrap = (m: any): Handler => (typeof m === 'function' ? m : m.default)
const routes: Record<string, Handler> = Object.fromEntries(
  Object.entries({ auth, mcp, mocks, questions, token }).map(([k, m]) => [k, unwrap(m)]),
)
const port = Number(process.env.PORT ?? 3000)
const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' })

http
  .createServer(async (rawReq, rawRes) => {
    const url = new URL(rawReq.url ?? '/', `http://${rawReq.headers.host}`)
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
      req.body = raw && (req.headers['content-type'] ?? '').includes('json') ? JSON.parse(raw) : raw || undefined
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
