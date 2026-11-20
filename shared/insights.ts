// Study insights: streak & heatmap, estimated CAT percentile band, speed-vs-accuracy quadrants,
// and the "stubborn" (Anki leech) rule. Plain arithmetic on saved data — no AI.
import { statusOf, type QuestionRow } from './analysis'

// ---------- 1. Streak & 28-day heatmap ----------
export const DAILY_GOAL = 10 // actions a day: a card review, an answered question, a saved mock or note
export const HEATMAP_DAYS = 28

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

/** counts: { 'YYYY-MM-DD': actions }. A streak still counts if today has nothing yet but yesterday did. */
export function streakStats(counts: Record<string, number>, today: string, days = HEATMAP_DAYS) {
  const active = (d: string) => (counts[d] ?? 0) > 0
  let current = 0
  for (let d = active(today) ? today : addDays(today, -1); active(d); d = addDays(d, -1)) current++
  let best = 0, run = 0, prev = ''
  for (const d of Object.keys(counts).filter(active).sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run); prev = d
  }
  const grid = Array.from({ length: days }, (_, i) => { const date = addDays(today, i - days + 1); return { date, count: counts[date] ?? 0 } })
  return { current, best: Math.max(best, current), today: counts[today] ?? 0, goal: DAILY_GOAL, grid, active_days: grid.filter((g) => g.count > 0).length }
}

/** 0 = none, 1–4 = darker with more actions (relative to the daily goal). */
export const heatLevel = (n: number, goal = DAILY_GOAL) => (n <= 0 ? 0 : n < goal * 0.3 ? 1 : n < goal * 0.7 ? 2 : n < goal ? 3 : 4)

// ---------- 2. Estimated CAT percentile band ----------
// Rough public score-vs-percentile cut-offs from recent CAT papers (CAT 2022–2024 reports), as % of max marks.
// An estimate only — mock difficulty and normalisation move these every year.
type Curve = [pct: number, percentile: number][]
export const PERCENTILE_CURVES: Record<'Full' | 'VARC' | 'DILR' | 'Quant', Curve> = {
  Full: [[0, 0], [5, 30], [9, 50], [12, 60], [15, 70], [19, 80], [22, 85], [26, 90], [33, 95], [38, 97], [45, 99], [55, 99.5], [62, 99.9], [100, 100]],
  VARC: [[0, 0], [6, 30], [11, 50], [15, 60], [19, 70], [23, 80], [27, 85], [31, 90], [38, 95], [43, 97], [50, 99], [58, 99.5], [66, 99.9], [100, 100]],
  DILR: [[0, 0], [4, 30], [8, 50], [11, 60], [14, 70], [18, 80], [21, 85], [25, 90], [32, 95], [37, 97], [45, 99], [53, 99.5], [62, 99.9], [100, 100]],
  Quant: [[0, 0], [4, 30], [7, 50], [10, 60], [13, 70], [17, 80], [20, 85], [24, 90], [31, 95], [37, 97], [45, 99], [55, 99.5], [65, 99.9], [100, 100]],
}
const ROUND = (x: number) => (x >= 99 ? Math.round(x * 10) / 10 : Math.round(x))

/** Linear between the cut-offs. Band = estimate ± the gap to the neighbouring cut-offs' midpoint, capped at ±3. */
export function estimatePercentile(score: number, max: number, section: string | null) {
  const curve = PERCENTILE_CURVES[section as keyof typeof PERCENTILE_CURVES]
  if (!curve || max <= 0) return null
  const pct = Math.max(0, Math.min(100, (score / max) * 100))
  let k = curve.findIndex(([p]) => p >= pct)
  if (k <= 0) k = 1
  const [p0, y0] = curve[k - 1], [p1, y1] = curve[k]
  const est = y0 + ((pct - p0) / (p1 - p0 || 1)) * (y1 - y0)
  const spread = Math.min(3, (100 - est) / 3 + 0.3)
  return { estimate: ROUND(est), low: ROUND(Math.max(0, est - spread)), high: ROUND(Math.min(est >= 99.9 ? 100 : 99.9, est + spread)) }
}
export const bandText = (b: { low: number; high: number } | null) => (b ? (b.low === b.high ? `${b.low}` : `${b.low}–${b.high}`) : '—')

// ---------- 3. Speed vs accuracy ----------
export type Quadrant = 'fast_right' | 'slow_right' | 'fast_wrong' | 'slow_wrong'
export const QUADRANT_LABEL: Record<Quadrant, { title: string; tip: string }> = {
  fast_right: { title: 'Fast & Right', tip: 'Pocket' },
  slow_right: { title: 'Slow & Right', tip: 'Speed drill' },
  fast_wrong: { title: 'Fast & Wrong', tip: 'Careless trap' },
  slow_wrong: { title: 'Slow & Wrong', tip: 'Skip earlier!' },
}
/** Attempted questions with a time only; skipped or untimed → null. Fast = within ideal seconds. */
export function quadrantOf(r: QuestionRow): Quadrant | null {
  const s = statusOf(r)
  if (s === 'skipped' || r.seconds === null || r.seconds === undefined) return null
  const fast = r.seconds <= r.ideal_seconds
  return s === 'correct' ? (fast ? 'fast_right' : 'slow_right') : fast ? 'fast_wrong' : 'slow_wrong'
}

// ---------- 4. Stubborn ("leech") ----------
export const STUBBORN = { MISSES: 3, REPEATS: 2 } as const
/** Missed 3+ times in total, or came back wrong 2+ times after the first miss. */
export const isStubborn = (x: { missed: number; repeats?: number }) => x.missed >= STUBBORN.MISSES || (x.repeats ?? 0) >= STUBBORN.REPEATS

// ---------- 5. Command palette fuzzy match ----------
/** Letters of the query in order (not necessarily together). Higher = better; -1 = no match. Word starts and runs score more. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, ''), t = text.toLowerCase()
  if (!q) return 0
  if (t.includes(query.toLowerCase().trim())) return 1000 - t.indexOf(query.toLowerCase().trim())
  let score = 0, ti = 0, run = 0
  for (const ch of q) {
    const at = t.indexOf(ch, ti)
    if (at < 0) return -1
    run = at === ti ? run + 1 : 0
    score += 1 + run * 2 + (at === 0 || /[\s\-&(/]/.test(t[at - 1]) ? 5 : 0)
    ti = at + 1
  }
  return score
}
