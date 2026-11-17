// The reviewer account: the whole loop already done once, so a reviewer sees every screen with real data.
// Built with the app's own functions (no hand-written SQL rows), only when the account does not exist yet
// (or with --reset-reviewer), so reviewers' own changes survive later deploys.
import { createUser, hashPassword } from '../api/_lib/auth'
import { q } from '../api/_lib/db'
import { createMock } from '../api/_lib/mocks'
import { saveNotes, createNote, updateNote } from '../api/_lib/notes'
import { saveQuestion } from '../api/_lib/practice'
import { saveFix, submitTest, tagMistake } from '../api/_lib/topics'
import { SAMPLE_MOCK, SAMPLE_ROWS } from '../shared/sample-mock'
import { SAMPLE_NOTE, SAMPLE_PRACTICE } from '../shared/sample-practice'

export const REVIEWER = { username: 'reviewer', password: 'cat-review-2026' }

const q3 = (t: string, ta: number, a: string, b: string, c: string, aa: number) => ({ type_options: [t, 'Other type', 'Not sure'], type_answer: ta, approach_options: [a, b, c], approach_answer: aa })

const VARC_ROWS = [
  { q_no: 1, topic: 'Reading Comprehension', text: 'Passage on urban heat islands. The author’s main concern is…', options: ['the cost of air-conditioning', 'how city design traps heat', 'rural migration', 'tree species'], correct_index: 1, chosen_index: 1, seconds: 95, ideal_seconds: 120, ...q3('Main idea', 0, 'Read first and last paragraphs', 'Re-read everything', 'Guess from options', 0), solution_notes: 'Paragraphs 1 and 4 both frame design as the cause.' },
  { q_no: 2, topic: 'Reading Comprehension', text: 'Which can be inferred about the author’s view of green roofs?', options: ['They are useless', 'They help but are not enough alone', 'They cost too much', 'They replace parks'], correct_index: 1, chosen_index: 2, seconds: 140, ideal_seconds: 120, type_options: ['Main idea', 'Inference', 'Tone'], type_answer: 1, approach_options: ['Find the supporting line', 'Eliminate extreme options first', 'Pick the most familiar idea'], approach_answer: 1, solution_notes: '“…helps, but only with wider changes” (para 3). Options a and c are extreme or unstated.' },
  { q_no: 3, topic: 'Para Jumbles', text: 'Arrange: (1) Hence costs fell. (2) Firms adopted the method. (3) A new method appeared. (4) Output rose.', options: ['3241', '3214', '2341', '3421'], correct_index: 0, chosen_index: 1, seconds: 80, ideal_seconds: 90, type_options: ['Cause → effect chain', 'Chronological story', 'General → example'], type_answer: 0, approach_options: ['Find the opening, then link pairs', 'Try every order', 'Start from the last sentence'], approach_answer: 0, solution_notes: '3 opens; 2 follows; output rises (4), hence costs fell (1).' },
  { q_no: 4, topic: 'Critical Reasoning', text: 'Which most weakens: “Sales rose after the ad, so the ad worked”?', options: ['The ad was colourful', 'A rival shut down that week', 'Sales rose in all cities', 'The ad cost less'], correct_index: 1, chosen_index: 1, seconds: 70, ideal_seconds: 75, ...q3('Weaken an argument', 0, 'Look for another cause', 'Attack the evidence', 'Restate the claim', 0), solution_notes: 'Another cause (rival closing) explains the rise.' },
  { q_no: 5, topic: 'Vocabulary', text: 'Closest in meaning to “ephemeral”:', options: ['lasting', 'brief', 'heavy', 'bright'], correct_index: 1, chosen_index: null, seconds: null, ideal_seconds: 30, ...q3('Synonym', 0, 'Recall or use the root', 'Use the sentence', 'Eliminate antonyms', 0), solution_notes: 'Ephemeral = lasting a very short time.' },
]

