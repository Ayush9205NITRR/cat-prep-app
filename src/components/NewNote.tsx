import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { detectKind, FILE_TYPES, MAX_FILE_BYTES, normaliseUrl } from '../../shared/note-input'
import { AREAS, SCHEMA } from '../../shared/topics'
import { api } from '../api'
import { btnGhost, btnPrimary, ErrorNote, inputCls } from '../ui'

/** Big photos are shrunk in the browser (longest side 1600 px, JPEG) so uploads stay small. GIF and PDF go as they are. */
async function prepareFile(f: File): Promise<{ name: string; mime: string; base64: string }> {
  let blob: Blob = f
  let mime = f.type
  let name = f.name || 'pasted-image.png'
  if (['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
    const img = await createImageBitmap(f).catch(() => { throw new Error('That file is not a real image. Try another one.') })
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
    if (scale < 1 || f.size > 800_000) {
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85))
      mime = 'image/jpeg'; name = name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg'
    }
  }
  if (blob.size > MAX_FILE_BYTES) throw new Error('That file is over 3 MB. Try a smaller one.')
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { name, mime, base64: btoa(bin) }
}

export default function NewNote({ onClose, defaultTopic }: { onClose: () => void; defaultTopic?: string }) {
  const nav = useNavigate()
  const [topic, setTopic] = useState(defaultTopic ?? '')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const kind = file ? 'file' : detectKind(content)

  function pick(f: File | undefined | null) {
    if (!f) return
    if (!(FILE_TYPES as readonly string[]).includes(f.type)) return setError('Images (PNG, JPG, WebP, GIF) or PDF only.')
    setError(''); setFile(f)
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    if (!topic) return setError('Pick a topic.')
    setBusy(true); setError('')
    try {
      const r = await api.createNote({ topic, title: title.trim() || undefined, content: content || undefined, file: file ? await prepareFile(file) : undefined })
      nav(`/notes/${r.id}`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const chip = {
    file: { t: file?.type === 'application/pdf' ? 'PDF' : 'Image', c: 'bg-violet-50 text-violet-700', i: file?.type === 'application/pdf' ? '📄' : '🖼️' },
    link: { t: 'Link', c: 'bg-sky-50 text-sky-700', i: '🔗' },
    text: { t: 'Text', c: 'bg-emerald-50 text-emerald-700', i: '📝' },
    empty: null,
  }[kind]

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-gray-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="New note" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}
        onPaste={(e) => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); pick(f) } }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[16px] font-semibold tracking-tight">New note</div>
          <button className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select aria-label="Topic" className={`${inputCls} py-2`} value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Topic…</option>
              {AREAS.map((a) => <optgroup key={a} label={a}>{SCHEMA[a].map((t) => <option key={t}>{t}</option>)}</optgroup>)}
            </select>
            <input aria-label="Title" className={`${inputCls} py-2`} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {!file && (
            <div className="relative">
              <textarea aria-label="Text or link" autoFocus className={`${inputCls} w-full resize-y py-2.5 text-[13px] leading-relaxed`} rows={7}
                placeholder={'Type or paste your notes, or a link (YouTube, PDF, article…).\nYou can also paste a screenshot here.'}
                value={content} onChange={(e) => setContent(e.target.value)} />
              {chip && <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.c}`}>{chip.i} {chip.t}{kind === 'link' ? ' · ' + (() => { try { return new URL(normaliseUrl(content)).hostname.replace(/^www\./, '') } catch { return '' } })() : ''}</span>}
            </div>
          )}

          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
              {preview ? <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-violet-50 text-[24px]">📄</div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{file.name || 'Pasted image'}</div>
                <div className="text-[11px] text-gray-500">{chip?.i} {chip?.t} · {(file.size / 1024).toFixed(0)} KB{file.size > 800_000 && file.type !== 'application/pdf' && file.type !== 'image/gif' ? ' · will be shrunk' : ''}</div>
              </div>
              <button className="text-[12px] text-gray-500 hover:text-red-600" onClick={() => { setFile(null); setPreview(null) }}>Remove</button>
            </div>
          ) : (
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
              className={`w-full rounded-xl border-2 border-dashed px-4 py-4 text-center text-[12.5px] transition-colors ${drag ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}>
              <b className="text-gray-700">Or add a file</b> — photo of notes, screenshot or PDF · drop it here or click · up to 3 MB
            </button>
          )}
          <input ref={input} type="file" accept={FILE_TYPES.join(',')} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

          <p className="text-[11.5px] text-gray-400">Saved as you give it. For a summary, formulas and flashcards, send the same thing to Claude and say “Make notes and flashcards”.</p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={onClose}>Cancel</button>
            <button className={btnPrimary} disabled={busy || (kind === 'empty')} onClick={save}>{busy ? 'Saving…' : 'Save note'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
