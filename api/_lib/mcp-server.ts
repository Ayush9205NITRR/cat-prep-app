import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { analyse } from '../../shared/analysis'
import { CONFIG } from '../../shared/config'
import { TOPICS } from '../../shared/topics'
import type { User } from './auth'
import { createMock, getMock, MockInput, rowProblems } from './mocks'

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

  return server
}
