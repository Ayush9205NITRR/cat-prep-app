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

  // ---- Tier 2: practice ----
  /** A wrong answer is a "repeat" if the same topic had the same error (A/B/C) in this many earlier attempts. */
  REPEAT_WINDOW: 10,
  /** get_topic_history returns this many attempts. */
  HISTORY_SIZE: 20,

  // ---- Tier 3: flashcards ----
  /** Days until the next review after each right answer in a row; stays at the last value after that. */
  FLASHCARD_INTERVALS: [1, 2, 4, 8],
  /** A wrong answer brings the card back after this many days and restarts the intervals. */
  FLASHCARD_WRONG_DAYS: 1,
  /** "Today" for due cards, in the students' time zone. */
  TIME_ZONE: 'Asia/Kolkata',
} as const
