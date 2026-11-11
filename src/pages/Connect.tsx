import { useEffect, useState } from 'react'
import { api } from '../api'
import { btnGhost, Card, ErrorNote, Loading } from '../ui'

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret)
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-gray-700">{label}</div>
      <div className="flex flex-wrap gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px]">
          {shown ? value : value.slice(0, 4) + '•'.repeat(32)}
        </code>
        {secret && <button className={btnGhost} onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>}
        <button
          className={btnGhost}
          onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export default function Connect() {
  const [data, setData] = useState<{ token: string; mcp_url: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.token().then(setData, (e) => setError(e.message))
  }, [])

  async function regenerate() {
    if (!confirm('Make a new token? The old one stops working, so you will need to update it in Claude.')) return
    try {
      setData(await api.newToken())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold tracking-tight">Connect Claude</h1>
        <p className="text-[12px] text-gray-500">Add this app to Claude once. Then upload a mock in Claude and say “Analyse my mock”.</p>
      </div>
      <Card>
        <div className="space-y-4">
          <CopyField label="MCP server URL" value={data.mcp_url} />
          <CopyField label="Your token" value={data.token} secret />
          <p className="text-[11px] text-gray-500">
            The token is like a password for your data. It goes in a header, never in the URL.{' '}
            <button className="underline" onClick={regenerate}>Make a new token</button>
          </p>
        </div>
      </Card>
      <Card title="3 steps">
        <ol className="list-decimal space-y-3 pl-5 text-[13px] text-gray-800">
          <li>In Claude, open <b>Settings → Connectors → Add custom connector</b>.</li>
          <li>Name it <b>CAT Prep</b> and paste the <b>MCP server URL</b> above.</li>
          <li>
            Add the header <code className="rounded bg-gray-100 px-1">Authorization</code> with the value{' '}
            <code className="rounded bg-gray-100 px-1">Bearer &lt;your token&gt;</code>, then save and turn the connector on in a chat.
          </li>
        </ol>
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-[12px] text-gray-600">
          <div className="mb-1 font-medium text-gray-800">Using Claude Code instead?</div>
          <code className="block break-all text-[11px]">
            claude mcp add --transport http cat-prep {data.mcp_url} --header "Authorization: Bearer &lt;your token&gt;"
          </code>
        </div>
      </Card>
    </div>
  )
}
