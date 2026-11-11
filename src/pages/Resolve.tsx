import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { bucketOf, statusOf, type QuestionRow } from '../../shared/analysis'
import { Back, btnGhost, btnPrimary, Card, ErrorNote, fmtSeconds, Loading, optionLabel } from '../ui'
import { useMock } from '../useMock'

type Row = QuestionRow & { id: number }

function resultText(r: Row) {
  if (r.resolve_index === null) return { text: 'Not tried', tone: 'text-gray-400' }
  if (r.resolve_index !== r.correct_index) return { text: 'Wrong', tone: 'text-red-600' }
  if (r.resolve_seconds! > r.ideal_seconds) return { text: `Right but slow (${fmtSeconds(r.resolve_seconds)})`, tone: 'text-amber-700' }
  return { text: `Solved in ${fmtSeconds(r.resolve_seconds)}`, tone: 'text-emerald-700' }
}

/** Timed solve: question and options only, no hints. */
function Solver({ row, onDone, onCancel }: { row: Row; onDone: (index: number, seconds: number) => void; onCancel: () => void }) {
  const start = useRef(Date.now())
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const secs = Math.floor((now - start.current) / 1000)
  const over = secs > row.ideal_seconds
  return (
    <Card
      title={`Q${row.q_no} · ${row.topic}`}
      aside={<span className={`text-[14px] font-semibold tabular-nums ${over ? 'text-red-600' : 'text-gray-900'}`}>{fmtSeconds(secs)} <span className="text-[11px] font-normal text-gray-400">/ ideal {fmtSeconds(row.ideal_seconds)}</span></span>}
    >
      <p className="mb-4 whitespace-pre-wrap text-[14px] text-gray-900">{row.text}</p>
      <div className="grid gap-2">
        {row.options.map((o, i) => (
          <button key={i} onClick={() => onDone(i, Math.max(1, Math.round((Date.now() - start.current) / 1000)))} className="rounded-lg border border-gray-200 px-3 py-2 text-left text-[13px] hover:border-gray-400 hover:bg-gray-50">
            {optionLabel(i)} {o}
          </button>
        ))}
      </div>
      <button className="mt-4 text-[12px] text-gray-500 underline" onClick={onCancel}>Stop without answering</button>
    </Card>
  )
}

export default function Resolve() {
  const id = Number(useParams().id)
  const { data, error, patchRow } = useMock(id)
  const [solving, setSolving] = useState<number | null>(null)
  const [justDone, setJustDone] = useState<number | null>(null)

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />
  const skipped = data.rows.filter((r) => statusOf(r) === 'skipped')
  const active = skipped.find((r) => r.id === solving)
  const done = skipped.find((r) => r.id === justDone)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Back to={`/mocks/${id}`}>{data.mock.name}</Back>
      <div>
        <h1 className="text-[18px] font-semibold tracking-tight">Re-solve skipped questions</h1>
        <p className="text-[12px] text-gray-500">
          Timer on, no hints. Right within the ideal time → <b>Could have solved</b>. Otherwise → <b>Not solved</b>.
        </p>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}

      {active ? (
        <Solver
          key={active.id}
          row={active}
          onCancel={() => setSolving(null)}
          onDone={async (index, seconds) => {
            setSolving(null)
            if (await patchRow(active.id, { resolve_index: index, resolve_seconds: seconds })) setJustDone(active.id)
          }}
        />
      ) : done ? (
        <Card title={`Q${done.q_no} · ${done.topic}`}>
          <div className={`mb-2 text-[16px] font-semibold ${resultText(done).tone}`}>{resultText(done).text}</div>
          <div className="mb-3 text-[12px] text-gray-500">
            Counts as <b>{bucketOf(done, data.mock.has_time_data) === 'could_have_solved' ? 'Could have solved' : 'Not solved'}</b>.
            Correct answer: {optionLabel(done.correct_index)} {done.options[done.correct_index]}
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-[13px] text-gray-800">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Solution notes</div>
            <p className="whitespace-pre-wrap">{done.solution_notes || 'No notes.'}</p>
          </div>
          <button className={`${btnPrimary} mt-3`} onClick={() => setJustDone(null)}>Back to the list</button>
        </Card>
      ) : skipped.length === 0 ? (
        <Card><p className="py-6 text-center text-[13px] text-gray-500">You did not skip any question in this mock.</p></Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {skipped.map((r) => {
            const res = resultText(r)
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3 last:border-0">
                <div>
                  <div className="text-[13px] font-medium">Q{r.q_no} · {r.topic}</div>
                  <div className={`text-[12px] ${res.tone}`}>{res.text}</div>
                </div>
                <button className={r.resolve_index === null ? btnPrimary : btnGhost} onClick={() => { setJustDone(null); setSolving(r.id) }}>
                  {r.resolve_index === null ? 'Start timer' : 'Try again'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
