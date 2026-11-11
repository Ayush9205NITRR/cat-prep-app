// The analysis rules. Plain code, no AI. All numbers come from config.ts.
import { CONFIG } from './config'

export interface QuestionRow {
  id?: number
  q_no: number
  topic: string
  text: string
  options: string[]
  correct_index: number
  /** null = skipped */
  chosen_index: number | null
  /** time spent, from the mock report; null if the report has no time data */
  seconds: number | null
  ideal_seconds: number
  type_options: string[]
  type_answer: number
  approach_options: string[]
  approach_answer: number
  solution_notes: string
  /** Review tap 1: the type option the student picked in the app */
  type_tap: number | null
  /** Review tap 2: the approach option the student picked in the app */
  approach_tap: number | null
  /** Re-solve of a skipped question: option picked and time taken */
  resolve_index: number | null
  resolve_seconds: number | null
}

export type Status = 'correct' | 'incorrect' | 'skipped'
export type Bucket = 'pocket' | 'over_time' | 'incorrect' | 'could_have_solved' | 'not_solved'
export type Abc = 'A' | 'B' | 'C'

export const BUCKET_LABEL: Record<Bucket, string> = {
  pocket: 'Pocket',
  over_time: 'Over time',
  incorrect: 'Incorrect',
  could_have_solved: 'Could have solved',
  not_solved: 'Not solved',
}

export const ABC_LABEL: Record<Abc, string> = {
  A: 'Comprehension',
  B: 'Optimal approach',
  C: 'Mistake',
}

export function statusOf(r: QuestionRow): Status {
  if (r.chosen_index === null || r.chosen_index === undefined) return 'skipped'
  return r.chosen_index === r.correct_index ? 'correct' : 'incorrect'
}

export function bucketOf(r: QuestionRow, hasTimeData: boolean): Bucket {
  const s = statusOf(r)
  if (s === 'incorrect') return 'incorrect'
  if (s === 'correct') {
    if (hasTimeData && r.seconds !== null && r.seconds > r.ideal_seconds) return 'over_time'
    return 'pocket'
  }
  const resolvedInTime =
    r.resolve_index !== null &&
    r.resolve_index === r.correct_index &&
    r.resolve_seconds !== null &&
    r.resolve_seconds <= r.ideal_seconds
  return resolvedInTime ? 'could_have_solved' : 'not_solved'
}

/** Questions that go through the two-tap review. */
export function needsReview(r: QuestionRow, hasTimeData: boolean): boolean {
  const b = bucketOf(r, hasTimeData)
  return b === 'incorrect' || b === 'over_time'
}

/**
 * A / B / C from the two taps. Returns:
 *  - 'pending' while the taps needed are not done,
 *  - null for an over-time question with both taps right (C is only for Incorrect),
 *  - otherwise A, B or C.
 */
export function abcOf(r: QuestionRow, hasTimeData: boolean): Abc | null | 'pending' {
  if (!needsReview(r, hasTimeData)) return null
  if (r.type_tap === null) return 'pending'
  if (r.type_tap !== r.type_answer) return 'A'
  if (r.approach_tap === null) return 'pending'
  if (r.approach_tap !== r.approach_answer) return 'B'
  return bucketOf(r, hasTimeData) === 'incorrect' ? 'C' : null
}

export function timeDelta(r: QuestionRow): number | null {
  return r.seconds === null ? null : r.seconds - r.ideal_seconds
}

export interface DeficitPart {
  key: 'C' | 'could_have_solved' | 'A' | 'B' | 'unreviewed' | 'over_time'
  label: string
  group: 'fixable_now' | 'needs_practice' | 'time'
  questions: number
  marks: number
  minutes: number
  topics: string[]
}

export interface Report {
  score: number
  reachable_score: number
  max_score: number
  counts: { total: number; correct: number; incorrect: number; skipped: number }
  buckets: Record<Bucket, number>
  over_time_tracked: boolean
  over_time_note: string | null
  abc: { A: number; B: number; C: number; pending: number }
  pending_resolve: number
  time_delta: { q_no: number; topic: string; seconds: number; ideal_seconds: number; delta: number }[]
  deficit: {
    fixable_now: { C_marks: number; could_have_solved_marks: number; total: number }
    needs_practice: { A_marks: number; B_marks: number; unreviewed_marks: number; total: number }
    over_time_extra_minutes: number
    parts: DeficitPart[]
  }
  top_fixes: string[]
}

