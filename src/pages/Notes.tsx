import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type NoteSummary } from '../api'
import { btnPrimary, Card, ErrorNote, Loading } from '../ui'

export default function Notes() {
  const [data, setData] = useState<{ notes: NoteSummary[]; due: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.notes().then(setData, (e) => setError(e.message)) }, [])
  const byTopic = useMemo(() => {
    const m = new Map<string, NoteSummary[]>()
    for (const n of data?.notes ?? []) m.set(n.topic, [...(m.get(n.topic) ?? []), n])
    return [...m.entries()]
  }, [data])
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Notes</h1>
          <p className="text-[12px] text-gray-500">Send Claude a photo of lecture notes, a text dump or a transcript. It saves a summary, formulas and flashcards here.</p>
        </div>
        <Link to="/notes/review" className={btnPrimary}>{data.due ? `Review ${data.due} due card${data.due > 1 ? 's' : ''}` : 'No cards due'}</Link>
      </div>
      {byTopic.length === 0 ? (
        <Card><p className="py-6 text-center text-[13px] text-gray-500">No notes yet. In Claude, upload your lecture notes and say “Make notes and flashcards”.</p></Card>
      ) : byTopic.map(([topic, list]) => (
        <Card key={topic} title={topic}>
          <div className="divide-y divide-gray-100">
            {list.map((n) => (
              <Link key={n.id} to={`/notes/${n.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-gray-50">
                <div>
                  <div className="text-[13px] font-medium text-gray-800">{n.title}</div>
                  <div className="text-[11px] text-gray-400">{n.cards} cards{n.due ? ` · ${n.due} due` : ''}</div>
                </div>
                {n.click_type
                  ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">clicked via {n.click_type}</span>
                  : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">tap needed</span>}
              </Link>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
