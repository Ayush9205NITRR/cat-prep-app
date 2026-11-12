import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MAX_FILE_BYTES } from '../../shared/note-input'
import { api, type MockUploadItem } from '../api'
import { btnGhost, btnPrimary, ErrorNote } from '../ui'

export const PROMPT = 'Read my latest mock upload in mbaprep and save it. Then analyse it: use next_mistake, ask me tap 1 and tap 2 for each wrong or slow question, explain in 80 words, save a fix, and offer a retest at the end.'

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
  const input = useRef<HTMLInputElement>(null)
  const load = () => api.mockUploads().then((r) => setUploads(r.uploads), () => {})
  useEffect(() => { load() }, [])

  async function pick(f?: File) {
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return setError('Choose a PDF.')
    setError(''); setProgress('Opening the PDF…')
    try {
      const pages = await extractPages(f, (n, t) => setProgress(`Reading text in your browser: page ${n} of ${t}`))
      const chars = pages.join('').trim().length
      if (!chars && f.size > MAX_FILE_BYTES) throw new Error('This PDF is a scan (no text) and over 3 MB. Upload it straight into the Claude chat instead.')
      setProgress('Saving…')
      await api.uploadMock({ name: f.name.replace(/\.pdf$/i, ''), section: section || null, page_texts: pages, pdf_size: f.size, pdf_base64: f.size <= MAX_FILE_BYTES ? await toBase64(f) : undefined })
      await load()
    } catch (e) { setError((e as Error).message) } finally { setProgress(null); if (input.current) input.current.value = '' }
  }

  const waiting = uploads.filter((u) => u.status === 'new')
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-gray-900">Upload a mock paper (PDF)</div>
          <div className="text-[12px] text-gray-600">Faster than attaching it in Claude: your browser pulls out the text, Claude reads only that.</div>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Section" className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-[12.5px]" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Section: auto</option><option>Quant</option><option>VARC</option><option>DILR</option>
          </select>
          <button className={btnPrimary} disabled={!!progress} onClick={() => input.current?.click()}>{progress ? 'Working…' : 'Upload mock PDF'}</button>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      </div>
      {progress && <div className="mt-3 text-[12.5px] text-indigo-800">{progress}</div>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {uploads.length > 0 && (
        <div className="mt-3 divide-y divide-indigo-100 rounded-xl bg-white">
          {uploads.slice(0, 5).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 truncate"><b>{u.name}</b> <span className="text-gray-500">· {u.pages} pages · {u.chars ? `${Math.round(u.chars / 1000)}k characters of text` : 'scan (Claude reads the PDF)'}{u.section ? ` · ${u.section}` : ''}</span></span>
              {u.status === 'saved' && u.mock_id
                ? <Link className="font-medium text-emerald-700 hover:underline" to={`/mocks/${u.mock_id}`}>✓ Saved by Claude → open</Link>
                : <span className="flex items-center gap-3"><span className="font-medium text-amber-700">Waiting for Claude</span>
                    <button className="text-gray-400 hover:text-red-600" onClick={async () => { if (confirm('Remove this upload?')) { await api.deleteMockUpload(u.id); load() } }}>Remove</button></span>}
            </div>
          ))}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3">
          <div className="text-[12px] font-medium text-gray-700">Now, in Claude (connector on), send:</div>
          <div className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-800">{PROMPT}</div>
          <button className={`${btnGhost} mt-2`} onClick={() => navigator.clipboard.writeText(PROMPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>{copied ? 'Copied' : 'Copy prompt'}</button>
        </div>
      )}
    </div>
  )
}
