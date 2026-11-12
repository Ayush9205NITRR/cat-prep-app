import { requireUser } from './_lib/auth'
import { fail, one, route } from './_lib/http'
import { deleteMock, getMock, listMocks, MockPatch, updateMock } from './_lib/mocks'
import { createUpload, deleteUpload, listUploads, UploadInput } from './_lib/uploads'

// GET /api/mocks → list · GET /api/mocks?id=N → one mock with rows · PATCH /api/mocks?id=N → name/date/time flag
export default route(async (req, res) => {
  const u = await requireUser(req, res)
  if (!u) return
  const id = Number(one(req.query.id))
  // Mock papers uploaded for Claude to read: GET ?view=uploads · POST ?view=upload · DELETE ?view=upload&id=N
  const view = one(req.query.view)
  if (view === 'uploads' && req.method === 'GET') return void res.status(200).json({ uploads: await listUploads(u.id) })
  if (view === 'upload' && req.method === 'POST') {
    const p = UploadInput.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'Invalid upload', p.error.issues)
    const r = await createUpload(u.id, p.data)
    return 'problem' in r ? fail(res, 400, r.problem as string) : void res.status(201).json(r)
  }
  if (view === 'upload' && req.method === 'DELETE') return (await deleteUpload(u.id, id)) ? void res.status(200).json({ ok: true }) : fail(res, 404, 'Upload not found')
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
  if (req.method === 'DELETE') return (await deleteMock(u.id, id)) ? void res.status(200).json({ ok: true }) : fail(res, 404, 'Mock not found')
  fail(res, 405, 'Method not allowed')
})
