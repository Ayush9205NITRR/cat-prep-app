import { Link } from 'react-router-dom'
import { BLOCK_LABEL, endSession, readSession } from '../session'
import { btnGhost, btnPrimary } from '../ui'

/** End of Today's Session: what was done, with links to each test result. */
export default function SessionDone() {
  const s = readSession()
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-gray-200/70 bg-white p-8 text-center shadow-sm">
      <div className="text-[34px]">🏁</div>
      <h1 className="mt-1 text-[18px] font-semibold">Session done</h1>
      {s && (
        <ul className="mt-4 space-y-1.5 text-left text-[13.5px] text-gray-700">
          {s.plan.blocks.map((b, i) => {
            const r = s.results[i]
            return (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <span>{r ? '✅' : '⏭️'} {BLOCK_LABEL[b.kind]}{b.topic ? ` · ${b.topic}` : ''} · {b.count}</span>
                {r?.mock_id && <Link className="text-indigo-700 underline" to={`/mocks/${r.mock_id}`}>See result</Link>}
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <Link to="/" className={btnPrimary} onClick={endSession}>Back to Today</Link>
        <Link to="/mocks" className={btnGhost} onClick={endSession}>Mocks &amp; Tests</Link>
      </div>
    </div>
  )
}
