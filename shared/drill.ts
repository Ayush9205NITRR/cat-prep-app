// "Top 3 topics to drill next" on a mock report: ranked by marks lost, then by extra time. No AI.
import { bucketOf, type QuestionRow } from './analysis'
import { CONFIG } from './config'

export interface DrillTopic { topic: string; marks_lost: number; extra_seconds: number; wrong: number; slow: number; skipped: number }

export function topTopicsToDrill(rows: QuestionRow[], hasTimeData: boolean, n = 3): DrillTopic[] {
  const by = new Map<string, DrillTopic>()
  for (const r of rows) {
    const t = by.get(r.topic) ?? { topic: r.topic, marks_lost: 0, extra_seconds: 0, wrong: 0, slow: 0, skipped: 0 }
    const b = bucketOf(r, hasTimeData)
    if (b === 'incorrect') { t.wrong++; t.marks_lost += CONFIG.LOSS_PER_WRONG }
    else if (b === 'over_time') { t.slow++; t.extra_seconds += (r.seconds ?? 0) - r.ideal_seconds }
    else if (b === 'could_have_solved' || b === 'not_solved') { t.skipped++; t.marks_lost += CONFIG.LOSS_PER_COULD_HAVE_SOLVED }
    by.set(r.topic, t)
  }
  return [...by.values()]
    .filter((t) => t.marks_lost > 0 || t.extra_seconds > 0)
    .sort((a, b) => b.marks_lost - a.marks_lost || b.extra_seconds - a.extra_seconds || a.topic.localeCompare(b.topic))
    .slice(0, n)
}
