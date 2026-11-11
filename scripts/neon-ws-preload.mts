// TEST/SANDBOX ONLY — never loaded by the app or on Vercel.
// Some sandboxes allow only HTTPS out through a proxy, so a Postgres TCP connection to Neon is
// impossible there. Neon's serverless Pool is a drop-in for pg.Pool that speaks the same Postgres
// protocol over a WebSocket. This swaps it in so the unchanged app code runs against real Neon.
// Usage: tsx --import ./scripts/neon-ws-preload.mts <script>
import { neonConfig, Pool as NeonPool } from '@neondatabase/serverless'
import { HttpsProxyAgent } from 'https-proxy-agent'
import pg from 'pg'
import WebSocket from 'ws'

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
neonConfig.webSocketConstructor = proxy
  ? class extends WebSocket {
      constructor(url: string, protocols?: string | string[]) {
        super(url, protocols, { agent: new HttpsProxyAgent(proxy!) })
      }
    }
  : WebSocket
;(pg as any).Pool = NeonPool
console.error('[neon-ws-preload] pg.Pool -> @neondatabase/serverless Pool over WebSocket' + (proxy ? ' via proxy' : ''))
