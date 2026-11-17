import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { bucketOf, statusOf, type QuestionRow } from '../../shared/analysis'
import { Back, btnGhost, btnPrimary, Card, ErrorNote, fmtSeconds, Loading, optionLabel } from '../ui'
import { useMock } from '../useMock'
import ExamTools from '../components/ExamTools'

const isTyping = (e: KeyboardEvent) => ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)

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
  const [pick, setPick] = useState<number | null>(null)
  const submit = (i: number) => onDone(i, Math.max(1, Math.round((Date.now() - start.current) / 1000)))
  // 1–4 / A–D select · Enter or → confirms the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const opt = /^[1-9]$/.test(k) ? Number(k) - 1 : /^[a-f]$/.test(k) ? k.charCodeAt(0) - 97 : -1
      if (opt >= 0 && opt < row.options.length) { e.preventDefault(); setPick(opt) }
      else if ((e.key === 'Enter' || e.key === 'ArrowRight') && pick !== null) { e.preventDefault(); submit(pick) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
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
          <button key={i} onClick={() => submit(i)} className={`rounded-lg border px-3 py-2 text-left text-[13px] ${pick === i ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}>
            {optionLabel(i)} {o}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button className="text-[12px] text-gray-500 underline" onClick={onCancel}>Stop without answering</button>
        <ExamTools />
      </div>
      <p className="mt-2 text-[11px] text-gray-400">Tap an answer to submit, or keys 1–4 / A–D then Enter.</p>
    </Card>
  )
}

/** Starts the next question by itself after a short read of the solution; Enter or the button goes now. */
function AutoNext({ label, onGo }: { label: string; onGo: () => void }) {
  const [left, setLeft] = useState(8)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    if (left <= 0) { onGo(); return }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left, paused, onGo])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); onGo() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onGo])
  return (
    <>
      <button className={btnPrimary} onClick={onGo}>{label} →{!paused && <span className="ml-1 opacity-70">({left}s)</span>}</button>
      {!paused && <button className="text-[12px] text-gray-500 underline" onClick={() => setPaused(true)}>Pause</button>}
    </>
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
  // Continuous queue: the next untried skip after the one just done (then any untried one).
  const nextUp = (after?: number) => {
    const untried = skipped.filter((r) => r.resolve_index === null && r.id !== after)
    const at = skipped.findIndex((r) => r.id === after)
    return untried.find((r) => skipped.indexOf(r) > at) ?? untried[0]
  }
  const queued = done ? nextUp(done.id) : undefined
  const startNext = () => { if (queued) { setJustDone(null); setSolving(queued.id) } else setJustDone(null) }

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
      {!active && !done && nextUp() && <button className={btnPrimary} onClick={() => setSolving(nextUp()!.id)}>▶ Solve all untried in a row ({skipped.filter((r) => r.resolve_index === null).length})</button>}

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
          <div className="mt-3 flex flex-wrap gap-2">
            {queued ? <AutoNext key={done.id} label={`Next: Q${queued.q_no}`} onGo={startNext} /> : <button className={btnPrimary} onClick={() => setJustDone(null)}>All tried — back to the list</button>}
            {queued && <button className={btnGhost} onClick={() => setJustDone(null)}>Back to the list</button>}
          </div>
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
