import { heatLevel } from '../../shared/insights'
import type { Streak } from '../api'

const HEAT = ['bg-gray-100', 'bg-emerald-200', 'bg-emerald-400', 'bg-emerald-500', 'bg-emerald-700']
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Streak, today vs goal, and a 4-week heatmap — all counted from what you already did in the app. */
export default function StreakCard({ s }: { s: Streak }) {
  const pct = Math.min(100, Math.round((s.today / s.goal) * 100))
  // Columns = weeks (oldest left), rows = 7 days, like GitHub/LeetCode.
  const weeks = Array.from({ length: Math.ceil(s.grid.length / 7) }, (_, w) => s.grid.slice(w * 7, w * 7 + 7))
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-gray-900">Study streak &amp; consistency</h2>
        <span className="text-[11.5px] text-gray-400">Counted automatically</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <div className={`text-[26px] font-semibold leading-tight ${s.current ? 'text-orange-600' : 'text-gray-300'}`}>🔥 {s.current}-day streak</div>
          <div className="text-[12px] text-gray-500">Best: <b className="text-gray-800">{s.best} day{s.best === 1 ? '' : 's'}</b> · {s.active_days}/28 days active</div>
          <div className="mt-3 w-56">
            <div className="flex justify-between text-[11.5px] text-gray-500"><span>Today</span><span><b className="text-gray-900">{s.today}</b> / {s.goal} actions</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={s.today} aria-valuemax={s.goal}>
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-orange-400'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-gray-400">{pct >= 100 ? '✓ Daily goal met' : 'A card review, an answered question, a mock or a note = 1 action'}</div>
          </div>
        </div>
        <div>
          <div className="flex gap-1" role="img" aria-label="Activity over the last 28 days">
            {weeks.map((w, i) => (
              <div key={i} className="grid grid-rows-7 gap-1">
                {w.map((d) => (
                  <div key={d.date} title={`${fmt(d.date)}: ${d.count} action${d.count === 1 ? '' : 's'}`}
                    className={`h-4 w-4 rounded-[4px] ${HEAT[heatLevel(d.count, s.goal)]} ${d.date === s.grid[s.grid.length - 1].date ? 'ring-2 ring-gray-900/40' : ''}`} />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-gray-400">Less {HEAT.map((c) => <span key={c} className={`h-2.5 w-2.5 rounded-sm ${c}`} />)} More</div>
        </div>
      </div>
    </div>
  )
}
