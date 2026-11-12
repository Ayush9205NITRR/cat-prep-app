import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ABC_LABEL, abcOf, analyse, bucketOf } from '../../shared/analysis'
import { DIFFICULTIES } from '../../shared/practice'
import { resolveTopic, SECTION_NAMES, SECTIONS } from '../../shared/topics'
import type { User } from './auth'
import { markFileRead, nextMistake, noteFull, oneLine, page, profile, rewriteNote, topicDigest, type Include } from './claude'
import { q } from './db'
import { addRows, createMock, getMock, MockInput, RowInput, rowProblems, setReviewOptions } from './mocks'
import { markUploadSaved, readUpload } from './uploads'
import { NotesInput, saveNotes, updateCard } from './notes'
import { forSolving, nextQuestion, problems, QuestionInput, saveQuestion, setTaps, submitAnswer, topicHistory } from './practice'
import { FixInput, prepareRetest, saveFix, tagMistake } from './topics'

// Lines 1–4 word for word from the brief; 5–7 from FIXES round 1; 8–11 from FIXES round 2.
// The topic list is sent once, here, instead of in every tool (Fix 10.1).
const TOPIC_LIST = SECTION_NAMES.map((s) => `${s}: ${Object.values(SECTIONS[s]).flat().join('; ')}`).join('\n')
export const INSTRUCTIONS = [
  '1. Read every question in the upload. Map each to one allowed topic; if unsure, ask the student.',
  '2. Estimate `ideal_seconds` for each question and write 3 type options and 3 approach options with the right one marked — only for wrong or slow questions; for the rest leave them out (add them later with `add_review_options`).',
  '3. After saving, tell the student what you read (count, anything unreadable) and give the app link so they can correct it.',
  '4. Do not grade or analyse yourself; use `get_report`.',
  '5. After a test or mock, call `get_report`, then go through the wrong questions one at a time: ask tap 1 and tap 2, call `tag_mistake`, explain where the thinking went wrong and the faster way, then call `save_fix`.',
  '6. Keep each explanation short. Do not solve the next question for the student.',
  '7. At the end, offer `start_retest`.',
  '8. At the start of a study chat, call `get_profile` once and use it to choose how to explain (e.g. analogy first if that is how the student learns).',
  '9. Use `get_topic` before `get_note`; open a full note only when needed.',
  '10. Walk mistakes with `next_mistake` (one at a time). Reuse its `solution_notes` or `saved_fix` instead of writing a new explanation.',
  '11. Explanations follow "Where it went wrong · Faster way · Rule", 80 words max.',
  '12. For a mock uploaded in the app: read it with `get_mock_upload` (follow next_page), then `save_mock` with upload_id and at most 30 rows, and `add_mock_rows` for the rest. For right-and-in-time questions a one-line question text is enough.',
  '',
  'Topics (use these exact names):',
  TOPIC_LIST,
].join('\n')

// Compact JSON: no indentation (every character is paid for by the student's Claude plan).
const text = (obj: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(obj) }] })
const error = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true })
/** A valid topic name, or an error listing the 3 closest. */
function topicOr(t: string): { topic: string } | { err: ReturnType<typeof error> } {
  const r = resolveTopic(t)
  return 'topic' in r ? r : { err: error(`Unknown topic "${t}". Closest: ${r.suggestions.join('; ')}.`) }
}
const badTopics = (topics: string[]) => {
  const bad = [...new Set(topics)].map((t) => [t, resolveTopic(t)] as const).filter(([, r]) => !('topic' in r))
  return bad.length ? error('Nothing saved. Unknown topics: ' + bad.map(([t, r]) => `"${t}" (closest: ${(r as { suggestions: string[] }).suggestions.join('; ')})`).join(', ')) : null
}
const fixTopic = <T extends { topic: string }>(x: T): T => ({ ...x, topic: (resolveTopic(x.topic) as { topic: string }).topic })