function topicsOf(rows: QuestionRow[]): string[] {
  const count = new Map<string, number>()
  for (const r of rows) count.set(r.topic, (count.get(r.topic) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
const round1 = (n: number) => Math.round(n * 10) / 10

function fixText(p: DeficitPart): string {
  const where = p.topics.length ? ` (${p.topics.slice(0, 3).join(', ')})` : ''
  switch (p.key) {
    case 'C':
      return `Careless mistakes cost ${p.marks} marks: ${plural(p.questions, 'question')}${where} where you knew the type and the approach but still got it wrong. Re-check the last step before you mark the answer.`
    case 'could_have_solved':
      return `Skipped but solvable, ${p.marks} marks: you solved ${plural(p.questions, 'skipped question')}${where} within the ideal time on the re-solve. Attempt these on the first pass.`
    case 'A':
      return `Question type not recognised, ${p.marks} marks: ${plural(p.questions, 'wrong answer')}${where}. Practise naming the question type before you start solving.`
    case 'B':
      return `Slower approach chosen, ${p.marks} marks: ${plural(p.questions, 'wrong answer')}${where}. Learn the fastest method for these question types.`
    case 'unreviewed':
      return `Not reviewed yet, ${p.marks} marks: ${plural(p.questions, 'wrong answer')}${where}. Open Review and do the two taps to see why each one went wrong.`
    case 'over_time':
      return `Over time by ${p.minutes} minutes on ${plural(p.questions, 'correct answer')}${where}. Practise these against the clock to free time for more attempts.`
  }
}

export function analyse(rows: QuestionRow[], hasTimeData: boolean): Report {
  const by = (b: Bucket) => rows.filter((r) => bucketOf(r, hasTimeData) === b)
  const correct = rows.filter((r) => statusOf(r) === 'correct')
  const incorrect = rows.filter((r) => statusOf(r) === 'incorrect')
  const skipped = rows.filter((r) => statusOf(r) === 'skipped')

  const score = correct.length * CONFIG.MARKS_CORRECT - incorrect.length * CONFIG.MARKS_WRONG

  const buckets: Record<Bucket, number> = {
    pocket: by('pocket').length,
    over_time: by('over_time').length,
    incorrect: incorrect.length,
    could_have_solved: by('could_have_solved').length,
    not_solved: by('not_solved').length,
  }

  const reviewed = rows.map((r) => ({ r, abc: abcOf(r, hasTimeData) }))
  const wrongWith = (k: Abc) => reviewed.filter((x) => statusOf(x.r) === 'incorrect' && x.abc === k).map((x) => x.r)
  const A = wrongWith('A')
  const B = wrongWith('B')
  const C = wrongWith('C')
  const unreviewed = reviewed.filter((x) => statusOf(x.r) === 'incorrect' && x.abc === 'pending').map((x) => x.r)
  const could = by('could_have_solved')
  const overTime = by('over_time')
  const extraSeconds = overTime.reduce((s, r) => s + (timeDelta(r) ?? 0), 0)

  const abc = {
    A: reviewed.filter((x) => x.abc === 'A').length,
    B: reviewed.filter((x) => x.abc === 'B').length,
    C: C.length,
    pending: reviewed.filter((x) => x.abc === 'pending').length,
  }

  const L = CONFIG.LOSS_PER_WRONG
  const part = (
    key: DeficitPart['key'],
    label: string,
    group: DeficitPart['group'],
    list: QuestionRow[],
    marks: number,
    minutes = 0,
  ): DeficitPart => ({ key, label, group, questions: list.length, marks, minutes, topics: topicsOf(list) })

  const parts: DeficitPart[] = [
    part('C', 'C · Mistake', 'fixable_now', C, C.length * L),
    part('could_have_solved', 'Could have solved', 'fixable_now', could, could.length * CONFIG.LOSS_PER_COULD_HAVE_SOLVED),
    part('A', 'A · Comprehension', 'needs_practice', A, A.length * L),
    part('B', 'B · Optimal approach', 'needs_practice', B, B.length * L),
    part('unreviewed', 'Not reviewed yet', 'needs_practice', unreviewed, unreviewed.length * L),
    part('over_time', 'Over time', 'time', overTime, 0, round1(extraSeconds / 60)),
  ]

  const weight = (p: DeficitPart) => p.marks + p.minutes * CONFIG.RANK_MARKS_PER_EXTRA_MINUTE
  const top_fixes = parts
    .filter((p) => p.questions > 0 && weight(p) > 0)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, CONFIG.TOP_FIXES)
    .map(fixText)

  const fixableC = C.length * L
  const fixableCould = could.length * CONFIG.LOSS_PER_COULD_HAVE_SOLVED

  return {
    score,
    reachable_score: score + fixableC + fixableCould,
    max_score: rows.length * CONFIG.MARKS_CORRECT,
    counts: { total: rows.length, correct: correct.length, incorrect: incorrect.length, skipped: skipped.length },
    buckets,
    over_time_tracked: hasTimeData,
    over_time_note: hasTimeData
      ? null
      : 'This mock report has no time per question, so the Over time bucket is skipped and correct answers all count as Pocket.',
    abc,
    pending_resolve: skipped.filter((r) => r.resolve_index === null).length,
    time_delta: rows
      .filter((r) => r.seconds !== null)
      .map((r) => ({ q_no: r.q_no, topic: r.topic, seconds: r.seconds!, ideal_seconds: r.ideal_seconds, delta: timeDelta(r)! }))
      .sort((a, b) => b.delta - a.delta),
    deficit: {
      fixable_now: { C_marks: fixableC, could_have_solved_marks: fixableCould, total: fixableC + fixableCould },
      needs_practice: {
        A_marks: A.length * L,
        B_marks: B.length * L,
        unreviewed_marks: unreviewed.length * L,
        total: (A.length + B.length + unreviewed.length) * L,
      },
      over_time_extra_minutes: round1(extraSeconds / 60),
      parts,
    },
    top_fixes,
  }
}
