// FIXES round 2: compact reads for Claude (Fix 9) and small results (Fix 10). All computed from stored data — no AI here.
import { abcOf, bucketOf, type QuestionRow } from '../../shared/analysis'
import { CONFIG } from '../../shared/config'
import { sectionOf } from '../../shared/topics'
import { db, q } from './db'
import { getMock } from './mocks'
import { saveVersion } from './notes'
import { mistakesWithFixes } from './topics'

const TODAY = `(now() AT TIME ZONE '${CONFIG.TIME_ZONE}')::date`
export const oneLine = (s: string, n: number) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
/** The "Rule to remember" line of a fix note. */
export const ruleOf = (summary: string) => /Rule to remember\**\s*\n+([^\n]+)/i.exec(summary ?? '')?.[1]?.trim() ?? null
/** Lists are capped; `cursor` is the offset of the next page. */
export function page<T>(list: T[], cursor: string | undefined, size: number) {
  const from = Math.max(0, Number(cursor) || 0)
  const items = list.slice(from, from + size)
  return { items, next_cursor: from + size < list.length ? String(from + size) : null, total: list.length }
}

// ---------- get_profile: at most ~150 words ----------
export async function profile(userId: number): Promise<string> {
  const [[u], mistakes, clicks] = await Promise.all([
    q<{ exam_date: string | null; days: number | null }>(`SELECT to_char(exam_date, 'YYYY-MM-DD') AS exam_date, (exam_date - ${TODAY}) AS days FROM users WHERE id = $1`, [userId]),
    mistakesWithFixes(userId),
    q<{ click_type: string; n: number }>('SELECT click_type, count(*)::int AS n FROM notes WHERE user_id = $1 AND click_type IS NOT NULL GROUP BY click_type ORDER BY n DESC LIMIT 1', [userId]),
  ])
  const open = mistakes.filter((m) => m.status !== 'Fixed')
  const weight = new Map<string, number>()
  for (const m of open) weight.set(m.topic, (weight.get(m.topic) ?? 0) + (m.status === 'Repeated' ? 2 : 1))
  const weakest = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)
  const tagged = mistakes.filter((m) => m.error === 'A' || m.error === 'B' || m.error === 'C')
  const pct = (k: string) => (tagged.length ? Math.round((tagged.filter((m) => m.error === k).length / tagged.length) * 100) : 0)
  const rules = weakest.flatMap((t) => open.filter((m) => m.topic === t && m.fix).map((m) => ruleOf(m.fix!.summary)).filter(Boolean).slice(0, 1).map((r) => `${t}: ${oneLine(r!, 90)}`))
  return [
    `Exam: ${u?.exam_date ? `${u.exam_date} (${u.days} days left)` : 'date not set'}.`,
    `Weakest topics: ${weakest.length ? weakest.map((t) => `${t} (${open.filter((m) => m.topic === t).length} open)`).join(', ') : 'none yet'}.`,
    `Error mix: ${tagged.length ? `A ${pct('A')}% · B ${pct('B')}% · C ${pct('C')}% of ${tagged.length} tagged` : 'nothing tagged yet'}.`,
    `Learns best via: ${clicks[0]?.click_type ?? 'not known yet'}.`,
    `Open repeats: ${open.filter((m) => m.status === 'Repeated').length}. Open mistakes: ${open.length}.`,
    rules.length ? `Own rules: ${rules.join(' | ')}` : 'Own rules: none saved yet.',
  ].join('\n')
}

