import { useNavigate } from 'react-router-dom'
import { BLOCK_LABEL, endSession, readSession } from '../session'

/** Shown on a page that is a block of Today's Session: where you are, and a way out. */
export default function SessionBar() {
  const nav = useNavigate()
  const s = readSession()
  if (!s || !new URLSearchParams(window.location.search).get('session')) return null
  const blocks = s.plan.blocks
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className="font-semibold text-indigo-900">Today’s session · {s.plan.minutes} min · block {Math.min(s.step + 1, blocks.length)} of {blocks.length}</span>
        <button className="text-indigo-700 underline" onClick={() => { endSession(); nav('/') }}>End session</button>
      </div>
      <div className="mt-2 flex gap-1.5">
        {blocks.map((b, i) => (
          <div key={i} className="flex-1">
            <div className={`h-1.5 rounded-full ${i < s.step ? 'bg-indigo-600' : i === s.step ? 'bg-indigo-400' : 'bg-indigo-100'}`} />
            <div className={`mt-1 text-[11px] ${i === s.step ? 'font-semibold text-indigo-900' : 'text-indigo-700/70'}`}>{BLOCK_LABEL[b.kind]} · {b.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
