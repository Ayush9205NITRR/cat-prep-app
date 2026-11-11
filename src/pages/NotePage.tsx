import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CLICK_TYPES } from '../../shared/flashcards'
import { AREAS, SCHEMA } from '../../shared/topics'
import { api, type Card as CardT, type Note, type NoteFile } from '../api'
import { KIND, kindOf } from './Notes'
import { Back, btnGhost, Card, ErrorNote, inputCls, Loading } from '../ui'

const box = `${inputCls} w-full`

/** A text field that saves when you leave it. */
function Field({ value, onSave, rows, className = '' }: { value: string; onSave: (v: string) => void; rows?: number; className?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => (v.trim() && v !== value ? onSave(v.trim()) : setV(value))
  return rows
    ? <textarea className={`${box} ${className}`} rows={rows} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />
    : <input className={`${box} ${className}`} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
}

export default function NotePage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const [data, setData] = useState<{ note: Note; cards: CardT[]; files: NoteFile[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.note(id).then(setData, (e) => setError(e.message)) }, [id])
  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />
  const { note, cards, files = [] } = data
  const k = note.kind === 'fix' ? { label: 'Fix', icon: '🛠️', cls: 'bg-orange-50 text-orange-700' } : KIND[kindOf({ kind: note.kind, file_mime: files[0]?.mime })]

  const run = async (f: () => Promise<unknown>) => { setError(''); try { await f() } catch (e) { setError(`Not saved: ${(e as Error).message}`) } }
  const patch = (p: Partial<Note>) => run(async () => setData(await api.updateNote(id, p)))
  const setCard = (c: CardT) => setData({ ...data, cards: cards.map((x) => (x.id === c.id ? c : x)) })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Back to={`/topic/${encodeURIComponent(note.topic)}`}>{note.topic}</Back>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${k.cls}`}>{k.icon} {k.label}</span>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}

      {note.kind === 'fix' && note.fix_mock_id && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-[13px] text-orange-900">
          <span>🛠️ Fix note for a mistake in <b>{note.topic}</b>.</span>
          <Link className="font-medium underline" to={`/mocks/${note.fix_mock_id}/review?row=${note.fix_row_id}`}>See the question</Link>
        </div>
      )}
      {note.kind !== 'fix' && <div className={`rounded-xl border p-4 ${note.click_type ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
        <div className="mb-2 text-[13px] font-semibold text-gray-900">How did this click? {!note.click_type && <span className="font-normal text-amber-700">· one tap, required</span>}</div>
        <div className="flex flex-wrap gap-2">
          {CLICK_TYPES.map((c) => (
            <button key={c} onClick={() => patch({ click_type: c })} className={`rounded-full border px-3 py-1 text-[12px] font-medium capitalize ${note.click_type === c ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'}`}>{c}</button>
          ))}
        </div>
      </div>}

      {note.kind === 'link' && note.link_url && (
        <Card title="Link">
          <a href={note.link_url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 hover:bg-sky-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[18px] shadow-sm">🔗</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-sky-800">{(() => { try { return new URL(note.link_url).hostname.replace(/^www\./, '') } catch { return note.link_url } })()}</span>
              <span className="block truncate text-[11.5px] text-sky-700/70">{note.link_url}</span>
            </span>
            <span className="ml-auto shrink-0 text-[12px] font-medium text-sky-700">Open ↗</span>
          </a>
          <div className="mt-3"><Field value={note.link_url} onSave={(link_url) => patch({ link_url: /^https?:\/\//i.test(link_url) ? link_url : 'https://' + link_url })} /></div>
        </Card>
      )}
      {files.map((f) => (
        <Card key={f.id} title={f.name} aside={`${(f.size / 1024).toFixed(0)} KB`}>
          {f.mime.startsWith('image/')
            ? <a href={api.fileUrl(f.id)} target="_blank" rel="noopener noreferrer"><img src={api.fileUrl(f.id)} alt={f.name} className="max-h-[70vh] w-full rounded-xl border border-gray-100 object-contain" /></a>
            : <a href={api.fileUrl(f.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3 hover:bg-rose-50"><span className="text-[22px]">📄</span><span className="text-[13px] font-medium text-rose-800">Open PDF</span><span className="ml-auto text-[12px] text-rose-700">↗</span></a>}
        </Card>
      ))}

      <Card title="Note">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><Field value={note.title} onSave={(title) => patch({ title })} className="font-semibold" /></div>
            <select className={box} value={note.topic} onChange={(e) => patch({ topic: e.target.value })}>
              {AREAS.map((a) => <optgroup key={a} label={a}>{SCHEMA[a].map((t) => <option key={t}>{t}</option>)}</optgroup>)}
            </select>
          </div>
          <div>
            <div className="mb-1 text-[12px] font-medium text-gray-700">{note.kind === 'summary' ? 'Summary' : note.kind === 'text' ? 'Text' : note.kind === 'fix' ? 'Fix' : 'Your notes on this'}</div>
            <Field rows={note.kind === 'text' ? 12 : 6} value={note.summary} onSave={(summary) => patch({ summary })} />
          </div>
          <div>
            <div className="mb-1 text-[12px] font-medium text-gray-700">Formulas <span className="font-normal text-gray-400">(one per line)</span></div>
            <Field rows={Math.max(3, note.formulas.length + 1)} value={note.formulas.join('\n')} onSave={(v) => patch({ formulas: v.split('\n').map((x) => x.trim()).filter(Boolean) })} className="font-mono text-[12px]" />
          </div>
          {note.source && <div className="text-[11px] text-gray-400">From: {note.source}</div>}
        </div>
      </Card>

      <Card title="Flashcards" aside="Edits save when you leave a box">
        <div className="space-y-3">
          {cards.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-gray-100 p-3">
              <div className="mb-1 flex justify-between text-[11px] text-gray-400">
                <span>Card {i + 1} · due {c.due_on}{c.reviews ? ` · reviewed ${c.reviews}×` : ''}</span>
                <button className="hover:text-red-600" onClick={() => run(async () => { await api.deleteCard(c.id); setData({ ...data, cards: cards.filter((x) => x.id !== c.id) }) })}>Delete</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field rows={2} value={c.front} onSave={(front) => run(async () => setCard((await api.updateCard(c.id, { front })).card))} />
                <Field rows={2} value={c.back} onSave={(back) => run(async () => setCard((await api.updateCard(c.id, { back })).card))} />
              </div>
            </div>
          ))}
          <button className={btnGhost} onClick={() => run(async () => { const { card } = await api.addCard(id, 'New question', 'Answer'); setData({ ...data, cards: [...cards, card] }) })}>Add card</button>
        </div>
      </Card>

      <button className="text-[12px] text-red-600 hover:underline" onClick={() => confirm('Delete this note and its cards?') && run(async () => { await api.deleteNote(id); nav(`/topic/${encodeURIComponent(note.topic)}`) })}>Delete note</button>
    </div>
  )
}
