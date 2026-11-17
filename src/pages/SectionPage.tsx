import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { btnGhost } from '../ui'
import { SECTIONS, type Section } from '../../shared/topics'
import { api, type TopicStats } from '../api'
import StartTest from '../components/StartTest'
import { ErrorNote, Loading, PageHeader } from '../ui'

const SUB: Record<Section, string> = {
  Quant: 'Arithmetic, Algebra, Geometry, Number System and Modern Math.',
  VARC: 'Reading Comprehension and Verbal Ability: Para Jumbles, Para Summary, Odd One Out, Critical Reasoning, Vocabulary.',
  DILR: 'Data Interpretation & Logical Reasoning (plus Data Sufficiency).',

}

function TopicCard({ topic, s }: { topic: string; s?: TopicStats }) {
  const stat = (n: number | undefined, label: string, tone = 'text-gray-900') => (
    <div><div className={`text-[15px] font-semibold tabular-nums ${n ? tone : 'text-gray-300'}`}>{n ?? 0}</div><div className="text-[10.5px] text-gray-400">{label}</div></div>
  )
  return (
    <Link to={`/topic/${encodeURIComponent(topic)}`} className="group flex flex-col rounded-2xl border border-gray-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[14px] font-semibold leading-snug text-gray-900 group-hover:text-indigo-700">{topic}</div>
        {!!s?.due && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-700">{s.due} card{s.due > 1 ? 's' : ''} due</span>}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {stat(s?.notes, 'notes')}
        {stat(s?.questions, 'questions')}
        {stat(s?.open, 'open', 'text-red-600')}
        {stat(s?.fixed, 'fixed', 'text-emerald-600')}
      </div>
      <div className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
        {s?.open || s?.fixed ? <>Fixed {s.fixed} / Open {s.open} · </> : null}{s?.last_test ? `Last test ${s.last_test}` : 'No test yet'}
      </div>
    </Link>
  )
}

type Filter = 'all' | 'attention' | 'active'
const FILTERS: [Filter, string][] = [['all', 'All topics'], ['attention', 'Needs attention'], ['active', 'Active only']]
/** Needs attention = open mistakes or due cards. Active = anything at all saved for the topic. */
const keep = (f: Filter, s?: TopicStats) =>
  f === 'all' || (!!s && (f === 'attention' ? s.open + s.due > 0 : s.notes + s.questions + s.open + s.fixed + s.due > 0 || !!s.last_test))
const readFilter = (): Filter => { try { const v = localStorage.getItem('section-filter'); return v === 'attention' || v === 'active' ? v : 'all' } catch { return 'all' } }

export default function SectionPage() {
  const section = useParams().section as Section
  const [filter, setFilterState] = useState<Filter>(readFilter)
  const setFilter = (f: Filter) => { setFilterState(f); try { localStorage.setItem('section-filter', f) } catch { /* private mode: just not remembered */ } }
  const [stats, setStats] = useState<Record<string, TopicStats> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.topicsSummary().then((r) => setStats(r.topics), (e) => setError(e.message)) }, [])
  if (!SECTIONS[section]) return <ErrorNote>Unknown section.</ErrorNote>
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!stats) return <Loading />
  const allAreas = Object.entries(SECTIONS[section]) as [string, readonly string[]][]
  const areas = allAreas.map(([a, ts]) => [a, ts.filter((t) => keep(filter, stats[t]))] as [string, string[]]).filter(([, ts]) => ts.length)
  const hidden = allAreas.flatMap(([, ts]) => ts).length - areas.flatMap(([, ts]) => ts).length
  const total = (k: keyof TopicStats) => allAreas.flatMap(([, ts]) => ts).reduce((n, t) => n + (Number(stats[t]?.[k]) || 0), 0)
  return (
    <div className="space-y-7">
      <PageHeader title={section} sub={`${SUB[section]} ${total('open')} open mistakes · ${total('fixed')} fixed · ${total('questions')} questions saved.`}
        actions={<>
          {total('due') > 0 && <Link to="/flashcards" className={btnGhost}>Review {total('due')} due card{total('due') > 1 ? 's' : ''}</Link>}
          <StartTest scope={{ section }} label={`Start a ${section} test`} />
        </>} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm" role="group" aria-label="Show topics">
          {FILTERS.map(([f, label]) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${filter === f ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{label}</button>
          ))}
        </div>
        {hidden > 0 && <span className="text-[12px] text-gray-400">{hidden} empty topic{hidden > 1 ? 's' : ''} hidden</span>}
      </div>
      {areas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 px-6 py-10 text-center text-[13px] text-gray-500">
          {filter === 'attention' ? 'Nothing needs attention here: no open mistakes or due cards.' : 'Nothing saved in this section yet.'} <button className="font-medium text-indigo-700 underline" onClick={() => setFilter('all')}>Show all topics</button>
        </div>
      )}
      {areas.length > 0 && allAreas.every(([, ts]) => ts.length === 1) ? (
        // VARC: each area is one topic, so show one grid without repeating headings.
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{areas.map(([, [t]]) => <TopicCard key={t} topic={t} s={stats[t]} />)}</div>
      ) : areas.map(([area, topics]) => (
        <section key={area}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-500">{area}</h2>
            {topics.length > 1 && <StartTest scope={{ section, area }} label="Test this area" small />}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{topics.map((t) => <TopicCard key={t} topic={t} s={stats[t]} />)}</div>
        </section>
      ))}
    </div>
  )
}
