// Full-length mocks: a score per section. Each row's section comes from its topic; the same scoring rules apply.
import { analyse, type QuestionRow } from './analysis'
import { sectionOf, SECTION_NAMES, type Section } from './topics'

export const CAT_ORDER: Section[] = ['VARC', 'DILR', 'Quant'] // order of sections in the CAT paper

export interface SectionScore { section: Section; questions: number; right: number; wrong: number; skipped: number; score: number; reachable: number; max: number }

export function sectionBreakdown(rows: QuestionRow[], hasTimeData: boolean): SectionScore[] {
  return CAT_ORDER.filter((s) => SECTION_NAMES.includes(s)).flatMap((section) => {
    const part = rows.filter((r) => sectionOf(r.topic) === section)
    if (!part.length) return []
    const a = analyse(part, hasTimeData)
    return [{ section, questions: part.length, right: a.counts.correct, wrong: a.counts.incorrect, skipped: a.counts.skipped, score: a.score, reachable: a.reachable_score, max: a.max_score }]
  })
}
