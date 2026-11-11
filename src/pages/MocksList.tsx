import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type MockSummary } from '../api'
import { Card, ErrorNote, Loading } from '../ui'

export default function MocksList() {
  const [mocks, setMocks] = useState<MockSummary[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.mocks().then((r) => setMocks(r.mocks), (e) => setError(e.message))
  }, [])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!mocks) return <Loading />
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold tracking-tight">Your mocks</h1>
        <p className="text-[12px] text-gray-500">
          In Claude, upload a mock report and say “Analyse my mock”. It shows up here for you to check and edit.
        </p>
      </div>
      {mocks.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-[13px] text-gray-500">
            No mocks yet. <Link to="/connect" className="font-medium text-gray-900 underline">Connect Claude</Link>, then send it your first mock.
          </div>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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
