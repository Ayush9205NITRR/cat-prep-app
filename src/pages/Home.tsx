import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type HomeData } from '../api'
import { planSession, SESSION_MINUTES } from '../../shared/session'
import { BLOCK_LABEL, startSession } from '../session'
import { useNavigate } from 'react-router-dom'
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

const short = (s: string) => s.replace(/^(Sample mock — |Test · |Retest · )/, '')
/** X-axis label that never clips: cut to fit the bar's slot, full name in the tooltip. */
function Tick({ x, y, payload, width }: any) {
  const max = Math.max(4, Math.floor((width ?? 60) / 6.2))
  const t = payload.value.length > max ? payload.value.slice(0, max - 1) + '…' : payload.value
  return <text x={x} y={y + 12} textAnchor="middle" fontSize={10.5} fill="#6B7280">{t}</text>
}

function SessionCard({ have }: { have: HomeData['session'] }) {
  const nav = useNavigate()
  const [mins, setMins] = useState<number>(30)
  const plan = planSession(mins, { ...have, weakest: have.weakest ?? undefined })
  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-gray-900">Start today’s session</h2>
          <p className="text-[12.5px] text-gray-500">One tap: due flashcards → retest open mistakes → drill your weakest topic.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {SESSION_MINUTES.map((m) => (
            <button key={m} onClick={() => setMins(m)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${mins === m ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{m} min</button>
          ))}
        </div>
      </div>
      {plan.blocks.length === 0 ? <p className="mt-3 text-[12.5px] text-gray-500">Nothing to study yet: no due cards, open mistakes or saved questions.</p> : (
        <>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {plan.blocks.map((b, i) => (
              <li key={i} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Step {i + 1} · ~{Math.round(b.minutes)} min</div>
                <div className="text-[13.5px] font-semibold text-gray-900">{BLOCK_LABEL[b.kind]}</div>
                <div className="truncate text-[12px] text-gray-500">{b.count} {b.kind === 'cards' ? 'card' : 'question'}{b.count === 1 ? '' : 's'}{b.topic ? ` · ${b.topic}` : ''}</div>
              </li>
            ))}
          </ol>
          <button className={`${btnPrimary} mt-4`} onClick={() => nav(startSession(plan))}>Start {mins}-minute session →</button>
        </>
      )}
    </div>
  )
}

/** Today's Study Hub. */
export default function Home() {
  const [d, setD] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.home().then(setD, (e) => setError(e.message)) }, [])
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!d) return <Loading />
  // Percent of the maximum, so a 9-mark test and a 198-mark full mock compare fairly (raw marks in the tooltip).
  const pct = (n: number, max: number) => (max ? Math.max(0, Math.round((n / max) * 100)) : 0)
  const chart = d.recent_mocks.map((m) => ({ name: short(m.name), full: m.name, Score: pct(m.score, m.max), Reachable: pct(m.reachable, m.max), raw: { Score: m.score, Reachable: m.reachable }, max: m.max }))

  return (
    <div className="space-y-6">
      <PageHeader title="Today" sub="Your study hub: what is due, what is weak, and how your mocks are going." />

      <SessionCard have={d.session} />

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
        <Tile label="Mocks" value={d.mocks_count} sub={<>{d.recent_mocks.length ? `latest: ${d.recent_mocks[d.recent_mocks.length - 1].score} / ${d.recent_mocks[d.recent_mocks.length - 1].max}` : 'none yet'} · {d.tests_count} topic test{d.tests_count === 1 ? '' : 's'} &amp; retests</>}>
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

        <Card title="Recent full & sectional mocks (% of max)" aside="Reachable = score if mistakes and solvable skips were fixed" className="lg:col-span-3">
          {chart.length === 0 ? <p className="text-[12.5px] text-gray-500">No mocks yet. Upload one in Mocks &amp; Tests.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart} margin={{ left: -18, right: 12, top: 6, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={<Tick width={chart.length ? 560 / chart.length : 60} />} axisLine={false} tickLine={false} interval={0} height={28} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(_l: any, p: any) => p?.[0]?.payload.full ?? _l} contentStyle={{ fontSize: 12, borderRadius: 10 }} formatter={(v: number, n: string, p: any) => [`${p.payload.raw[n]} / ${p.payload.max} (${v}%)`, n]} />
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
