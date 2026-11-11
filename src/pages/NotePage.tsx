import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CLICK_TYPES } from '../../shared/flashcards'
import { AREAS, SCHEMA } from '../../shared/topics'
import { api, type Card as CardT, type Note, type NoteFile } from '../api'
import Markdown from '../components/Markdown'
import { KIND, kindOf } from './Notes'
import { Back, btnGhost, btnPrimary, Card, ErrorNote, inputCls, Loading } from '../ui'

const box = `${inputCls} w-full`
type Data = { note: Note; cards: CardT[]; files: NoteFile[] }

/** "Saved" for 2 seconds after a save. */
function useSaved() {
  const [on, setOn] = useState(false)
  return { on, flash: () => { setOn(true); setTimeout(() => setOn(false), 2000) } }
}
export const SavedTick = ({ on }: { on: boolean }) => (on ? <span className="text-[12px] font-medium text-emerald-700">✓ Saved</span> : null)

function EditButtons({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
      <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  )
}

function FlashCard({ c, i, onSaved, onDelete }: { c: CardT; i: number; onSaved: (c: CardT) => void; onDelete: () => void }) {
  const [edit, setEdit] = useState(false)
  const [front, setFront] = useState(c.front)
  const [back, setBack] = useState(c.back)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saved = useSaved()
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { onSaved((await api.updateCard(c.id, { front, back })).card); setEdit(false); saved.flash() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
        <span>Card {i + 1} · due {c.due_on}{c.reviews ? ` · reviewed ${c.reviews}×` : ''}</span>
        <span className="flex items-center gap-3"><SavedTick on={saved.on} />{!edit && <button className="font-medium text-indigo-700 hover:underline" onClick={() => { setFront(c.front); setBack(c.back); setEdit(true) }}>Edit</button>}<button className="hover:text-red-600" onClick={onDelete}>Delete</button></span>
      </div>
      {edit ? (
        <form onSubmit={save} className="space-y-2">
          <label className="block text-[11.5px] font-medium text-gray-600">Front<textarea className={`${box} mt-0.5`} rows={2} value={front} onChange={(e) => setFront(e.target.value)} /></label>
          <label className="block text-[11.5px] font-medium text-gray-600">Back<textarea className={`${box} mt-0.5`} rows={2} value={back} onChange={(e) => setBack(e.target.value)} /></label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <EditButtons busy={busy} onCancel={() => setEdit(false)} />
        </form>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-900">{c.front}</div>
          <div className="whitespace-pre-wrap rounded-lg bg-emerald-50/60 px-3 py-2 text-[13px] text-emerald-900">{c.back}</div>
        </div>
      )}
    </div>
  )
}

