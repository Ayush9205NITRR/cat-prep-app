import { z } from 'zod'
import { SECTION_NAMES, topicsIn, TOPICS } from '../shared/topics'
import { requireUser } from './_lib/auth'
import { fail, one, route } from './_lib/http'
import { homeData, pickQuestions, prepareRetest, questionsForSolving, retestOutcome, submitTest, SubmitTest, topicPage, topicsSummary } from './_lib/topics'

// GET  ?view=summary                              → per topic: notes, questions, open/fixed mistakes, last test, due cards
// GET  ?view=topic&topic=…                        → the topic page (mistakes, notes, questions, flashcards)
// GET  ?view=test&section|area|topic=…&count=5|10|15 → questions for a test (no answers)
// GET  ?view=retest[&topic=…]                     → the not-yet-fixed mistakes as a test
// POST ?view=submit {kind, scope, answers}        → saved like a mock; returns mock_id
// GET  ?view=outcome&mock_id=N                    → retest result: retested · fixed · still open
export default route(async (req, res) => {
  const u = await requireUser(req, res)
  if (!u) return
  const view = one(req.query.view)
  const ok = (x: unknown, code = 200) => void res.status(code).json(x)
  const topic = one(req.query.topic)
  if (topic && !TOPICS.includes(topic as any)) return fail(res, 400, 'Unknown topic')

  if (req.method === 'GET' && view === 'home') return ok(await homeData(u.id))
  if (req.method === 'GET' && view === 'summary') return ok({ topics: await topicsSummary(u.id) })
  if (req.method === 'GET' && view === 'topic') return topic ? ok(await topicPage(u.id, topic)) : fail(res, 400, 'Pick a topic')

  if (req.method === 'GET' && view === 'test') {
    const count = Number(one(req.query.count))
    // 5/10/15 in the picker; any 1–20 for small topics and Today's Session.
    if (!Number.isInteger(count) || count < 1 || count > 20) return fail(res, 400, 'Choose 1–20 questions')
    const section = one(req.query.section)
    if (section && !(SECTION_NAMES as string[]).includes(section)) return fail(res, 400, 'Unknown section')
    const topics = topicsIn({ section, area: one(req.query.area), topic })
    if (!topics.length) return fail(res, 400, 'Nothing to test')
    return ok({ questions: await questionsForSolving(u.id, await pickQuestions(u.id, topics, count)) })
  }
  if (req.method === 'GET' && view === 'retest') {
    const limit = Number(one(req.query.limit)) || undefined
    const ids = await prepareRetest(u.id, topic)
    return ok({ questions: await questionsForSolving(u.id, limit ? ids.slice(0, limit) : ids) })
  }

  if (req.method === 'POST' && view === 'submit') {
    const p = SubmitTest.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'Invalid test', p.error.issues)
    const r = await submitTest(u.id, p.data).catch(() => ({ problem: 'An answer is outside its options.' }))
    return 'problem' in r ? fail(res, 400, r.problem as string) : ok(r, 201)
  }
  if (req.method === 'GET' && view === 'outcome') {
    const id = z.coerce.number().int().min(1).safeParse(one(req.query.mock_id))
    return id.success ? ok(await retestOutcome(u.id, id.data)) : fail(res, 400, 'Bad mock id')
  }
  fail(res, 405, 'Method not allowed')
})
