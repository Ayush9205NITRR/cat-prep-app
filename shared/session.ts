// Today's Session: one time budget → three blocks, in order. Plain arithmetic, no AI.
export const SESSION_MINUTES = [15, 30, 60] as const
/** Rough minutes per item, used only to fill the time budget. */
export const PER = { card: 0.5, retest: 2.5, drill: 2 } as const

export interface SessionPlan {
  minutes: number
  blocks: { kind: 'cards' | 'retest' | 'drill'; count: number; minutes: number; topic?: string }[]
}

/**
 * Fills the budget in order: due flashcards (at most 40% of the time), then open-mistake retest (at most 10),
 * then a drill on the weakest topic with whatever time is left (at most 15, and only questions that exist).
 */
export function planSession(minutes: number, have: { due: number; open: number; weakest?: { topic: string; questions: number } }): SessionPlan {
  let left = minutes
  const blocks: SessionPlan['blocks'] = []
  const take = (kind: 'cards' | 'retest' | 'drill', available: number, per: number, budget: number, cap: number, topic?: string) => {
    const count = Math.max(0, Math.min(available, cap, Math.floor(budget / per)))
    if (count > 0) { const m = Math.round(count * per * 10) / 10; blocks.push({ kind, count, minutes: m, ...(topic ? { topic } : {}) }); left -= m }
  }
  take('cards', have.due, PER.card, minutes * 0.4, 80)
  take('retest', have.open, PER.retest, left, 10)
  if (have.weakest) take('drill', have.weakest.questions, PER.drill, left, 15, have.weakest.topic)
  return { minutes, blocks }
}
