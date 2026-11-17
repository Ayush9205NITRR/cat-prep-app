import { describe, expect, it } from 'vitest'
import { mistakesFrom, type HistoryRow } from '../shared/mistakes'
import { majoritySection, sectionOf, SECTIONS, topicsIn, TOPICS } from '../shared/topics'

let n = 0
const row = (p: Partial<HistoryRow>): HistoryRow => ({
  id: ++n, mock_id: 1, mock_name: 'T', mock_created_at: '2026-11-12T10:00:00Z', has_time_data: true, practice_question_id: 7,
  q_no: 1, topic: 'Triangles', text: 'q', options: ['a', 'b', 'c'], correct_index: 0, chosen_index: 1, seconds: 50, ideal_seconds: 60,
  type_options: ['x', 'y', 'z'], type_answer: 0, approach_options: ['x', 'y', 'z'], approach_answer: 0, solution_notes: '',
  type_tap: null, approach_tap: null, resolve_index: null, resolve_seconds: null, ...p,
})
const at = (h: number) => `2026-11-12T${String(h).padStart(2, '0')}:00:00Z`

describe('sections', () => {
  it('all 46 topics are in exactly one section', () => {
    expect(TOPICS.length).toBe(46)
    expect(TOPICS.filter((t) => sectionOf(t)).length).toBe(46)
    expect(sectionOf('Games & Tournaments')).toBe('DILR')
    expect(sectionOf('Odd One Out')).toBe('VARC')
    expect(sectionOf('Data Sufficiency')).toBe('DILR')
    expect(sectionOf('Para Jumbles')).toBe('VARC')
    expect(sectionOf('Triangles')).toBe('Quant')
    expect(Object.keys(SECTIONS.DILR)).toEqual(['Data Interpretation', 'Data Sufficiency', 'Logical Reasoning'])
    expect(topicsIn({ section: 'Quant', area: 'Geometry' })).toHaveLength(5)
  })
  it('save_mock without a section uses the section most rows belong to', () => {
    expect(majoritySection(['Reading Comprehension', 'Para Jumbles', 'Triangles'])).toBe('VARC')
  })
})

describe('mistake status', () => {
  it('Open until retested', () => {
    expect(mistakesFrom([row({})])[0].status).toBe('Open')
  })
  it('Fixed when answered right within ideal time in a later test', () => {
    expect(mistakesFrom([row({ mock_created_at: at(10) }), row({ mock_created_at: at(11), chosen_index: 0, seconds: 55 })])[0].status).toBe('Fixed')
  })
  it('right but over ideal time stays Open', () => {
    expect(mistakesFrom([row({ mock_created_at: at(10) }), row({ mock_created_at: at(11), chosen_index: 0, seconds: 90 })])[0].status).toBe('Open')
  })
  it('Repeated when wrong again; the latest answer wins', () => {
    const wrong = [row({ mock_created_at: at(10) }), row({ mock_created_at: at(11), chosen_index: 2, type_tap: 0, approach_tap: 1 })]
    const m = mistakesFrom(wrong)[0]
    expect(m.status).toBe('Repeated'); expect(m.error).toBe('B'); expect(m.times_wrong).toBe(2)
    expect(mistakesFrom([...wrong, row({ mock_created_at: at(12), chosen_index: 0, seconds: 30 })])[0].status).toBe('Fixed')
  })
  it('a right, in-time answer is not a mistake; over time is', () => {
    expect(mistakesFrom([row({ chosen_index: 0 })])).toHaveLength(0)
    expect(mistakesFrom([row({ chosen_index: 0, seconds: 99 })])[0].error).toBe('not reviewed')
  })
})

import { resolveTopic } from '../shared/topics'
describe('topic names from Claude (Fix 10.1)', () => {
  it('accepts exact and loosely written names', () => {
    expect(resolveTopic('Time & Work')).toEqual({ topic: 'Time & Work' })
    expect(resolveTopic('time and work')).toEqual({ topic: 'Time & Work' })
    expect(resolveTopic('  reading   comprehension ')).toEqual({ topic: 'Reading Comprehension' })
  })
  it('suggests the 3 closest for a bad name', () => {
    const r = resolveTopic('Trianglez') as { suggestions: string[] }
    expect(r.suggestions).toHaveLength(3); expect(r.suggestions[0]).toBe('Triangles')
    expect(resolveTopic('Profit and loss')).toEqual({ topic: 'Profit & Loss' })
  })
})

import { mockSectionOf } from '../shared/topics'
describe('full-length mocks', () => {
  it('a paper spanning sections is Full; a sectional stays its section', () => {
    const full = [...Array(8).fill('Reading Comprehension'), ...Array(6).fill('Arrangements'), ...Array(8).fill('Time & Work')]
    expect(mockSectionOf(full)).toBe('Full')
    expect(mockSectionOf([...Array(20).fill('Averages'), 'Para Jumbles'])).toBe('Quant')
    expect(mockSectionOf(['Averages', 'Para Jumbles', 'Tables'])).not.toBe('Full') // too few rows to call it full-length
  })
  it('new topics resolve for Claude', () => {
    expect(resolveTopic('games and tournaments')).toEqual({ topic: 'Games & Tournaments' })
    expect(resolveTopic('para summary')).toEqual({ topic: 'Para Summary' })
  })
})

import { sectionBreakdown } from '../shared/sections-report'
import { analyse } from '../shared/analysis'
describe('sectional breakdown', () => {
  it('splits a full-length mock by section and the parts add up to the total', () => {
    const rows = [
      row({ topic: 'Reading Comprehension', chosen_index: 0 }), row({ topic: 'Reading Comprehension', chosen_index: 1 }),
      row({ topic: 'Arrangements', chosen_index: 0 }), row({ topic: 'Tables', chosen_index: null }),
      row({ topic: 'Averages', chosen_index: 0 }), row({ topic: 'Averages', chosen_index: 0 }),
    ]
    const b = sectionBreakdown(rows, true)
    expect(b.map((x) => x.section)).toEqual(['VARC', 'DILR', 'Quant'])
    expect(b.map((x) => x.score)).toEqual([2, 3, 6])
    expect(b.reduce((n, x) => n + x.score, 0)).toBe(analyse(rows, true).score)
  })
})

describe('mistake de-duplication', () => {
  const long = 'A can finish a job in 12 days and B in 18 days. How many more days?'
  it('the same question in a mock and in two later tests is ONE mistake (Missed 2× · Fixed 1×)', () => {
    const rows = [
      row({ mock_created_at: at(9), practice_question_id: null, text: long }),             // mock row, no saved question
      row({ mock_created_at: at(10), practice_question_id: 50, text: long }),              // test: wrong again
      row({ mock_created_at: at(11), practice_question_id: 50, text: long, chosen_index: 0, seconds: 40 }), // retest: right in time
    ]
    const m = mistakesFrom(rows)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ times_wrong: 2, times_fixed: 1, status: 'Fixed', practice_question_id: 50 })
    expect(m[0].row_ids).toHaveLength(3)
  })
  it('short one-line texts never merge different questions', () => {
    const m = mistakesFrom([row({ practice_question_id: null, text: 'Q3' }), row({ practice_question_id: null, text: 'Q3', mock_id: 2 })])
    expect(m).toHaveLength(2)
  })
  it('same text in different topics stays separate', () => {
    expect(mistakesFrom([row({ practice_question_id: null, text: long }), row({ practice_question_id: null, text: long, topic: 'Averages' })])).toHaveLength(2)
  })
})
