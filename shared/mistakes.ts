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
  times_wrong: number
}

const order = (a: HistoryRow, b: HistoryRow) => a.mock_created_at.localeCompare(b.mock_created_at) || a.id - b.id
const isMistake = (r: HistoryRow) => { const b = bucketOf(r, r.has_time_data); return b === 'incorrect' || b === 'over_time' }

export function mistakesFrom(rows: HistoryRow[]): Mistake[] {
  const groups = new Map<string, HistoryRow[]>()
  for (const r of [...rows].sort(order)) {
    const k = r.practice_question_id ? `q${r.practice_question_id}` : `r${r.id}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: Mistake[] = []
  for (const [key, g] of groups) {
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
    out.push({
      key, status, topic: latestMistake.topic, row: latestMistake,
      error: abc === 'pending' ? 'not reviewed' : abc,
      row_ids: g.map((r) => r.id), practice_question_id: latestMistake.practice_question_id, times_wrong: mistakes.length,
    })
  }
  const rank = { Open: 0, Repeated: 1, Fixed: 2 }
  return out.sort((a, b) => rank[a.status] - rank[b.status] || order(b.row, a.row))
}
