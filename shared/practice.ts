// Tier 2 rules: A/B/C from the two taps after a wrong answer, and repeat errors. Plain code, no AI.
import type { Abc } from './analysis'
import { CONFIG } from './config'

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** A/B/C for a wrong answer, or 'pending' until the needed taps are in. */
export function errorClass(t: { type_tap: number | null; type_answer: number; approach_tap: number | null; approach_answer: number }): Abc | 'pending' {
  if (t.type_tap === null) return 'pending'
  if (t.type_tap !== t.type_answer) return 'A'
  if (t.approach_tap === null) return 'pending'
  return t.approach_tap !== t.approach_answer ? 'B' : 'C'
}

/**
 * Repeat = the same topic had the same error in its last REPEAT_WINDOW attempts.
 * `earlier` = that topic's attempts before this one, newest first.
 */
export function isRepeat(error: Abc, earlier: { error_class: string | null }[]): boolean {
  return earlier.slice(0, CONFIG.REPEAT_WINDOW).some((a) => a.error_class === error)
}
