import { z } from 'zod'
import { requireUser } from './_lib/auth'
import { fail, one, route } from './_lib/http'
import {
  addCard, CardInput, CreateNote, createNote, getFile, CardPatch, deleteCard, deleteNote, dueCards, getNote, listNotes, NotePatch, reviewCard, updateCard, updateNote,
} from './_lib/notes'

// GET ?view=list · GET|PATCH|DELETE ?view=note&id=N
// POST ?view=card&note_id=N · PATCH|DELETE ?view=card&id=N
// GET ?view=due · POST ?view=review&id=N {right}
// POST ?view=create {topic, title?, content?, file?} · GET ?view=file&id=N
export default route(async (req, res) => {
  const u = await requireUser(req, res)
  if (!u) return
  const view = one(req.query.view) ?? 'list'
  const id = Number(one(req.query.id))
  const m = req.method
  const ok = (x: unknown, code = 200) => void res.status(code).json(x)

  if (view === 'list' && m === 'GET') return ok(await listNotes(u.id))
  if (view === 'due' && m === 'GET') return ok({ cards: await dueCards(u.id) })

  if (view === 'create' && m === 'POST') {
    const p = CreateNote.safeParse(req.body)
    if (!p.success) return fail(res, 400, 'Pick a topic, and add text, a link or an image/PDF up to 3 MB', p.error.issues)
    const r = await createNote(u.id, p.data)
    return 'problem' in r ? fail(res, 400, r.problem!) : ok(r, 201)
  }

  if (view === 'file' && m === 'GET') {
    const f = await getFile(u.id, id)
    if (!f) return fail(res, 404, 'File not found')
    res.statusCode = 200
    res.setHeader('Content-Type', f.mime)
    res.setHeader('Content-Disposition', `inline; filename="${f.name.replace(/[^\w.\- ]/g, '_')}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // Images get the strictest policy; Chrome's PDF viewer refuses sandboxed documents.
    if (f.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.end(f.data)
    return
  }

  if (view === 'note') {
    if (!Number.isInteger(id) || id < 1) return fail(res, 400, 'Bad note id')
    if (m === 'GET') { const n = await getNote(u.id, id); return n ? ok(n) : fail(res, 404, 'Note not found') }
    if (m === 'PATCH') {
      const p = NotePatch.safeParse(req.body)
      if (!p.success) return fail(res, 400, 'Invalid change', p.error.issues)
      const n = await updateNote(u.id, id, p.data)
      return n ? ok(n) : fail(res, 404, 'Note not found')
    }
    if (m === 'DELETE') return (await deleteNote(u.id, id)) ? ok({ ok: true }) : fail(res, 404, 'Note not found')
  }

  if (view === 'card') {
    if (m === 'POST') {
      const p = CardInput.safeParse(req.body)
      if (!p.success) return fail(res, 400, 'Front and back are both needed')
      const c = await addCard(u.id, Number(one(req.query.note_id)), p.data)
      return c ? ok({ card: c }, 201) : fail(res, 404, 'Note not found')
    }
    if (!Number.isInteger(id) || id < 1) return fail(res, 400, 'Bad card id')
    if (m === 'PATCH') {
      const p = CardPatch.safeParse(req.body)
      if (!p.success) return fail(res, 400, 'Invalid change', p.error.issues)
      const c = await updateCard(u.id, id, p.data)
      return c ? ok({ card: c }) : fail(res, 404, 'Card not found')
    }
    if (m === 'DELETE') return (await deleteCard(u.id, id)) ? ok({ ok: true }) : fail(res, 404, 'Card not found')
  }

  if (view === 'review' && m === 'POST') {
    const b = z.object({ right: z.boolean() }).safeParse(req.body)
    if (!b.success) return fail(res, 400, 'Say right or wrong')
    const r = await reviewCard(u.id, id, b.data.right)
    return r ? ok(r) : fail(res, 404, 'Card not found')
  }
  fail(res, 405, 'Method not allowed')
})
