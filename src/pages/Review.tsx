import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ABC_LABEL, abcOf, bucketOf, needsReview, statusOf } from '../../shared/analysis'
import { Back, btnGhost, btnPrimary, Card, ErrorNote, fmtSeconds, Loading, optionLabel } from '../ui'
import { useMock } from '../useMock'

function Choices({ options, picked, answer, onPick }: { options: string[]; picked: number | null; answer: number; onPick?: (i: number) => void }) {
  return (
    <div className="grid gap-2">
      {options.map((o, i) => {
        const done = picked !== null
        const tone = !done
          ? 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
          : i === answer
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
            : i === picked
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-gray-100 text-gray-400'
        return (
          <button key={i} disabled={done} onClick={() => onPick?.(i)} className={`rounded-lg border px-3 py-2 text-left text-[13px] transition-colors ${tone}`}>
            {o}
            {done && i === answer && <span className="ml-2 text-[11px] font-semibold">✓ right</span>}
            {done && i === picked && i !== answer && <span className="ml-2 text-[11px] font-semibold">your tap</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function Review() {
  const id = Number(useParams().id)
  const { data, error, patchRow } = useMock(id)
  const queue = useMemo(() => (data ? data.rows.filter((r) => needsReview(r, data.mock.has_time_data)) : []), [data])
  const [pos, setPos] = useState<number | null>(null)
  const rowParam = Number(useSearchParams()[0].get('row')) || null

  // Start at the first question still waiting for taps.
  useEffect(() => {
    if (pos === null && data) {
      const asked = rowParam ? queue.findIndex((r) => r.id === rowParam) : -1
      const first = queue.findIndex((r) => abcOf(r, data.mock.has_time_data) === 'pending')
      setPos(Math.max(0, asked >= 0 ? asked : first))
    }
  }, [data, queue, pos, rowParam])

  if (!data || pos === null) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />
  const t = data.mock.has_time_data

  if (queue.length === 0)
    return (
      <div className="space-y-4">
        <Back to={`/mocks/${id}`}>{data.mock.name}</Back>
        <Card><p className="py-6 text-center text-[13px] text-gray-500">No wrong or over-time questions in this mock. Nothing to review.</p></Card>
      </div>
    )

  const r = queue[Math.min(pos, queue.length - 1)]
  const bucket = bucketOf(r, t)
  const abc = abcOf(r, t)
  const typeWrong = r.type_tap !== null && r.type_tap !== r.type_answer
  const showTap2 = r.type_tap !== null && !typeWrong
  const finished = abc !== 'pending'
  const left = queue.filter((q) => abcOf(q, t) === 'pending').length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Back to={`/mocks/${id}`}>{data.mock.name}</Back>
        <span className="text-[12px] text-gray-500">{pos + 1} of {queue.length} · {left} left to review</span>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card
        title={`Q${r.q_no} · ${r.topic}`}
        aside={bucket === 'incorrect' ? 'Incorrect' : `Over time: ${fmtSeconds(r.seconds)} vs ideal ${fmtSeconds(r.ideal_seconds)}`}
      >
        <p className="mb-3 whitespace-pre-wrap text-[14px] text-gray-900">{r.text}</p>
        <ul className="mb-1 space-y-1 text-[13px]">
          {r.options.map((o, i) => (
            <li key={i} className={i === r.correct_index ? 'font-medium text-emerald-700' : i === r.chosen_index ? 'text-red-600' : 'text-gray-600'}>
              {optionLabel(i)} {o}
              {i === r.correct_index && ' — correct'}
              {i === r.chosen_index && statusOf(r) === 'incorrect' && ' — your answer'}
            </li>
          ))}
        </ul>
      </Card>

      {r.type_options.length !== 3 || r.approach_options.length !== 3 ? (
        <Card><p className="text-[13px] text-gray-700">The two tap questions for this one aren’t written yet. In Claude, say: <i>“Review my last mock”</i> — Claude adds them for wrong and slow questions only, then asks you the taps.</p></Card>
      ) : <>
      <Card title="Tap 1 · Which type of question is this?">
        <Choices options={r.type_options} picked={r.type_tap} answer={r.type_answer} onPick={(i) => patchRow(r.id, { type_tap: i })} />
      </Card>

      {showTap2 && (
        <Card title="Tap 2 · Which is the fastest approach?">
          <Choices options={r.approach_options} picked={r.approach_tap} answer={r.approach_answer} onPick={(i) => patchRow(r.id, { approach_tap: i })} />
        </Card>
      )}

      </>}

      {finished && r.type_options.length === 3 && (
        <Card>
          <div className="mb-3 flex items-center gap-3">
            {abc ? (
              <>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-[18px] font-bold text-white">{abc}</span>
                <div>
                  <div className="text-[14px] font-semibold">{ABC_LABEL[abc]}</div>
                  <div className="text-[12px] text-gray-500">
                    {abc === 'A' && 'You did not recognise the question type.'}
                    {abc === 'B' && 'You knew the type but not the fastest approach.'}
                    {abc === 'C' && 'You knew the type and the approach, so this was a mistake.'}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-[13px] text-gray-700">You knew the type and the fastest approach. This one was right, just slow — practise it against the clock.</div>
            )}
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-[13px] text-gray-800">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Solution notes</div>
            <p className="whitespace-pre-wrap">{r.solution_notes || 'No notes.'}</p>
          </div>
          <button className="mt-3 text-[12px] text-gray-500 underline hover:text-gray-900" onClick={() => patchRow(r.id, { type_tap: null, approach_tap: null })}>
            Redo the taps
          </button>
        </Card>
      )}

      <div className="flex justify-between">
        <button className={btnGhost} disabled={pos === 0} onClick={() => setPos(pos - 1)}>← Previous</button>
        {pos < queue.length - 1 ? (
          <button className={btnPrimary} onClick={() => setPos(pos + 1)}>Next →</button>
        ) : (
          <Link className={btnPrimary} to={`/mocks/${id}`}>Back to the analysis</Link>
        )}
      </div>
    </div>
  )
}
