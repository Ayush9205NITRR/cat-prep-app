import { useCallback, useEffect, useState } from 'react'
import type { QuestionRow } from '../shared/analysis'
import { api, type MockData, type MockMeta } from './api'

/** Loads a mock and saves changes. Edits show at once; if the save fails they are undone. */
export function useMock(id: number) {
  const [data, setData] = useState<MockData | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(0)

  useEffect(() => {
    api.mock(id).then(setData, (e) => setError(e.message))
  }, [id])

  const patchRow = useCallback(async (rowId: number, patch: Partial<QuestionRow>) => {
    let before: MockData | null = null
    setData((d) => {
      before = d
      return d && { ...d, rows: d.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }
    })
    setSaving((n) => n + 1)
    setError('')
    try {
      const { row } = await api.updateQuestion(rowId, patch)
      setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === rowId ? row : r)) })
      return true
    } catch (e) {
      setData(before)
      setError(`Not saved: ${(e as Error).message}`)
      return false
    } finally {
      setSaving((n) => n - 1)
    }
  }, [])

  const patchMock = useCallback(async (patch: Partial<MockMeta>) => {
    let before: MockData | null = null
    setData((d) => {
      before = d
      return d && { ...d, mock: { ...d.mock, ...patch } }
    })
    setSaving((n) => n + 1)
    setError('')
    try {
      setData(await api.updateMock(id, patch))
    } catch (e) {
      setData(before)
      setError(`Not saved: ${(e as Error).message}`)
    } finally {
      setSaving((n) => n - 1)
    }
  }, [id])

  return { data, error, saving: saving > 0, patchRow, patchMock }
}
