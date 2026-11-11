import { z } from 'zod'
import type { Abc } from '../../shared/analysis'
import { CONFIG } from '../../shared/config'
import { DIFFICULTIES, errorClass, isRepeat } from '../../shared/practice'
import { TOPICS } from '../../shared/topics'
import { q } from './db'

// ---------- shapes ----------
const three = z.array(z.string().min(1)).length(3)

export const QuestionInput = {
  topic: z.string().min(1).max(60).describe('A topic from the list in the instructions'),
  difficulty: z.enum(DIFFICULTIES),
  text: z.string().min(1),
  options: z.array(z.string()).min(2).max(10),
  correct_index: z.number().int().min(0),
  ideal_seconds: z.number().int().min(1),
  type_options: three,
  type_answer: z.number().int().min(0).max(2),
  approach_options: three,
  approach_answer: z.number().int().min(0).max(2),
  solution_notes: z.string(),
  hints: z.array(z.string().min(1)).max(5).describe('1–3, gentle first'),
  source: z.string().max(200).optional(),
}
const QuestionObject = z.object(QuestionInput)
export type QuestionInput = z.infer<typeof QuestionObject>
export const QuestionPatch = QuestionObject.partial().strict()

export interface PracticeQuestion extends QuestionInput {
  id: number
  created_at: string
}

const COLS = `id, topic, difficulty, text, options, correct_index, ideal_seconds, type_options, type_answer,
  approach_options, approach_answer, solution_notes, hints, source, created_at`

/** What a student may see while solving: no answer, solution, type/approach answers or hints. */
export function forSolving(x: PracticeQuestion) {
  return { question_id: x.id, topic: x.topic, difficulty: x.difficulty, text: x.text, options: x.options, ideal_seconds: x.ideal_seconds }
}

export function problems(x: Partial<QuestionInput>): string[] {
  if (x.options && x.correct_index !== undefined && x.correct_index >= x.options.length) return ['correct_index is outside options']
  return []
}

