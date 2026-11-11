import { z } from 'zod'
import { DIFFICULTIES } from '../shared/practice'
import { TOPICS } from '../shared/topics'
import { requireUser } from './_lib/auth'
import { fail, one, route } from './_lib/http'
import {
  deleteQuestion, forSolving, getQuestion, listQuestions, nextQuestion, QuestionPatch, setTaps, submitAnswer, topicHistory, updateQuestion,
} from './_lib/practice'

// GET  ?view=list                         → question sets (no answers)
// GET  ?view=question&id=N                → one question, full (for editing)
// PATCH/DELETE ?view=question&id=N        → edit / delete
// GET  ?view=next&topic=…&difficulty=…    → next question to solve (no answer, solution or hints)
// POST ?view=attempt {question_id, chosen_index, seconds} → result + the full question for review
// PATCH ?view=attempt&id=N {type_tap, approach_tap}       → A/B/C + repeat
// GET  ?view=history&topic=…              → last 20 attempts
export default route(async (req, res) => {
  const u = await requireUser(req, res)
  if (!u) return
  const view = one(req.query.view) ?? 'list'
  const id = Number(one(req.query.id))
  const m = req.method

  if (view === 'list' && m === 'GET') return void res.status(200).json({ questions: await listQuestions(u.id) })

  if (view === 'question') {
    if (!Number.isInteger(id) || id < 1) return fail(res, 400, 'Bad question id')
    if (m === 'GET') {
      const x = await getQuestion(u.id, id)
      return x ? void res.status(200).json({ question: x }) : fail(res, 404, 'Question not found')
    }
    if (m === 'PATCH') {
      const p = QuestionPatch.safeParse(req.body)
      if (!p.success) return fail(res, 400, 'Invalid change', p.error.issues)
      const r = await updateQuestion(u.id, id, p.data)
      if (!r) return fail(res, 404, 'Question not found')
      return 'problems' in r ? fail(res, 400, r.problems!.join('; ')) : void res.status(200).json(r)
    }
    if (m === 'DELETE') return (await deleteQuestion(u.id, id)) ? void res.status(200).json({ ok: true }) : fail(res, 404, 'Question not found')
  }

  if (view === 'next' && m === 'GET') {
    const topic = z.enum(TOPICS).safeParse(one(req.query.topic))
    const diff = one(req.query.difficulty)
    if (!topic.success) return fail(res, 400, 'Pick a topic')
    if (diff && !(DIFFICULTIES as readonly string[]).includes(diff)) return fail(res, 400, 'Bad difficulty')
    const skip = Number(one(req.query.skip)) || undefined
    const x = (await nextQuestion(u.id, topic.data, diff, skip)) ?? (skip ? await nextQuestion(u.id, topic.data, diff) : null)
    return void res.status(200).json({ question: x ? forSolving(x) : null })
  }

  if (view === 'attempt' && m === 'POST') {
    const b = z.object({ question_id: z.number().int().min(1), chosen_index: z.number().int().min(0), seconds: z.number().int().min(0).max(36000) }).safeParse(req.body)
    if (!b.success) return fail(res, 400, 'Invalid attempt', b.error.issues)
    const r = await submitAnswer(u.id, b.data.question_id, b.data.chosen_index, b.data.seconds)
    if (!r) return fail(res, 404, 'Question not found')
    return 'problems' in r ? fail(res, 400, r.problems!.join('; ')) : void res.status(201).json(r)
  }
  if (view === 'attempt' && m === 'PATCH') {
    const b = z.object({ type_tap: z.number().int().min(0).max(2).nullable(), approach_tap: z.number().int().min(0).max(2).nullable() }).safeParse(req.body)
    if (!b.success || !Number.isInteger(id)) return fail(res, 400, 'Invalid taps')
    const r = await setTaps(u.id, id, b.data.type_tap, b.data.approach_tap)
    if (!r) return fail(res, 404, 'Attempt not found')
    return 'problems' in r ? fail(res, 400, (r as any).problems.join('; ')) : void res.status(200).json({ attempt: r })
  }

  if (view === 'history' && m === 'GET') {
    const topic = z.enum(TOPICS).safeParse(one(req.query.topic))
    if (!topic.success) return fail(res, 400, 'Pick a topic')
    return void res.status(200).json(await topicHistory(u.id, topic.data))
  }
  fail(res, 405, 'Method not allowed')
})
