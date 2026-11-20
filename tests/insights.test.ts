import { describe, expect, it } from 'vitest'
import { estimatePercentile, heatLevel, isStubborn, quadrantOf, streakStats } from '../shared/insights'

const row = (o: Partial<any>) => ({ q_no: 1, topic: 'Averages', text: 'x', options: ['a', 'b', 'c', 'd'], correct_index: 0, chosen_index: 0, seconds: 60, ideal_seconds: 90,
  type_options: [], type_answer: 0, approach_options: [], approach_answer: 0, solution_notes: '', type_tap: null, approach_tap: null, resolve_index: null, resolve_seconds: null, ...o }) as any

describe('streak & heatmap', () => {
  it('counts the current run ending today, and the best run', () => {
    const s = streakStats({ '2026-11-01': 3, '2026-11-02': 1, '2026-11-03': 5, '2026-11-18': 2, '2026-11-19': 4, '2026-11-20': 12 }, '2026-11-20')
    expect([s.current, s.best, s.today]).toEqual([3, 3, 12])
    expect(s.grid).toHaveLength(28)
    expect(s.grid[27]).toEqual({ date: '2026-11-20', count: 12 })
    expect(s.grid[0].date).toBe('2026-10-24')
  })
  it('keeps the streak alive if only yesterday is done; breaks after a gap', () => {
    expect(streakStats({ '2026-11-18': 1, '2026-11-19': 1 }, '2026-11-20').current).toBe(2)
    expect(streakStats({ '2026-11-18': 1 }, '2026-11-20').current).toBe(0)
    expect(streakStats({ '2026-11-30': 1, '2026-12-01': 1 }, '2026-12-01').current).toBe(2) // across a month
    expect(streakStats({}, '2026-11-20')).toMatchObject({ current: 0, best: 0, today: 0 })
  })
  it('heat levels', () => expect([0, 1, 5, 8, 10].map((n) => heatLevel(n))).toEqual([0, 1, 2, 3, 4]))
})

describe('CAT percentile band', () => {
  it('higher scores give higher bands; full mock 45% ≈ 99', () => {
    const a = estimatePercentile(30, 198, 'Full')!, b = estimatePercentile(89, 198, 'Full')!
    expect(a.estimate).toBeLessThan(b.estimate)
    expect(b.estimate).toBeCloseTo(99, 0)
    expect(b.low).toBeLessThanOrEqual(b.estimate); expect(b.high).toBeLessThanOrEqual(100)
  })
  it('is monotonic, clamps negatives, and is null for topic tests', () => {
    let last = -1
    for (let s = -10; s <= 66; s += 3) { const e = estimatePercentile(s, 66, 'Quant')!.estimate; expect(e).toBeGreaterThanOrEqual(last); last = e }
    expect(estimatePercentile(-5, 66, 'Quant')!.estimate).toBe(0)
    expect(estimatePercentile(10, 30, null)).toBeNull()
  })
})

describe('speed vs accuracy quadrant', () => {
  it('classifies the four corners and skips untimed or skipped', () => {
    expect(quadrantOf(row({}))).toBe('fast_right')
    expect(quadrantOf(row({ seconds: 120 }))).toBe('slow_right')
    expect(quadrantOf(row({ chosen_index: 2 }))).toBe('fast_wrong')
    expect(quadrantOf(row({ chosen_index: 2, seconds: 200 }))).toBe('slow_wrong')
    expect(quadrantOf(row({ seconds: 90 }))).toBe('fast_right') // exactly ideal = fast
    expect(quadrantOf(row({ chosen_index: null }))).toBeNull()
    expect(quadrantOf(row({ seconds: null }))).toBeNull()
  })
})

describe('stubborn / leech', () => {
  it('3+ misses or 2+ repeats', () => {
    expect(isStubborn({ missed: 2 })).toBe(false)
    expect(isStubborn({ missed: 3 })).toBe(true)
    expect(isStubborn({ missed: 1, repeats: 2 })).toBe(true)
    expect(isStubborn({ missed: 2, repeats: 1 })).toBe(false)
  })
})

import { fuzzyScore } from '../shared/insights'
describe('command palette fuzzy match', () => {
  it('matches substrings first, then letters in order', () => {
    expect(fuzzyScore('time', 'Time & Work')).toBeGreaterThan(fuzzyScore('time', 'TSD - Relative Speed'))
    expect(fuzzyScore('tsdbs', 'TSD - Boats & Streams')).toBeGreaterThan(0)
    expect(fuzzyScore('xyz', 'Averages')).toBe(-1)
    expect(fuzzyScore('pnc', 'Permutation & Combination')).toBeGreaterThan(fuzzyScore('pnc', 'Para Jumbles'))
  })
})
