import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type SolvingQuestion } from '../api'
import { Back, btnGhost, btnPrimary, Card, Empty, ErrorNote, fmtSeconds, Loading, optionLabel } from '../ui'

/** A test: solve in one stretch — no right/wrong, no taps, no hints. Review after submitting. */
export default function TestPage() {
  const [p] = useSearchParams()
  const nav = useNavigate()
  const retest = p.get('retest') === '1'
  const scope = { section: p.get('section') ?? undefined, area: p.get('area') ?? undefined, topic: p.get('topic') ?? undefined }
  const scopeLabel = scope.topic ?? scope.area ?? scope.section ?? 'All topics'
  const [qs, setQs] = useState<SolvingQuestion[] | null>(null)
  const [error, setError] = useState('')
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<(number | null)[]>([])
  const [spent, setSpent] = useState<number[]>([]) // seconds per question
  const [busy, setBusy] = useState(false)
  const shownAt = useRef(Date.now())
  const [, tick] = useState(0)

  useEffect(() => {
    const load = retest ? api.retestQuestions(scope.topic) : api.testQuestions(scope, Number(p.get('count')) || 10)
    load.then((r) => { setQs(r.questions); setChosen(r.questions.map(() => null)); setSpent(r.questions.map(() => 0)); shownAt.current = Date.now() }, (e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t) }, [])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (qs?.length && !busy) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [qs, busy])

  const header = <Back to={scope.topic ? `/topic/${encodeURIComponent(scope.topic)}` : scope.section ? `/section/${scope.section}` : '/mocks'}>Back</Back>
  if (error) return <div className="mx-auto max-w-3xl space-y-4">{header}<ErrorNote>{error}</ErrorNote></div>
  if (!qs) return <Loading />
  if (!qs.length)
    return <div className="mx-auto max-w-3xl space-y-4">{header}<Empty icon={retest ? '🎉' : '📭'} title={retest ? 'No open mistakes to retest' : 'No saved questions here yet'}>{retest ? 'Everything here is fixed.' : 'Send Claude a question or an assignment and say “Save these for practice”.'}</Empty></div>

  const live = (Date.now() - shownAt.current) / 1000
  const secsOn = (k: number) => Math.floor(spent[k] + (k === i ? live : 0))
  const total = spent.reduce((a, b) => a + b, 0) + live
  function go(k: number) {
    setSpent((s) => s.map((v, j) => (j === i ? v + (Date.now() - shownAt.current) / 1000 : v)))
    shownAt.current = Date.now(); setI(k)
  }
  async function submit() {
    const skipped = chosen.filter((c) => c === null).length
    if (skipped && !confirm(`${skipped} question${skipped > 1 ? 's are' : ' is'} not answered and will count as skipped. Submit anyway?`)) return
    setBusy(true)
    const final = spent.map((v, j) => (j === i ? v + (Date.now() - shownAt.current) / 1000 : v))
    try {
      const r = await api.submitTest(retest ? 'retest' : 'test', retest ? `Mistakes${scope.topic ? ' · ' + scope.topic : ''}` : scopeLabel,
        qs!.map((q, j) => ({ question_id: q.question_id, chosen_index: chosen[j], seconds: Math.max(1, Math.round(final[j])) })))
      nav(`/mocks/${r.mock_id}`, { replace: true })
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const q = qs[i]
  const answered = chosen.filter((c) => c !== null).length
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold">{retest ? 'Retest' : 'Test'} · {retest ? `your mistakes${scope.topic ? ' in ' + scope.topic : ''}` : scopeLabel}</div>
        <div className="flex items-center gap-3 text-[12px] text-gray-500">
          <span>{answered}/{qs.length} answered</span>
          <span className="rounded-lg bg-gray-900 px-2.5 py-1 font-semibold tabular-nums text-white">Total {fmtSeconds(Math.floor(total))}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {qs.map((_, k) => (
          <button key={k} onClick={() => go(k)} aria-label={`Question ${k + 1}`}
            className={`h-8 w-8 rounded-lg text-[12px] font-semibold transition ${k === i ? 'bg-gray-900 text-white' : chosen[k] !== null ? 'bg-indigo-100 text-indigo-800' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-400'}`}>{k + 1}</button>
        ))}
      </div>

      <Card title={`Question ${i + 1} of ${qs.length} · ${q.topic}`}
        aside={<span className={`text-[13px] font-semibold tabular-nums ${secsOn(i) > q.ideal_seconds ? 'text-red-600' : 'text-gray-800'}`}>{fmtSeconds(secsOn(i))} <span className="text-[11px] font-normal text-gray-400">/ ideal {fmtSeconds(q.ideal_seconds)}</span></span>}>
        <p className="mb-4 whitespace-pre-wrap text-[14.5px] leading-relaxed text-gray-900">{q.text}</p>
        <div className="grid gap-2">
          {q.options.map((o, k) => (
            <button key={k} onClick={() => setChosen((c) => c.map((v, j) => (j === i ? (v === k ? null : k) : v)))}
              className={`rounded-xl border px-3.5 py-2.5 text-left text-[13.5px] transition ${chosen[i] === k ? 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}>
              {optionLabel(k)} {o}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-400">Tap your answer again to clear it. No feedback until you submit.</p>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex items-center justify-between gap-2">
        <button className={btnGhost} disabled={i === 0} onClick={() => go(i - 1)}>← Back</button>
        <div className="flex gap-2">
          {i < qs.length - 1 && <button className={btnGhost} onClick={() => go(i + 1)}>{chosen[i] === null ? 'Skip →' : 'Next →'}</button>}
          {i === qs.length - 1 ? <button className={btnPrimary} disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit test'}</button>
            : <button className="text-[12px] text-gray-500 underline" disabled={busy} onClick={submit}>Submit test</button>}
        </div>
      </div>
    </div>
  )
}
