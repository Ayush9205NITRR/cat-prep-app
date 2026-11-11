import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type NoteSummary } from '../api'
import NewNote from '../components/NewNote'
import { btnGhost, btnPrimary, Empty, ErrorNote, Loading, PageHeader } from '../ui'

export const KIND = {
  summary: { label: 'Claude summary', icon: '✨', cls: 'bg-indigo-50 text-indigo-700' },
  text: { label: 'Text', icon: '📝', cls: 'bg-emerald-50 text-emerald-700' },
  link: { label: 'Link', icon: '🔗', cls: 'bg-sky-50 text-sky-700' },
  image: { label: 'Image', icon: '🖼️', cls: 'bg-violet-50 text-violet-700' },
  pdf: { label: 'PDF', icon: '📄', cls: 'bg-rose-50 text-rose-700' },
  fix: { label: 'Fix', icon: '🛠️', cls: 'bg-orange-50 text-orange-700' },
}
export const kindOf = (n: { kind: string; file_mime?: string | null }) =>
  n.kind === 'file' ? (n.file_mime === 'application/pdf' ? 'pdf' : 'image') : (n.kind as keyof typeof KIND)

const host = (u: string | null) => { try { return new URL(u!).hostname.replace(/^www\./, '') } catch { return u ?? '' } }

function NoteCard({ n }: { n: NoteSummary }) {
  const k = KIND[kindOf(n)]
  return (
    <Link to={`/notes/${n.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-md">
      {kindOf(n) === 'image' && n.file_id && <img src={api.fileUrl(n.file_id)} alt="" loading="lazy" className="h-32 w-full object-cover" />}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${k.cls}`}>{k.icon} {k.label}</span>
          {n.due > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-700">{n.due} due</span>}
        </div>
        <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-gray-900 group-hover:text-indigo-700">{n.title}</div>
        {n.kind === 'link' ? (
          <div className="mt-1 truncate text-[12px] text-sky-700">{host(n.link_url)}</div>
        ) : n.preview ? (
          <div className="mt-1 line-clamp-3 whitespace-pre-line text-[12px] leading-relaxed text-gray-500">{n.preview}</div>
        ) : null}
        <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-gray-400">
          <span>{n.cards ? `${n.cards} flashcard${n.cards > 1 ? 's' : ''}` : 'No flashcards'}</span>
          {n.click_type ? <span className="text-indigo-600">clicked via {n.click_type}</span> : <span className="text-amber-600">tap needed</span>}
        </div>
      </div>
    </Link>
  )
}

export default function Notes() {
  const [data, setData] = useState<{ notes: NoteSummary[]; due: number } | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  useEffect(() => { api.notes().then(setData, (e) => setError(e.message)) }, [])
  const byTopic = useMemo(() => {
    const m = new Map<string, NoteSummary[]>()
    const f = filter.trim().toLowerCase()
    for (const n of data?.notes ?? [])
      if (!f || n.title.toLowerCase().includes(f) || n.topic.toLowerCase().includes(f) || n.preview?.toLowerCase().includes(f)) m.set(n.topic, [...(m.get(n.topic) ?? []), n])
    return [...m.entries()]
  }, [data, filter])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notes"
        sub="Your notes by topic. Add text, a link, a photo or a PDF here, or send lecture notes to Claude for a summary, formulas and flashcards."
        actions={<>
          <Link to="/notes/review" className={btnGhost}>{data.due ? `Review ${data.due} due card${data.due > 1 ? 's' : ''}` : 'No cards due'}</Link>
          <button className={btnPrimary} onClick={() => setAdding(true)}>+ New note</button>
        </>}
      />
      {data.notes.length > 3 && (
        <input className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10" placeholder="Search notes…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {data.notes.length === 0 ? (
        <Empty icon="📝" title="No notes yet">Click <b>New note</b> to paste text or a link, or add a photo or PDF. Or send lecture notes to Claude and say “Make notes and flashcards”.</Empty>
      ) : byTopic.length === 0 ? (
        <Empty icon="🔍" title="Nothing matches" />
      ) : byTopic.map(([topic, list]) => (
        <section key={topic}>
          <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-gray-500">{topic} <span className="font-normal normal-case tracking-normal text-gray-400">· {list.length}</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map((n) => <NoteCard key={n.id} n={n} />)}</div>
        </section>
      ))}
      {adding && <NewNote onClose={() => setAdding(false)} />}
    </div>
  )
}
