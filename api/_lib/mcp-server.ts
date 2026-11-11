import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { analyse } from '../../shared/analysis'
import { CONFIG } from '../../shared/config'
import { TOPICS } from '../../shared/topics'
import type { User } from './auth'
import { createMock, getMock, MockInput, rowProblems } from './mocks'
import { NotesInput, saveNotes } from './notes'
import { forSolving, nextQuestion, problems, QuestionInput, saveQuestion, setTaps, submitAnswer, topicHistory } from './practice'
import { DIFFICULTIES } from '../../shared/practice'
import { ABC_LABEL, abcOf, bucketOf } from '../../shared/analysis'
import { q } from './db'
import { FixInput, prepareRetest, saveFix, tagMistake } from './topics'

// Sent word for word, as written in the brief.
export const INSTRUCTIONS = [
  '1. Read every question in the upload. Map each to one allowed topic; if unsure, ask the student.',
  '2. Estimate `ideal_seconds` for each question and write 3 type options and 3 approach options with the right one marked.',
  '3. After saving, tell the student what you read (count, anything unreadable) and give the app link so they can correct it.',
  '4. Do not grade or analyse yourself; use `get_report`.',
  '5. After a test or mock, call `get_report`, then go through the wrong questions one at a time: ask tap 1 and tap 2, call `tag_mistake`, explain where the thinking went wrong and the faster way, then call `save_fix`.',
  '6. Keep each explanation short. Do not solve the next question for the student.',
  '7. At the end, offer `start_retest`.',
].join('\n')

const text = (obj: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] })
const error = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true })

