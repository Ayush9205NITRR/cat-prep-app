import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GRADES, intervalLabel, scheduleGrade, type Grade } from '../../shared/flashcards'
import { api, type DueCard } from '../api'
import SessionBar from '../components/SessionBar'
import { advanceSession } from '../session'
import { Back, btnPrimary, Empty, ErrorNote, Loading } from '../ui'

const GRADE_UI: Record<Grade, { label: string; key: string; cls: string }> = {
  again: { label: 'Again', key: '1', cls: 'bg-red-500 hover:bg-red-600' },
  hard: { label: 'Hard', key: '2', cls: 'bg-amber-500 hover:bg-amber-600' },
  good: { label: 'Good', key: '3', cls: 'bg-emerald-600 hover:bg-emerald-700' },
  easy: { label: 'Easy', key: '4', cls: 'bg-sky-600 hover:bg-sky-700' },
}
const isTyping = (e: KeyboardEvent) => ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)

/** One card per screen. Space = show answer · 1 Again · 2 Hard · 3 Good · 4 Easy. "Again" cards come back in this session. */
export default function CardReview() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const topic = params.get('topic') ?? undefined
  const limit = Number(params.get('limit')) || undefined
  const inSession = params.get('session') === '1'
  const [queue, setQueue] = useState<DueCard[] | null>(null)
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(0)
  const [typed, setTyped] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tally, setTally] = useState<Record<Grade, number>>({ again: 0, hard: 0, good: 0, easy: 0 })
  const [next, setNext] = useState(Infinity)
  const [error, setError] = useState('')
  useEffect(() => {
    api.dueCards(topic).then((r) => { const cards = limit ? r.cards.slice(0, limit) : r.cards; setQueue(cards); setTotal(cards.length) }, (e) => setError(e.message))
  }, [topic, limit])

  const c = queue?.[0]
  const grade = useCallback(async (g: Grade) => {
    if (!c || busy) return
    setBusy(true)
    try {
      const r = await api.reviewCard(c.id, g)
      setTally((t) => ({ ...t, [g]: t[g] + 1 }))
      if (r.due_in_days > 0) setNext((n) => Math.min(n, r.due_in_days))
      // "Again" goes to the back of this session's queue; the rest are done for today.
      setQueue((q) => (q ? (g === 'again' ? [...q.slice(1), { ...q[0], streak: r.card.streak }] : q.slice(1)) : q))
      if (g !== 'again') setDone((n) => n + 1)
      setShown(false); setTyped('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [c, busy])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (!c) { if (e.key === 'Enter' && inSession) nav(advanceSession({ kind: 'cards', note: `${done} cards` })); return }
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true); return }
      const g = GRADES[Number(e.key) - 1]
      if (shown && g) { e.preventDefault(); grade(g) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [c, shown, grade, inSession, done, nav])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!queue) return <Loading />
  const back = topic ? `/topic/${encodeURIComponent(topic)}` : '/'

  if (!c)
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {inSession ? <SessionBar /> : <Back to={back}>{topic ?? 'Home'}</Back>}
        {total === 0 && !inSession ? <Empty icon="✅" title="No cards due">Nothing to review {topic ? `in ${topic} ` : ''}right now.</Empty> : (
          <div className="rounded-2xl border border-gray-200/70 bg-white p-8 text-center shadow-sm">
            <div className="text-[34px]">🎉</div>
            <div className="mt-1 text-[17px] font-semibold">{total ? 'Cards done' : 'No cards due'}</div>
            {total > 0 && (
              <div className="mt-2 text-[13.5px] text-gray-700">
                <b className="text-emerald-700">{tally.good + tally.easy} got</b> · <b className="text-amber-700">{tally.hard} hard</b> · <b className="text-red-600">{tally.again} again</b>
                {next !== Infinity && <> · next review {intervalLabel(next).toLowerCase()}</>}
              </div>
            )}
            {inSession
              ? <button className={`${btnPrimary} mt-5`} onClick={() => nav(advanceSession({ kind: 'cards', note: `${done} cards` }))}>Continue to the next block → <span className="ml-1 opacity-60">(Enter)</span></button>
              : <Link to={back} className={`${btnPrimary} mt-5`}>Back to {topic ?? 'Home'}</Link>}
          </div>
        )}
      </div>
    )

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {inSession ? <SessionBar /> : (
        <div className="flex items-center justify-between">
          <Back to={back}>{topic ?? 'Home'}</Back>
          <span className="text-[12.5px] font-medium text-gray-600">{topic ? '' : 'All topics · '}{Math.min(done + 1, total)} of {total}</span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <div className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-gray-500">
          <span>
            <Link to={`/topic/${encodeURIComponent(c.topic)}`} className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 hover:underline">{c.topic}</Link>
            <span className="ml-2">{c.kind === 'fix' ? 'Fix note' : c.title}</span>
          </span>
          {c.kind === 'fix' && c.fix_mock_id && (
            <Link className="rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-700 hover:underline" to={`/mocks/${c.fix_mock_id}/review?row=${c.fix_row_id}`}>🛠️ From your mistake — see the question →</Link>
          )}
        </div>
        <div className="whitespace-pre-wrap py-3 text-center text-[17px] font-medium leading-relaxed text-gray-900">{c.front}</div>
        {!shown ? (
          <>
            <p className="mb-3 text-center text-[12.5px] text-gray-500">Say or write the answer in your head, then tap <b>Show answer</b>.</p>
            <textarea aria-label="Type your answer (optional)" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your answer (optional)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10" />
            <button className={`${btnPrimary} mt-3 w-full py-3 text-[14px]`} onClick={() => setShown(true)}>Show answer <span className="ml-1 text-[11px] opacity-60">Space</span></button>
          </>
        ) : (
          <>
            {typed.trim() && (
              <div className="mb-2 rounded-xl bg-gray-50 px-3 py-2 text-[13px] text-gray-700"><div className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400">Your answer</div>{typed}</div>
            )}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-[14px] text-emerald-900"><div className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-700">Answer</div><div className="whitespace-pre-wrap">{c.back}</div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <button key={g} disabled={busy} onClick={() => grade(g)} className={`rounded-xl px-2 py-3 text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50 ${GRADE_UI[g].cls}`}>
                  <div className="text-[14.5px] font-semibold">{GRADE_UI[g].label}</div>
                  <div className="text-[11.5px] opacity-90">{intervalLabel(scheduleGrade(c.streak, g).dueInDays)} · <kbd className="font-sans opacity-80">{GRADE_UI[g].key}</kbd></div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="text-center text-[11px] text-gray-400">Keys: Space show answer · 1 Again · 2 Hard · 3 Good · 4 Easy</p>
    </div>
  )
}
