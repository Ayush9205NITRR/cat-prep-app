import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ABC_LABEL } from '../../shared/analysis'
import { api, type Attempt, type PracticeQuestion, type SolvingQuestion } from '../api'
import TapChoices from '../components/TapChoices'
import { Back, btnPrimary, Card, ErrorNote, fmtSeconds, Loading, optionLabel } from '../ui'

/** Timer on, no hints while solving. After a wrong answer: two taps → A/B/C. Hints only in review, one at a time. */
export default function PracticeSession() {
  const [params] = useSearchParams()
  const topic = params.get('topic') ?? ''
  const difficulty = params.get('difficulty') ?? undefined
  const [q, setQ] = useState<SolvingQuestion | null | undefined>(undefined)
  const [result, setResult] = useState<{ attempt: Attempt; question: PracticeQuestion } | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [error, setError] = useState('')
  const [done, setDone] = useState(0)
  const start = useRef(Date.now())
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async (skip?: number) => {
    setResult(null); setHintsShown(0); setError(''); setQ(undefined)
    try {
      const r = await api.nextQuestion(topic, difficulty, skip)
      setQ(r.question); start.current = Date.now(); setNow(Date.now())
    } catch (e) { setError((e as Error).message) }
  }, [topic, difficulty])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!q || result) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [q, result])

  async function answer(i: number) {
    if (!q) return
    const seconds = Math.max(1, Math.round((Date.now() - start.current) / 1000))
    try { setResult(await api.submitAttempt(q.question_id, i, seconds)); setDone((n) => n + 1) } catch (e) { setError((e as Error).message) }
  }
  async function tap(type_tap: number | null, approach_tap: number | null) {
    if (!result) return
    try { const r = await api.setTaps(result.attempt.id, type_tap, approach_tap); setResult({ ...result, attempt: r.attempt }) } catch (e) { setError((e as Error).message) }
  }

  const header = (
    <div className="flex items-center justify-between">
      <Back to="/practice">Practice</Back>
      <span className="text-[12px] text-gray-500">{topic}{difficulty ? ` · ${difficulty}` : ''} · {done} answered</span>
    </div>
  )
  if (error) return <div className="mx-auto max-w-3xl space-y-4">{header}<ErrorNote>{error}</ErrorNote></div>
  if (q === undefined) return <Loading />
  if (q === null) return <div className="mx-auto max-w-3xl space-y-4">{header}<Card><p className="py-6 text-center text-[13px] text-gray-500">No questions saved for this topic{difficulty ? ` at ${difficulty}` : ''} yet.</p></Card></div>

  const secs = Math.floor((now - start.current) / 1000)
  if (!result)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <Card
          title={`${q.topic} · ${q.difficulty}`}
          aside={<span className={`text-[14px] font-semibold tabular-nums ${secs > q.ideal_seconds ? 'text-red-600' : 'text-gray-900'}`}>{fmtSeconds(secs)} <span className="text-[11px] font-normal text-gray-400">/ ideal {fmtSeconds(q.ideal_seconds)}</span></span>}
        >
          <p className="mb-4 whitespace-pre-wrap text-[14px] text-gray-900">{q.text}</p>
          <div className="grid gap-2">
            {q.options.map((o, i) => (
              <button key={i} onClick={() => answer(i)} className="rounded-lg border border-gray-200 px-3 py-2 text-left text-[13px] hover:border-gray-400 hover:bg-gray-50">{optionLabel(i)} {o}</button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-400">No hints while solving. They open in the review.</p>
        </Card>
      </div>
    )

  const { attempt: a, question: x } = result
  const typeWrong = a.type_tap !== null && a.type_tap !== x.type_answer
  const tapsDone = a.correct || a.error_class !== null
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {header}
      <Card title={a.correct ? '✓ Correct' : '✗ Wrong'} aside={`${fmtSeconds(a.seconds)} · ideal ${fmtSeconds(x.ideal_seconds)}`}>
        <p className="mb-3 whitespace-pre-wrap text-[14px] text-gray-900">{x.text}</p>
        <ul className="space-y-1 text-[13px]">
          {x.options.map((o, i) => (
            <li key={i} className={i === x.correct_index ? 'font-medium text-emerald-700' : i === a.chosen_index ? 'text-red-600' : 'text-gray-500'}>
              {optionLabel(i)} {o}{i === x.correct_index && ' — correct'}{i === a.chosen_index && !a.correct && ' — your answer'}
            </li>
          ))}
        </ul>
      </Card>

      {!a.correct && (
        <>
          <Card title="Tap 1 · Which type of question is this?">
            <TapChoices options={x.type_options} picked={a.type_tap} answer={a.type_tap !== null ? x.type_answer : undefined} onPick={(i) => tap(i, null)} />
          </Card>
          {a.type_tap !== null && !typeWrong && (
            <Card title="Tap 2 · Which is the fastest approach?">
              <TapChoices options={x.approach_options} picked={a.approach_tap} answer={a.approach_tap !== null ? x.approach_answer : undefined} onPick={(i) => tap(a.type_tap, i)} />
            </Card>
          )}
          {a.error_class && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-[18px] font-bold text-white">{a.error_class}</span>
              <div>
                <div className="text-[14px] font-semibold">{ABC_LABEL[a.error_class]}</div>
                {a.repeat
                  ? <div className="text-[12px] font-semibold text-red-600">Repeat: you made this same kind of error in {x.topic} in your last 10 attempts.</div>
                  : <div className="text-[12px] text-gray-500">Not a repeat in your last 10 attempts of {x.topic}.</div>}
              </div>
            </div>
          )}
        </>
      )}

      {tapsDone && (
        <Card title="Review">
          <div className="rounded-lg bg-gray-50 p-3 text-[13px] text-gray-800">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Solution</div>
            <p className="whitespace-pre-wrap">{x.solution_notes || 'No notes.'}</p>
          </div>
          {x.hints.length > 0 && (
            <div className="mt-3 space-y-2">
              {x.hints.slice(0, hintsShown).map((h, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"><b>Hint {i + 1}.</b> {h}</div>
              ))}
              {hintsShown < x.hints.length && (
                <button className="text-[12px] font-medium text-gray-600 underline" onClick={() => setHintsShown(hintsShown + 1)}>
                  Show hint {hintsShown + 1} of {x.hints.length}
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      {tapsDone && <div className="flex justify-end"><button className={btnPrimary} onClick={() => load(x.id)}>Next question →</button></div>}
    </div>
  )
}
