import { requireUser } from './_lib/auth'
import { fail, one, route } from './_lib/http'
import { getMock, listMocks, MockPatch, updateMock } from './_lib/mocks'

// GET /api/mocks → list · GET /api/mocks?id=N → one mock with rows · PATCH /api/mocks?id=N → name/date/time flag
export default route(async (req, res) => {
  const u = await requireUser(req, res)
  if (!u) return
  const id = Number(one(req.query.id))
  if (req.method === 'GET' && !one(req.query.id)) {
    res.status(200).json({ mocks: await listMocks(u.id) })
    return
  }
  if (!Number.isInteger(id) || id < 1) return fail(res, 400, 'Bad mock id')
  if (req.method === 'GET') {
    const m = await getMock(u.id, id)
    return m ? res.status(200).json(m) : fail(res, 404, 'Mock not found')
  }
  if (req.method === 'PATCH') {
    const p = MockPatch.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'Invalid change', p.error.issues)
    if (!(await updateMock(u.id, id, p.data))) return fail(res, 404, 'Mock not found')
    res.status(200).json(await getMock(u.id, id))
    return
  }
  fail(res, 405, 'Method not allowed')
})
