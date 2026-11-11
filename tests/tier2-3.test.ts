import { describe, expect, it } from 'vitest'
import { schedule } from '../shared/flashcards'
import { errorClass, isRepeat } from '../shared/practice'

const t = (type_tap: number | null, approach_tap: number | null) => ({ type_tap, approach_tap, type_answer: 0, approach_answer: 1 })

describe('practice A/B/C', () => {
  it('tap 1 wrong → A, tap 1 right + tap 2 wrong → B, both right → C', () => {
    expect(errorClass(t(2, null))).toBe('A')
    expect(errorClass(t(0, 0))).toBe('B')
    expect(errorClass(t(0, 1))).toBe('C')
    expect(errorClass(t(null, null))).toBe('pending')
    expect(errorClass(t(0, null))).toBe('pending')
  })
  it('repeat = same error in the last 10 attempts of the topic', () => {
    const earlier = (n: number, cls: string) => [...Array(n).fill({ error_class: null }), { error_class: cls }]
    expect(isRepeat('B', earlier(0, 'B'))).toBe(true)
    expect(isRepeat('B', earlier(9, 'B'))).toBe(true) // 10th attempt back
    expect(isRepeat('B', earlier(10, 'B'))).toBe(false) // 11th: outside the window
    expect(isRepeat('B', earlier(0, 'A'))).toBe(false)
  })
})

describe('flashcards: 1, 2, 4, 8 days; wrong → tomorrow', () => {
  it('doubles on each right answer and stays at 8', () => {
    let s = 0
    const days = [1, 2, 3, 4, 5].map(() => { const r = schedule(s, true); s = r.streak; return r.dueInDays })
    expect(days).toEqual([1, 2, 4, 8, 8])
  })
  it('wrong → due tomorrow and the intervals restart', () => {
    expect(schedule(3, false)).toEqual({ streak: 0, dueInDays: 1 })
    expect(schedule(0, true)).toEqual({ streak: 1, dueInDays: 1 })
  })
})

import { autoTitle, detectKind } from '../shared/note-input'
describe('new note: text or link is detected', () => {
  it('a lone URL is a link; anything else is text', () => {
    expect(detectKind('https://youtu.be/abc')).toBe('link')
    expect(detectKind('  www.example.com/notes  ')).toBe('link')
    expect(detectKind('see https://example.com for more')).toBe('text')
    expect(detectKind('Area = ½ × b × h')).toBe('text')
    expect(detectKind('   ')).toBe('empty')
  })
  it('titles itself when left blank', () => {
    expect(autoTitle('link', 'https://www.example.com/triangles/')).toBe('example.com/triangles')
    expect(autoTitle('text', 'Triangles: Area Formulas\nmore')).toBe('Triangles: Area Formulas')
    expect(autoTitle('file', '', 'lecture-5.jpg')).toBe('lecture-5')
  })
})
