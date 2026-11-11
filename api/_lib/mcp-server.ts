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
import { ABC_LABEL } from '../../shared/analysis'

// Sent word for word, as written in the brief.
export const INSTRUCTIONS = [
  '1. Read every question in the upload. Map each to one allowed topic; if unsure, ask the student.',
  '2. Estimate `ideal_seconds` for each question and write 3 type options and 3 approach options with the right one marked.',
  '3. After saving, tell the student what you read (count, anything unreadable) and give the app link so they can correct it.',
  '4. Do not grade or analyse yourself; use `get_report`.',
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
    async ({ name, taken_on, has_time_data, rows }) => {
      const problems = rows.flatMap(rowProblems)
      const nums = rows.map((r) => r.q_no)
      const dupes = nums.filter((n, i) => nums.indexOf(n) !== i)
      if (dupes.length) problems.push(`Duplicate q_no: ${[...new Set(dupes)].join(', ')}`)
      if (has_time_data && rows.some((r) => r.chosen_index !== null && (r.seconds === null || r.seconds === undefined)))
        problems.push('has_time_data is true but some attempted rows have no seconds')
      if (problems.length) return error('Nothing saved. Fix these and call save_mock again:\n- ' + problems.join('\n- '))

      const id = await createMock(user.id, { name, taken_on, has_time_data }, rows)
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
      inputSchema: { mock_id: z.number().int().min(1) },
    },
    async ({ mock_id }) => {
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
        app_link: `${appUrl}/mocks/${mock_id}`,
        review_link: `${appUrl}/mocks/${mock_id}/review`,
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
      return text({ question_id: id, topic: x.topic, difficulty: x.difficulty, app_link: `${appUrl}/practice/questions/${id}`, practice_link: `${appUrl}/practice` })
    },
  )

  server.registerTool(
    'next_question',
    {
      title: 'Get the next practice question',
      description:
        'One question for a topic (optionally a difficulty): never-tried first, then ones last answered wrong. ' +
        'Returned WITHOUT the answer, solution or hints. Show it as is, give no hints, note the time, then call submit_answer. ' +
        'Practising in the app has a built-in timer: practice_link.',
      inputSchema: { topic: QuestionInput.topic, difficulty: z.enum(DIFFICULTIES).optional() },
    },
    async ({ topic, difficulty }) => {
      const x = await nextQuestion(user.id, topic, difficulty)
      if (!x) return text({ question: null, message: `No saved questions for ${topic}${difficulty ? ` (${difficulty})` : ''}. Save some with save_question.` })
      return text({ ...forSolving(x), practice_link: `${appUrl}/practice/session?topic=${encodeURIComponent(topic)}${difficulty ? `&difficulty=${difficulty}` : ''}` })
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
      return text({ note_id: id, flashcards: x.flashcards.length, note_link: `${appUrl}/notes/${id}`, review_link: `${appUrl}/notes/review` })
    },
  )

  return server
}
