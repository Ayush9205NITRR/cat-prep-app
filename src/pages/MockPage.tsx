import { useEffect, useMemo, useState } from 'react'
import { sectionBreakdown } from '../../shared/sections-report'
import { sectionOf } from '../../shared/topics'
import { api } from '../api'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { analyse } from '../../shared/analysis'
import EditableTable from '../components/EditableTable'
import ReportPanel from '../components/ReportPanel'
import { Back, btnGhost, Card, ErrorNote, inputCls, Loading } from '../ui'
import { useMock } from '../useMock'

function MetaInput({ value, onSave, type = 'text', className = '' }: { value: string; onSave: (v: string) => void; type?: string; className?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      type={type}
      className={`${inputCls} ${className}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() && v !== value ? onSave(v.trim()) : setV(value))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** "3 retested · 2 fixed · 1 still open" */
function RetestOutcome({ id }: { id: number }) {
  const [o, setO] = useState<{ retested: number; fixed: number; still_open: number } | null>(null)
  useEffect(() => { api.retestOutcome(id).then(setO, () => {}) }, [id])
  if (!o) return null
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900">
      <b>{o.retested} retested</b> · <b>{o.fixed} fixed</b> · <b>{o.still_open} still open</b>
      <span className="ml-2 text-[12px] text-emerald-700">Fixed = right within the ideal time.</span>
    </div>
  )
}

export default function MockPage() {
  const id = Number(useParams().id)
  const { data, error, saving, patchRow, patchMock } = useMock(id)
  const nav = useNavigate()
  const report = useMemo(() => data && analyse(data.rows, data.mock.has_time_data), [data])
  const breakdown = useMemo(() => (data ? sectionBreakdown(data.rows, data.mock.has_time_data) : []), [data])
  const [tableOpen, setTableOpen] = useState(false)
  const [only, setOnly] = useState<string>('All') // section filter for the questions table

  if (!data || !report) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />
  const { mock, rows } = data

  return (
    <div className="space-y-4">
      <Back to="/mocks">Mocks &amp; Tests</Back>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MetaInput value={mock.name} onSave={(name) => patchMock({ name })} className="w-72 text-[15px] font-semibold" />
          <MetaInput type="date" value={mock.taken_on} onSave={(taken_on) => patchMock({ taken_on })} />
          <select aria-label="Section" className={inputCls} value={mock.section ?? ''} onChange={(e) => patchMock({ section: e.target.value })}>
            {['Quant', 'VARC', 'DILR'].map((x) => <option key={x}>{x}</option>)}
            <option value="Full">Full-length (all 3)</option>
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
            <input type="checkbox" checked={mock.has_time_data} onChange={(e) => patchMock({ has_time_data: e.target.checked })} />
            Report has time per question
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">{saving ? 'Saving…' : 'All changes saved'}</span>
          <Link to={`/mocks/${id}/review`} className={btnGhost}>Review wrong answers</Link>
          <Link to={`/mocks/${id}/resolve`} className={btnGhost}>Re-solve skipped</Link>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {mock.source === 'retest' && <RetestOutcome id={id} />}

      {/* Results first; the editable table is below. */}
      {breakdown.length > 1 && (
        <Card title={mock.section === 'Full' ? 'Full-length mock · by section' : 'By section'} aside={`Total ${report.score} / ${report.max_score} · reachable ${report.reachable_score}`}>
          <div className="grid gap-3 sm:grid-cols-3">
            {breakdown.map((b) => (
              <button key={b.section} onClick={() => { setOnly(b.section); setTableOpen(true) }} className="rounded-xl border border-gray-100 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40" title={`Show ${b.section} questions`}>
                <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold text-gray-900">{b.section}</span><span className="text-[11px] text-gray-400">{b.questions} Q</span></div>
                <div className="mt-1 text-[24px] font-semibold tabular-nums">{b.score}<span className="text-[12px] font-normal text-gray-400"> / {b.max}</span></div>
                <div className="text-[11.5px] text-gray-500">reachable <b className="text-emerald-700">{b.reachable}</b> · {b.right} right · {b.wrong} wrong · {b.skipped} skipped</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <ReportPanel report={report} mockId={id} />

      <div className="rounded-2xl border border-gray-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]">
        <button className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-4 text-left" onClick={() => setTableOpen(!tableOpen)} aria-expanded={tableOpen}>
          <span className="text-[13.5px] font-semibold text-gray-900">{tableOpen ? '▾' : '▸'} Questions · {rows.length} <span className="font-normal text-gray-400">— check and edit what Claude read</span></span>
          <span className="text-[11px] text-gray-400">Every cell saves when you leave it; the numbers above update straight away.</span>
        </button>
        {tableOpen && (
          <div className="px-5 pb-5">
            {breakdown.length > 1 && (
              <div className="mb-3 flex w-fit gap-1 rounded-xl border border-gray-200 bg-white p-1">
                {['All', ...breakdown.map((b) => b.section)].map((t) => (
                  <button key={t} onClick={() => setOnly(t)} className={`rounded-lg px-3 py-1 text-[12px] font-medium ${only === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t}</button>
                ))}
              </div>
            )}
            <EditableTable rows={only === 'All' ? rows : rows.filter((r) => sectionOf(r.topic) === only)} hasTimeData={mock.has_time_data} onPatch={patchRow}
              section={mock.section} showSection={breakdown.length > 1} />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button className="text-[12.5px] text-red-600 hover:underline" onClick={async () => {
          if (!confirm(`Delete “${mock.name}” and all its ${rows.length} questions? This cannot be undone. Fix notes stay on their topics.`)) return
          await api.deleteMock(id); nav('/mocks', { replace: true })
        }}>Delete this {mock.source === 'mock' ? 'mock' : 'test'}</button>
      </div>
    </div>
  )
}
