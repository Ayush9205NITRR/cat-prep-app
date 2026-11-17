import { describe, expect, it } from 'vitest'
import { intervalLabel, scheduleGrade } from '../shared/flashcards'
import { planSession } from '../shared/session'
import { topTopicsToDrill } from '../shared/drill'
import type { QuestionRow } from '../shared/analysis'

describe('flashcard grades: the four buttons always differ', () => {
  it('a new card: Today / Tomorrow / 2d / 4d', () => {
    expect((['again', 'hard', 'good', 'easy'] as const).map((g) => intervalLabel(scheduleGrade(0, g).dueInDays))).toEqual(['Today', 'Tomorrow', '2d', '4d'])
  })
  it('Good climbs 2 → 4 → 8 and stays; Again resets; Hard keeps the streak', () => {
    let s = 0; const days: number[] = []
    for (let i = 0; i < 4; i++) { const r = scheduleGrade(s, 'good'); s = r.streak; days.push(r.dueInDays) }
    expect(days).toEqual([2, 4, 8, 8])
    expect(scheduleGrade(3, 'again')).toEqual({ streak: 0, dueInDays: 0 })
    expect(scheduleGrade(3, 'hard')).toEqual({ streak: 3, dueInDays: 1 })
    expect(scheduleGrade(1, 'easy').dueInDays).toBe(8)
  })
})

describe("today's session plan", () => {
  it('fills 30 minutes: cards (≤40%), then retest, then a drill on the weakest topic', () => {
    const p = planSession(30, { due: 50, open: 3, weakest: { topic: 'Time & Work', questions: 20 } })
    expect(p.blocks.map((b) => [b.kind, b.count])).toEqual([['cards', 24], ['retest', 3], ['drill', 5]])
    expect(p.blocks.reduce((n, b) => n + b.minutes, 0)).toBeLessThanOrEqual(30)
  })
  it('skips blocks with nothing to do and never asks for questions that do not exist', () => {
    expect(planSession(15, { due: 0, open: 0 }).blocks).toEqual([])
    const p = planSession(60, { due: 2, open: 0, weakest: { topic: 'Averages', questions: 3 } })
    expect(p.blocks.map((b) => [b.kind, b.count])).toEqual([['cards', 2], ['drill', 3]])
  })
})

describe('top 3 topics to drill next', () => {
  const r = (topic: string, chosen: number | null, seconds = 50): QuestionRow => ({
    q_no: 1, topic, text: 't', options: ['a', 'b'], correct_index: 0, chosen_index: chosen, seconds, ideal_seconds: 60,
    type_options: [], type_answer: -1, approach_options: [], approach_answer: -1, solution_notes: '', type_tap: null, approach_tap: null, resolve_index: null, resolve_seconds: null,
  })
  it('ranks by marks lost, then by extra time; ignores clean topics', () => {
    const rows = [r('Averages', 1), r('Averages', 1), r('Triangles', 1), r('Probability', null), r('Logarithms', 0, 200), r('Circles', 0)]
    expect(topTopicsToDrill(rows, true).map((t) => [t.topic, t.marks_lost, t.extra_seconds])).toEqual([['Averages', 8, 0], ['Triangles', 4, 0], ['Probability', 3, 0]])
    expect(topTopicsToDrill([r('Logarithms', 0, 200), r('Circles', 0)], true)).toEqual([{ topic: 'Logarithms', marks_lost: 0, extra_seconds: 140, wrong: 0, slow: 1, skipped: 0 }])
  })
})

import { initCalc, press } from '../shared/calculator'
describe('CAT basic calculator', () => {
  const run = (keys: string[]) => keys.reduce(press, initCalc()).display
  it('does immediate-execution arithmetic like the exam calculator', () => {
    expect(run(['1', '2', '+', '3', '×', '2', '='])).toBe('30')   // (12 + 3) × 2, left to right
    expect(run(['2', '0', '0', '+', '1', '0', '%', '='])).toBe('220')
    expect(run(['8', '1', '√'])).toBe('9')
    expect(run(['1', '÷', '3', '='])).toBe('0.333333333333')
    expect(run(['5', '÷', '0', '='])).toBe('Error')
    expect(run(['7', 'MS', 'C', '3', '+', 'MR', '='])).toBe('10')
    expect(run(['1', '2', '3', '←'])).toBe('12')
  })
})
