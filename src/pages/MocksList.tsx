import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type MockSummary } from '../api'
import { Empty, ErrorNote, Loading, PageHeader } from '../ui'

export default function MocksList() {
  const [mocks, setMocks] = useState<MockSummary[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.mocks().then((r) => setMocks(r.mocks), (e) => setError(e.message))
  }, [])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!mocks) return <Loading />
  return (
    <div className="space-y-6">
      <PageHeader title="Mocks" sub="In Claude, upload a mock report and say “Analyse my mock”. It shows up here for you to check and edit." />
      {mocks.length === 0 ? (
        <Empty icon="📊" title="No mocks yet"><Link to="/connect" className="font-medium text-indigo-700 underline">Connect Claude</Link>, then send it your first mock report.</Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]">
          {mocks.map((m) => (
            <Link key={m.id} to={`/mocks/${m.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 last:border-0 hover:bg-gray-50">
              <div>
                <div className="text-[14px] font-medium text-gray-900">{m.name}</div>
                <div className="text-[12px] text-gray-500">
                  {m.taken_on} · {m.questions} questions{m.has_time_data ? '' : ' · no time data'}
                </div>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-[11px] text-gray-400">Score</div>
                  <div className="text-[16px] font-semibold tabular-nums">{m.score}<span className="text-[11px] font-normal text-gray-400"> / {m.max_score}</span></div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-400">Reachable</div>
                  <div className="text-[16px] font-semibold tabular-nums text-emerald-700">{m.reachable_score}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
