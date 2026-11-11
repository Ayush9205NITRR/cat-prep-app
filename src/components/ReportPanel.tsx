import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BUCKET_LABEL, type Bucket, type Report } from '../../shared/analysis'
import { CONFIG } from '../../shared/config'
import { Card, CHART, fmtSeconds } from '../ui'

const BUCKET_ORDER: Bucket[] = ['pocket', 'over_time', 'incorrect', 'could_have_solved', 'not_solved']
const BUCKET_HELP: Record<Bucket, string> = {
  pocket: 'Correct, within ideal time',
  over_time: 'Correct, slower than ideal',
  incorrect: 'Attempted, wrong',
  could_have_solved: 'Skipped, solved in re-solve within ideal time',
  not_solved: 'Skipped, not solved in re-solve',
}

const PART_COLOR: Record<string, string> = {
  C: CHART.danger,
  could_have_solved: CHART.accent,
  A: CHART.warning,
  B: '#B08968',
  unreviewed: CHART.muted,
}

function Stat({ label, value, sub, tone = 'text-gray-900' }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-[26px] font-semibold tabular-nums leading-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  )
}

export default function ReportPanel({ report: r, mockId }: { report: Report; mockId: number }) {
  const marksParts = r.deficit.parts.filter((p) => p.group !== 'time' && p.marks > 0)
  const over = r.deficit.parts.find((p) => p.key === 'over_time')!

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Score" value={r.score} sub={`of ${r.max_score} · +${CONFIG.MARKS_CORRECT} / −${CONFIG.MARKS_WRONG}`} />
        <Stat label="Reachable score" value={r.reachable_score} tone="text-emerald-700" sub={`score + C × ${CONFIG.LOSS_PER_WRONG} + could-have-solved × ${CONFIG.LOSS_PER_COULD_HAVE_SOLVED}`} />
        <Stat label="Attempted" value={r.counts.correct + r.counts.incorrect} sub={`${r.counts.correct} right · ${r.counts.incorrect} wrong · ${r.counts.skipped} skipped`} />
        <Stat label="A / B / C" value={`${r.abc.A} / ${r.abc.B} / ${r.abc.C}`} sub={r.abc.pending ? `${r.abc.pending} still to review` : 'Comprehension / Approach / Mistake'} />
      </div>

      {(r.abc.pending > 0 || r.pending_resolve > 0) && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
          {r.abc.pending > 0 && (
            <span>
              {r.abc.pending} wrong or over-time question{r.abc.pending === 1 ? ' needs' : 's need'} two taps to get A/B/C.{' '}
              <Link className="font-semibold underline" to={`/mocks/${mockId}/review`}>Review</Link>
            </span>
          )}
          {r.pending_resolve > 0 && (
            <span>
              {r.pending_resolve} skipped question{r.pending_resolve === 1 ? '' : 's'} not re-solved yet.{' '}
              <Link className="font-semibold underline" to={`/mocks/${mockId}/resolve`}>Re-solve</Link>
            </span>
          )}
        </div>
      )}

      <Card title="Buckets" aside={r.over_time_tracked ? undefined : 'Over time not tracked'}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {BUCKET_ORDER.map((b) => {
            const off = b === 'over_time' && !r.over_time_tracked
            return (
              <div key={b} className={`rounded-lg border border-gray-100 p-3 ${off ? 'opacity-50' : ''}`}>
                <div className="text-[12px] font-medium text-gray-700">{BUCKET_LABEL[b]}</div>
                <div className="text-[22px] font-semibold tabular-nums">{off ? '—' : r.buckets[b]}</div>
                <div className="text-[11px] leading-snug text-gray-400">{BUCKET_HELP[b]}</div>
              </div>
            )
          })}
        </div>
        {r.over_time_note && <p className="mt-3 text-[12px] text-gray-500">{r.over_time_note}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top 3 fixes">
          {r.top_fixes.length === 0 ? (
            <p className="text-[12px] text-gray-500">Nothing to fix yet. Review wrong answers and re-solve skips to fill this in.</p>
          ) : (
            <ol className="space-y-3">
              {r.top_fixes.map((f, i) => (
                <li key={i} className="flex gap-3 text-[13px] text-gray-800">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">{i + 1}</span>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Deficit split" aside="marks lost">
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-emerald-50 p-2">
              <div className="text-[11px] text-emerald-700">Fixable now</div>
              <div className="text-[18px] font-semibold tabular-nums text-emerald-800">{r.deficit.fixable_now.total}</div>
              <div className="text-[10px] text-emerald-700">C {r.deficit.fixable_now.C_marks} · skips {r.deficit.fixable_now.could_have_solved_marks}</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <div className="text-[11px] text-amber-700">Needs practice</div>
              <div className="text-[18px] font-semibold tabular-nums text-amber-800">{r.deficit.needs_practice.total}</div>
              <div className="text-[10px] text-amber-700">
                A {r.deficit.needs_practice.A_marks} · B {r.deficit.needs_practice.B_marks}
                {r.deficit.needs_practice.unreviewed_marks > 0 && ` · unreviewed ${r.deficit.needs_practice.unreviewed_marks}`}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-2">
              <div className="text-[11px] text-gray-600">Over time</div>
              <div className="text-[18px] font-semibold tabular-nums text-gray-800">{r.over_time_tracked ? `${r.deficit.over_time_extra_minutes}m` : '—'}</div>
              <div className="text-[10px] text-gray-500">{r.over_time_tracked ? `extra on ${over.questions} correct` : 'no time data'}</div>
            </div>
          </div>
          {marksParts.length > 0 && (
            <ResponsiveContainer width="100%" height={marksParts.length * 34 + 10}>
              <BarChart data={marksParts} layout="vertical" margin={{ left: 0, right: 28, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F3F4F6' }} formatter={(v: number, _n, p: any) => [`${v} marks · ${p.payload.questions} q`, '']} separator="" contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="marks" radius={[0, 4, 4, 0]} barSize={18}>
                  {marksParts.map((p) => <Cell key={p.key} fill={PART_COLOR[p.key]} />)}
                  <LabelList dataKey="marks" position="right" style={{ fontSize: 11, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title="Time delta" aside="seconds − ideal seconds, slowest first">
        {r.time_delta.length === 0 ? (
          <p className="text-[12px] text-gray-500">This mock has no time per question.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-2">Q</th>
                  <th className="py-1.5 pr-2">Topic</th>
                  <th className="py-1.5 pr-2 text-right">Taken</th>
                  <th className="py-1.5 pr-2 text-right">Ideal</th>
                  <th className="py-1.5 text-right">Delta</th>
                </tr>
              </thead>
              <tbody>
                {r.time_delta.map((t) => (
                  <tr key={t.q_no} className="border-b border-gray-50">
                    <td className="py-1 pr-2 tabular-nums text-gray-500">{t.q_no}</td>
                    <td className="py-1 pr-2">{t.topic}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtSeconds(t.seconds)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-gray-500">{fmtSeconds(t.ideal_seconds)}</td>
                    <td className={`py-1 text-right font-medium tabular-nums ${t.delta > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {t.delta > 0 ? '+' : ''}{t.delta}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
