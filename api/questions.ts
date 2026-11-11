import { requireUser } from './_lib/auth'
import { fail, one, route } from './_lib/http'
import { QuestionPatch, updateQuestion } from './_lib/mocks'

// PATCH /api/questions?id=N → change one question (edit cells, review taps, re-solve)
export default route(async (req, res) => {
  const u = await requireUser(req, res)
  if (!u) return
  if (req.method !== 'PATCH') return fail(res, 405, 'Method not allowed')
  const id = Number(one(req.query.id))
  if (!Number.isInteger(id) || id < 1) return fail(res, 400, 'Bad question id')
  const p = QuestionPatch.safeParse(req.body)
  if (!p.success) return fail(res, 400, 'Invalid change', p.error.issues)
  const r = await updateQuestion(u.id, id, p.data)
  if (!r) return fail(res, 404, 'Question not found')
  if ('problems' in r) return fail(res, 400, r.problems!.join('; '))
  res.status(200).json(r)
})