export function buildMcpServer(user: User, appUrl: string): McpServer {
  const server = new McpServer({ name: 'mbaprep', version: '1.1.0' }, { instructions: INSTRUCTIONS })
  const topicLink = (t: string) => `${appUrl}/topic/${encodeURIComponent(t)}`

  // ---------------- Mocks and tests ----------------
  server.registerTool('save_mock', { title: 'Save a mock', description: 'Save a mock, one row per question (≤30 here; add_mock_rows for the rest). Tap options only for wrong/slow questions.', inputSchema: { ...MockInput, rows: MockInput.rows.max(60), upload_id: z.number().int().min(1).optional().describe('From get_mock_upload') } },
    async ({ name, taken_on, has_time_data, section, rows, upload_id }) => {
      const bt = badTopics(rows.map((r) => r.topic))
      if (bt) return bt
      const problems = rows.flatMap(rowProblems)
      const nums = rows.map((r) => r.q_no)
      const dupes = nums.filter((n, i) => nums.indexOf(n) !== i)
      if (dupes.length) problems.push(`Duplicate q_no: ${[...new Set(dupes)].join(', ')}`)
      if (has_time_data && rows.some((r) => r.chosen_index !== null && (r.seconds === null || r.seconds === undefined)))
        problems.push('has_time_data is true but some attempted rows have no seconds')
      if (problems.length) return error('Nothing saved. Fix these and call save_mock again:\n- ' + problems.join('\n- '))
      const id = await createMock(user.id, { name, taken_on, has_time_data, section }, rows.map(fixTopic) as any)
      if (upload_id) await markUploadSaved(user.id, upload_id, id)
      const r = analyse((await getMock(user.id, id))!.rows, has_time_data)
      return text({ mock_id: id, saved: rows.length, score: r.score, max: r.max_score, app_link: `${appUrl}/mocks/${id}` })
    })

  server.registerTool('get_mock_upload', {
    title: 'Read an uploaded mock',
    description: 'Text of a mock paper the student uploaded in the app (default: the latest unread one), a chunk of pages at a time.',
    inputSchema: { upload_id: z.number().int().min(1).optional(), from_page: z.number().int().min(1).optional() },
  }, async ({ upload_id, from_page }) => {
    const r = await readUpload(user.id, upload_id, from_page)
    if (!r) return error(upload_id ? `No upload ${upload_id} for this account.` : 'No unread mock uploads. Ask the student to upload the PDF in the app (Mocks & Tests → Upload mock PDF).')
    const u = r.upload
    const head = { upload_id: u.id, name: u.name, section: u.section, pages: u.pages, status: u.status }
    if ('chunk' in r) return text({ ...head, ...r.chunk, next: r.chunk!.next_page ? 'Call again with from_page = next_page.' : 'All pages read. Save with save_mock (upload_id) and add_mock_rows.' })
    if (!r.pdf) return error('This upload has no text and no stored PDF.')
    return { content: [
      { type: 'text' as const, text: JSON.stringify({ ...head, note: 'Scanned PDF (no text layer): read the attached PDF.' }) },
      { type: 'resource' as const, resource: { uri: `${appUrl}/mocks?upload=${u.id}`, mimeType: 'application/pdf', blob: r.pdf.toString('base64') } },
    ] }
  })

  server.registerTool('add_mock_rows', {
    title: 'Add rows to a mock',
    description: 'Append more questions to a saved mock (long papers are saved in parts, ≤30 rows per call).',
    inputSchema: { mock_id: z.number().int().min(1), rows: z.array(RowInput).min(1).max(60) },
  }, async ({ mock_id, rows }) => {
    const bt = badTopics(rows.map((r) => r.topic))
    if (bt) return bt
    const problems = rows.flatMap(rowProblems)
    if (problems.length) return error('Nothing saved:\n- ' + problems.join('\n- '))
    const r = await addRows(user.id, mock_id, rows.map(fixTopic) as any)
    if (!r) return error(`No mock ${mock_id} for this account.`)
    if ('problem' in r) return error(r.problem as string)
    const m = analyse((await getMock(user.id, mock_id))!.rows, true)
    return text({ mock_id, added: r.added, total_rows: m.counts.total, score: m.score, app_link: `${appUrl}/mocks/${mock_id}` })
  })

  server.registerTool('add_review_options', {
    title: 'Add tap questions to a mistake',
    description: 'For one wrong/slow question saved without them: the 3 type options, 3 approach options (right ones marked) and a short solution.',
    inputSchema: {
      attempt_id: z.number().int().min(1),
      type_options: z.array(z.string().min(1)).length(3), type_answer: z.number().int().min(0).max(2),
      approach_options: z.array(z.string().min(1)).length(3), approach_answer: z.number().int().min(0).max(2),
      solution_notes: z.string().max(1500).optional(),
    },
  }, async ({ attempt_id, ...x }) => (await setReviewOptions(user.id, attempt_id, x)) ? text({ attempt_id, ok: true, next: 'Ask tap 1 and tap 2, then tag_mistake.' }) : error(`No question ${attempt_id} for this account.`))

  server.registerTool('get_report', {
    title: 'Mock or test report',
    description: 'Score, buckets, deficit and top fixes for a mock or test (default: the latest), plus a short list of wrong/slow questions.',
    inputSchema: { mock_id: z.number().int().min(1).optional(), cursor: z.string().optional().describe('next_cursor of the wrong list') },
  }, async ({ mock_id: given, cursor }) => {
    const [latest] = given ? [{ id: given }] : await q<{ id: number }>('SELECT id FROM mocks WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [user.id])
    if (!latest) return error('No mocks or tests yet.')
    const m = await getMock(user.id, latest.id)
    if (!m) return error(`No mock ${latest.id} for this account.`)
    const t = m.mock.has_time_data
    const r = analyse(m.rows, t)
    const flagged = m.rows.filter((x) => { const b = bucketOf(x, t); return b === 'incorrect' || b === 'over_time' })
    const p = page(flagged, cursor, 6) // 6 per page keeps the report under ~1,500 characters
    return text({
      mock_id: latest.id, name: oneLine(m.mock.name, 60), section: m.mock.section, source: m.mock.source,
      score: r.score, reachable: r.reachable_score, max: r.max_score,
      counts: { right: r.counts.correct, wrong: r.counts.incorrect, skipped: r.counts.skipped },
      buckets: { pocket: r.buckets.pocket, over_time: t ? r.buckets.over_time : 'n/a', incorrect: r.buckets.incorrect, could_solve: r.buckets.could_have_solved, not_solved: r.buckets.not_solved },
      abc: r.abc, unresolved_skips: r.pending_resolve,
      deficit: { fixable_now: r.deficit.fixable_now.total, needs_practice: r.deficit.needs_practice.total, over_time_min: r.deficit.over_time_extra_minutes },
      top_fixes: r.top_fixes.map((f) => oneLine(f, 100)),
      wrong: { items: p.items.map((x) => { const a = abcOf(x, t); return { id: x.id, q: oneLine(x.text, 34), topic: x.topic, r: bucketOf(x, t) === 'incorrect' ? 'wrong' : 'slow', tag: a === 'pending' ? null : a } }), total: p.total, next_cursor: p.next_cursor },
      link: `${appUrl}/mocks/${latest.id}`,
      next: 'Use next_mistake to review one at a time.',
    })
  })

  server.registerTool('next_mistake', {
    title: 'Next mistake to review',
    description: 'The next untagged wrong or slow question (default: latest mock/test), with tap options and any saved solution or fix to reuse.',
    inputSchema: { mock_id: z.number().int().min(1).optional() },
  }, async ({ mock_id }) => {
    const r = await nextMistake(user.id, mock_id)
    return 'problem' in r ? error(r.problem as string) : text(r)
  })

  server.registerTool('tag_mistake', {
    title: 'Tag a mistake A/B/C',
    description: 'Record the two taps for one wrong/slow question (skip approach_tap if tap 1 was wrong). Returns A/B/C and whether it repeats.',
    inputSchema: { attempt_id: z.number().int().min(1), type_tap: z.number().int().min(0).max(2), approach_tap: z.number().int().min(0).max(2).optional() },
  }, async ({ attempt_id, type_tap, approach_tap }) => {
    const r = await tagMistake(user.id, attempt_id, type_tap, approach_tap ?? null)
    if (!r) return error(`No question ${attempt_id} for this account.`)
    if ('problem' in r) return error(r.problem as string)
    return text({ ...r, meaning: r.error_class ? ABC_LABEL[r.error_class] : 'slow, both taps right: no letter' })
  })

  server.registerTool('save_fix', {
    title: 'Save a fix note',
    description: 'Save the fix for a mistake as a note on its topic (and one flashcard by default).',
    inputSchema: FixInput,
  }, async (x) => {
    const r = await saveFix(user.id, x)
    if (!r) return error(`No question ${x.attempt_id} for this account.`)
    return text({ note_id: r.note_id, flashcard: r.flashcard, topic_link: topicLink(r.topic) })
  })

  server.registerTool('start_retest', {
    title: 'Retest open mistakes',
    description: 'Build a test from the not-yet-fixed mistakes (same questions), for one topic or all. Returns the app link.',
    inputSchema: { topic: z.string().max(60).optional() },
  }, async ({ topic }) => {
    let t: string | undefined
    if (topic) { const r = topicOr(topic); if ('err' in r) return r.err; t = r.topic }
    const ids = await prepareRetest(user.id, t)
    if (!ids.length) return text({ questions: 0, message: t ? `No open mistakes in ${t}.` : 'No open mistakes.' })
    return text({ questions: ids.length, app_link: `${appUrl}/test?retest=1${t ? `&topic=${encodeURIComponent(t)}` : ''}` })
  })

  // ---------------- Questions and practice ----------------
  const QuestionObject = z.object(QuestionInput)
  async function saveMany(list: z.infer<typeof QuestionObject>[]) {
    const bt = badTopics(list.map((x) => x.topic))
    if (bt) return bt
    const errs = list.flatMap((x, i) => problems(x).map((p) => `#${i + 1}: ${p}`))
    if (errs.length) return error('Nothing saved: ' + errs.join('; '))
    const ids: number[] = []
    for (const x of list) ids.push(await saveQuestion(user.id, fixTopic(x)))
    const topics = [...new Set(list.map((x) => fixTopic(x).topic))]
    return text({ saved: ids.length, ids, topics: topics.map((t) => ({ topic: t, link: topicLink(t) })) })
  }
  server.registerTool('save_questions', {
    title: 'Save practice questions',
    description: 'Save up to 50 questions at once (e.g. a whole assignment PDF) into the topic question sets.',
    inputSchema: { questions: z.array(QuestionObject).min(1).max(50) },
  }, async ({ questions }) => saveMany(questions))

  server.registerTool('save_question', {
    title: 'Save one practice question',
    description: 'Save one question. For several, use save_questions.',
    inputSchema: QuestionInput,
  }, async (x) => saveMany([x]))

  server.registerTool('next_question', {
    title: 'Next practice question',
    description: 'One question for a topic, without answer, solution or hints. Give no hints; note the time; then submit_answer.',
    inputSchema: { topic: z.string().max(60), difficulty: z.enum(DIFFICULTIES).optional() },
  }, async ({ topic, difficulty }) => {
    const r = topicOr(topic); if ('err' in r) return r.err
    const x = await nextQuestion(user.id, r.topic, difficulty)
    return x ? text(forSolving(x)) : text({ question: null, message: `No saved questions for ${r.topic}${difficulty ? ` (${difficulty})` : ''}.` })
  })

  server.registerTool('submit_answer', {
    title: 'Submit an answer',
    description: 'Step 1: question_id, chosen_index, seconds → correct? If wrong, ask the two taps and call again with attempt_id, type_tap, approach_tap → A/B/C and repeat.',
    inputSchema: {
      question_id: z.number().int().min(1).optional(), chosen_index: z.number().int().min(0).optional(), seconds: z.number().int().min(0).max(36000).optional(),
      attempt_id: z.number().int().min(1).optional(), type_tap: z.number().int().min(0).max(2).optional(), approach_tap: z.number().int().min(0).max(2).optional(),
    },
  }, async (a) => {
    if (a.attempt_id) {
      if (a.type_tap === undefined) return error('Step 2 needs type_tap (and approach_tap unless tap 1 was wrong).')
      const r = await setTaps(user.id, a.attempt_id, a.type_tap, a.approach_tap ?? null)
      if (!r) return error(`No attempt ${a.attempt_id} for this account.`)
      if ('problems' in r) return error((r as any).problems.join('; '))
      if (!r.error_class) return error('Tap 1 was right, so approach_tap is needed too.')
      return text({ attempt_id: r.id, error_class: r.error_class, meaning: ABC_LABEL[r.error_class], repeat: r.repeat })
    }
    if (!a.question_id || a.chosen_index === undefined || a.seconds === undefined) return error('Step 1 needs question_id, chosen_index and seconds.')
    const r = await submitAnswer(user.id, a.question_id, a.chosen_index, a.seconds)
    if (!r) return error(`No question ${a.question_id} for this account.`)
    if ('problems' in r) return error(r.problems!.join('; '))
    const { attempt, question: x } = r
    return text({
      attempt_id: attempt.id, correct: attempt.correct, seconds: attempt.seconds, ideal_seconds: x.ideal_seconds,
      ...(attempt.correct ? { solution_notes: oneLine(x.solution_notes, 300) } : { tap_1: x.type_options, tap_2: x.approach_options }),
    })
  })

  server.registerTool('get_topic_history', {
    title: 'Practice history',
    description: 'Recent practice attempts in a topic with errors and repeats (10 per page).',
    inputSchema: { topic: z.string().max(60), cursor: z.string().optional() },
  }, async ({ topic, cursor }) => {
    const r = topicOr(topic); if ('err' in r) return r.err
    const h = await topicHistory(user.id, r.topic)
    const p = page(h.history, cursor, 10)
    return text({ topic: h.topic, attempts: h.attempts, right: h.right, errors: h.errors,
      items: p.items.map((a) => ({ id: a.id, q: oneLine(a.text, 50), ok: a.correct, s: a.seconds, err: a.error_class, repeat: a.repeat })), next_cursor: p.next_cursor })
  })

  // ---------------- Notes ----------------
  server.registerTool('save_notes', {
    title: 'Save notes and cards',
    description: 'Save a Markdown summary, formulas and 5–8 flashcards for a topic. Ask the student to tap "How did this click?" in the app.',
    inputSchema: NotesInput,
  }, async (x) => {
    const r = topicOr(x.topic); if ('err' in r) return r.err
    const id = await saveNotes(user.id, { ...x, topic: r.topic as any })
    return text({ note_id: id, flashcards: x.flashcards.length, note_link: `${appUrl}/notes/${id}` })
  })

  server.registerTool('get_profile', {
    title: 'Learner profile',
    description: 'A short learner profile (exam date, weakest topics, error mix, how they learn, open repeats, own rules). Call once per study chat.',
    inputSchema: {},
  }, async () => ({ content: [{ type: 'text' as const, text: await profile(user.id) }] }))

  server.registerTool('get_topic', {
    title: 'Topic overview',
    description: 'Compact view of a topic: note titles with the first 300 characters, open mistakes, files. Use before get_note.',
    inputSchema: {
      topic: z.string().max(60),
      include: z.array(z.enum(['notes', 'mistakes', 'files'])).optional().describe('Default: notes and mistakes'),
      cursor: z.string().optional(),
    },
  }, async ({ topic, include, cursor }) => {
    const r = topicOr(topic); if ('err' in r) return r.err
    return text(await topicDigest(user.id, r.topic, (include?.length ? include : ['notes', 'mistakes']) as Include[], cursor))
  })

  server.registerTool('get_note', {
    title: 'Open one note',
    description: 'One note in full, or an uploaded file (images come back as images).',
    inputSchema: { note_id: z.number().int().min(1) },
  }, async ({ note_id }) => {
    const r = await noteFull(user.id, note_id)
    if (!r) return error(`No note ${note_id} for this account.`)
    const { note, file } = r
    const meta = { id: note.id, topic: note.topic, kind: note.kind, title: note.title, ...(note.link_url ? { link: note.link_url } : {}),
      ...(note.kind === 'file' ? { file: file?.name, read: note.file_read, next: note.file_read ? undefined : 'After reading, call mark_file_read.' } : {}),
      text: note.summary, formulas: note.formulas, flashcards: note.flashcards }
    if (!file) return text(meta)
    const data = file.data.toString('base64')
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(meta) },
        file.mime.startsWith('image/')
          ? { type: 'image' as const, data, mimeType: file.mime }
          : { type: 'resource' as const, resource: { uri: `${appUrl}/notes/${note.id}`, mimeType: file.mime, blob: data } },
      ],
    }
  })

  server.registerTool('update_note', {
    title: 'Rewrite a note',
    description: 'Replace a note’s Markdown text (and title). The previous version is kept; the student can restore it in the app.',
    inputSchema: { note_id: z.number().int().min(1), title: z.string().max(200).optional(), body: z.string().min(1).max(20000).describe('Markdown') },
  }, async ({ note_id, title, body }) => {
    const r = await rewriteNote(user.id, note_id, body, title)
    return r ? text({ ...r, note_link: `${appUrl}/notes/${note_id}` }) : error(`No note ${note_id} for this account.`)
  })

  server.registerTool('update_card', {
    title: 'Edit a flashcard',
    description: 'Change a flashcard’s front and/or back (card ids come from get_note). Its review schedule is kept.',
    inputSchema: { card_id: z.number().int().min(1), front: z.string().min(1).max(500).optional(), back: z.string().min(1).max(1000).optional() },
  }, async ({ card_id, front, back }) => {
    if (front === undefined && back === undefined) return error('Send front, back or both.')
    const c = await updateCard(user.id, card_id, { ...(front !== undefined ? { front } : {}), ...(back !== undefined ? { back } : {}) })
    return c ? text({ card_id, front: oneLine(c.front, 80), back: oneLine(c.back, 80), due_on: c.due_on }) : error(`No card ${card_id} for this account.`)
  })

  server.registerTool('mark_file_read', {
    title: 'Mark a file read',
    description: 'After reading an uploaded file (get_note): save its summary and flashcards; the file note becomes a read note.',
    inputSchema: {
      note_id: z.number().int().min(1),
      summary: z.string().min(1).max(20000).describe('Markdown'),
      flashcards: z.array(z.object({ front: z.string().min(1).max(500), back: z.string().min(1).max(1000) })).max(8),
    },
  }, async ({ note_id, summary, flashcards }) => {
    const r = await markFileRead(user.id, note_id, summary, flashcards)
    if (!r) return error(`No note ${note_id} for this account.`)
    if ('problem' in r) return error(r.problem as string)
    return text({ ...r, note_link: `${appUrl}/notes/${note_id}` })
  })

  return server
}
