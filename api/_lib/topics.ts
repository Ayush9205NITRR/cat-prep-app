// FIXES round 1: topic home, mistakes, fix notes, tests and retests.
import { z } from 'zod'
import { abcOf, bucketOf, type Abc } from '../../shared/analysis'
import { CONFIG } from '../../shared/config'
import { mistakesFrom, type HistoryRow, type Mistake } from '../../shared/mistakes'
import { sectionOf, TOPICS } from '../../shared/topics'
import { db, q } from './db'
import { listNotes } from './notes'
import { forSolving, type PracticeQuestion } from './practice'
import { createMock } from './mocks'

const TODAY = `(now() AT TIME ZONE '${CONFIG.TIME_ZONE}')::date`
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.TIME_ZONE }).format(new Date())

// ---------- history and mistakes ----------
export async function historyRows(userId: number, topic?: string): Promise<HistoryRow[]> {
  return q<HistoryRow>(
    `SELECT qn.id, qn.mock_id, m.name AS mock_name, m.created_at::text AS mock_created_at, m.has_time_data, qn.practice_question_id,
       qn.q_no, qn.topic, qn.text, qn.options, qn.correct_index, qn.chosen_index, qn.seconds, qn.ideal_seconds, qn.type_options,
       qn.type_answer, qn.approach_options, qn.approach_answer, qn.solution_notes, qn.type_tap, qn.approach_tap, qn.resolve_index, qn.resolve_seconds
     FROM questions qn JOIN mocks m ON m.id = qn.mock_id
     WHERE m.user_id = $1 AND ($2::text IS NULL OR qn.topic = $2)`,
    [userId, topic ?? null],
  )
}

export interface FixNote { id: number; title: string; summary: string; fix_row_id: number }

export async function mistakesWithFixes(userId: number, topic?: string) {
  const mistakes = mistakesFrom(await historyRows(userId, topic))
  const fixes = await q<FixNote>(
    `SELECT id, title, summary, fix_row_id FROM notes WHERE user_id = $1 AND kind = 'fix' AND fix_row_id IS NOT NULL ORDER BY id DESC`,
    [userId],
  )
  return mistakes.map((m) => ({ ...m, fix: fixes.find((f) => m.row_ids.includes(f.fix_row_id)) ?? null }))
}

/** One line per topic for the section pages. */
export async function topicsSummary(userId: number) {
  const [mistakes, notes, questions, tests, due] = await Promise.all([
    mistakesWithFixes(userId),
    q<{ topic: string; n: number }>('SELECT topic, count(*)::int AS n FROM notes WHERE user_id = $1 GROUP BY topic', [userId]),
    q<{ topic: string; n: number }>('SELECT topic, count(*)::int AS n FROM practice_questions WHERE user_id = $1 GROUP BY topic', [userId]),
    q<{ topic: string; last: string }>(
      `SELECT qn.topic, to_char(max(m.taken_on), 'YYYY-MM-DD') AS last FROM questions qn JOIN mocks m ON m.id = qn.mock_id WHERE m.user_id = $1 GROUP BY qn.topic`, [userId]),
    q<{ topic: string; n: number }>(`SELECT n.topic, count(*)::int AS n FROM flashcards f JOIN notes n ON n.id = f.note_id WHERE f.user_id = $1 AND f.due_on <= ${TODAY} GROUP BY n.topic`, [userId]),
  ])
  const get = (list: { topic: string; n: number }[], t: string) => list.find((x) => x.topic === t)?.n ?? 0
  return Object.fromEntries(
    TOPICS.map((t) => {
      const ms = mistakes.filter((m) => m.topic === t)
      return [t, {
        notes: get(notes, t), questions: get(questions, t), due: get(due, t),
        open: ms.filter((m) => m.status !== 'Fixed').length, fixed: ms.filter((m) => m.status === 'Fixed').length,
        repeated: ms.filter((m) => m.status === 'Repeated').length,
        last_test: tests.find((x) => x.topic === t)?.last ?? null,
      }]
    }),
  )
}

