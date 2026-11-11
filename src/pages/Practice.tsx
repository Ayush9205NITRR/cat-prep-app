import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DIFFICULTIES } from '../../shared/practice'
import { areaOf } from '../../shared/topics'
import { api, type PracticeSummary, type TopicHistory } from '../api'
import { btnGhost, btnPrimary, Card, ErrorNote, fmtSeconds, Loading } from '../ui'

const DIFF_STYLE: Record<string, string> = { easy: 'bg-emerald-50 text-emerald-700', medium: 'bg-amber-50 text-amber-700', hard: 'bg-red-50 text-red-600' }

function History({ topic }: { topic: string }) {
  const [h, setH] = useState<TopicHistory | null>(null)
  useEffect(() => { api.history(topic).then(setH, () => {}) }, [topic])
  if (!h) return <div className="text-[12px] text-gray-400">Loading…</div>
  if (!h.attempts) return <div className="text-[12px] text-gray-400">No attempts yet.</div>
  return (
    <div className="space-y-2">
      <div className="text-[12px] text-gray-600">
        Last {h.attempts}: <b>{h.right} right</b> · A {h.errors.A} · B {h.errors.B} · C {h.errors.C}
        {h.errors.not_tapped > 0 && ` · ${h.errors.not_tapped} not tapped`}
        {h.errors.repeats > 0 && <span className="font-semibold text-red-600"> · {h.errors.repeats} repeat{h.errors.repeats > 1 ? 's' : ''}</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {h.history.map((a) => (
          <span key={a.id} title={`${a.text.slice(0, 80)} · ${fmtSeconds(a.seconds)}`} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${a.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'} ${a.repeat ? 'ring-1 ring-red-400' : ''}`}>
            {a.correct ? '✓' : a.error_class ?? '✗'}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Practice() {
  const [qs, setQs] = useState<PracticeSummary[] | null>(null)
  const [error, setError] = useState('')
  const [diff, setDiff] = useState<string>('')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { api.practiceList().then((r) => setQs(r.questions), (e) => setError(e.message)) }, [])

  const byTopic = useMemo(() => {
    const m = new Map<string, PracticeSummary[]>()
    for (const q of qs ?? []) if (!diff || q.difficulty === diff) m.set(q.topic, [...(m.get(q.topic) ?? []), q])
    return [...m.entries()]
  }, [qs, diff])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!qs) return <Loading />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Practice</h1>
          <p className="text-[12px] text-gray-500">Send Claude a teacher’s question or an assignment PDF. Then practise here: timer on, no hints.</p>
        </div>
        <div className="flex gap-1">
          {['', ...DIFFICULTIES].map((d) => (
            <button key={d} onClick={() => setDiff(d)} className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${diff === d ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{d || 'All'}</button>
          ))}
        </div>
      </div>
      {byTopic.length === 0 ? (
        <Card><p className="py-6 text-center text-[13px] text-gray-500">{qs.length ? 'No questions at this difficulty.' : 'No questions yet. In Claude, upload a question or an assignment and say “Save these for practice”.'}</p></Card>
      ) : byTopic.map(([topic, list]) => (
        <Card key={topic} title={<span>{topic} <span className="font-normal text-gray-400">· {areaOf(topic)}</span></span>} aside={`${list.length} question${list.length > 1 ? 's' : ''}`}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Link className={btnPrimary} to={`/practice/session?topic=${encodeURIComponent(topic)}${diff ? `&difficulty=${diff}` : ''}`}>Practise {diff || 'all'}</Link>
            <button className={btnGhost} onClick={() => setOpen(open === topic ? null : topic)}>{open === topic ? 'Hide history' : 'History'}</button>
          </div>
          {open === topic && <div className="mb-3 rounded-lg bg-gray-50 p-3"><History topic={topic} /></div>}
          <div className="divide-y divide-gray-100">
            {list.map((q) => (
              <Link key={q.id} to={`/practice/questions/${q.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-gray-50">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-gray-800">{q.text}</div>
                  <div className="text-[11px] text-gray-400">{q.source || 'saved by Claude'} · {q.attempts ? `${q.right_attempts}/${q.attempts} right` : 'not tried'}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${DIFF_STYLE[q.difficulty]}`}>{q.difficulty}</span>
              </Link>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
