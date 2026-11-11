import { z } from 'zod'
import { CONFIG } from '../../shared/config'
import { CLICK_TYPES, schedule } from '../../shared/flashcards'
import { TOPICS } from '../../shared/topics'
import { db, q } from './db'

const TODAY = `(now() AT TIME ZONE '${CONFIG.TIME_ZONE}')::date`

const Card = z.object({ front: z.string().min(1).max(500), back: z.string().min(1).max(1000) })

export const NotesInput = {
  topic: z.enum(TOPICS).describe('One topic from the allowed list'),
  title: z.string().min(1).max(200).describe('Short title, e.g. "Lecture 5: Circular tracks"'),
  summary: z.string().min(1).max(5000).describe('Plain summary of the notes'),
  formulas: z.array(z.string().min(1).max(300)).max(30).describe('Formulas, one per item'),
  flashcards: z.array(Card).min(5).max(8).describe('5–8 cards: a question on the front, the answer on the back'),
  source: z.string().max(200).optional().describe('e.g. "Photo of lecture notes, 12 Nov"'),
}
export const NotePatch = z
  .object({
    topic: z.enum(TOPICS),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(5000),
    formulas: z.array(z.string().min(1).max(300)).max(30),
    click_type: z.enum(CLICK_TYPES).nullable(),
  })
  .partial()
  .strict()
export const CardInput = Card
export const CardPatch = Card.partial().strict()

const N_COLS = 'id, topic, title, summary, formulas, click_type, source, created_at'
const C_COLS = 'id, note_id, front, back, streak, to_char(due_on, \'YYYY-MM-DD\') AS due_on, reviews'

export async function saveNotes(userId: number, x: z.infer<z.ZodObject<typeof NotesInput>>) {
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const { rows: [n] } = await client.query(
      'INSERT INTO notes (user_id, topic, title, summary, formulas, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [userId, x.topic, x.title, x.summary, JSON.stringify(x.formulas), x.source ?? ''],
    )
    for (const c of x.flashcards)
      await client.query(`INSERT INTO flashcards (note_id, user_id, front, back, due_on) VALUES ($1,$2,$3,$4,${TODAY})`, [n.id, userId, c.front, c.back])
    await client.query('COMMIT')
    return n.id as number
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function listNotes(userId: number) {
  const notes = await q(
    `SELECT n.id, n.topic, n.title, n.click_type, n.created_at, count(f.id)::int AS cards,
       count(f.id) FILTER (WHERE f.due_on <= ${TODAY})::int AS due
     FROM notes n LEFT JOIN flashcards f ON f.note_id = n.id WHERE n.user_id = $1 GROUP BY n.id ORDER BY n.topic, n.id DESC`,
    [userId],
  )
  return { notes, due: notes.reduce((s: number, n: any) => s + n.due, 0) }
}

export async function getNote(userId: number, id: number) {
  const [note] = await q(`SELECT ${N_COLS} FROM notes WHERE id = $1 AND user_id = $2`, [id, userId])
  if (!note) return null
  const cards = await q(`SELECT ${C_COLS} FROM flashcards WHERE note_id = $1 ORDER BY id`, [id])
  return { note, cards }
}

export async function updateNote(userId: number, id: number, patch: z.infer<typeof NotePatch>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (keys.length) {
    const vals = keys.map((k) => (k === 'formulas' ? JSON.stringify(patch[k]) : patch[k]))
    const r = await q(`UPDATE notes SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId, ...vals])
    if (!r.length) return null
  }
  return getNote(userId, id)
}

export const deleteNote = async (userId: number, id: number) =>
  (await q('DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])).length === 1

export async function addCard(userId: number, noteId: number, c: z.infer<typeof Card>) {
  const [own] = await q('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [noteId, userId])
  if (!own) return null
  const [card] = await q(`INSERT INTO flashcards (note_id, user_id, front, back, due_on) VALUES ($1,$2,$3,$4,${TODAY}) RETURNING ${C_COLS}`, [noteId, userId, c.front, c.back])
  return card
}

export async function updateCard(userId: number, id: number, patch: z.infer<typeof CardPatch>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (!keys.length) return (await q(`SELECT ${C_COLS} FROM flashcards WHERE id = $1 AND user_id = $2`, [id, userId]))[0] ?? null
  const [card] = await q(`UPDATE flashcards SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND user_id = $2 RETURNING ${C_COLS}`, [id, userId, ...keys.map((k) => patch[k])])
  return card ?? null
}

export const deleteCard = async (userId: number, id: number) =>
  (await q('DELETE FROM flashcards WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])).length === 1

export async function dueCards(userId: number) {
  return q(
    `SELECT f.id, f.note_id, f.front, f.back, f.streak, to_char(f.due_on, 'YYYY-MM-DD') AS due_on, f.reviews, n.title, n.topic
     FROM flashcards f JOIN notes n ON n.id = f.note_id WHERE f.user_id = $1 AND f.due_on <= ${TODAY} ORDER BY f.due_on, f.id`,
    [userId],
  )
}

/** Right → next interval (1, 2, 4, 8 days). Wrong → tomorrow, intervals restart. */
export async function reviewCard(userId: number, id: number, right: boolean) {
  const [c] = await q<{ streak: number }>('SELECT streak FROM flashcards WHERE id = $1 AND user_id = $2', [id, userId])
  if (!c) return null
  const s = schedule(c.streak, right)
  const [card] = await q(
    `UPDATE flashcards SET streak = $3, due_on = ${TODAY} + $4::int, reviews = reviews + 1 WHERE id = $1 AND user_id = $2 RETURNING ${C_COLS}`,
    [id, userId, s.streak, s.dueInDays],
  )
  return { card, due_in_days: s.dueInDays }
}