// ---------- questions ----------
export async function saveQuestion(userId: number, x: QuestionInput): Promise<number> {
  const [r] = await q<{ id: number }>(
    `INSERT INTO practice_questions (user_id, topic, difficulty, text, options, correct_index, ideal_seconds, type_options,
       type_answer, approach_options, approach_answer, solution_notes, hints, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [userId, x.topic, x.difficulty, x.text, JSON.stringify(x.options), x.correct_index, x.ideal_seconds,
      JSON.stringify(x.type_options), x.type_answer, JSON.stringify(x.approach_options), x.approach_answer,
      x.solution_notes, JSON.stringify(x.hints), x.source ?? ''],
  )
  return r.id
}

export async function getQuestion(userId: number, id: number) {
  const [x] = await q<PracticeQuestion>(`SELECT ${COLS} FROM practice_questions WHERE id = $1 AND user_id = $2`, [id, userId])
  return x ?? null
}

export async function listQuestions(userId: number) {
  return q(
    `SELECT p.id, p.topic, p.difficulty, p.text, p.source, p.created_at,
       count(a.id)::int AS attempts, count(a.id) FILTER (WHERE a.correct)::int AS right_attempts,
       (array_agg(a.correct ORDER BY a.created_at DESC))[1] AS last_correct
     FROM practice_questions p LEFT JOIN attempts a ON a.question_id = p.id
     WHERE p.user_id = $1 GROUP BY p.id ORDER BY p.topic, p.difficulty, p.id`,
    [userId],
  )
}

export async function updateQuestion(userId: number, id: number, patch: z.infer<typeof QuestionPatch>) {
  if (patch.topic !== undefined && !TOPICS.includes(patch.topic as any)) return { problems: ['Unknown topic'] }
  const cur = await getQuestion(userId, id)
  if (!cur) return null
  const merged = { ...cur, ...patch }
  const p = problems(merged)
  if (p.length) return { problems: p }
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (keys.length) {
    const json = new Set(['options', 'type_options', 'approach_options', 'hints'])
    const vals = keys.map((k) => (json.has(k) ? JSON.stringify(patch[k]) : patch[k]))
    await q(`UPDATE practice_questions SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND user_id = $2`, [id, userId, ...vals])
  }
  return { question: await getQuestion(userId, id) }
}

export async function deleteQuestion(userId: number, id: number) {
  const r = await q('DELETE FROM practice_questions WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
  return r.length === 1
}

/**
 * Next question for a topic (and difficulty, if given): never tried first, then ones last answered
 * wrong, then the one practised longest ago. Returned without answer, solution or hints.
 */
export async function nextQuestion(userId: number, topic: string, difficulty?: string, excludeId?: number) {
  const [x] = await q<PracticeQuestion>(
    `SELECT ${COLS.split(',').map((c) => 'p.' + c.trim()).join(', ')}
     FROM practice_questions p
     LEFT JOIN LATERAL (SELECT correct, created_at FROM attempts a WHERE a.question_id = p.id ORDER BY created_at DESC LIMIT 1) last ON true
     WHERE p.user_id = $1 AND p.topic = $2 AND ($3::text IS NULL OR p.difficulty = $3) AND ($4::int IS NULL OR p.id <> $4)
     ORDER BY (last.created_at IS NULL) DESC, (last.correct = false) DESC, last.created_at ASC NULLS FIRST, p.id
     LIMIT 1`,
    [userId, topic, difficulty ?? null, excludeId ?? null],
  )
  return x ?? null
}

// ---------- attempts ----------
export interface Attempt {
  id: number
  question_id: number
  topic: string
  chosen_index: number
  correct: boolean
  seconds: number
  type_tap: number | null
  approach_tap: number | null
  error_class: Abc | null
  repeat: boolean | null
  created_at: string
}
const A_COLS = 'id, question_id, topic, chosen_index, correct, seconds, type_tap, approach_tap, error_class, repeat, created_at'

/** Saves an attempt. Taps are optional; with them a wrong answer gets A/B/C and the repeat check. */
export async function submitAnswer(
  userId: number,
  questionId: number,
  chosen: number,
  seconds: number,
  taps?: { type_tap?: number | null; approach_tap?: number | null },
) {
  const x = await getQuestion(userId, questionId)
  if (!x) return null
  if (chosen >= x.options.length) return { problems: ['chosen_index is outside options'] }
  const correct = chosen === x.correct_index
  const [a] = await q<Attempt>(
    `INSERT INTO attempts (user_id, question_id, topic, chosen_index, correct, seconds) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${A_COLS}`,
    [userId, questionId, x.topic, chosen, correct, seconds],
  )
  const attempt = !correct && taps && taps.type_tap != null ? await setTaps(userId, a.id, taps.type_tap, taps.approach_tap ?? null) : a
  return { attempt: attempt as Attempt, question: x }
}

/** The two taps after a wrong answer → A/B/C and whether the same error happened in this topic's last 10 attempts. */
export async function setTaps(userId: number, attemptId: number, typeTap: number | null, approachTap: number | null) {
  const [a] = await q<Attempt & { type_answer: number; approach_answer: number; created_at: string }>(
    `SELECT a.id, a.topic, a.correct, a.created_at, p.type_answer, p.approach_answer
     FROM attempts a JOIN practice_questions p ON p.id = a.question_id WHERE a.id = $1 AND a.user_id = $2`,
    [attemptId, userId],
  )
  if (!a) return null
  if (a.correct) return { problems: ['Taps are only for wrong answers'] }
  const cls = errorClass({ type_tap: typeTap, type_answer: a.type_answer, approach_tap: typeTap !== a.type_answer ? null : approachTap, approach_answer: a.approach_answer })
  let repeat: boolean | null = null
  if (cls !== 'pending') {
    const earlier = await q<{ error_class: string | null }>(
      `SELECT error_class FROM attempts WHERE user_id = $1 AND topic = $2 AND id <> $3 AND created_at <= $4
       ORDER BY created_at DESC, id DESC LIMIT $5`,
      [userId, a.topic, attemptId, a.created_at, CONFIG.REPEAT_WINDOW],
    )
    repeat = isRepeat(cls, earlier)
  }
  const [u] = await q<Attempt>(
    `UPDATE attempts SET type_tap = $2, approach_tap = $3, error_class = $4, repeat = $5 WHERE id = $1 RETURNING ${A_COLS}`,
    [attemptId, typeTap, cls === 'A' ? null : approachTap, cls === 'pending' ? null : cls, repeat],
  )
  return u
}

export async function topicHistory(userId: number, topic: string) {
  const attempts = await q<Attempt & { text: string; difficulty: string }>(
    `SELECT a.id, a.question_id, a.topic, a.chosen_index, a.correct, a.seconds, a.type_tap, a.approach_tap, a.error_class,
       a.repeat, a.created_at, p.text, p.difficulty, p.ideal_seconds
     FROM attempts a JOIN practice_questions p ON p.id = a.question_id
     WHERE a.user_id = $1 AND a.topic = $2 ORDER BY a.created_at DESC, a.id DESC LIMIT $3`,
    [userId, topic, CONFIG.HISTORY_SIZE],
  )
  const wrong = attempts.filter((a) => !a.correct)
  const count = (k: string) => wrong.filter((a) => a.error_class === k).length
  return {
    topic,
    attempts: attempts.length,
    right: attempts.length - wrong.length,
    errors: { A: count('A'), B: count('B'), C: count('C'), not_tapped: wrong.filter((a) => !a.error_class).length, repeats: wrong.filter((a) => a.repeat).length },
    history: attempts,
  }
}
