import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { schedule } from '../../shared/flashcards'
import { api, type DueCard } from '../api'
import { Back, btnPrimary, Empty, ErrorNote, Loading } from '../ui'

const when = (days: number) => (days === 1 ? 'Tomorrow' : `In ${days} days`)

/** One card per screen: think → (optionally type) → Show answer → I got it / I missed it. */
export default function CardReview() {
  const [params] = useSearchParams()
  const topic = params.get('topic') ?? undefined
  const [cards, setCards] = useState<DueCard[] | null>(null)
  const [i, setI] = useState(0)
  const [typed, setTyped] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tally, setTally] = useState({ got: 0, missed: 0, next: Infinity })
  const [error, setError] = useState('')
  useEffect(() => { api.dueCards(topic).then((r) => setCards(r.cards), (e) => setError(e.message)) }, [topic])
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!cards) return <Loading />

  const back = topic ? `/topic/${encodeURIComponent(topic)}` : '/notes'
  const c = cards[i]
  async function grade(right: boolean) {
    setBusy(true)
    try {
      const r = await api.reviewCard(c.id, right)
      setTally((t) => ({ got: t.got + (right ? 1 : 0), missed: t.missed + (right ? 0 : 1), next: Math.min(t.next, r.due_in_days) }))
      setShown(false); setTyped(''); setI(i + 1)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (!c)
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Back to={back}>{topic ?? 'Notes'}</Back>
        {cards.length === 0 ? <Empty icon="✅" title="No cards due">Nothing to review {topic ? `in ${topic} ` : ''}right now.</Empty> : (
          <div className="rounded-2xl border border-gray-200/70 bg-white p-8 text-center shadow-sm">
            <div className="text-[34px]">🎉</div>
            <div className="mt-1 text-[17px] font-semibold">Done for now</div>
            <div className="mt-2 text-[14px] text-gray-700"><b className="text-emerald-700">{tally.got} got</b> · <b className="text-red-600">{tally.missed} missed</b> · next review {tally.next === Infinity ? '—' : when(tally.next).toLowerCase()}</div>
            <Link to={back} className={`${btnPrimary} mt-5`}>Back to {topic ?? 'notes'}</Link>
          </div>
        )}
      </div>
    )

  const ifGot = schedule(c.streak, true).dueInDays
  const ifMissed = schedule(c.streak, false).dueInDays
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <Back to={back}>{topic ?? 'Notes'}</Back>
        <span className="text-[12.5px] font-medium text-gray-600">{i + 1} of {cards.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(i / cards.length) * 100}%` }} /></div>

      <div className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-gray-500">
          <span>{c.topic} · {c.title}</span>
          {c.kind === 'fix' && (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-700">
              🛠️ From your mistake{c.fix_mock_id && <> · <Link className="underline" to={`/mocks/${c.fix_mock_id}/review?row=${c.fix_row_id}`}>the question</Link></>}
            </span>
          )}
        </div>
        <div className="whitespace-pre-wrap py-3 text-center text-[17px] font-medium leading-relaxed text-gray-900">{c.front}</div>
        {!shown ? (
          <>
            <p className="mb-3 text-center text-[12.5px] text-gray-500">Say or write the answer in your head, then tap <b>Show answer</b>.</p>
            <textarea aria-label="Type your answer (optional)" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your answer (optional)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10" />
            <button className={`${btnPrimary} mt-3 w-full py-3 text-[14px]`} onClick={() => setShown(true)}>Show answer</button>
          </>
        ) : (
          <>
            {typed.trim() && (
              <div className="mb-2 rounded-xl bg-gray-50 px-3 py-2 text-[13px] text-gray-700"><div className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400">Your answer</div>{typed}</div>
            )}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-[14px] text-emerald-900"><div className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-700">Answer</div><div className="whitespace-pre-wrap">{c.back}</div></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button disabled={busy} onClick={() => grade(true)} className="rounded-xl bg-emerald-600 px-3 py-3.5 text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50">
                <div className="text-[15px] font-semibold">I got it</div><div className="text-[11.5px] opacity-90">{when(ifGot)}</div>
              </button>
              <button disabled={busy} onClick={() => grade(false)} className="rounded-xl bg-red-500 px-3 py-3.5 text-white shadow-sm transition hover:bg-red-600 active:scale-[0.98] disabled:opacity-50">
                <div className="text-[15px] font-semibold">I missed it</div><div className="text-[11.5px] opacity-90">{when(ifMissed)}</div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
