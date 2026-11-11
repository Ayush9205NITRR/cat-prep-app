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
