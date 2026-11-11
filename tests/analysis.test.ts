import { describe, expect, it } from 'vitest'
import { analyse, abcOf, bucketOf, type QuestionRow } from '../shared/analysis'
import { SAMPLE_ROWS } from '../shared/sample-mock'

function row(p: Partial<QuestionRow>): QuestionRow {
  return {
    q_no: 1, topic: 'Averages', text: 'q', options: ['a', 'b', 'c', 'd'], correct_index: 0, chosen_index: 0,
    seconds: null, ideal_seconds: 60, type_options: ['t0', 't1', 't2'], type_answer: 0,
    approach_options: ['p0', 'p1', 'p2'], approach_answer: 0, solution_notes: '',
    type_tap: null, approach_tap: null, resolve_index: null, resolve_seconds: null, ...p,
  }
}

describe('brief sample: 12 correct, 6 wrong (A 2, B 1, C 3), 2 could-have-solved', () => {
  const rows: QuestionRow[] = [
    ...Array.from({ length: 12 }, (_, i) => row({ q_no: i + 1 })),
    row({ q_no: 13, chosen_index: 1, type_tap: 1 }), // A
    row({ q_no: 14, chosen_index: 1, type_tap: 2 }), // A
    row({ q_no: 15, chosen_index: 1, type_tap: 0, approach_tap: 1 }), // B
    row({ q_no: 16, chosen_index: 1, type_tap: 0, approach_tap: 0 }), // C
    row({ q_no: 17, chosen_index: 2, type_tap: 0, approach_tap: 0 }), // C
    row({ q_no: 18, chosen_index: 3, type_tap: 0, approach_tap: 0 }), // C
    row({ q_no: 19, chosen_index: null, resolve_index: 0, resolve_seconds: 50 }),
    row({ q_no: 20, chosen_index: null, resolve_index: 0, resolve_seconds: 60 }), // exactly ideal counts
  ]
  const r = analyse(rows, false)

  it('score 30, reachable 48', () => {
    expect(r.score).toBe(30)
    expect(r.reachable_score).toBe(48)
  })
  it('A/B/C and buckets', () => {
    expect(r.abc).toEqual({ A: 2, B: 1, C: 3, pending: 0 })
    expect(r.buckets).toEqual({ pocket: 12, over_time: 0, incorrect: 6, could_have_solved: 2, not_solved: 0 })
  })
  it('deficit split', () => {
    expect(r.deficit.fixable_now).toEqual({ C_marks: 12, could_have_solved_marks: 6, total: 18 })
    expect(r.deficit.needs_practice).toEqual({ A_marks: 8, B_marks: 4, unreviewed_marks: 0, total: 12 })
  })
  it('top 3 fixes are the biggest parts', () => {
    expect(r.top_fixes).toHaveLength(3)
    expect(r.top_fixes[0]).toMatch(/^Careless mistakes cost 12 marks/)
    expect(r.top_fixes[1]).toMatch(/^Question type not recognised, 8 marks/)
    expect(r.top_fixes[2]).toMatch(/^Skipped but solvable, 6 marks/)
  })
  it('says the over-time bucket is skipped without time data', () => {
    expect(r.over_time_tracked).toBe(false)
    expect(r.over_time_note).toMatch(/no time per question/)
  })
})

describe('seeded sample mock', () => {
  const r = analyse(SAMPLE_ROWS, true)
  it('matches the brief numbers', () => {
    expect(r.counts).toEqual({ total: 22, correct: 12, incorrect: 6, skipped: 4 })
    expect(r.score).toBe(30)
    expect(r.reachable_score).toBe(48)
    expect(r.buckets).toEqual({ pocket: 9, over_time: 3, incorrect: 6, could_have_solved: 2, not_solved: 2 })
    expect(r.deficit.over_time_extra_minutes).toBe(3.3)
  })
})

describe('rules', () => {
  it('over time only with time data', () => {
    const r = row({ seconds: 90, ideal_seconds: 60 })
    expect(bucketOf(r, true)).toBe('over_time')
    expect(bucketOf(r, false)).toBe('pocket')
  })
  it('re-solve slower than ideal or wrong is not solved', () => {
    expect(bucketOf(row({ chosen_index: null, resolve_index: 0, resolve_seconds: 61 }), true)).toBe('not_solved')
    expect(bucketOf(row({ chosen_index: null, resolve_index: 1, resolve_seconds: 10 }), true)).toBe('not_solved')
    expect(bucketOf(row({ chosen_index: null }), true)).toBe('not_solved')
  })
  it('C only for incorrect; over time with both taps right has no letter', () => {
    expect(abcOf(row({ seconds: 90, type_tap: 0, approach_tap: 0 }), true)).toBeNull()
    expect(abcOf(row({ seconds: 90, type_tap: 0, approach_tap: 2 }), true)).toBe('B')
    expect(abcOf(row({ chosen_index: 1, type_tap: 0 }), true)).toBe('pending')
  })
  it('score = correct × 3 − incorrect × 1, skips count 0', () => {
    expect(analyse([row({}), row({ chosen_index: 2 }), row({ chosen_index: null })], false).score).toBe(2)
  })
})
