import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Link, useParams } from 'react-router-dom'
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
  const report = useMemo(() => data && analyse(data.rows, data.mock.has_time_data), [data])

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

      <Card title="Questions" aside="Every cell is editable and saves when you leave it. The numbers below update straight away.">
        <EditableTable rows={rows} hasTimeData={mock.has_time_data} onPatch={patchRow} />
      </Card>

      <ReportPanel report={report} mockId={id} />
    </div>
  )
}
