// Today's Session: the plan and progress live in sessionStorage (this tab only) so the
// flashcard and test pages can hand over to the next block. Works without storage too (one block).
import type { SessionPlan } from '../shared/session'

export interface SessionState { plan: SessionPlan; step: number; results: { kind: string; mock_id?: number; note?: string }[] }
const KEY = 'todays-session'

export function readSession(): SessionState | null {
  try { const s = sessionStorage.getItem(KEY); return s ? JSON.parse(s) : null } catch { return null }
}
function write(s: SessionState | null) {
  try { s ? sessionStorage.setItem(KEY, JSON.stringify(s)) : sessionStorage.removeItem(KEY) } catch { /* private mode */ }
}

export function stepRoute(s: SessionState): string {
  const b = s.plan.blocks[s.step]
  if (!b) return '/session/done'
  if (b.kind === 'cards') return `/flashcards?limit=${b.count}&session=1`
  if (b.kind === 'retest') return `/test?retest=1&limit=${b.count}&session=1`
  return `/test?topic=${encodeURIComponent(b.topic!)}&count=${b.count}&session=1`
}

export function startSession(plan: SessionPlan): string {
  const s = { plan, step: 0, results: [] }
  write(s)
  return stepRoute(s)
}

/** Marks the current block done and returns where to go next. */
export function advanceSession(result: { kind: string; mock_id?: number; note?: string }): string {
  const s = readSession()
  if (!s) return '/'
  const next = { ...s, step: s.step + 1, results: [...s.results, result] }
  write(next)
  return stepRoute(next)
}

export const endSession = () => write(null)
export const BLOCK_LABEL = { cards: 'Due flashcards', retest: 'Retest open mistakes', drill: 'Weakest-topic drill' } as const
