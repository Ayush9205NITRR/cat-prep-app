import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { QuestionRow } from '../../shared/analysis'
import { quadrantOf, QUADRANT_LABEL, type Quadrant } from '../../shared/insights'
import { Card } from '../ui'

const STYLE: Record<Quadrant, string> = {
  fast_right: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  slow_right: 'border-amber-200 bg-amber-50 text-amber-800',
  fast_wrong: 'border-red-200 bg-red-50 text-red-800',
  slow_wrong: 'border-gray-300 bg-gray-100 text-gray-800',
}
const ORDER: Quadrant[] = ['slow_right', 'fast_right', 'slow_wrong', 'fast_wrong'] // top row = right, left column = slow

/** Speed vs accuracy: every attempted, timed question in one of four boxes. Tap a box to list its questions. */
export default function Quadrants({ rows, mockId, hasTimeData }: { rows: (QuestionRow & { id: number })[]; mockId: number; hasTimeData: boolean }) {
  const [pick, setPick] = useState<Quadrant | null>(null)
  if (!hasTimeData) return null
  const by = Object.fromEntries(ORDER.map((k) => [k, rows.filter((r) => quadrantOf(r) === k)])) as Record<Quadrant, typeof rows>
  const total = ORDER.reduce((n, k) => n + by[k].length, 0)
  if (!total) return null
  return (
    <Card title="Speed vs accuracy" aside="Fast = within ideal time · tap a box">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-[11px] text-gray-400">
        <span /><span className="text-center">Slow</span><span className="text-center">Fast</span>
        {(['Right', 'Wrong'] as const).map((rowName, ri) => (
          <div key={rowName} className="contents">
            <span className="self-center [writing-mode:vertical-rl] rotate-180">{rowName}</span>
            {ORDER.slice(ri * 2, ri * 2 + 2).map((k) => (
              <button key={k} onClick={() => setPick(pick === k ? null : k)} aria-pressed={pick === k}
                className={`rounded-xl border p-3 text-left transition ${STYLE[k]} ${pick === k ? 'ring-2 ring-gray-900/40' : pick ? 'opacity-60' : ''}`}>
                <div className="text-[22px] font-semibold tabular-nums">{by[k].length}</div>
                <div className="text-[12.5px] font-semibold">{QUADRANT_LABEL[k].title}</div>
                <div className="text-[11.5px] opacity-80">{QUADRANT_LABEL[k].tip}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
      {pick && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {by[pick].length === 0 ? <span className="text-[12px] text-gray-500">None.</span> : by[pick].map((r) => {
            const label = <>Q{r.q_no} · {r.topic} · {r.seconds}s/{r.ideal_seconds}s</>
            return pick === 'fast_right'
              ? <span key={r.id} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11.5px] text-gray-700">{label}</span>
              : <Link key={r.id} to={`/mocks/${mockId}/review?row=${r.id}`} className="rounded-full bg-gray-900 px-2.5 py-1 text-[11.5px] text-white hover:bg-gray-700">{label} →</Link>
          })}
        </div>
      )}
    </Card>
  )
}
