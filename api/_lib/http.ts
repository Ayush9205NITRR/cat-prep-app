import type { IncomingMessage, ServerResponse } from 'node:http'

// The parts of Vercel's Node request/response helpers that the handlers use.
export type Req = IncomingMessage & { body?: any; query: Record<string, string | string[] | undefined> }
export type Res = ServerResponse & { status(code: number): Res; json(body: unknown): Res; send(body: string): Res }
export type Handler = (req: Req, res: Res) => unknown | Promise<unknown>

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function baseUrl(req: Req): string {
  const proto = one(req.headers['x-forwarded-proto'] as any) ?? 'http'
  const host = one(req.headers['x-forwarded-host'] as any) ?? req.headers.host
  return `${proto.split(',')[0]}://${host}`
}

export function fail(res: Res, code: number, error: string, details?: unknown) {
  res.status(code).json({ error, details })
}

/** Wraps a handler so a thrown error becomes a 500 JSON reply instead of a crash. */
export function route(h: Handler): Handler {
  return async (req, res) => {
    try {
      await h(req, res)
    } catch (e) {
      console.error(e)
      if (!res.headersSent) fail(res, 500, 'Server error')
    }
  }
}
