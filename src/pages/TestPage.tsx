import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type SolvingQuestion } from '../api'
import ExamTools from '../components/ExamTools'
import SessionBar from '../components/SessionBar'
import { advanceSession } from '../session'

import { Back, btnGhost, btnPrimary, Card, Empty, ErrorNote, fmtSeconds, Loading, optionLabel } from '../ui'

const isTyping = (e: KeyboardEvent) => ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)

/** A test: solve in one stretch — no right/wrong, no taps, no hints. Review after submitting. */
export default function TestPage() {
  const [p] = useSearchParams()
  const nav = useNavigate()
  const retest = p.get('retest') === '1'
  const inSession = p.get('session') === '1'
  const limit = Number(p.get('limit')) || undefined
  const [marked, setMarked] = useState<boolean[]>([])
  const scope = { section: p.get('section') ?? undefined, area: p.get('area') ?? undefined, topic: p.get('topic') ?? undefined }
  const scopeLabel = scope.topic ?? scope.area ?? scope.section ?? 'All topics'
  const [qs, setQs] = useState<SolvingQuestion[] | null>(null)
  const [error, setError] = useState('')
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<(number | null)[]>([])
  const [spent, setSpent] = useState<number[]>([]) // seconds per question
  const [busy, setBusy] = useState(false)
  const shownAt = useRef(Date.now())
  const iRef = useRef(0)
  const goRef = useRef<(k: number) => void>(() => {})
  const [, tick] = useState(0)

  useEffect(() => {
    const load = retest ? api.retestQuestions(scope.topic, limit) : api.testQuestions(scope, Number(p.get('count')) || 10)
    load.then((r) => {
      // Never the same question twice in one test.
      const seen = new Set<number>(); r.questions = r.questions.filter((q) => !seen.has(q.question_id) && seen.add(q.question_id))
      setMarked(r.questions.map(() => false)); setQs(r.questions); setChosen(r.questions.map(() => null)); setSpent(r.questions.map(() => 0)); shownAt.current = Date.now() }, (e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t) }, [])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (qs?.length && !busy) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [qs, busy])

  // CAT-style keys: 1–4 or A–D choose · → / Enter next · ← back · M mark for review. Ignored while typing in the tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!qs?.length || busy || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const opt = /^[1-9]$/.test(k) ? Number(k) - 1 : /^[a-f]$/.test(k) ? k.charCodeAt(0) - 97 : -1
      const q = qs[iRef.current]
      if (opt >= 0 && opt < q.options.length && k !== 'm') { e.preventDefault(); setChosen((c) => c.map((v, j) => (j === iRef.current ? opt : v))) }
      else if (k === 'm') setMarked((m) => m.map((v, j) => (j === iRef.current ? !v : v)))
      else if ((e.key === 'ArrowRight' || e.key === 'Enter') && iRef.current < qs.length - 1) { e.preventDefault(); goRef.current(iRef.current + 1) }
      else if (e.key === 'ArrowLeft' && iRef.current > 0) { e.preventDefault(); goRef.current(iRef.current - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qs, busy])

  const header = inSession ? <SessionBar /> : <Back to={scope.topic ? `/topic/${encodeURIComponent(scope.topic)}` : scope.section ? `/section/${scope.section}` : '/mocks'}>Back</Back>
  if (error) return <div className="mx-auto max-w-3xl space-y-4">{header}<ErrorNote>{error}</ErrorNote></div>
  if (!qs) return <Loading />
  if (!qs.length)
    return <div className="mx-auto max-w-3xl space-y-4">{header}<Empty icon={retest ? '🎉' : '📭'} title={retest ? 'No open mistakes to retest' : 'No saved questions here yet'}>{retest ? 'Everything here is fixed.' : 'Send Claude a question or an assignment and say “Save these for practice”.'}</Empty></div>

  const live = (Date.now() - shownAt.current) / 1000
  const secsOn = (k: number) => Math.floor(spent[k] + (k === i ? live : 0))
  const total = spent.reduce((a, b) => a + b, 0) + live
  iRef.current = i
  goRef.current = go
  function go(k: number) {
    setSpent((s) => s.map((v, j) => (j === i ? v + (Date.now() - shownAt.current) / 1000 : v)))
    shownAt.current = Date.now(); setI(k)
  }
  async function submit() {
    const skipped = chosen.filter((c) => c === null).length
    const markedN = marked.filter(Boolean).length
    if (markedN && !skipped && !confirm(`${markedN} question${markedN > 1 ? 's are' : ' is'} marked for review. Submit anyway?`)) return
    if (skipped && !confirm(`${skipped} question${skipped > 1 ? 's are' : ' is'} not answered and will count as skipped. Submit anyway?`)) return
    setBusy(true)
    const final = spent.map((v, j) => (j === i ? v + (Date.now() - shownAt.current) / 1000 : v))
    try {
      const r = await api.submitTest(retest ? 'retest' : 'test', retest ? `Mistakes${scope.topic ? ' · ' + scope.topic : ''}` : scopeLabel,
        qs!.map((q, j) => ({ question_id: q.question_id, chosen_index: chosen[j], seconds: Math.max(1, Math.round(final[j])) })))
      nav(inSession ? advanceSession({ kind: retest ? 'retest' : 'drill', mock_id: r.mock_id }) : `/mocks/${r.mock_id}`, { replace: true })
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const q = qs[i]
  const answered = chosen.filter((c) => c !== null).length
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold">{retest ? 'Retest' : 'Test'} · {retest ? `your mistakes${scope.topic ? ' in ' + scope.topic : ''}` : scopeLabel}</div>
        <div className="flex items-center gap-3 text-[12px] text-gray-500">
          <span>{answered}/{qs.length} answered{marked.some(Boolean) ? ` · ${marked.filter(Boolean).length} marked` : ''}</span>
          <span className="rounded-lg bg-gray-900 px-2.5 py-1 font-semibold tabular-nums text-white">Total {fmtSeconds(Math.floor(total))}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {qs.map((_, k) => (
          <button key={k} onClick={() => go(k)} aria-label={`Question ${k + 1}`}
            className={`relative h-8 w-8 rounded-lg text-[12px] font-semibold transition ${k === i ? 'bg-gray-900 text-white' : marked[k] ? 'bg-violet-500 text-white' : chosen[k] !== null ? 'bg-emerald-100 text-emerald-800' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-400'}`}>
            {k + 1}{marked[k] && chosen[k] !== null && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
          </button>
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => setMarked((m) => m.map((v, j) => (j === i ? !v : v)))}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium ${marked[i] ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {marked[i] ? '★ Marked for review' : '☆ Mark for review'} <span className="text-[11px] opacity-60">M</span>
          </button>
          <ExamTools />
        </div>
        <p className="mt-2 text-[11px] text-gray-400">Keys: 1–4 or A–D choose · → / Enter next · ← back · M mark. Tap an answer again to clear it. No feedback until you submit.</p>
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