// ---------- get_topic: compact, never the whole history ----------
export type Include = 'notes' | 'mistakes' | 'files'
export async function topicDigest(userId: number, topic: string, include: Include[], cursor?: string) {
  const out: Record<string, unknown> = { topic, section: sectionOf(topic) }
  let next: string | null = null
  const more = (n: string | null) => { if (n && (!next || Number(n) > Number(next))) next = n }
  if (include.includes('notes') || include.includes('files')) {
    const notes = await q<{ id: number; kind: string; title: string; summary: string; file_read: boolean; name: string | null }>(
      `SELECT n.id, n.kind, n.title, n.summary, n.file_read, (SELECT name FROM note_files f WHERE f.note_id = n.id ORDER BY id LIMIT 1) AS name
       FROM notes n WHERE n.user_id = $1 AND n.topic = $2 ORDER BY (n.kind = 'fix'), n.id DESC`, [userId, topic])
    if (include.includes('notes')) {
      const p = page(notes.filter((n) => n.kind !== 'file' || n.file_read), cursor, 4)
      out.notes = p.items.map((n) => ({ id: n.id, kind: n.kind, title: oneLine(n.title, 80), text: oneLine(n.summary, 300) }))
      out.notes_total = p.total; more(p.next_cursor)
    }
    if (include.includes('files')) {
      const p = page(notes.filter((n) => n.kind === 'file'), cursor, 10)
      out.files = p.items.map((n) => ({ note_id: n.id, name: n.name, read: n.file_read })); more(p.next_cursor)
    }
  }
  if (include.includes('mistakes')) {
    const open = (await mistakesWithFixes(userId, topic)).filter((m) => m.status !== 'Fixed')
    const p = page(open, cursor, 8)
    out.open_mistakes = p.items.map((m) => ({ id: m.row.id, q: oneLine(m.row.text, 70), error: m.error, status: m.status, rule: m.fix ? oneLine(ruleOf(m.fix.summary) ?? '', 90) : null }))
    out.open_total = p.total; more(p.next_cursor)
  }
  out.next_cursor = next
  return out
}

// ---------- get_note: one note in full, or one file ----------
export async function noteFull(userId: number, id: number) {
  const [n] = await q<{ id: number; topic: string; kind: string; title: string; summary: string; formulas: string[]; link_url: string | null; file_read: boolean }>(
    'SELECT id, topic, kind, title, summary, formulas, link_url, file_read FROM notes WHERE id = $1 AND user_id = $2', [id, userId])
  if (!n) return null
  const [f] = n.kind === 'file' ? await q<{ name: string; mime: string; data: Buffer }>('SELECT name, mime, data FROM note_files WHERE note_id = $1 ORDER BY id LIMIT 1', [id]) : []
  // Card ids so Claude can fix one with update_card (short text, capped).
  const cards = await q<{ id: number; front: string; back: string }>('SELECT id, front, back FROM flashcards WHERE note_id = $1 ORDER BY id LIMIT 10', [id])
  return { note: { ...n, flashcards: cards.map((c) => ({ id: c.id, front: oneLine(c.front, 80), back: oneLine(c.back, 80) })) }, file: f ?? null }
}

// ---------- update_note: rewrite, keeping the previous version ----------
export async function rewriteNote(userId: number, id: number, body: string, title?: string) {
  const [own] = await q('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [id, userId])
  if (!own) return null
  await saveVersion(userId, id)
  await q('UPDATE notes SET summary = $3, title = COALESCE($4, title) WHERE id = $1 AND user_id = $2', [id, userId, body, title?.trim() || null])
  const [v] = await q<{ n: number }>('SELECT count(*)::int AS n FROM note_versions WHERE note_id = $1', [id])
  return { note_id: id, versions_kept: v.n }
}

// ---------- mark_file_read ----------
export async function markFileRead(userId: number, id: number, summary: string, cards: { front: string; back: string }[]) {
  const [n] = await q<{ kind: string; topic: string }>('SELECT kind, topic FROM notes WHERE id = $1 AND user_id = $2', [id, userId])
  if (!n) return null
  if (n.kind !== 'file') return { problem: 'That note is not an uploaded file.' }
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query(`INSERT INTO note_versions (note_id, user_id, title, summary) SELECT id, user_id, title, summary FROM notes WHERE id = $1 AND summary <> ''`, [id])
    await client.query('UPDATE notes SET summary = $2, file_read = true WHERE id = $1', [id, summary])
    for (const c of cards) await client.query(`INSERT INTO flashcards (note_id, user_id, front, back, due_on) VALUES ($1,$2,$3,$4,${TODAY})`, [id, userId, c.front, c.back])
    await client.query('COMMIT')
  } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
  return { note_id: id, topic: n.topic, flashcards_added: cards.length }
}