const DILR_QS = [
  { topic: 'Tables', difficulty: 'easy' as const, text: 'Sales (units): Jan 120, Feb 150, Mar 180. Percentage rise from Jan to Mar?', options: ['40%', '50%', '60%', '33%'], correct_index: 1, ideal_seconds: 45, type_options: ['Percentage change', 'Average', 'Ratio'], type_answer: 0, approach_options: ['(180 − 120) ÷ 120', 'Average the months', 'Compare with Feb'], approach_answer: 0, solution_notes: '60 ÷ 120 = 50%.', hints: ['Change ÷ starting value.'] },
  { topic: 'Bar Graphs', difficulty: 'medium' as const, text: 'Bars: A 40, B 55, C 35, D 70 (₹ lakh). D is what percent more than the average of A, B, C?', options: ['35%', '50%', '61.5%', '75%'], correct_index: 2, ideal_seconds: 90, type_options: ['Percent more than an average', 'Simple average', 'Share of total'], type_answer: 0, approach_options: ['Average = 130 ÷ 3, then compare', 'Compare D with each bar', 'Use the total'], approach_answer: 0, solution_notes: 'Average of A, B, C = 130 ÷ 3 ≈ 43.3. (70 − 43.3) ÷ 43.3 ≈ 61.5%.', hints: ['Find the average of A, B and C first.'] },
  { topic: 'Data Sufficiency', difficulty: 'medium' as const, text: 'Is x > y? (1) x − y = 3. (2) x + y = 9.', options: ['(1) alone', '(2) alone', 'Both together', 'Each alone'], correct_index: 0, ideal_seconds: 60, type_options: ['Yes/no data sufficiency', 'Value data sufficiency', 'Ranking'], type_answer: 0, approach_options: ['Test each statement alone first', 'Solve both together', 'Plug numbers'], approach_answer: 0, solution_notes: '(1) gives x − y = 3 > 0, so yes. (2) alone does not.', hints: ['Check each statement on its own first.'] },
]

const LR_ROWS = [
  { q_no: 1, topic: 'Arrangements', text: 'Six people sit around a round table. A is opposite B; C is to the immediate left of A. Who sits opposite C?', options: ['D', 'E', 'F', 'Cannot be determined'], correct_index: 3, chosen_index: 0, seconds: 210, ideal_seconds: 150, solution_notes: 'Two positions remain open for D, E, F: not enough information.' },
  { q_no: 2, topic: 'Games & Tournaments', text: '8 teams play a single round-robin. What is the total number of matches?', options: ['16', '28', '56', '64'], correct_index: 1, chosen_index: 1, seconds: 60, ideal_seconds: 60, solution_notes: '8C2 = 28.' },
  { q_no: 3, topic: 'Venn Diagrams', text: '40 like tea, 30 coffee, 10 both, 20 neither. How many people in all?', options: ['80', '90', '100', '70'], correct_index: 0, chosen_index: 0, seconds: 75, ideal_seconds: 60, solution_notes: '40 + 30 − 10 + 20 = 80.' },
  { q_no: 4, topic: 'Tables', text: 'Revenue grew from 200 to 260. Percentage growth?', options: ['25%', '30%', '35%', '60%'], correct_index: 1, chosen_index: null, seconds: null, ideal_seconds: 45, solution_notes: '60 ÷ 200 = 30%.' },
]
const FULL_NAME = 'Sample full-length mock (VARC + DILR + Quant)'

/** A full-length sample (all 3 sections) for the reviewer, added once if missing. */
async function ensureFullMock(userId: number) {
  const [has] = await q('SELECT id FROM mocks WHERE user_id = $1 AND name = $2', [userId, FULL_NAME])
  if (has) return false
  const rows = [
    ...VARC_ROWS.map((r) => ({ ...r })),
    ...LR_ROWS.map((r, i) => ({ ...r, q_no: VARC_ROWS.length + i + 1 })),
    ...SAMPLE_ROWS.slice(0, 12).map((r, i) => ({ ...r, q_no: VARC_ROWS.length + LR_ROWS.length + i + 1 })),
  ]
  await createMock(userId, { name: FULL_NAME, taken_on: SAMPLE_MOCK.taken_on, has_time_data: true, section: 'Full' }, rows as any)
  return true
}

