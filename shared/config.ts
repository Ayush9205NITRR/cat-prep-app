// Every number the analysis uses lives here.
export const CONFIG = {
  /** Marks for a correct answer. */
  MARKS_CORRECT: 3,
  /** Marks taken off for a wrong answer (entered as a positive number). */
  MARKS_WRONG: 1,
  /** Marks lost by a wrong answer compared with getting it right: +3 missed and −1 taken. */
  LOSS_PER_WRONG: 4,
  /** Marks lost by a skip you could have solved: the +3 you did not take. */
  LOSS_PER_COULD_HAVE_SOLVED: 3,
  /**
   * Only used to rank over-time minutes against marks when picking the top 3 fixes.
   * CAT gives about 2 minutes per question for 3 marks, so one minute is worth about 1.5 marks.
   */
  RANK_MARKS_PER_EXTRA_MINUTE: 1.5,
  /** How many fixes to show. */
  TOP_FIXES: 3,
} as const