// ---------- next_mistake: one unreviewed wrong or slow question at a time ----------
export async function nextMistake(userId: number, mockId?: number) {
  const [m] = mockId ? [{ id: mockId }] : await q<{ id: number }>('SELECT id FROM mocks WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [userId])
  if (!m) return { problem: 'No mocks or tests yet.' }
  const data = await getMock(userId, m.id)
  if (!data) return { problem: `No mock ${m.id} for this account.` }
  const t = data.mock.has_time_data
  const flagged = data.rows.filter((r) => { const b = bucketOf(r, t); return b === 'incorrect' || b === 'over_time' })
  const todo = flagged.filter((r) => abcOf(r, t) === 'pending')
  if (!todo.length) return { mock_id: m.id, done: true, reviewed: flagged.length, next: 'All reviewed. Offer start_retest.' }
  const r = todo[0] as QuestionRow & { id: number; practice_question_id: number | null }
  // Reuse: a fix this student already saved for the same question (any mock or test).
  const [fix] = await q<{ summary: string }>(
    `SELECT n.summary FROM notes n WHERE n.user_id = $1 AND n.kind = 'fix' AND n.fix_row_id IN
       (SELECT id FROM questions WHERE id = $2 OR ($3::int IS NOT NULL AND practice_question_id = $3)) ORDER BY n.id DESC LIMIT 1`,
    [userId, r.id, r.practice_question_id ?? null])
  return {
    mock_id: m.id, left: todo.length, attempt_id: r.id, topic: r.topic,
    question: oneLine(r.text, 600), options: r.options.map((o) => oneLine(o, 120)),
    student_answer: r.chosen_index, correct_answer: r.correct_index, seconds: r.seconds, ideal_seconds: r.ideal_seconds,
    result: bucketOf(r, t) === 'incorrect' ? 'wrong' : 'right but slow',
    ...(r.type_options.length === 3 && r.approach_options.length === 3
      ? { tap_1: r.type_options, tap_2: r.approach_options }
      : { needs_options: 'No tap questions yet: call add_review_options for this attempt_id first.' }),
    solution_notes: r.solution_notes ? oneLine(r.solution_notes, 300) : null,
    saved_fix: fix ? oneLine(fix.summary.replace(/\*\*/g, ''), 300) : null,
  }
}

// ---------- Faster mistake reviews (fewer Claude round trips) ----------
/** Wrong/slow questions the student already tapped (in the app or chat) that have no fix note yet. Compact, ≤10. */
export async function pendingFixes(userId: number, mockId?: number) {
  const [m] = mockId ? [{ id: mockId }] : await q<{ id: number }>('SELECT id FROM mocks WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [userId])
  if (!m) return { problem: 'No mocks or tests yet.' }
  const data = await getMock(userId, m.id)
  if (!data) return { problem: `No mock ${m.id} for this account.` }
  const t = data.mock.has_time_data
  const fixed = new Set((await q<{ fix_row_id: number }>("SELECT fix_row_id FROM notes WHERE user_id = $1 AND kind = 'fix' AND fix_row_id IS NOT NULL", [userId])).map((r) => r.fix_row_id))
  const flagged = data.rows.filter((r) => { const b = bucketOf(r, t); return b === 'incorrect' || b === 'over_time' })
  const todo = flagged.filter((r) => abcOf(r, t) !== 'pending' && !fixed.has(r.id!))
  const untapped = flagged.filter((r) => abcOf(r, t) === 'pending').length
  return {
    mock_id: m.id, need_fix: todo.length, not_tapped_yet: untapped,
    items: todo.slice(0, 5).map((r) => ({
      // Only the two answers that matter for a fix, as text (not all options): keeps the list small.
      attempt_id: r.id!, topic: r.topic, q: oneLine(r.text, 90),
      you: r.chosen_index === null ? 'skipped' : oneLine(r.options[r.chosen_index] ?? '', 40), right: oneLine(r.options[r.correct_index] ?? '', 40),
      s: r.seconds, ideal: r.ideal_seconds,
      error: abcOf(r, t) ?? 'slow (no letter)', solution: r.solution_notes ? oneLine(r.solution_notes, 80) : null,
    })),
    next: todo.length ? (todo.length > 5 ? 'Write these fixes, one save_fixes call, then pending_fixes again for the rest.' : 'Write all fixes, then one save_fixes call.') : untapped ? 'Ask the student to tap the rest in the app (Review), or review them here with review_mistake.' : 'All done. Offer start_retest.',
  }
}
