// FIXES round 1, Fix 5: a mistake's status across tests. Plain rules, no AI.
// A mistake = a wrong or over-time row in a mock or test. Rows of the same question are grouped by
// practice_question_id (tests and retests link to it); a mock row without one is its own group.
//   Fixed    — the latest later answer to that question is right and within its ideal time
//   Repeated — the latest later answer is wrong
//   Open     — no later answer yet (or right but still slow, or skipped)
import { abcOf, bucketOf, type Abc, type QuestionRow } from './analysis'

export type MistakeStatus = 'Open' | 'Fixed' | 'Repeated'

export interface HistoryRow extends QuestionRow {
  id: number
  mock_id: number
  mock_name: string
  mock_created_at: string
  has_time_data: boolean
  practice_question_id: number | null
}

export interface Mistake {
  key: string
  status: MistakeStatus
  topic: string
  /** The latest wrong/over-time row: what to show and tag. */
  row: HistoryRow
  error: Abc | 'not reviewed' | null
  /** Every row id of this question, for finding its fix note. */
  row_ids: number[]
  practice_question_id: number | null
  /** Times answered wrong or too slowly. */
  times_wrong: number
  /** Times answered right within the ideal time after a mistake. */
  times_fixed: number
}

const order = (a: HistoryRow, b: HistoryRow) => a.mock_created_at.localeCompare(b.mock_created_at) || a.id - b.id
const isMistake = (r: HistoryRow) => { const b = bucketOf(r, r.has_time_data); return b === 'incorrect' || b === 'over_time' }
const rightInTime = (r: HistoryRow) => r.chosen_index !== null && r.chosen_index === r.correct_index && (r.seconds === null || r.seconds <= r.ideal_seconds)

/** Question text that is long enough to identify a question (short one-liners like "Q3" are not). */
export const MIN_TEXT_FOR_MATCH = 25
const textKey = (r: HistoryRow) => {
  const t = r.text.toLowerCase().replace(/\s+/g, ' ').trim()
  return t.length >= MIN_TEXT_FOR_MATCH ? `${r.topic}\u0000${t}` : null
}

/**
 * Groups rows of the same question: same saved question (practice_question_id) OR the same topic and
 * the same long-enough text (the same question in a mock and in a later test). Union-find over both links.
 */
export function groupSameQuestion(rows: HistoryRow[]): HistoryRow[][] {
  const parent = new Map<number, number>()
  const find = (x: number): number => { const p = parent.get(x)!; if (p === x) return x; const r = find(p); parent.set(x, r); return r }
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const r of rows) parent.set(r.id, r.id)
  const byPq = new Map<number, number>(), byText = new Map<string, number>()
  for (const r of rows) {
    if (r.practice_question_id) { const o = byPq.get(r.practice_question_id); if (o === undefined) byPq.set(r.practice_question_id, r.id); else union(r.id, o) }
    const t = textKey(r)
    if (t) { const o = byText.get(t); if (o === undefined) byText.set(t, r.id); else union(r.id, o) }
  }
  const groups = new Map<number, HistoryRow[]>()
  for (const r of rows) { const k = find(r.id); groups.set(k, [...(groups.get(k) ?? []), r]) }
  return [...groups.values()].map((g) => g.sort(order))
}

export function mistakesFrom(rows: HistoryRow[]): Mistake[] {
  const out: Mistake[] = []
  for (const g of groupSameQuestion(rows)) {
    const first = g.findIndex(isMistake)
    if (first < 0) continue
    const mistakes = g.filter(isMistake)
    const latestMistake = mistakes[mistakes.length - 1]
    const later = g.slice(first + 1).filter((r) => r.chosen_index !== null)
    const last = later[later.length - 1]
    let status: MistakeStatus = 'Open'
    if (last) {
      if (last.chosen_index !== last.correct_index) status = 'Repeated'
      else if (last.seconds === null || last.seconds <= last.ideal_seconds) status = 'Fixed'
    }
    const abc = abcOf(latestMistake, latestMistake.has_time_data)
    const pq = g.find((r) => r.practice_question_id)?.practice_question_id ?? null
    out.push({
      key: pq ? `q${pq}` : `r${g[0].id}`, status, topic: latestMistake.topic, row: latestMistake,
      error: abc === 'pending' ? 'not reviewed' : abc,
      row_ids: g.map((r) => r.id), practice_question_id: pq,
      times_wrong: mistakes.length, times_fixed: later.filter(rightInTime).length,
    })
  }
  const rank = { Open: 0, Repeated: 1, Fixed: 2 }
  return out.sort((a, b) => rank[a.status] - rank[b.status] || order(b.row, a.row))
}
