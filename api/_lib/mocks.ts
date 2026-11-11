import { z } from 'zod'
import { analyse, type QuestionRow } from '../../shared/analysis'
import { majoritySection, SECTION_NAMES, TOPICS } from '../../shared/topics'
import { db, q } from './db'

// ---------- input shapes (shared by MCP and the REST API) ----------
const idx = z.number().int().min(0)
const three = z.array(z.string().min(1)).length(3)

export const RowInput = z.object({
  q_no: z.number().int().min(1),
  topic: z.string().min(1).max(60).describe('A topic from the list in the instructions'),
  text: z.string().min(1),
  options: z.array(z.string()).min(2).describe('Options in order (TITA: the correct value, plus the student value if different)'),
  correct_index: idx,
  chosen_index: idx.nullable().describe('null = skipped'),
  seconds: z.number().int().min(0).nullable().optional(),
  ideal_seconds: z.number().int().min(1),
  type_options: three.describe('Which type of question?'),
  type_answer: z.number().int().min(0).max(2),
  approach_options: three.describe('Fastest approach?'),
  approach_answer: z.number().int().min(0).max(2),
  solution_notes: z.string(),
})
export type RowInput = z.infer<typeof RowInput>

export const MockInput = {
  name: z.string().min(1).max(200),
  taken_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
  has_time_data: z.boolean(),
  section: z.enum(SECTION_NAMES).optional().describe('Default: the section most rows belong to'),
  rows: z.array(RowInput).min(1).max(200),
}

/** Index checks zod cannot express per field. Returns a list of problems. */
export function rowProblems(r: Pick<RowInput, 'q_no' | 'options' | 'correct_index' | 'chosen_index'>): string[] {
  const p: string[] = []
  if (r.correct_index >= r.options.length) p.push(`Q${r.q_no}: correct_index ${r.correct_index} is outside options`)
  if (r.chosen_index !== null && r.chosen_index >= r.options.length) p.push(`Q${r.q_no}: chosen_index ${r.chosen_index} is outside options`)
  return p
}

// ---------- reads ----------
export interface MockMeta {
  id: number
  name: string
  taken_on: string
  has_time_data: boolean
  created_at: string
  section: string | null
  source: 'mock' | 'test' | 'retest'
  topic: string | null
  scope: string | null
}

const MOCK_COLS = `id, name, to_char(taken_on, 'YYYY-MM-DD') AS taken_on, has_time_data, created_at, section, source, topic, scope`
const Q_COLS = `id, q_no, topic, text, options, correct_index, chosen_index, seconds, ideal_seconds,
  type_options, type_answer, approach_options, approach_answer, solution_notes,
  type_tap, approach_tap, resolve_index, resolve_seconds, practice_question_id`

export async function listMocks(userId: number) {
  const mocks = await q<MockMeta>(`SELECT ${MOCK_COLS} FROM mocks WHERE user_id = $1 ORDER BY taken_on DESC, id DESC`, [userId])
  const rows = await q<QuestionRow & { mock_id: number }>(
    `SELECT mock_id, ${Q_COLS} FROM questions WHERE mock_id IN (SELECT id FROM mocks WHERE user_id = $1)`,
    [userId],
  )
  return mocks.map((m) => {
    const r = analyse(rows.filter((x) => x.mock_id === m.id), m.has_time_data)
    return { ...m, questions: r.counts.total, score: r.score, reachable_score: r.reachable_score, max_score: r.max_score }
  })
}

export async function getMock(userId: number, mockId: number) {
  const [mock] = await q<MockMeta>(`SELECT ${MOCK_COLS} FROM mocks WHERE id = $1 AND user_id = $2`, [mockId, userId])
  if (!mock) return null
  const rows = await q<QuestionRow>(`SELECT ${Q_COLS} FROM questions WHERE mock_id = $1 ORDER BY q_no, id`, [mockId])
  return { mock, rows }
}

// ---------- writes ----------
export async function createMock(
  userId: number,
  m: { name: string; taken_on: string; has_time_data: boolean; section?: string; source?: 'mock' | 'test' | 'retest'; topic?: string | null; scope?: string | null },
  rows: (RowInput & Partial<Pick<QuestionRow, 'type_tap' | 'approach_tap' | 'resolve_index' | 'resolve_seconds'>> & { practice_question_id?: number | null })[],
): Promise<number> {
  const section = m.section ?? majoritySection(rows.map((r) => r.topic))
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const { rows: [{ id }] } = await client.query(
      'INSERT INTO mocks (user_id, name, taken_on, has_time_data, section, source, topic, scope) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [userId, m.name, m.taken_on, m.has_time_data, section, m.source ?? 'mock', m.topic ?? null, m.scope ?? null],
    )
    for (const r of rows) {
      await client.query(
        `INSERT INTO questions (mock_id, q_no, topic, text, options, correct_index, chosen_index, seconds, ideal_seconds,
           type_options, type_answer, approach_options, approach_answer, solution_notes,
           type_tap, approach_tap, resolve_index, resolve_seconds, practice_question_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [id, r.q_no, r.topic, r.text, JSON.stringify(r.options), r.correct_index, r.chosen_index, r.seconds ?? null,
          r.ideal_seconds, JSON.stringify(r.type_options), r.type_answer, JSON.stringify(r.approach_options),
          r.approach_answer, r.solution_notes, r.type_tap ?? null, r.approach_tap ?? null, r.resolve_index ?? null,
          r.resolve_seconds ?? null, r.practice_question_id ?? null],
      )
    }
    await client.query('COMMIT')
    return id
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export const MockPatch = z
  .object({
    name: z.string().min(1).max(200),
    taken_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    has_time_data: z.boolean(),
    section: z.enum(SECTION_NAMES),
  })
  .partial()
  .strict()

export async function updateMock(userId: number, mockId: number, patch: z.infer<typeof MockPatch>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (!keys.length) return true
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
  const r = await db().query(`UPDATE mocks SET ${sets} WHERE id = $1 AND user_id = $2`, [mockId, userId, ...keys.map((k) => patch[k])])
  return r.rowCount === 1
}

const nint = z.number().int().min(0).nullable()
export const QuestionPatch = z
  .object({
    topic: z.enum(TOPICS),
    chosen_index: nint,
    correct_index: z.number().int().min(0),
    seconds: nint,
    ideal_seconds: z.number().int().min(1),
    type_tap: z.number().int().min(0).max(2).nullable(),
    approach_tap: z.number().int().min(0).max(2).nullable(),
    resolve_index: nint,
    resolve_seconds: nint,
  })
  .partial()
  .strict()

/** Updates one question the user owns. Returns the updated row, null if not found, or a list of problems. */
export async function updateQuestion(userId: number, questionId: number, patch: z.infer<typeof QuestionPatch>) {
  const [cur] = await q<QuestionRow>(
    `SELECT q.q_no, q.options, q.correct_index, q.chosen_index FROM questions q JOIN mocks m ON m.id = q.mock_id
     WHERE q.id = $1 AND m.user_id = $2`,
    [questionId, userId],
  )
  if (!cur) return null
  const merged = { ...cur, ...patch }
  const problems = rowProblems(merged)
  if (patch.resolve_index != null && patch.resolve_index >= cur.options.length) problems.push('resolve_index is outside options')
  if (problems.length) return { problems }
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    await q(`UPDATE questions SET ${sets} WHERE id = $1`, [questionId, ...keys.map((k) => patch[k])])
  }
  const [row] = await q<QuestionRow>(`SELECT ${Q_COLS} FROM questions WHERE id = $1`, [questionId])
  return { row }
}
