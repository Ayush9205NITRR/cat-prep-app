import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ABC_LABEL } from '../../shared/analysis'
import { sectionAreaOf, sectionOf } from '../../shared/topics'
import { api, type MistakeItem, type TopicData } from '../api'
import NewNote from '../components/NewNote'
import StartTest from '../components/StartTest'
import { btnGhost, btnPrimary, Card, ErrorNote, fmtSeconds, Loading, optionLabel } from '../ui'
import { KIND, kindOf } from './Notes'

const STATUS: Record<MistakeItem['status'], string> = {
  Open: 'bg-red-50 text-red-700 ring-red-200',
  Repeated: 'bg-orange-50 text-orange-700 ring-orange-200',
  Fixed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

function MistakeRow({ m }: { m: MistakeItem }) {
  const [open, setOpen] = useState(false)
  const ans = (i: number | null) => (i === null ? 'Skipped' : `${optionLabel(i)} ${m.options[i] ?? ''}`)
  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <div className="flex flex-wrap items-start gap-3">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS[m.status]}`}>{m.status}</span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] text-gray-900">{m.text}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-gray-500">
            <span>You: <b className={m.over_time ? 'text-amber-700' : 'text-red-600'}>{ans(m.chosen_index)}</b>{m.over_time && ` (slow: ${fmtSeconds(m.seconds)} vs ${fmtSeconds(m.ideal_seconds)})`}</span>
            <span>Correct: <b className="text-emerald-700">{ans(m.correct_index)}</b></span>
            {m.times_wrong > 1 && <span className="text-orange-700">wrong {m.times_wrong}×</span>}
          </div>
        </div>
        <span className="shrink-0 text-right text-[11.5px]">
          {m.error === 'not reviewed' ? <Link className="text-amber-700 underline" to={`/mocks/${m.mock_id}/review?row=${m.row_id}`}>not reviewed</Link>
            : m.error ? <span className="font-semibold text-gray-800">{m.error} · {ABC_LABEL[m.error]}</span>
            : <span className="text-gray-400">slow, no letter</span>}
        </span>
      </div>
      <div className="mt-2 pl-[3.4rem] sm:pl-16">
        {m.fix ? (
          <button className="text-left text-[12px] text-indigo-700 hover:underline" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Fix note</button>
        ) : (
          <span className="text-[11.5px] text-gray-400">No fix note yet — ask Claude: “Analyse my last test”. · <Link className="underline" to={`/mocks/${m.mock_id}/review?row=${m.row_id}`}>Review in {m.mock_name}</Link></span>
        )}
        {open && m.fix && (
          <div className="mt-2 whitespace-pre-line rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-[12.5px] leading-relaxed text-gray-800">
            {m.fix.summary}
            <div className="mt-2"><Link className="text-[11.5px] text-indigo-700 underline" to={`/notes/${m.fix.note_id}`}>Open the note</Link> · <Link className="text-[11.5px] text-indigo-700 underline" to={`/mocks/${m.mock_id}/review?row=${m.row_id}`}>See the question</Link></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TopicPage() {
  const topic = decodeURIComponent(useParams().topic ?? '')
  const nav = useNavigate()
  const [d, setD] = useState<TopicData | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  useEffect(() => { setD(null); api.topic(topic).then(setD, (e) => setError(e.message)) }, [topic])
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!d) return <Loading />
  const section = sectionOf(topic)
  const open = d.mistakes.filter((m) => m.status !== 'Fixed').length
  const fixed = d.mistakes.length - open
  const lectureNotes = d.notes.filter((n) => n.kind !== 'fix')
  const fixNotes = d.notes.filter((n) => n.kind === 'fix')

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[12px] text-gray-500"><Link to={`/section/${section}`} className="hover:text-gray-900">{section}</Link> · {sectionAreaOf(topic)}</div>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-tight">{topic}</h1>
        <div className="mt-1 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 font-medium text-red-700">Open {open}</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">Fixed {fixed}</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-600">{d.notes.length} notes · {d.questions.length} questions</span>
        </div>
      </div>

      {/* 1. Mistakes */}
      <Card title={`Mistakes · ${d.mistakes.length}`} aside="Wrong or over-time answers from your mocks and tests. Open first.">
        {d.mistakes.length === 0
          ? <p className="text-[12.5px] text-gray-500">No mistakes in this topic yet. Take a test below, or upload a mock to Claude.</p>
          : d.mistakes.map((m) => <MistakeRow key={m.row_id} m={m} />)}
      </Card>

      {/* 2. Notes */}
      <Card title={`Notes · ${d.notes.length}`} aside={<button className="font-medium text-indigo-700 hover:underline" onClick={() => setAdding(true)}>+ New note</button>}>
        {d.notes.length === 0 ? <p className="text-[12.5px] text-gray-500">No notes yet. Add one, or send lecture notes to Claude: “Make notes and flashcards”.</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {[...fixNotes, ...lectureNotes].map((n) => {
              const k = n.kind === 'fix' ? { label: 'Fix', icon: '🛠️', cls: 'bg-orange-50 text-orange-700' } : KIND[kindOf(n) as keyof typeof KIND]
              return (
                <div key={n.id} className="rounded-xl border border-gray-100 p-3 hover:border-gray-200 hover:bg-gray-50/60">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${k.cls}`}>{k.icon} {k.label}</span>
                    {n.kind === 'fix' && n.fix_mock_id && <Link className="text-[11px] text-indigo-700 underline" to={`/mocks/${n.fix_mock_id}/review?row=${n.fix_row_id}`}>the question</Link>}
                  </div>
                  <Link to={`/notes/${n.id}`} className="line-clamp-2 text-[13px] font-medium text-gray-900 hover:text-indigo-700">{n.title}</Link>
                  {n.preview && n.kind !== 'link' && <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-[11.5px] text-gray-500">{n.preview}</div>}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* 3. Practice */}
      <Card title="Practice" aside="Solve in one go; review after.">
        <div className="flex flex-wrap items-center gap-2">
          <StartTest scope={{ topic }} />
          <button className={btnGhost} disabled={!d.retestable} onClick={() => nav(`/test?retest=1&topic=${encodeURIComponent(topic)}`)}>Retest my mistakes ({d.retestable})</button>
        </div>
        {d.questions.length === 0
          ? <p className="mt-3 text-[12px] text-gray-500">No saved questions yet. Send Claude a question or an assignment: “Save these for practice”.</p>
          : (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] text-gray-500">{d.questions.length} saved question{d.questions.length > 1 ? 's' : ''}</summary>
              <div className="mt-2 divide-y divide-gray-100">
                {d.questions.map((q) => (
                  <Link key={q.id} to={`/practice/questions/${q.id}`} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px] hover:bg-gray-50">
                    <span className="truncate text-gray-700">{q.text}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">{q.difficulty}{q.answered ? ` · ${q.answered}×` : ''}</span>
                  </Link>
                ))}
              </div>
            </details>
          )}
      </Card>

      {/* 4. Flashcards */}
      <Card title="Flashcards">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-gray-700">{d.flashcards_due ? <><b>{d.flashcards_due}</b> due now</> : 'Nothing due'}</span>
          <Link to={`/notes/review?topic=${encodeURIComponent(topic)}`} className={d.flashcards_due ? btnPrimary : btnGhost}>Review</Link>
        </div>
      </Card>

      {adding && <NewNote onClose={() => setAdding(false)} defaultTopic={topic} />}
    </div>
  )
}
