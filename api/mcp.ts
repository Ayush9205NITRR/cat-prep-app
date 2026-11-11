import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { userFromBearer } from './_lib/auth'
import { baseUrl, route } from './_lib/http'
import { buildMcpServer } from './_lib/mcp-server'

// Stateless Streamable HTTP: a new server and transport for every request.
export default route(async (req, res) => {
  const user = await userFromBearer(req.headers.authorization)
  if (!user) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Missing or wrong token. Send Authorization: Bearer <token> from the Connect page.' }, id: null })
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null })
    return
  }
  const server = buildMcpServer(user, baseUrl(req))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})
