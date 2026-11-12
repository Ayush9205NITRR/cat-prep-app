// Mock papers uploaded in the app, for Claude to read as compact text (no AI in the app: the browser only
// extracts the PDF's text layer). Claude reads it with get_mock_upload and saves rows with save_mock(upload_id).
import { z } from 'zod'
import { MAX_FILE_BYTES } from '../../shared/note-input'
import { SECTION_NAMES } from '../../shared/topics'
import { q } from './db'

export const KINDS = ['mock', 'assignment', 'notes'] as const
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export const UploadInput = z.object({
  kind: z.enum(KINDS).default('mock'),
  mime: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']).default('application/pdf'),
  name: z.string().min(1).max(200),
  section: z.enum(SECTION_NAMES).nullable().optional(),
  page_texts: z.array(z.string().max(60000)).min(1).max(200),
  pdf_size: z.number().int().min(1),
  pdf_base64: z.string().optional(), // the file itself (PDF or photo), only when ≤ 3 MB
})

export async function createUpload(userId: number, x: z.infer<typeof UploadInput>) {
  const text = x.page_texts.join('').trim()
  let pdf: Buffer | null = null
  if (x.pdf_base64) {
    pdf = Buffer.from(x.pdf_base64, 'base64')
    if (pdf.length > MAX_FILE_BYTES) return { problem: 'The file itself can be up to 3 MB (a PDF’s text is kept either way).' }
    const hex = pdf.subarray(0, 4).toString('hex')
    const ok = x.mime === 'application/pdf' ? pdf.subarray(0, 5).toString() === '%PDF-'
      : x.mime === 'image/png' ? hex === '89504e47' : x.mime === 'image/jpeg' ? hex.startsWith('ffd8ff') : pdf.subarray(8, 12).toString() === 'WEBP'
    if (!ok) return { problem: 'The file is not the type it says it is.' }
  }
  if (x.kind !== 'notes' && IMAGE_TYPES.includes(x.mime)) return { problem: 'Mock papers and assignments must be PDFs. Photos go in as Class notes.' }
  if (!text && !pdf) return { problem: 'This PDF has no text layer (a scan) and is over 3 MB. Upload it in the Claude chat instead.' }
  const [r] = await q<{ id: number }>(
    'INSERT INTO mock_uploads (user_id, kind, mime, name, section, pages, page_texts, pdf, pdf_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [userId, x.kind, x.mime, x.name, x.section ?? null, x.page_texts.length, JSON.stringify(x.page_texts), pdf, x.pdf_size])
  return { id: r.id, pages: x.page_texts.length, chars: text.length, has_text: text.length > 0, pdf_kept: !!pdf }
}

export const listUploads = (userId: number) =>
  q(`SELECT id, kind, mime, name, section, pages, pdf_size, (pdf IS NOT NULL) AS pdf_kept, status, mock_id, result_link, created_at,
       (SELECT sum(length(t))::int FROM jsonb_array_elements_text(page_texts) t) AS chars
     FROM mock_uploads WHERE user_id = $1 ORDER BY id DESC LIMIT 20`, [userId])

export const deleteUpload = async (userId: number, id: number) =>
  (await q('DELETE FROM mock_uploads WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])).length === 1

/** A chunk of pages for Claude: as many whole pages as fit in ~MAX chars (large chunks = fewer calls). */
const MAX = 24000
export async function readUpload(userId: number, id: number | undefined, fromPage = 1, kind: string = 'mock') {
  const [u] = await q<{ id: number; kind: string; mime: string; name: string; section: string | null; pages: number; page_texts: string[]; pdf: Buffer | null; status: string }>(
    id ? 'SELECT * FROM mock_uploads WHERE id = $1 AND user_id = $2'
       : "SELECT * FROM mock_uploads WHERE user_id = $1 AND status = 'new' AND kind = $2 ORDER BY id DESC LIMIT 1",
    id ? [id, userId] : [userId, kind])
  if (!u) return null
  const hasText = u.page_texts.join('').trim().length > 0
  if (!hasText) return { upload: u, pdf: u.pdf } // scanned PDF: Claude reads the PDF itself
  const start = Math.min(Math.max(1, fromPage), u.pages)
  let end = start - 1, size = 0
  while (end < u.pages && (end === start - 1 || size + u.page_texts[end].length <= MAX)) { size += u.page_texts[end].length; end++ }
  const text = u.page_texts.slice(start - 1, end).map((t, i) => `--- page ${start + i} ---\n${t}`).join('\n')
  return { upload: u, chunk: { from_page: start, to_page: end, next_page: end < u.pages ? end + 1 : null, text } }
}

export async function markUploadSaved(userId: number, id: number, mockId: number | null, link?: string) {
  await q("UPDATE mock_uploads SET status = 'saved', mock_id = COALESCE($3, mock_id), result_link = COALESCE($4, result_link) WHERE id = $1 AND user_id = $2", [id, userId, mockId, link ?? null])
}

/** The inbox for Claude: just what is waiting, tiny (no content). Oldest first. */
export const inbox = (userId: number) =>
  q<{ id: number; kind: string; name: string; pages: number; chars: number; type: string }>(
    `SELECT id, kind, name, pages, (SELECT coalesce(sum(length(t)), 0)::int FROM jsonb_array_elements_text(page_texts) t) AS chars,
       CASE WHEN mime = 'application/pdf' THEN 'pdf' ELSE 'photo' END AS type
     FROM mock_uploads WHERE user_id = $1 AND status = 'new' ORDER BY id LIMIT 10`, [userId])
