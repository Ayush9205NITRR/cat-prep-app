import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DIFFICULTIES } from '../../shared/practice'
import { AREAS, SCHEMA } from '../../shared/topics'
import { api, type PracticeQuestion } from '../api'
import { Back, btnGhost, btnPrimary, Card, ErrorNote, inputCls, Loading, optionLabel } from '../ui'

const area = `${inputCls} w-full`
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

/** Edit every field of a saved practice question. */
export default function QuestionEdit() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const [q, setQ] = useState<PracticeQuestion | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [edit, setEdit] = useState(false)
  const [orig, setOrig] = useState<PracticeQuestion | null>(null) // for Cancel
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(''), 2000); return () => clearTimeout(t) } }, [saved])
  useEffect(() => { api.practiceQuestion(id).then((r) => setQ(r.question), (e) => setError(e.message)) }, [id])
  if (!q) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />

  const set = (p: Partial<PracticeQuestion>) => setQ({ ...q, ...p })
  async function save() {
    setError(''); setSaved('')
    const keys = ['topic', 'difficulty', 'text', 'options', 'correct_index', 'ideal_seconds', 'type_options', 'type_answer',
      'approach_options', 'approach_answer', 'solution_notes', 'hints'] as const
    const cur = q!
    const patch = Object.fromEntries(keys.map((k) => [k, cur[k]])) as Partial<PracticeQuestion>
    try { setQ((await api.updatePracticeQuestion(id, patch)).question); setSaved('✓ Saved'); setEdit(false) } catch (e) { setError((e as Error).message) }
  }
  async function remove() {
    if (!confirm('Delete this question and its attempts?')) return
    await api.deletePracticeQuestion(id); nav(`/topic/${encodeURIComponent(q!.topic)}`)
  }
  const field = (label: string, el: React.ReactNode) => <label className="block"><span className="mb-1 block text-[12px] font-medium text-gray-700">{label}</span>{el}</label>
  const choiceList = (label: string, opts: string[], ans: number, onOpts: (o: string[]) => void, onAns: (n: number) => void, fixed3 = false) => (
    <div>
      <span className="mb-1 block text-[12px] font-medium text-gray-700">{label} <span className="font-normal text-gray-400">(select the right one)</span></span>
      <div className="space-y-1.5">
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" checked={ans === i} onChange={() => onAns(i)} aria-label={`${label} ${i + 1} is right`} />
            <span className="w-6 text-[12px] text-gray-400">{optionLabel(i)}</span>
            <input className={`${inputCls} flex-1`} value={o} onChange={(e) => onOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
            {!fixed3 && opts.length > 2 && <button className="text-[12px] text-gray-400 hover:text-red-600" onClick={() => { onOpts(opts.filter((_, j) => j !== i)); if (ans >= i && ans > 0) onAns(ans - 1) }}>✕</button>}
          </div>
        ))}
        {!fixed3 && opts.length < 10 && <button className="text-[12px] text-gray-500 underline" onClick={() => onOpts([...opts, ''])}>Add option</button>}
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Back to={`/topic/${encodeURIComponent(q.topic)}`}>{q.topic}</Back>
        {q.source && <span className="text-[11px] text-gray-400">From: {q.source}</span>}
      </div>
      {!edit ? (
        <Card title={`${q.topic} · ${q.difficulty} · ideal ${q.ideal_seconds}s`} aside={<span className="flex items-center gap-3">{saved && <span className="font-medium text-emerald-700">{saved}</span>}<button className="text-[12.5px] font-medium text-indigo-700 hover:underline" onClick={() => { setOrig(q); setEdit(true) }}>Edit</button></span>}>
          <p className="whitespace-pre-wrap text-[14px] text-gray-900">{q.text}</p>
          <ul className="mt-3 space-y-1 text-[13px]">{q.options.map((o, i) => <li key={i} className={i === q.correct_index ? 'font-medium text-emerald-700' : 'text-gray-600'}>{optionLabel(i)} {o}{i === q.correct_index && ' — correct'}</li>)}</ul>
          <div className="mt-3 grid gap-2 text-[12.5px] text-gray-600 sm:grid-cols-2">
            <div><b className="text-gray-800">Type:</b> {q.type_options[q.type_answer]}</div>
            <div><b className="text-gray-800">Fastest approach:</b> {q.approach_options[q.approach_answer]}</div>
          </div>
          {q.solution_notes && <div className="mt-3 rounded-lg bg-gray-50 p-3 text-[13px] whitespace-pre-wrap">{q.solution_notes}</div>}
          {q.hints.length > 0 && <div className="mt-2 text-[12px] text-gray-500">{q.hints.length} hint{q.hints.length > 1 ? 's' : ''}</div>}
        </Card>
      ) : (
      <Card title="Edit question">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {field('Topic', <select className={area} value={q.topic} onChange={(e) => set({ topic: e.target.value })}>
              {AREAS.map((a) => <optgroup key={a} label={a}>{SCHEMA[a].map((t) => <option key={t}>{t}</option>)}</optgroup>)}
            </select>)}
            {field('Difficulty', <select className={area} value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value as any })}>{DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}</select>)}
            {field('Ideal seconds', <input className={area} inputMode="numeric" value={q.ideal_seconds} onChange={(e) => set({ ideal_seconds: Number(e.target.value.replace(/\D/g, '')) || 1 })} />)}
          </div>
          {field('Question', <textarea className={area} rows={4} value={q.text} onChange={(e) => set({ text: e.target.value })} />)}
          {choiceList('Answer options', q.options, q.correct_index, (options) => set({ options }), (correct_index) => set({ correct_index }))}
          {choiceList('Tap 1: which type of question?', q.type_options, q.type_answer, (type_options) => set({ type_options }), (type_answer) => set({ type_answer }), true)}
          {choiceList('Tap 2: fastest approach?', q.approach_options, q.approach_answer, (approach_options) => set({ approach_options }), (approach_answer) => set({ approach_answer }), true)}
          {field('Solution notes', <textarea className={area} rows={3} value={q.solution_notes} onChange={(e) => set({ solution_notes: e.target.value })} />)}
          {field('Hints (one per line, gentle first; shown one at a time after answering)', <textarea className={area} rows={3} value={q.hints.join('\n')} onChange={(e) => set({ hints: lines(e.target.value) })} />)}
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex items-center justify-between">
            <button className="text-[12px] text-red-600 hover:underline" onClick={remove}>Delete question</button>
            <div className="flex items-center gap-2">
              {saved && <span className="text-[12px] text-emerald-700">{saved}</span>}
              <button className={btnGhost} onClick={() => nav(`/topic/${encodeURIComponent(q.topic)}`)}>Open topic</button>
              <button className={btnGhost} onClick={() => { if (orig) setQ(orig); setEdit(false) }}>Cancel</button>
              <button className={btnPrimary} onClick={save}>Save</button>
            </div>
          </div>
        </div>
      </Card>
      )}
    </div>
  )
}