export function buildMcpServer(user: User, appUrl: string): McpServer {
  const server = new McpServer({ name: 'cat-prep', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'save_mock',
    {
      title: 'Save a mock test',
      description:
        "Save a CAT mock the student uploaded: one row per question with the student's answer, the correct answer, " +
        'time spent (if the report has it), your ideal time estimate, 3 type options and 3 approach options. ' +
        `Allowed topics: ${TOPICS.join('; ')}. Returns mock_id, score and the app link where the student can check and edit every row.`,
      inputSchema: MockInput,
    },
    async ({ name, taken_on, has_time_data, section, rows }) => {
      const problems = rows.flatMap(rowProblems)
      const nums = rows.map((r) => r.q_no)
      const dupes = nums.filter((n, i) => nums.indexOf(n) !== i)
      if (dupes.length) problems.push(`Duplicate q_no: ${[...new Set(dupes)].join(', ')}`)
      if (has_time_data && rows.some((r) => r.chosen_index !== null && (r.seconds === null || r.seconds === undefined)))
        problems.push('has_time_data is true but some attempted rows have no seconds')
      if (problems.length) return error('Nothing saved. Fix these and call save_mock again:\n- ' + problems.join('\n- '))

      const id = await createMock(user.id, { name, taken_on, has_time_data, section }, rows)
      const report = analyse((await getMock(user.id, id))!.rows, has_time_data)
      return text({
        mock_id: id,
        questions_saved: rows.length,
        score: report.score,
        max_score: report.max_score,
        app_link: `${appUrl}/mocks/${id}`,
        next: 'Tell the student what you read and share app_link. Use get_report for the analysis.',
      })
    },
  )

  server.registerTool(
    'get_report',
    {
      title: 'Get the analysis of a mock',
      description:
        'The app’s rule-based analysis of a saved mock: score, reachable score, bucket counts, deficit split and top 3 fixes. ' +
        'A/B/C needs the student’s two review taps in the app, and could-have-solved needs the re-solve in the app; ' +
        'until then those parts show as pending.',
      inputSchema: { mock_id: z.number().int().min(1).optional().describe('Leave out for the latest mock or test') },
    },
    async ({ mock_id: given }) => {
      const [latest] = given ? [{ id: given }] : await q<{ id: number }>('SELECT id FROM mocks WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [user.id])
      if (!latest) return error('No mocks or tests yet.')
      const mock_id = latest.id
      const m = await getMock(user.id, mock_id)
      if (!m) return error(`No mock ${mock_id} for this account.`)
      const r = analyse(m.rows, m.mock.has_time_data)
      return text({
        mock: m.mock.name,
        taken_on: m.mock.taken_on,
        score: r.score,
        reachable_score: r.reachable_score,
        max_score: r.max_score,
        scoring: `+${CONFIG.MARKS_CORRECT} correct, −${CONFIG.MARKS_WRONG} wrong, 0 skipped`,
        counts: r.counts,
        buckets: r.over_time_tracked ? r.buckets : { ...r.buckets, over_time: 'not tracked (no time data)' },
        over_time_note: r.over_time_note,
        abc: r.abc,
        pending: {
          review_taps_needed: r.abc.pending,
          skipped_not_yet_re_solved: r.pending_resolve,
        },
        deficit: {
          fixable_now: r.deficit.fixable_now,
          needs_practice: r.deficit.needs_practice,
          over_time_extra_minutes: r.deficit.over_time_extra_minutes,
        },
        top_3_fixes: r.top_fixes,
        mock_id,
        section: m.mock.section,
        source: m.mock.source,
        app_link: `${appUrl}/mocks/${mock_id}`,
        review_link: `${appUrl}/mocks/${mock_id}/review`,
        // One entry per wrong or over-time question, for tag_mistake and save_fix. Tap answers are not included.
        wrong_or_over_time: m.rows
          .filter((r) => { const b = bucketOf(r, m.mock.has_time_data); return b === 'incorrect' || b === 'over_time' })
          .map((r) => {
            const abc = abcOf(r, m.mock.has_time_data)
            return {
              attempt_id: r.id, q_no: r.q_no, topic: r.topic, text: r.text, options: r.options,
              student_answer: r.chosen_index, correct_answer: r.correct_index, seconds: r.seconds, ideal_seconds: r.ideal_seconds,
              result: bucketOf(r, m.mock.has_time_data) === 'incorrect' ? 'wrong' : 'right but over time',
              tap_1_which_type: r.type_options, tap_2_fastest_approach: r.approach_options,
              already_tagged: abc === 'pending' ? null : abc ?? 'no letter (over time, both taps right)',
            }
          }),
      })
    },
  )

  // ---------------- Tier 2: questions and practice ----------------
  server.registerTool(
    'save_question',
    {
      title: 'Save a practice question',
      description:
        "Save one question from a teacher's screenshot or an assignment PDF into the student's question sets. " +
        'For a PDF, call it once per question. Same fields as a mock row plus difficulty and 1–3 hints. ' +
        'Hints are only shown in the app after the student answers, one at a time. Returns question_id and the app link to check or edit it.',
      inputSchema: QuestionInput,
    },
    async (x) => {
      const p = problems(x)
      if (p.length) return error('Nothing saved: ' + p.join('; '))
      const id = await saveQuestion(user.id, x)
      return text({ question_id: id, topic: x.topic, difficulty: x.difficulty, app_link: `${appUrl}/practice/questions/${id}`, topic_link: `${appUrl}/topic/${encodeURIComponent(x.topic)}` })
    },
  )

  server.registerTool(
    'next_question',
    {
      title: 'Get the next practice question',
      description:
        'One question for a topic (optionally a difficulty): never-tried first, then ones last answered wrong. ' +
        'Returned WITHOUT the answer, solution or hints. Show it as is, give no hints, note the time, then call submit_answer. ' +
        'For a timed set with no feedback, the student can start a test on the topic page: topic_link.',
      inputSchema: { topic: QuestionInput.topic, difficulty: z.enum(DIFFICULTIES).optional() },
    },
    async ({ topic, difficulty }) => {
      const x = await nextQuestion(user.id, topic, difficulty)
      if (!x) return text({ question: null, message: `No saved questions for ${topic}${difficulty ? ` (${difficulty})` : ''}. Save some with save_question.` })
      return text({ ...forSolving(x), topic_link: `${appUrl}/topic/${encodeURIComponent(topic)}` })
    },
  )

  server.registerTool(
    'submit_answer',
    {
      title: "Save the student's answer",
      description:
        'Step 1: send question_id, chosen_index and seconds. Returns whether it is correct. ' +
        'If wrong, it also returns the two tap questions (type, then fastest approach) without their answers: ask the student ' +
        'tap 1, then tap 2 (skip tap 2 if tap 1 is wrong), and call submit_answer again with attempt_id, type_tap and approach_tap. ' +
        'Step 2 returns A (comprehension), B (optimal approach) or C (mistake) and whether it repeats the same error in this topic’s last 10 attempts. ' +
        'Do not give hints before the answer.',
      inputSchema: {
        question_id: z.number().int().min(1).optional(),
        chosen_index: z.number().int().min(0).optional(),
        seconds: z.number().int().min(0).max(36000).optional(),
        attempt_id: z.number().int().min(1).optional().describe('Step 2 only'),
        type_tap: z.number().int().min(0).max(2).optional().describe('Step 2: the type option the student picked'),
        approach_tap: z.number().int().min(0).max(2).optional().describe('Step 2: the approach option the student picked'),
      },
    },
    async (a) => {
      if (a.attempt_id) {
        if (a.type_tap === undefined) return error('Step 2 needs type_tap (and approach_tap unless tap 1 was wrong).')
        const r = await setTaps(user.id, a.attempt_id, a.type_tap, a.approach_tap ?? null)
        if (!r) return error(`No attempt ${a.attempt_id} for this account.`)
        if ('problems' in r) return error((r as any).problems.join('; '))
        if (!r.error_class) return error('Tap 1 was right, so approach_tap is needed too.')
        return text({ attempt_id: r.id, error_class: r.error_class, meaning: ABC_LABEL[r.error_class], repeat: r.repeat, note: r.repeat ? 'Same error as an earlier attempt in this topic.' : 'Not a repeat.' })
      }
      if (!a.question_id || a.chosen_index === undefined || a.seconds === undefined) return error('Step 1 needs question_id, chosen_index and seconds.')
      const r = await submitAnswer(user.id, a.question_id, a.chosen_index, a.seconds)
      if (!r) return error(`No question ${a.question_id} for this account.`)
      if ('problems' in r) return error(r.problems!.join('; '))
      const { attempt, question: x } = r
      return text({
        attempt_id: attempt.id,
        correct: attempt.correct,
        seconds: attempt.seconds,
        ideal_seconds: x.ideal_seconds,
        ...(attempt.correct
          ? { solution_notes: x.solution_notes }
          : {
              next: 'Ask tap 1, then tap 2, and call submit_answer with attempt_id, type_tap, approach_tap.',
              tap_1_which_type: x.type_options,
              tap_2_fastest_approach: x.approach_options,
            }),
        review_link: `${appUrl}/practice/questions/${x.id}`,
        topic_link: `${appUrl}/topic/${encodeURIComponent(x.topic)}`,
      })
    },
  )

  server.registerTool(
    'get_topic_history',
    {
      title: 'Practice history for a topic',
      description: "The student's last 20 attempts in a topic with right/wrong, time, A/B/C and repeats, so you can explain patterns.",
      inputSchema: { topic: QuestionInput.topic },
    },
    async ({ topic }) => text(await topicHistory(user.id, topic)),
  )

  // ---------------- Tier 3: notes ----------------
  server.registerTool(
    'save_notes',
    {
      title: 'Save notes and flashcards',
      description:
        'From a photo of lecture notes, a text dump or a transcript: a plain summary, the formulas, and 5–8 flashcards, ' +
        'saved to the topic page. Cards are due today, then on a 1, 2, 4, 8-day schedule. ' +
        'Tell the student to open note_link and answer "How did this click?" (example, formula, diagram, shortcut, analogy).',
      inputSchema: NotesInput,
    },
    async (x) => {
      const id = await saveNotes(user.id, x)
      return text({ note_id: id, flashcards: x.flashcards.length, note_link: `${appUrl}/notes/${id}`, topic_link: `${appUrl}/topic/${encodeURIComponent(x.topic)}`, review_link: `${appUrl}/notes/review?topic=${encodeURIComponent(x.topic)}` })
    },
  )

  // ---------------- FIXES round 1: analysis in Claude, saved back to the topic ----------------
  server.registerTool(
    'tag_mistake',
    {
      title: 'Tag a mistake with A/B/C',
      description:
        'The two taps for one wrong or over-time question from get_report, done in chat. Ask the student tap 1 (which type), then tap 2 ' +
        '(fastest approach; skip it if tap 1 was wrong). Returns A (comprehension), B (optimal approach) or C (mistake), and whether the ' +
        'same error happened in this topic’s last 10 attempts.',
      inputSchema: {
        attempt_id: z.number().int().min(1).describe('attempt_id from get_report'),
        type_tap: z.number().int().min(0).max(2).describe('Index of the type option the student chose'),
        approach_tap: z.number().int().min(0).max(2).optional().describe('Index of the approach option the student chose (not needed if tap 1 was wrong)'),
      },
    },
    async ({ attempt_id, type_tap, approach_tap }) => {
      const r = await tagMistake(user.id, attempt_id, type_tap, approach_tap ?? null)
      if (!r) return error(`No question ${attempt_id} for this account.`)
      if ('problem' in r) return error(r.problem as string)
      return text({ ...r, meaning: r.error_class ? ABC_LABEL[r.error_class] : 'Right but slow: both taps right, so no letter', topic_link: `${appUrl}/topic/${encodeURIComponent(r.topic)}` })
    },
  )

  server.registerTool(
    'save_fix',
    {
      title: 'Save a fix note for a mistake',
      description:
        'After explaining a mistake: saves a fix note on its topic, linked to the question (what went wrong, the correct approach, the rule). ' +
        'By default also adds one flashcard: the question in one line → the rule.',
      inputSchema: FixInput,
    },
    async (x) => {
      const r = await saveFix(user.id, x)
      if (!r) return error(`No question ${x.attempt_id} for this account.`)
      return text({ ...r, note_link: `${appUrl}/notes/${r.note_id}`, topic_link: `${appUrl}/topic/${encodeURIComponent(r.topic)}` })
    },
  )

  server.registerTool(
    'start_retest',
    {
      title: 'Retest the student’s mistakes',
      description:
        'Builds a test from the same questions the student got wrong (or too slow) and has not fixed yet, for one topic or all. ' +
        'Returns how many and the app link; the student solves it in the app with a timer and no feedback. A mistake becomes Fixed when ' +
        'answered right within its ideal time, Repeated when wrong again.',
      inputSchema: { topic: QuestionInput.topic.optional() },
    },
    async ({ topic }) => {
      const ids = await prepareRetest(user.id, topic)
      if (!ids.length) return text({ questions: 0, message: topic ? `No open mistakes in ${topic}.` : 'No open mistakes.' })
      return text({ questions: ids.length, app_link: `${appUrl}/test?retest=1${topic ? `&topic=${encodeURIComponent(topic)}` : ''}` })
    },
  )

  return server
}
