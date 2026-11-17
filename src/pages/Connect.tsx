import { useEffect, useState } from 'react'
import { api } from '../api'
import { btnGhost, btnPrimary, Card, ErrorNote, Loading } from '../ui'

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret)
  const [copied, setCopied] = useState(false)
  return (
    <div>
      {label && <div className="mb-1 text-[12px] font-medium text-gray-700">{label}</div>}
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

/** The student's CAT date (Home countdown and Claude's get_profile). Explicit Save, then "Saved!". */
function ExamDate() {
  const [saved, setSavedValue] = useState<string | null | undefined>(undefined) // what the server has
  const [v, setV] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => { api.profile().then((r) => { setSavedValue(r.exam_date); setV(r.exam_date ?? '') }, () => setSavedValue(null)) }, [])
  // Home's "Set your CAT date" links to #exam-date: scroll there once this card exists.
  useEffect(() => { if (saved !== undefined && window.location.hash === '#exam-date') document.getElementById('exam-date')?.scrollIntoView({ block: 'center' }) }, [saved])
  if (saved === undefined) return null
  async function save() {
    setState('saving')
    try { const r = await api.setExamDate(v || null); setSavedValue(r.exam_date); setState('saved'); setTimeout(() => setState('idle'), 2500) } catch { setState('error') }
  }
  return (
    <Card title="Your CAT exam date" aside="Used for the Home countdown and by Claude">
      <div id="exam-date" className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="CAT exam date" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px]" value={v} onChange={(e) => { setV(e.target.value); setState('idle') }} />
        <button className={btnPrimary} disabled={state === 'saving' || v === (saved ?? '')} onClick={save}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
        {state === 'saved' && <span className="text-[12.5px] font-semibold text-emerald-700">✓ Saved!</span>}
        {state === 'error' && <span className="text-[12.5px] text-red-600">Not saved — try again.</span>}
        {state === 'idle' && v !== (saved ?? '') && <span className="text-[12px] text-amber-700">Not saved yet</span>}
      </div>
    </Card>
  )
}

const STARTERS = [
  'Process my mbaprep inbox one item at a time and give me the app link after each.',
  'Analyze my latest mock in mbaprep and add fixes: use pending_fixes and one save_fixes if I tapped in the app, otherwise review_mistake one at a time.',
  'Make flashcards from my notes on [Topic] in mbaprep.',
  'Give me 10 medium practice questions on [Topic] from mbaprep, one at a time, timed, no hints.',
]

function StarterPrompts() {
  const [copied, setCopied] = useState<number | null>(null)
  return (
    <Card title="Starter prompts for Claude" aside="Copy, paste into a Claude chat with mbaprep on">
      <div className="space-y-2">
        {STARTERS.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
            <span className="min-w-0 flex-1 text-[13px] text-gray-800">{p.split(/(\[Topic\])/).map((part, j) => part === '[Topic]' ? <b key={j} className="text-indigo-700">[Topic]</b> : part)}</span>
            <button className={btnGhost} onClick={() => navigator.clipboard.writeText(p).then(() => { setCopied(i); setTimeout(() => setCopied(null), 1500) })}>{copied === i ? '✓ Copied' : 'Copy'}</button>
          </div>
        ))}
        <p className="text-[11.5px] text-gray-500">Replace <b>[Topic]</b> with a topic name, e.g. Time &amp; Work or Para Jumbles.</p>
      </div>
    </Card>
  )
}

export default function Connect() {
  const [data, setData] = useState<{ token: string; mcp_url: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.token().then(setData, (e) => setError(e.message))
  }, [])

  async function regenerate() {
    if (!confirm('Make a new token? The old one stops working, so you will need to update it in Claude Code / MCP Inspector.')) return
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
        <h1 className="text-[22px] font-semibold tracking-tight">Connect Claude</h1>
        <p className="text-[13px] text-gray-500">Add mbaprep to claude.ai once. Claude signs in for you — nothing to copy but the URL.</p>
      </div>

      <Card title="Connect claude.ai — 3 steps">
        <ol className="list-decimal space-y-3 pl-5 text-[13px] text-gray-800">
          <li>In Claude, open <b>Settings → Connectors → Add custom connector</b>.</li>
          <li>
            Name it <b>mbaprep</b>, paste this URL, and click <b>Add</b>. Leave the advanced settings empty.
            <div className="mt-2"><CopyField label="" value={data.mcp_url} /></div>
          </li>
          <li>Click <b>Connect</b>, log in to mbaprep if asked, and click <b>Allow</b>. Then turn the connector on in a chat.</li>
        </ol>
        <p className="mt-3 text-[12px] text-gray-500">Already connected but Claude doesn’t see new tools? Disconnect and connect again, then start a new chat.</p>
      </Card>

      <StarterPrompts />
      <ExamDate />

      <details className="rounded-2xl border border-gray-200/70 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-[13px] font-semibold text-gray-700">Advanced: Claude Code / MCP Inspector</summary>
        <div className="space-y-4 px-5 pb-5">
          <CopyField label="Your token" value={data.token} secret />
          <p className="text-[11.5px] text-gray-500">
            Only for Claude Code or MCP Inspector (claude.ai doesn’t need it). It is like a password for your data: it goes in a header, never in the URL.{' '}
            <button className="underline" onClick={regenerate}>Make a new token</button>
          </p>
          <div className="rounded-lg bg-gray-50 p-3 text-[12px] text-gray-600">
            <div className="mb-1 font-medium text-gray-800">Claude Code</div>
            <code className="block break-all text-[11px]">claude mcp add --transport http mbaprep {data.mcp_url} --header "Authorization: Bearer &lt;your token&gt;"</code>
          </div>
        </div>
      </details>
    </div>
  )
}
