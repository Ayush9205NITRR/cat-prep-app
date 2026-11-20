import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type CheatSheet as Data } from '../api'
import Markdown from '../components/Markdown'
import { btnPrimary, Empty, ErrorNote, Loading, optionLabel } from '../ui'

const SECTIONS = ['All', 'Quant', 'VARC', 'DILR'] as const

/** Night-before-mock revision sheet: every concept summary + formula, and the mistakes you keep repeating. */
export default function CheatSheet() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [p, setP] = useSearchParams()
  const sec = (p.get('section') ?? 'All') as (typeof SECTIONS)[number]
  const [query, setQuery] = useState('')
  useEffect(() => { api.cheatSheet().then(setD, (e) => setError(e.message)) }, [])

  const shown = useMemo(() => {
    if (!d) return null
    const f = query.trim().toLowerCase()
    const hit = (...xs: string[]) => !f || xs.some((x) => x.toLowerCase().includes(f))
    const inSec = (s: string) => sec === 'All' || s === sec
    const notes = d.notes.filter((n) => inSec(n.section) && hit(n.topic, n.title, n.summary, ...n.formulas))
    const mistakes = d.mistakes.filter((m) => inSec(m.section) && hit(m.topic, m.text, m.fix?.summary ?? ''))
    const topics = [...new Set([...notes.map((n) => n.topic), ...mistakes.map((m) => m.topic)])].sort()
    return { notes, mistakes, topics }
  }, [d, sec, query])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!d || !shown) return <Loading />
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Night-before-mock revision sheet</h1>
          <p className="text-[12.5px] text-gray-500">{sec === 'All' ? 'All sections' : sec} · your concept summaries, formulas and the mistakes you keep repeating.</p>
        </div>
        <button className={`${btnPrimary} no-print`} onClick={() => window.print()}>🖨️ Print / Save PDF</button>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {SECTIONS.map((s) => <button key={s} onClick={() => setP(s === 'All' ? {} : { section: s })} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${sec === s ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{s}</button>)}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search formulas, topics, mistakes…" aria-label="Search the cheat sheet"
          className="min-w-[200px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] shadow-sm focus:border-indigo-400 focus:outline-none" />
      </div>

      {shown.topics.length === 0 ? (
        <Empty icon="📄" title={d.notes.length + d.mistakes.length ? 'Nothing matches' : 'Your cheat sheet is empty'}>
          Send lecture notes to Claude (“Make notes and flashcards”) and review your mocks — summaries, formulas and repeated mistakes collect here.
        </Empty>
      ) : shown.topics.map((t) => {
        const notes = shown.notes.filter((n) => n.topic === t), ms = shown.mistakes.filter((m) => m.topic === t)
        const formulas = [...new Set(notes.flatMap((n) => n.formulas))]
        return (
          <section key={t} className="print-avoid-break rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-[15px] font-semibold"><Link to={`/topic/${encodeURIComponent(t)}`} className="hover:text-indigo-700">{t}</Link></h2>
            {formulas.length > 0 && (
              <ul className="mb-3 grid gap-1 rounded-xl bg-indigo-50/60 p-3 font-mono text-[12.5px] text-indigo-950 sm:grid-cols-2">
                {formulas.map((f) => <li key={f}>• {f}</li>)}
              </ul>
            )}
            {notes.map((n) => (
              <div key={n.id} className="mb-3">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">{n.title}</div>
                {n.summary && <Markdown text={n.summary} className="text-[13px]" />}
              </div>
            ))}
            {ms.length > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-3">
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-rose-700">Mistakes you repeat</div>
                {ms.map((m) => (
                  <div key={m.row_id} className="mb-2 rounded-xl bg-rose-50/60 p-3 text-[12.5px]">
                    <div className="flex flex-wrap gap-2 font-medium text-gray-900">
                      {m.stubborn && <span className="rounded-full bg-rose-100 px-2 text-[11px] font-semibold text-rose-800">🔁 Stubborn</span>}
                      <span className="text-[11px] text-rose-700">Missed {m.times_wrong}×</span>
                    </div>
                    <div className="mt-1 line-clamp-3 text-gray-800">{m.text}</div>
                    <div className="mt-1 text-[12px] text-emerald-800">Answer: {optionLabel(m.correct_index)} {m.options[m.correct_index]}</div>
                    {m.fix && <div className="mt-1.5 border-l-2 border-rose-300 pl-2 text-gray-700"><Markdown text={m.fix.summary} /></div>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