export async function topicPage(userId: number, topic: string) {
  const [mistakes, notes, questions, due] = await Promise.all([
    mistakesWithFixes(userId, topic),
    listNotes(userId),
    q(`SELECT p.id, p.difficulty, p.text, p.source, count(qn.id)::int AS answered
       FROM practice_questions p LEFT JOIN questions qn ON qn.practice_question_id = p.id AND qn.chosen_index IS NOT NULL
       WHERE p.user_id = $1 AND p.topic = $2 GROUP BY p.id ORDER BY p.difficulty, p.id`, [userId, topic]),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM flashcards f JOIN notes n ON n.id = f.note_id WHERE f.user_id = $1 AND n.topic = $2 AND f.due_on <= ${TODAY}`, [userId, topic]),
  ])
  return {
    topic, section: sectionOf(topic),
    mistakes: mistakes.map(slimMistake),
    notes: notes.notes.filter((n: any) => n.topic === topic),
    questions,
    flashcards_due: due[0]?.n ?? 0,
    retestable: mistakes.filter((m) => m.status !== 'Fixed').length,
  }
}

function slimMistake(m: Mistake & { fix: FixNote | null }) {
  const r = m.row
  return {
    status: m.status, error: m.error, times_wrong: m.times_wrong,
    row_id: r.id, mock_id: r.mock_id, mock_name: r.mock_name, text: r.text, options: r.options,
    chosen_index: r.chosen_index, correct_index: r.correct_index, seconds: r.seconds, ideal_seconds: r.ideal_seconds,
    over_time: bucketOf(r, r.has_time_data) === 'over_time',
    fix: m.fix ? { note_id: m.fix.id, title: m.fix.title, summary: m.fix.summary } : null,
  }
}

// ---------- tag_mistake: the two taps in chat, same A/B/C and repeat rules ----------
export async function tagMistake(userId: number, rowId: number, typeTap: number, approachTap: number | null) {
  const [r] = await q<HistoryRow>(
    `SELECT qn.*, m.has_time_data, m.created_at::text AS mock_created_at FROM questions qn JOIN mocks m ON m.id = qn.mock_id WHERE qn.id = $1 AND m.user_id = $2`,
    [rowId, userId],
  )
  if (!r) return null
  const b = bucketOf(r, r.has_time_data)
  if (b !== 'incorrect' && b !== 'over_time') return { problem: 'Only wrong or over-time questions get A/B/C.' }
  if (!(r.type_options?.length === 3 && r.approach_options?.length === 3)) return { problem: 'This question has no tap options yet: call add_review_options first.' }
  const tapped = { ...r, type_tap: typeTap, approach_tap: typeTap === r.type_answer ? approachTap : null }
  const abc = abcOf(tapped, r.has_time_data)
  if (abc === 'pending') return { problem: 'Tap 1 was right, so approach_tap is needed too.' }
  await q('UPDATE questions SET type_tap = $2, approach_tap = $3 WHERE id = $1', [rowId, tapped.type_tap, tapped.approach_tap])
  let repeat = false
  if (abc) {
    // Repeat = the same error in this topic's last REPEAT_WINDOW attempts before this one.
    const earlier = (await historyRows(userId, r.topic))
      .filter((x) => x.chosen_index !== null && (x.mock_created_at < r.mock_created_at || (x.mock_created_at === r.mock_created_at && x.id < r.id)))
      .sort((a, z) => z.mock_created_at.localeCompare(a.mock_created_at) || z.id - a.id)
      .slice(0, CONFIG.REPEAT_WINDOW)
    repeat = earlier.some((x) => abcOf(x, x.has_time_data) === abc)
  }
  return { attempt_id: rowId, topic: r.topic, error_class: abc as Abc | null, repeat }
}

// ---------- save_fix: a fix note on the topic, linked to the question ----------
export const FixInput = {
  attempt_id: z.number().int().min(1).describe('From get_report: the wrong or over-time question'),
  what_went_wrong: z.string().min(1).max(1000).describe('Where exactly the thinking went wrong, in 1–3 short sentences'),
  correct_approach: z.string().min(1).max(1500).describe('The faster or correct way, briefly'),
  rule_to_remember: z.string().min(1).max(300).describe('One line the student should remember'),
  make_flashcard: z.boolean().default(true).describe('Add one flashcard: the question in one line → the rule'),
}

export async function saveFix(userId: number, x: { attempt_id: number; what_went_wrong: string; correct_approach: string; rule_to_remember: string; make_flashcard?: boolean }) {
  const [r] = await q<{ id: number; topic: string; text: string; mock_id: number }>(
    'SELECT qn.id, qn.topic, qn.text, qn.mock_id FROM questions qn JOIN mocks m ON m.id = qn.mock_id WHERE qn.id = $1 AND m.user_id = $2', [x.attempt_id, userId])
  if (!r) return null
  const oneLine = r.text.replace(/\s+/g, ' ').trim()
  const short = oneLine.length > 70 ? oneLine.slice(0, 67) + '…' : oneLine
  const summary = `**What went wrong**\n${x.what_went_wrong.trim()}\n\n**Correct approach**\n${x.correct_approach.trim()}\n\n**Rule to remember**\n${x.rule_to_remember.trim()}`
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const { rows: [n] } = await client.query(
      `INSERT INTO notes (user_id, topic, title, summary, formulas, kind, fix_row_id, source) VALUES ($1,$2,$3,$4,'[]','fix',$5,'Fix from Claude') RETURNING id`,
      [userId, r.topic, `Fix: ${short}`, summary, r.id])
    if (x.make_flashcard !== false)
      await client.query(`INSERT INTO flashcards (note_id, user_id, front, back, due_on) VALUES ($1,$2,$3,$4,${TODAY})`,
        [n.id, userId, oneLine.length > 300 ? oneLine.slice(0, 297) + '…' : oneLine, x.rule_to_remember.trim()])
    await client.query('COMMIT')
    return { note_id: n.id as number, topic: r.topic, mock_id: r.mock_id, flashcard: x.make_flashcard !== false }
  } catch (e) {
    await client.query('ROLLBACK'); throw e
  } finally { client.release() }
}

// ---------- tests and retests ----------
const NOT_SET = ['Not set yet', 'Not set yet', 'Not set yet']

/** Mistakes that are not Fixed, each with a practice question to retest (made from the mock row if needed). */
export async function prepareRetest(userId: number, topic?: string): Promise<number[]> {
  const open = (await mistakesWithFixes(userId, topic)).filter((m) => m.status !== 'Fixed')
  const ids: number[] = []
  for (const m of open) {
    let pq = m.practice_question_id
    if (!pq) {
      const r = m.row
      const [p] = await q<{ id: number }>(
        `INSERT INTO practice_questions (user_id, topic, difficulty, text, options, correct_index, ideal_seconds, type_options, type_answer,
           approach_options, approach_answer, solution_notes, hints, source)
         VALUES ($1,$2,'medium',$3,$4,$5,$6,$7,$8,$9,$10,$11,'[]',$12) RETURNING id`,
        [userId, r.topic, r.text, JSON.stringify(r.options), r.correct_index, r.ideal_seconds,
          JSON.stringify(r.type_options?.length === 3 ? r.type_options : NOT_SET), r.type_options?.length === 3 ? r.type_answer : 0,
          JSON.stringify(r.approach_options?.length === 3 ? r.approach_options : NOT_SET), r.approach_options?.length === 3 ? r.approach_answer : 0, r.solution_notes, `Mistake from ${r.mock_name}`.slice(0, 200)])
      pq = p.id
      await q('UPDATE questions SET practice_question_id = $1 WHERE id = ANY($2::int[])', [pq, m.row_ids])
    }
    ids.push(pq)
  }
  return ids
}

/** Picks questions for a test: never answered first, then answered wrong last time, then the rest, at random within each. */
export async function pickQuestions(userId: number, topics: string[], count: number): Promise<number[]> {
  const rows = await q<{ id: number }>(
    `SELECT p.id FROM practice_questions p
     LEFT JOIN LATERAL (SELECT qn.chosen_index = qn.correct_index AS right FROM questions qn WHERE qn.practice_question_id = p.id AND qn.chosen_index IS NOT NULL ORDER BY qn.id DESC LIMIT 1) last ON true
     WHERE p.user_id = $1 AND p.topic = ANY($2::text[])
     ORDER BY (last.right IS NULL) DESC, (last.right = false) DESC, random() LIMIT $3`,
    [userId, topics, count])
  return rows.map((r) => r.id)
}

export async function questionsForSolving(userId: number, ids: number[]) {
  const rows = await q<PracticeQuestion>(
    `SELECT id, topic, difficulty, text, options, ideal_seconds FROM practice_questions WHERE user_id = $1 AND id = ANY($2::int[])`, [userId, ids])
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean).map((r) => forSolving(r as PracticeQuestion))
}

export const SubmitTest = z.object({
  kind: z.enum(['test', 'retest']),
  scope: z.string().max(100),
  answers: z.array(z.object({ question_id: z.number().int().min(1), chosen_index: z.number().int().min(0).nullable(), seconds: z.number().int().min(0).max(36000) })).min(1).max(50),
})

/** Saves a finished test like a mock (source 'test' or 'retest'). The answers' right/wrong come from the server's copy. */
export async function submitTest(userId: number, x: z.infer<typeof SubmitTest>) {
  const ids = x.answers.map((a) => a.question_id)
  if (new Set(ids).size !== ids.length) return { problem: 'A question appears twice.' }
  const qs = await q<PracticeQuestion>(`SELECT * FROM practice_questions WHERE user_id = $1 AND id = ANY($2::int[])`, [userId, ids])
  if (qs.length !== ids.length) return { problem: 'Some questions were not found.' }
  const rows = x.answers.map((a, i) => {
    const p = qs.find((z) => z.id === a.question_id)!
    if (a.chosen_index !== null && a.chosen_index >= p.options.length) throw new Error('bad option')
    return {
      q_no: i + 1, topic: p.topic as any, text: p.text, options: p.options, correct_index: p.correct_index, chosen_index: a.chosen_index,
      seconds: a.chosen_index === null ? null : a.seconds, ideal_seconds: p.ideal_seconds, type_options: p.type_options, type_answer: p.type_answer,
      approach_options: p.approach_options, approach_answer: p.approach_answer, solution_notes: p.solution_notes, practice_question_id: p.id,
    }
  })
  const topics = [...new Set(rows.map((r) => r.topic))]
  const d = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.TIME_ZONE, day: 'numeric', month: 'short' }).format(new Date())
  const label = x.kind === 'retest' ? 'Retest' : 'Test'
  const mockId = await createMock(userId, {
    name: `${label} · ${x.scope || topics.join(', ')} · ${d}`.slice(0, 200), taken_on: todayStr(), has_time_data: true,
    source: x.kind, topic: topics.length === 1 ? topics[0] : null, scope: x.scope || null,
  }, rows)
  return { mock_id: mockId }
}

/** For a retest result: how many of its questions are now Fixed. */
export async function retestOutcome(userId: number, mockId: number) {
  const rows = await q<{ practice_question_id: number | null; topic: string }>('SELECT practice_question_id, topic FROM questions WHERE mock_id = $1', [mockId])
  const ids = rows.map((r) => r.practice_question_id).filter(Boolean) as number[]
  const ms = (await mistakesWithFixes(userId)).filter((m) => m.practice_question_id && ids.includes(m.practice_question_id))
  const fixed = ms.filter((m) => m.status === 'Fixed').length
  return { retested: rows.length, fixed, still_open: rows.length - fixed }
}
