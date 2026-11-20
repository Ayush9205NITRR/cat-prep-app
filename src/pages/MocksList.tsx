import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { api, type MockSummary } from '../api'
import MockUpload from '../components/MockUpload'
import { Card, Empty, ErrorNote, Loading, PageHeader } from '../ui'
import AbcTrend from '../components/AbcTrend'
import { PercentileBand, TargetPicker, useTarget } from '../components/Percentile'

export default function MocksList() {
  const [mocks, setMocks] = useState<MockSummary[] | null>(null)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  const tab = params.get('section') ?? 'All'
  const [target, setTarget] = useTarget()
  useEffect(() => {
    api.mocks().then((r) => setMocks(r.mocks), (e) => setError(e.message))
  }, [])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!mocks) return <Loading />
  return (
    <div className="space-y-6">
      <PageHeader title="Mocks & Tests" sub="Mocks you upload to Claude (“Analyse my mock”) and tests you take in the app. Open one for the score, buckets and review." />
      <MockUpload />
      {(() => {
        const real = mocks.filter((m) => m.source === 'mock' && m.section)
        if (!real.length) return null
        const last = real[0] // newest first
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] text-gray-500">Latest mock: <b className="text-gray-800">{last.name}</b></span>
                <TargetPicker target={target} onSave={setTarget} />
              </div>
              <PercentileBand score={last.score} reachable={last.reachable_score} max={last.max_score} section={last.section} target={target} />
            </div>
            <Card title="A / B / C mistakes across mocks" aside="Watch C (careless) shrink"><AbcTrend mocks={mocks} /></Card>
          </div>
        )
      })()}
      <div className="flex w-fit gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {['All', 'Full', 'Quant', 'VARC', 'DILR'].map((t) => (
          <button key={t} onClick={() => setParams(t === 'All' ? {} : { section: t })} className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t}</button>
        ))}
      </div>
      {mocks.length === 0 ? (
        <Empty icon="📊" title="No mocks yet"><Link to="/connect" className="font-medium text-indigo-700 underline">Connect Claude</Link>, then send it your first mock report.</Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]">
          {mocks.filter((m) => tab === 'All' || m.section === tab).length === 0 && <div className="px-5 py-8 text-center text-[13px] text-gray-500">No {tab} mocks or tests yet.</div>}
          {mocks.filter((m) => tab === 'All' || m.section === tab).map((m) => (
            <Link key={m.id} to={`/mocks/${m.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 last:border-0 hover:bg-gray-50">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${m.source === 'mock' ? 'bg-indigo-50 text-indigo-700' : m.source === 'retest' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700'}`}>{m.source === 'mock' ? 'Mock' : m.source === 'retest' ? 'Retest' : 'Test'}</span>
                  {m.section && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-medium text-gray-600">{m.section}</span>}
                  <span className="text-[14px] font-medium text-gray-900">{m.name}</span>
                </div>
                <div className="text-[12px] text-gray-500">
                  {m.taken_on}{m.source === 'mock' && m.section ? <> · <PercentileBand compact score={m.score} reachable={m.reachable_score} max={m.max_score} section={m.section} /></> : null} · {m.questions} question{m.questions === 1 ? '' : 's'}{m.has_time_data ? '' : ' · no time data'}
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
