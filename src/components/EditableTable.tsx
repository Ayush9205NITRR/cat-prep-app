import { useEffect, useState } from 'react'
import { abcOf, BUCKET_LABEL, bucketOf, type QuestionRow } from '../../shared/analysis'
import { SCHEMA, AREAS } from '../../shared/topics'
import { optionLabel } from '../ui'

type Row = QuestionRow & { id: number }

const cellSelect =
  'w-full min-w-0 bg-white border border-gray-200 rounded-md px-1.5 py-1 text-[12px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-400'
const cellNumber = `${cellSelect} w-20 text-right tabular-nums`

const BUCKET_STYLE: Record<string, string> = {
  pocket: 'bg-emerald-50 text-emerald-700',
  over_time: 'bg-amber-50 text-amber-700',
  incorrect: 'bg-red-50 text-red-600',
  could_have_solved: 'bg-indigo-50 text-indigo-700',
  not_solved: 'bg-gray-100 text-gray-500',
}

/** Number cell: edits locally, saves on blur (or Enter). Empty = null where allowed. */
function NumberCell({ value, nullable, min, onSave, label }: { value: number | null; nullable?: boolean; min: number; onSave: (v: number | null) => void; label: string }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])
  function commit() {
    const t = text.trim()
    if (t === '' && nullable) return value !== null && onSave(null)
    const n = Number(t)
    if (!Number.isInteger(n) || n < min) return setText(value === null ? '' : String(value))
    if (n !== value) onSave(n)
  }
  return (
    <input
      aria-label={label}
      className={cellNumber}
      inputMode="numeric"
      value={text}
      placeholder={nullable ? '—' : ''}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** Select cell: saves when it loses focus with a changed value. */
function SelectCell({ value, onSave, children, label, className = '' }: { value: string; onSave: (v: string) => void; children: React.ReactNode; label: string; className?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <select
      aria-label={label}
      className={`${cellSelect} ${className}`}
      value={v}
      onChange={(e) => {
        setV(e.target.value)
        if (e.target.value !== value) onSave(e.target.value) // a pick is final, like a blur
      }}
    >
      {children}
    </select>
  )
}

export default function EditableTable({ rows, hasTimeData, onPatch }: { rows: Row[]; hasTimeData: boolean; onPatch: (id: number, p: Partial<QuestionRow>) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-[12px]">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] font-medium uppercase tracking-wide text-gray-400">
            <th className="px-2 py-2 w-10">Q</th>
            <th className="px-2 py-2">Question</th>
            <th className="px-2 py-2 w-52">Topic</th>
            <th className="px-2 py-2 w-40">Your answer</th>
            <th className="px-2 py-2 w-40">Correct answer</th>
            <th className="px-2 py-2 w-24 text-right">Seconds</th>
            <th className="px-2 py-2 w-24 text-right">Ideal s</th>
            <th className="px-2 py-2 w-40">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = bucketOf(r, hasTimeData)
            const abc = abcOf(r, hasTimeData)
            const opts = r.options.map((o, i) => (
              <option key={i} value={i}>{optionLabel(i)} {o}</option>
            ))
            return (
              <tr key={r.id} className="border-b border-gray-100 align-middle">
                <td className="px-2 py-1.5 font-medium tabular-nums text-gray-500">{r.q_no}</td>
                <td className="px-2 py-1.5 text-gray-700">
                  <div className="line-clamp-2 max-w-[22rem]" title={r.text}>{r.text}</div>
                </td>
                <td className="px-2 py-1.5">
                  <SelectCell label={`Q${r.q_no} topic`} value={r.topic} onSave={(v) => onPatch(r.id, { topic: v })}>
                    {AREAS.map((a) => (
                      <optgroup key={a} label={a}>
                        {SCHEMA[a].map((t) => <option key={t} value={t}>{t}</option>)}
                      </optgroup>
                    ))}
                  </SelectCell>
                </td>
                <td className="px-2 py-1.5">
                  <SelectCell
                    label={`Q${r.q_no} your answer`}
                    value={r.chosen_index === null ? '' : String(r.chosen_index)}
                    onSave={(v) => onPatch(r.id, { chosen_index: v === '' ? null : Number(v) })}
                  >
                    <option value="">Skipped</option>
                    {opts}
                  </SelectCell>
                </td>
                <td className="px-2 py-1.5">
                  <SelectCell label={`Q${r.q_no} correct answer`} value={String(r.correct_index)} onSave={(v) => onPatch(r.id, { correct_index: Number(v) })}>
                    {opts}
                  </SelectCell>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumberCell label={`Q${r.q_no} seconds`} value={r.seconds} nullable min={0} onSave={(v) => onPatch(r.id, { seconds: v })} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumberCell label={`Q${r.q_no} ideal seconds`} value={r.ideal_seconds} min={1} onSave={(v) => onPatch(r.id, { ideal_seconds: v! })} />
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${BUCKET_STYLE[b]}`}>{BUCKET_LABEL[b]}</span>
                  {abc && <span className="ml-1 text-[11px] font-semibold text-gray-600" title="Review class">{abc === 'pending' ? '· review' : `· ${abc}`}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
