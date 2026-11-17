// Tier 3: flashcards due on a doubling schedule (1, 2, 4, 8 days); wrong → tomorrow.
import { CONFIG } from './config'

export const CLICK_TYPES = ['example', 'formula', 'diagram', 'shortcut', 'analogy'] as const
export type ClickType = (typeof CLICK_TYPES)[number]

/** `streak` = right answers in a row so far. Returns the new streak and days until the card is due again. */
export function schedule(streak: number, right: boolean): { streak: number; dueInDays: number } {
  if (!right) return { streak: 0, dueInDays: CONFIG.FLASHCARD_WRONG_DAYS }
  const I = CONFIG.FLASHCARD_INTERVALS
  return { streak: streak + 1, dueInDays: I[Math.min(streak, I.length - 1)] }
}

// ---------- Four grades (keyboard 1–4): Again / Hard / Good / Easy ----------
export const GRADES = ['again', 'hard', 'good', 'easy'] as const
export type Grade = (typeof GRADES)[number]
/**
 * Again → back today (again in this session, streak resets) · Hard → tomorrow (streak kept)
 * Good → next step of the 1, 2, 4, 8-day ladder · Easy → skips a step. So the four buttons always differ
 * (a new card: Today / Tomorrow / 2d / 4d).
 */
export function scheduleGrade(streak: number, grade: Grade): { streak: number; dueInDays: number } {
  const I = CONFIG.FLASHCARD_INTERVALS
  const step = (n: number) => I[Math.min(n, I.length - 1)]
  if (grade === 'again') return { streak: 0, dueInDays: 0 }
  if (grade === 'hard') return { streak, dueInDays: CONFIG.FLASHCARD_WRONG_DAYS }
  if (grade === 'good') return { streak: streak + 1, dueInDays: step(streak + 1) }
  return { streak: streak + 2, dueInDays: step(streak + 2) }
}
export const intervalLabel = (days: number) => (days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`)