function Versions({ id, onRestored }: { id: number; onRestored: (d: Data) => void }) {
  const [list, setList] = useState<{ id: number; title: string; summary: string; created_at: string }[] | null>(null)
  const [peek, setPeek] = useState<number | null>(null)
  useEffect(() => { api.noteVersions(id).then((r) => setList(r.versions), () => setList([])) }, [id])
  if (!list?.length) return null
  return (
    <Card title={`Previous versions · ${list.length}`} aside="Kept when Claude rewrites this note">
      <div className="space-y-2">
        {list.map((v) => (
          <div key={v.id} className="rounded-xl border border-gray-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="text-gray-600">{new Date(v.created_at).toLocaleString()} · {v.title}</span>
              <span className="flex gap-3">
                <button className="text-gray-500 hover:underline" onClick={() => setPeek(peek === v.id ? null : v.id)}>{peek === v.id ? 'Hide' : 'Show'}</button>
                <button className="font-medium text-indigo-700 hover:underline" onClick={async () => { if (confirm('Restore this version? The current text is kept as a version too.')) onRestored(await api.restoreVersion(id, v.id)) }}>Restore</button>
              </span>
            </div>
            {peek === v.id && <div className="mt-2 rounded-lg bg-gray-50 p-3"><Markdown text={v.summary} /></div>}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function NotePage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ title: '', topic: '', summary: '', formulas: '', link_url: '' })
  const [busy, setBusy] = useState(false)
  const [versionsKey, setVersionsKey] = useState(0)
  const saved = useSaved()
  useEffect(() => { api.note(id).then(setData, (e) => setError(e.message)) }, [id])
  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />
  const { note, cards, files = [] } = data
  const k = note.kind === 'fix' ? { label: 'Fix', icon: '🛠️', cls: 'bg-orange-50 text-orange-700' } : KIND[kindOf({ kind: note.kind, file_mime: files[0]?.mime })]

  const run = async (f: () => Promise<unknown>) => { setError(''); try { await f() } catch (e) { setError(`Not saved: ${(e as Error).message}`) } }
  function startEdit() {
    setForm({ title: note.title, topic: note.topic, summary: note.summary, formulas: note.formulas.join('\n'), link_url: note.link_url ?? '' })
    setEdit(true)
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    await run(async () => {
      const patch: Partial<Note> = { title: form.title.trim() || note.title, topic: form.topic, summary: form.summary, formulas: form.formulas.split('\n').map((x) => x.trim()).filter(Boolean) }
      if (note.kind === 'link') patch.link_url = /^https?:\/\//i.test(form.link_url.trim()) ? form.link_url.trim() : 'https://' + form.link_url.trim()
      setData(await api.updateNote(id, patch)); setEdit(false); saved.flash()
    })
    setBusy(false)
  }

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
      {note.kind === 'file' && !note.file_read && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <b>Not read yet — ask Claude to read it.</b> In Claude: “Read the file I added to {note.topic} and make cards.” The app never reads files itself.
        </div>
      )}
      {note.kind !== 'fix' && (
        <div className={`rounded-xl border p-4 ${note.click_type ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
          <div className="mb-2 text-[13px] font-semibold text-gray-900">How did this click? {!note.click_type && <span className="font-normal text-amber-700">· one tap, required</span>}</div>
          <div className="flex flex-wrap gap-2">
            {CLICK_TYPES.map((c) => (
              <button key={c} onClick={() => run(async () => setData(await api.updateNote(id, { click_type: c })))} className={`rounded-full border px-3 py-1 text-[12px] font-medium capitalize ${note.click_type === c ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'}`}>{c}</button>
            ))}
          </div>
        </div>
      )}

      {files.map((f) => (
        <Card key={f.id} title={f.name} aside={`${(f.size / 1024).toFixed(0)} KB`}>
          {f.mime.startsWith('image/')
            ? <a href={api.fileUrl(f.id)} target="_blank" rel="noopener noreferrer"><img src={api.fileUrl(f.id)} alt={f.name} className="max-h-[70vh] w-full rounded-xl border border-gray-100 object-contain" /></a>
            : <a href={api.fileUrl(f.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3 hover:bg-rose-50"><span className="text-[22px]">📄</span><span className="text-[13px] font-medium text-rose-800">Open PDF</span><span className="ml-auto text-[12px] text-rose-700">↗</span></a>}
        </Card>
      ))}

      <Card title={edit ? 'Edit note' : note.title} aside={edit ? 'Markdown: # headings, - lists, | tables |' : <span className="flex items-center gap-3"><SavedTick on={saved.on} /><button className="text-[12.5px] font-medium text-indigo-700 hover:underline" onClick={startEdit}>Edit</button></span>}>
        {edit ? (
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-[12px] font-medium text-gray-700 sm:col-span-2">Title<input className={`${box} mt-1`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label className="block text-[12px] font-medium text-gray-700">Topic
                <select className={`${box} mt-1`} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
                  {AREAS.map((a) => <optgroup key={a} label={a}>{SCHEMA[a].map((t) => <option key={t}>{t}</option>)}</optgroup>)}
                </select>
              </label>
            </div>
            {note.kind === 'link' && <label className="block text-[12px] font-medium text-gray-700">Link<input className={`${box} mt-1`} value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} /></label>}
            <label className="block text-[12px] font-medium text-gray-700">Text <span className="font-normal text-gray-400">(Markdown)</span>
              <textarea className={`${box} mt-1 font-mono text-[12.5px] leading-relaxed`} rows={14} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </label>
            <label className="block text-[12px] font-medium text-gray-700">Formulas <span className="font-normal text-gray-400">(one per line)</span>
              <textarea className={`${box} mt-1 font-mono text-[12px]`} rows={Math.max(3, note.formulas.length + 1)} value={form.formulas} onChange={(e) => setForm({ ...form, formulas: e.target.value })} />
            </label>
            <EditButtons busy={busy} onCancel={() => setEdit(false)} />
          </form>
        ) : (
          <div className="space-y-4">
            {note.kind === 'link' && note.link_url && (
              <a href={note.link_url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 hover:bg-sky-50">
                <span className="text-[18px]">🔗</span><span className="min-w-0 truncate text-[13px] text-sky-800">{note.link_url}</span><span className="ml-auto shrink-0 text-[12px] font-medium text-sky-700">Open ↗</span>
              </a>
            )}
            {(note.summary || note.kind !== 'link') && <Markdown text={note.summary} />}
            {note.formulas.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Formulas</div>
                <ul className="space-y-1">{note.formulas.map((f, i) => <li key={i} className="rounded-lg bg-gray-50 px-3 py-1.5 font-mono text-[12.5px] text-gray-800">{f}</li>)}</ul>
              </div>
            )}
            {note.source && <div className="text-[11px] text-gray-400">From: {note.source}</div>}
          </div>
        )}
      </Card>

      <Card title={`Flashcards · ${cards.length}`}>
        <div className="space-y-3">
          {cards.map((c, i) => (
            <FlashCard key={c.id} c={c} i={i} onSaved={(nc) => setData({ ...data, cards: cards.map((x) => (x.id === nc.id ? nc : x)) })}
              onDelete={() => confirm('Delete this card?') && run(async () => { await api.deleteCard(c.id); setData({ ...data, cards: cards.filter((x) => x.id !== c.id) }) })} />
          ))}
          <button className={btnGhost} onClick={() => run(async () => { const { card } = await api.addCard(id, 'New question', 'Answer'); setData({ ...data, cards: [...cards, card] }) })}>Add card</button>
        </div>
      </Card>

      <Versions key={versionsKey} id={id} onRestored={(d) => { setData(d); setVersionsKey((n) => n + 1); saved.flash() }} />

      <button className="text-[12px] text-red-600 hover:underline" onClick={() => confirm('Delete this note and its cards?') && run(async () => { await api.deleteNote(id); nav(`/topic/${encodeURIComponent(note.topic)}`) })}>Delete note</button>
    </div>
  )
}
