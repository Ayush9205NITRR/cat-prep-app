import { z } from 'zod'
import { CONFIG } from '../../shared/config'
import { CLICK_TYPES, schedule } from '../../shared/flashcards'
import { autoTitle, detectKind, FILE_TYPES, MAX_FILE_BYTES, normaliseUrl } from '../../shared/note-input'
import { TOPICS } from '../../shared/topics'
import { db, q } from './db'

const TODAY = `(now() AT TIME ZONE '${CONFIG.TIME_ZONE}')::date`

const Card = z.object({ front: z.string().min(1).max(500), back: z.string().min(1).max(1000) })

export const NotesInput = {
  topic: z.string().min(1).max(60).describe('A topic from the list in the instructions'),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(5000).describe('Markdown'),
  formulas: z.array(z.string().min(1).max(300)).max(30),
  flashcards: z.array(Card).min(5).max(8),
  source: z.string().max(200).optional(),
}
export const NotePatch = z
  .object({
    topic: z.enum(TOPICS),
    title: z.string().min(1).max(200),
    summary: z.string().max(20000),
    link_url: z.string().url().max(2000),
    formulas: z.array(z.string().min(1).max(300)).max(30),
    click_type: z.enum(CLICK_TYPES).nullable(),
  })
  .partial()
  .strict()
export const CardInput = Card
export const CardPatch = Card.partial().strict()

const N_COLS = `id, topic, title, summary, formulas, click_type, source, kind, link_url, fix_row_id, file_read, created_at,
  (SELECT mock_id FROM questions WHERE id = notes.fix_row_id) AS fix_mock_id`
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
    `SELECT n.id, n.topic, n.title, n.click_type, n.kind, n.link_url, left(n.summary, 160) AS preview, n.created_at,
       n.fix_row_id, n.file_read, (SELECT mock_id FROM questions WHERE id = n.fix_row_id) AS fix_mock_id,
       (SELECT nf.id FROM note_files nf WHERE nf.note_id = n.id ORDER BY nf.id LIMIT 1) AS file_id,
       (SELECT nf.mime FROM note_files nf WHERE nf.note_id = n.id ORDER BY nf.id LIMIT 1) AS file_mime,
       count(f.id)::int AS cards,
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
  const files = await q('SELECT id, name, mime, size FROM note_files WHERE note_id = $1 ORDER BY id', [id])
  return { note, cards, files }
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

export async function dueCards(userId: number, topic?: string) {
  return q(
    `SELECT f.id, f.note_id, f.front, f.back, f.streak, to_char(f.due_on, 'YYYY-MM-DD') AS due_on, f.reviews, n.title, n.topic,
       n.kind, n.fix_row_id, (SELECT mock_id FROM questions WHERE id = n.fix_row_id) AS fix_mock_id
     FROM flashcards f JOIN notes n ON n.id = f.note_id
     WHERE f.user_id = $1 AND f.due_on <= ${TODAY} AND ($2::text IS NULL OR n.topic = $2) ORDER BY f.due_on, f.id`,
    [userId, topic ?? null],
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

// ---------- "New note" from the app: text, link or file, detected automatically ----------
export const CreateNote = z.object({
  topic: z.enum(TOPICS),
  title: z.string().max(200).optional(),
  content: z.string().max(20000).optional(),
  kind: z.enum(['text']).optional(), // "+ Add → Text": keep it text even if it is only a URL
  file: z.object({ name: z.string().min(1).max(200), mime: z.enum(FILE_TYPES), base64: z.string().min(1) }).optional(),
})

export async function createNote(userId: number, x: z.infer<typeof CreateNote>) {
  const content = x.content ?? ''
  const detected = detectKind(content)
  let bytes: Buffer | null = null
  if (x.file) {
    bytes = Buffer.from(x.file.base64, 'base64')
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) return { problem: 'Files can be up to 3 MB.' }
    if (!magicOk(bytes, x.file.mime)) return { problem: 'That file is not the type it says it is.' }
  } else if (detected === 'empty') return { problem: 'Type or paste something, or attach a file.' }

  const kind = x.file ? 'file' : x.kind === 'text' ? 'text' : detected
  const link = kind === 'link' ? normaliseUrl(content) : null
  const title = (x.title ?? '').trim() || autoTitle(kind, content, x.file?.name)
  const summary = kind === 'link' ? '' : content.trim()
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const { rows: [n] } = await client.query(
      "INSERT INTO notes (user_id, topic, title, summary, kind, link_url, source) VALUES ($1,$2,$3,$4,$5,$6,'Added in the app') RETURNING id",
      [userId, x.topic, title, summary, kind, link],
    )
    if (bytes) await client.query('INSERT INTO note_files (note_id, user_id, name, mime, size, data) VALUES ($1,$2,$3,$4,$5,$6)', [n.id, userId, x.file!.name, x.file!.mime, bytes.length, bytes])
    await client.query('COMMIT')
    return { id: n.id as number, kind }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Checks the first bytes so a renamed file cannot pretend to be an image or PDF. */
function magicOk(b: Buffer, mime: string) {
  const hex = b.subarray(0, 12).toString('hex')
  if (mime === 'image/png') return hex.startsWith('89504e47')
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff')
  if (mime === 'image/gif') return hex.startsWith('47494638')
  if (mime === 'image/webp') return hex.startsWith('52494646') && b.subarray(8, 12).toString() === 'WEBP'
  if (mime === 'application/pdf') return b.subarray(0, 5).toString() === '%PDF-'
  return false
}

export async function getFile(userId: number, id: number) {
  const [f] = await q<{ name: string; mime: string; data: Buffer }>('SELECT name, mime, data FROM note_files WHERE id = $1 AND user_id = $2', [id, userId])
  return f ?? null
}

// ---------- previous versions (kept by update_note; the student can restore one) ----------
export async function saveVersion(userId: number, noteId: number) {
  await q('INSERT INTO note_versions (note_id, user_id, title, summary) SELECT id, user_id, title, summary FROM notes WHERE id = $1 AND user_id = $2', [noteId, userId])
}
export const listVersions = (userId: number, noteId: number) =>
  q('SELECT id, title, summary, created_at FROM note_versions WHERE note_id = $1 AND user_id = $2 ORDER BY id DESC LIMIT 20', [noteId, userId])
export async function restoreVersion(userId: number, noteId: number, versionId: number) {
  const [v] = await q<{ title: string; summary: string }>('SELECT title, summary FROM note_versions WHERE id = $1 AND note_id = $2 AND user_id = $3', [versionId, noteId, userId])
  if (!v) return null
  await saveVersion(userId, noteId) // the current text becomes a version too, so a restore can be undone
  await q('UPDATE notes SET title = $3, summary = $4 WHERE id = $1 AND user_id = $2', [noteId, userId, v.title, v.summary])
  return getNote(userId, noteId)
}
