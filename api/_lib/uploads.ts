// Mock papers uploaded in the app, for Claude to read as compact text (no AI in the app: the browser only
// extracts the PDF's text layer). Claude reads it with get_mock_upload and saves rows with save_mock(upload_id).
import { z } from 'zod'
import { MAX_FILE_BYTES } from '../../shared/note-input'
import { SECTION_NAMES } from '../../shared/topics'
import { q } from './db'

export const UploadInput = z.object({
  name: z.string().min(1).max(200),
  section: z.enum(SECTION_NAMES).nullable().optional(),
  page_texts: z.array(z.string().max(60000)).min(1).max(200),
  pdf_size: z.number().int().min(1),
  pdf_base64: z.string().optional(), // only when the PDF is ≤ 3 MB
})

export async function createUpload(userId: number, x: z.infer<typeof UploadInput>) {
  const text = x.page_texts.join('').trim()
  let pdf: Buffer | null = null
  if (x.pdf_base64) {
    pdf = Buffer.from(x.pdf_base64, 'base64')
    if (pdf.length > MAX_FILE_BYTES) return { problem: 'The PDF itself can be up to 3 MB (the text is kept either way).' }
    if (pdf.subarray(0, 5).toString() !== '%PDF-') return { problem: 'That is not a PDF.' }
  }
  if (!text && !pdf) return { problem: 'This PDF has no text layer (a scan) and is over 3 MB. Upload it in the Claude chat instead.' }
  const [r] = await q<{ id: number }>(
    'INSERT INTO mock_uploads (user_id, name, section, pages, page_texts, pdf, pdf_size) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [userId, x.name, x.section ?? null, x.page_texts.length, JSON.stringify(x.page_texts), pdf, x.pdf_size])
  return { id: r.id, pages: x.page_texts.length, chars: text.length, has_text: text.length > 0, pdf_kept: !!pdf }
}

export const listUploads = (userId: number) =>
  q(`SELECT id, name, section, pages, pdf_size, (pdf IS NOT NULL) AS pdf_kept, status, mock_id, created_at,
       (SELECT sum(length(t))::int FROM jsonb_array_elements_text(page_texts) t) AS chars
     FROM mock_uploads WHERE user_id = $1 ORDER BY id DESC LIMIT 20`, [userId])

export const deleteUpload = async (userId: number, id: number) =>
  (await q('DELETE FROM mock_uploads WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])).length === 1

/** A chunk of pages for Claude: as many whole pages as fit in ~MAX chars (large chunks = fewer calls). */
const MAX = 24000
export async function readUpload(userId: number, id: number | undefined, fromPage = 1) {
  const [u] = await q<{ id: number; name: string; section: string | null; pages: number; page_texts: string[]; pdf: Buffer | null; status: string }>(
    id ? 'SELECT * FROM mock_uploads WHERE id = $1 AND user_id = $2'
       : "SELECT * FROM mock_uploads WHERE user_id = $1 AND status = 'new' ORDER BY id DESC LIMIT 1",
    id ? [id, userId] : [userId])
  if (!u) return null
  const hasText = u.page_texts.join('').trim().length > 0
  if (!hasText) return { upload: u, pdf: u.pdf } // scanned PDF: Claude reads the PDF itself
  const start = Math.min(Math.max(1, fromPage), u.pages)
  let end = start - 1, size = 0
  while (end < u.pages && (end === start - 1 || size + u.page_texts[end].length <= MAX)) { size += u.page_texts[end].length; end++ }
  const text = u.page_texts.slice(start - 1, end).map((t, i) => `--- page ${start + i} ---\n${t}`).join('\n')
  return { upload: u, chunk: { from_page: start, to_page: end, next_page: end < u.pages ? end + 1 : null, text } }
}

export async function markUploadSaved(userId: number, id: number, mockId: number) {
  await q("UPDATE mock_uploads SET status = 'saved', mock_id = $3 WHERE id = $1 AND user_id = $2", [id, userId, mockId])
}
