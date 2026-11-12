import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MAX_FILE_BYTES } from '../../shared/note-input'
import { api, type MockUploadItem } from '../api'
import { btnGhost, btnPrimary, ErrorNote } from '../ui'
import { prepareFile } from './NewNote'

export const PROMPT = 'Process my mbaprep inbox one item at a time and give me the app link after each. For the mock: save it, then analyse it with next_mistake (ask me tap 1 and tap 2, explain in 80 words, save a fix). Notes: save with flashcards. Assignment: save the questions for practice.'
type Kind = 'mock' | 'assignment' | 'notes'
const KIND: Record<Kind, { label: string; icon: string; accept: string; cls: string }> = {
  mock: { label: 'Mock paper', icon: '📊', accept: 'application/pdf,.pdf', cls: 'bg-indigo-50 text-indigo-700' },
  assignment: { label: 'Assignment', icon: '🎯', accept: 'application/pdf,.pdf', cls: 'bg-sky-50 text-sky-700' },
  notes: { label: 'Class notes', icon: '📝', accept: 'application/pdf,.pdf,image/png,image/jpeg,image/webp', cls: 'bg-emerald-50 text-emerald-700' },
}

/** Plain text extraction from the PDF's text layer, in the browser (pdf.js). Not AI: nothing is interpreted. */
async function extractPages(file: File, onPage: (n: number, total: number) => void): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    // Keep line breaks: a new line whenever the text moves down the page.
    let out = '', lastY: number | null = null
    for (const it of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = it.transform?.[5]
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) out += '\n'
      else if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += ' '
      out += it.str
      if (it.hasEOL) out += '\n'
      lastY = y ?? lastY
    }
    pages.push(out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
    onPage(i, doc.numPages)
  }
  return pages
}

const toBase64 = async (f: File) => {
  const buf = new Uint8Array(await f.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

export default function MockUpload() {
  const [uploads, setUploads] = useState<MockUploadItem[]>([])
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [section, setSection] = useState('')
  const [kind, setKind] = useState<Kind>('mock')
  const input = useRef<HTMLInputElement>(null)
  const choose = (k: Kind) => { setKind(k); setTimeout(() => input.current?.click(), 0) }
  const load = () => api.mockUploads().then((r) => setUploads(r.uploads), () => {})
  useEffect(() => { load() }, [])

  async function pick(f?: File) {
    if (!f) return
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    setError('')
    if (!isPdf) {
      if (kind !== 'notes' || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return setError(kind === 'notes' ? 'Choose a photo (PNG, JPG, WebP) or a PDF.' : 'Choose a PDF.')
      // A photo has no text: it is stored (shrunk in the browser) and Claude reads the image.
      setProgress('Saving the photo…')
      try {
        const file = await prepareFile(f)
        await api.uploadMock({ kind, mime: file.mime, name: f.name.replace(/\.[a-z0-9]+$/i, ''), section: null, page_texts: [''], pdf_size: f.size, pdf_base64: file.base64 })
        await load()
      } catch (e) { setError((e as Error).message) } finally { setProgress(null); if (input.current) input.current.value = '' }
      return
    }
    setProgress('Opening the PDF…')
    try {
      const pages = await extractPages(f, (n, t) => setProgress(`Reading text in your browser: page ${n} of ${t}`))
      const chars = pages.join('').trim().length
      if (!chars && f.size > MAX_FILE_BYTES) throw new Error('This PDF is a scan (no text) and over 3 MB. Upload it straight into the Claude chat instead.')
      setProgress('Saving…')
      await api.uploadMock({ kind, mime: 'application/pdf', name: f.name.replace(/\.pdf$/i, ''), section: kind === 'mock' ? section || null : null, page_texts: pages, pdf_size: f.size, pdf_base64: f.size <= MAX_FILE_BYTES ? await toBase64(f) : undefined })
      await load()
    } catch (e) { setError((e as Error).message) } finally { setProgress(null); if (input.current) input.current.value = '' }
  }

  const waiting = uploads.filter((u) => u.status === 'new')
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-gray-900">Upload for Claude</div>
          <div className="text-[12px] text-gray-600">Faster than attaching files in Claude: your browser pulls out the text, and Claude works through the inbox one item at a time.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Mock section" className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-[12.5px]" value={section} onChange={(e) => setSection(e.target.value)} title="Section of a mock paper">
            <option value="">Mock section: auto</option><option>Quant</option><option>VARC</option><option>DILR</option>
          </select>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <button key={k} className={k === 'mock' ? btnPrimary : btnGhost} disabled={!!progress} onClick={() => choose(k)}>{KIND[k].icon} {KIND[k].label}{k === 'notes' ? ' (photo/PDF)' : ' (PDF)'}</button>
          ))}
          <input ref={input} type="file" accept={KIND[kind].accept} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      </div>
      {progress && <div className="mt-3 text-[12.5px] text-indigo-800">{progress}</div>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {uploads.length > 0 && (
        <div className="mt-3 divide-y divide-indigo-100 rounded-xl bg-white">
          {uploads.slice(0, 8).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 truncate"><span className={`mr-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${KIND[u.kind].cls}`}>{KIND[u.kind].icon} {KIND[u.kind].label}</span><b>{u.name}</b> <span className="text-gray-500">· {u.mime !== 'application/pdf' ? 'photo (Claude reads the image)' : `${u.pages} pages · ${u.chars ? `${Math.round(u.chars / 1000)}k characters of text` : 'scan (Claude reads the PDF)'}`}{u.section ? ` · ${u.section}` : ''}</span></span>
              {u.status === 'saved' && (u.result_link || u.mock_id)
                ? <Link className="font-medium text-emerald-700 hover:underline" to={u.result_link ? new URL(u.result_link).pathname : `/mocks/${u.mock_id}`}>✓ Saved by Claude → open</Link>
                : <span className="flex items-center gap-3"><span className="font-medium text-amber-700">Waiting for Claude</span>
                    <button className="text-gray-400 hover:text-red-600" onClick={async () => { if (confirm('Remove this upload?')) { await api.deleteMockUpload(u.id); load() } }}>Remove</button></span>}
            </div>
          ))}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3">
          <div className="text-[12px] font-medium text-gray-700">{waiting.length} waiting. In Claude (connector on), send this once:</div>
          <div className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-800">{PROMPT}</div>
          <button className={`${btnGhost} mt-2`} onClick={() => navigator.clipboard.writeText(PROMPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>{copied ? 'Copied' : 'Copy prompt'}</button>
        </div>
      )}
    </div>
  )
}
