import { one, route } from './_lib/http'
import { authorizationServerMetadata, authorize, protectedResourceMetadata, register, token } from './_lib/oauth'

// Reached through vercel.json rewrites:
//   /.well-known/oauth-protected-resource[/…]   → ?step=resource
//   /.well-known/oauth-authorization-server[/…] → ?step=metadata  (also /.well-known/openid-configuration)
//   /oauth/register | /oauth/authorize | /oauth/token → ?step=register | authorize | token
export default route(async (req, res) => {
  const step = one(req.query.step)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.statusCode = 204
    res.end()
    return
  }
  if (step === 'resource' && req.method === 'GET') return protectedResourceMetadata(req, res)
  if (step === 'metadata' && req.method === 'GET') return authorizationServerMetadata(req, res)
  if (step === 'register' && req.method === 'POST') return register(req, res)
  if (step === 'authorize' && (req.method === 'GET' || req.method === 'POST')) return authorize(req, res)
  if (step === 'token' && req.method === 'POST') return token(req, res)
  res.status(404).json({ error: 'not_found' })
})
