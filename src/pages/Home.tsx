import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type HomeData } from '../api'
import { btnGhost, btnPrimary, Card, ErrorNote, Loading, PageHeader } from '../ui'

function Tile({ label, value, sub, tone = 'text-gray-900', children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-[30px] font-semibold leading-tight tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[12px] text-gray-500">{sub}</div>}
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  )
}

const short = (s: string) => s.replace(/^(Sample mock — |Test · |Retest · )/, '').slice(0, 16)

/** Today's Study Hub. */
export default function Home() {
  const [d, setD] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.home().then(setD, (e) => setError(e.message)) }, [])
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!d) return <Loading />
  // Percent of the maximum, so a 9-mark test and a 198-mark full mock compare fairly (raw marks in the tooltip).
  const pct = (n: number, max: number) => (max ? Math.max(0, Math.round((n / max) * 100)) : 0)
  const chart = d.recent_mocks.map((m) => ({ name: short(m.name), Score: pct(m.score, m.max), Reachable: pct(m.reachable, m.max), raw: { Score: m.score, Reachable: m.reachable }, max: m.max }))

  return (
    <div className="space-y-6">
      <PageHeader title="Today" sub="Your study hub: what is due, what is weak, and how your mocks are going." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Days to CAT" value={d.days_left === null ? '—' : d.days_left < 0 ? 'Done' : d.days_left}
          sub={d.exam_date ? `Exam on ${d.exam_date}` : 'Exam date not set'} tone="text-indigo-700">
          {!d.exam_date && <Link to="/connect#exam-date" className="text-[12.5px] font-medium text-indigo-700 underline">Set your CAT date</Link>}
        </Tile>
        <Tile label="Flashcards due today" value={d.due_today} sub="across all topics" tone={d.due_today ? 'text-amber-600' : 'text-gray-300'}>
          <Link to="/flashcards" className={d.due_today ? btnPrimary : btnGhost}>{d.due_today ? 'Review all due' : 'Nothing due'}</Link>
        </Tile>
        <Tile label="Open mistakes" value={d.open_mistakes} sub={<>{d.fixed_mistakes} fixed{d.repeated ? <> · <b className="text-orange-600">{d.repeated} repeated</b></> : null}</>} tone={d.open_mistakes ? 'text-red-600' : 'text-gray-300'}>
          {d.open_mistakes > 0 && <Link to="/test?retest=1" className={btnGhost}>Retest all open mistakes</Link>}
        </Tile>
        <Tile label="Mocks & tests" value={d.recent_mocks.length} sub={d.recent_mocks.length ? `latest: ${d.recent_mocks[d.recent_mocks.length - 1].score} / ${d.recent_mocks[d.recent_mocks.length - 1].max}` : 'none yet'}>
          <Link to="/mocks" className={btnGhost}>Open Mocks &amp; Tests</Link>
        </Tile>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Needs attention" aside="Open mistakes first, then due cards" className="lg:col-span-2">
          {d.active_topics.length === 0 ? <p className="text-[12.5px] text-gray-500">Nothing open. Take a test from a section page, or upload a mock to Claude.</p> : (
            <div className="divide-y divide-gray-100">
              {d.active_topics.map((t) => (
                <Link key={t.topic} to={`/topic/${encodeURIComponent(t.topic)}`} className="flex items-center justify-between gap-3 py-2 hover:bg-gray-50">
                  <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-gray-900">{t.topic}</span><span className="text-[11px] text-gray-400">{t.section}</span></span>
                  <span className="flex shrink-0 gap-1.5 text-[11px] font-medium">
                    {t.open > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{t.open} open</span>}
                    {t.repeated > 0 && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700">{t.repeated} repeat</span>}
                    {t.due > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{t.due} due</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent mocks: score vs reachable (% of max)" aside="Reachable = score if mistakes and solvable skips were fixed" className="lg:col-span-3">
          {chart.length === 0 ? <p className="text-[12.5px] text-gray-500">No mocks yet. Upload one in Mocks &amp; Tests.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart} margin={{ left: -18, right: 6, top: 6 }}>
                <CartesianGrid vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: '#6B7280' }} axisLine={false} tickLine={false} interval={0} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} formatter={(v: number, n: string, p: any) => [`${p.payload.raw[n]} / ${p.payload.max} (${v}%)`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                <Bar dataKey="Score" fill="#4F46E5" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Reachable" fill="#A5B4FC" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['Quant', 'VARC', 'DILR'] as const).map((s) => <Link key={s} to={`/section/${s}`} className={btnGhost}>Open {s}</Link>)}
      </div>
    </div>
  )
}