export async function seedReviewer(reset: boolean) {
  const [existing] = await q<{ id: number }>('SELECT id FROM users WHERE username = $1', [REVIEWER.username])
  if (existing && !reset) {
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [existing.id, await hashPassword(REVIEWER.password)])
    await ensureFullMock(existing.id)
    return { id: existing.id, created: false }
  }
  if (existing) await q('DELETE FROM users WHERE id = $1', [existing.id])
  const u = (await createUser(REVIEWER.username, REVIEWER.password))!
  await q(`UPDATE users SET exam_date = (now() AT TIME ZONE 'Asia/Kolkata')::date + 30 WHERE id = $1`, [u.id])

  // 1. Two uploaded mocks: the Quant sample (already reviewed) and a VARC sectional (not reviewed yet).
  await createMock(u.id, SAMPLE_MOCK, SAMPLE_ROWS as any)
  await createMock(u.id, { name: 'SimCAT 1 — VARC sectional', taken_on: SAMPLE_MOCK.taken_on, has_time_data: true }, VARC_ROWS as any)
  await ensureFullMock(u.id)

  // 2. Saved practice questions in all three sections.
  const ids: Record<string, number[]> = {}
  for (const x of [...SAMPLE_PRACTICE, ...DILR_QS]) (ids[x.topic] ??= []).push(await saveQuestion(u.id, x as any))

  // 3. A Time & Work test: one wrong → tagged B → fix note; then a retest answered right in time → Fixed.
  const tw = ids['Time & Work']
  const t1 = await submitTest(u.id, { kind: 'test', scope: 'Time & Work', answers: [
    { question_id: tw[0], chosen_index: 1, seconds: 50 }, { question_id: tw[1], chosen_index: 1, seconds: 140 }, { question_id: tw[2], chosen_index: 1, seconds: 160 }] })
  const wrong = await q<{ id: number }>('SELECT id FROM questions WHERE mock_id = $1 AND chosen_index <> correct_index ORDER BY q_no', [(t1 as any).mock_id])
  await tagMistake(u.id, wrong[0].id, 0, 1) // type right, approach wrong → B
  await saveFix(u.id, { attempt_id: wrong[0].id, make_flashcard: true,
    what_went_wrong: 'Worked with fractions per day and lost track after A left.',
    correct_approach: 'Total work = LCM(12, 18) = 36 units. A = 3/day, B = 2/day. 4 days together = 20 units; 16 left ÷ 2 = 8 days.',
    rule_to_remember: 'With people joining or leaving, make total work the LCM of the days and count units.' })
  await submitTest(u.id, { kind: 'retest', scope: 'Mistakes · Time & Work', answers: [{ question_id: tw[1], chosen_index: 2, seconds: 95 }] })

  // 4. A Probability test with one mistake left Open (for "Retest my mistakes").
  const pr = ids['Probability']
  await submitTest(u.id, { kind: 'test', scope: 'Probability', answers: [
    { question_id: pr[0], chosen_index: 2, seconds: 40 }, { question_id: pr[1], chosen_index: 0, seconds: 100 }, { question_id: pr[2], chosen_index: 0, seconds: 110 }] })

  // 5. Notes: Claude's summary (with a table), the student's own text, a link.
  const nid = await saveNotes(u.id, { ...SAMPLE_NOTE, summary: SAMPLE_NOTE.summary + '\n\n| Worker | Days | Units/day (work = 30) |\n|---|---|---|\n| A | 10 | 3 |\n| B | 15 | 2 |\n| Together | 6 | 5 |' } as any)
  await updateNote(u.id, nid, { click_type: 'shortcut' })
  const tri = await createNote(u.id, { topic: 'Triangles', title: 'Triangles: Area Formulas', kind: 'text', content:
    '## Sides or angles given\n- Area = ½ × base × height (A = ½ × BC × AD, AD ⟂ BC)\n- Heron’s: Area = √[s(s−a)(s−b)(s−c)]\n- Area = ½ · a · b · sin C\n\n## In-radius or circumradius given\n- Area = s · r\n- Area = abc / 4R\n\nwhere s = (a+b+c)/2, r = in-radius, R = circumradius.' })
  if ('id' in tri) await updateNote(u.id, tri.id!, { click_type: 'formula' })
  await createNote(u.id, { topic: 'Reading Comprehension', content: 'https://www.youtube.com/results?search_query=CAT+RC+inference+questions' })
  return { id: u.id, created: true }
}
