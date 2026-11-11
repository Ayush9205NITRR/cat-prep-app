import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Card as CardT } from '../api'
import { Back, btnGhost, btnPrimary, Card, ErrorNote, Loading } from '../ui'

type Due = CardT & { title: string; topic: string }

/** Due cards one at a time. Right → 1, 2, 4, 8 days. Wrong → tomorrow. */
export default function CardReview() {
  const [cards, setCards] = useState<Due[] | null>(null)
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [last, setLast] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { api.dueCards().then((r) => setCards(r.cards), (e) => setError(e.message)) }, [])
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!cards) return <Loading />

  const c = cards[i]
  async function grade(right: boolean) {
    try {
      const r = await api.reviewCard(c.id, right)
      setLast(right ? `Right — back in ${r.due_in_days} day${r.due_in_days > 1 ? 's' : ''}.` : 'Wrong — back tomorrow.')
      setFlipped(false); setI(i + 1)
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <Back to="/notes">Notes</Back>
        <span className="text-[12px] text-gray-500">{Math.min(i + 1, cards.length)} of {cards.length} due</span>
      </div>
      {last && <div className="text-center text-[12px] text-gray-500">{last}</div>}
      {!c ? (
        <Card><div className="py-8 text-center"><div className="text-[15px] font-semibold">{cards.length ? 'All done for today' : 'No cards due today'}</div><Link to="/notes" className="mt-2 inline-block text-[12px] text-gray-500 underline">Back to notes</Link></div></Card>
      ) : (
        <Card title={c.title} aside={c.topic}>
          <div className="min-h-[120px] whitespace-pre-wrap py-4 text-center text-[16px] text-gray-900">{c.front}</div>
          {flipped && <div className="whitespace-pre-wrap border-t border-gray-100 py-4 text-center text-[15px] text-emerald-800">{c.back}</div>}
          {!flipped ? (
            <button className={`${btnPrimary} w-full py-2`} onClick={() => setFlipped(true)}>Show answer</button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className={`${btnGhost} py-2 text-red-600`} onClick={() => grade(false)}>Wrong</button>
              <button className={`${btnPrimary} py-2`} onClick={() => grade(true)}>Right</button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
