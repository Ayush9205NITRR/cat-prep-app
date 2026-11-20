import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fuzzyScore } from '../../shared/insights'
import { planSession } from '../../shared/session'
import { sectionOf, TOPICS } from '../../shared/topics'
import { api, type MockSummary } from '../api'
import { startSession } from '../session'

interface Item { id: string; group: 'Actions' | 'Topics' | 'Mocks'; label: string; hint?: string; run: () => void }

/** ⌘K / Ctrl+K from any page: jump to a topic, a mock, or a quick action. */
export default function CommandPalette() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [mocks, setMocks] = useState<MockSummary[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) } }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey); window.addEventListener('open-palette', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-palette', onOpen) }
  }, [])
  useEffect(() => {
    if (!open) return
    setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 0)
    api.mocks().then((r) => setMocks(r.mocks), () => {})
  }, [open])

  const go = (path: string) => () => nav(path)
  const items = useMemo<Item[]>(() => [
    { id: 'a-session', group: 'Actions', label: 'Start today’s session', hint: '30 min', run: () => { api.home().then((h) => nav(startSession(planSession(30, { ...h.session, weakest: h.session.weakest ?? undefined }))), () => nav('/')) } },
    { id: 'a-cards', group: 'Actions', label: 'Review due flashcards', run: go('/flashcards') },
    { id: 'a-cheat', group: 'Actions', label: 'Open pre-mock cheat sheet', run: go('/cheatsheet') },
    { id: 'a-upload', group: 'Actions', label: 'Upload a mock', hint: 'Mocks & Tests', run: go('/mocks') },
    { id: 'a-retest', group: 'Actions', label: 'Retest open mistakes', run: go('/test?retest=1') },
    { id: 'a-connect', group: 'Actions', label: 'Connect Claude', run: go('/connect') },
    { id: 'a-home', group: 'Actions', label: 'Home', run: go('/') },
    ...TOPICS.map((t) => ({ id: 't-' + t, group: 'Topics' as const, label: t, hint: sectionOf(t), run: go(`/topic/${encodeURIComponent(t)}`) })),
    ...mocks.map((m) => ({ id: 'm-' + m.id, group: 'Mocks' as const, label: m.name, hint: `${m.taken_on} · ${m.score}/${m.max_score}`, run: go(`/mocks/${m.id}`) })),
  ], [mocks]) // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!q.trim()) return items.filter((i) => i.group === 'Actions').concat(items.filter((i) => i.group === 'Mocks').slice(0, 5))
    return items.map((i) => ({ i, s: Math.max(fuzzyScore(q, i.label), fuzzyScore(q, i.hint ?? '') - 50) })).filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.i)
  }, [q, items])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])
  if (!open) return null

  const choose = (it?: Item) => { if (it) { setOpen(false); it.run() } }
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center bg-gray-900/30 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-label="Quick jump" className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a topic, mock or action…" aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); choose(results[sel]) }
            else if (e.key === 'Escape') setOpen(false)
          }}
          className="w-full border-b border-gray-100 px-4 py-3.5 text-[14.5px] focus:outline-none" />
        <div ref={list} className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-gray-500">No match.</div>}
          {results.map((it, k) => (
            <div key={it.id}>
              {(k === 0 || results[k - 1].group !== it.group) && <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">{it.group}</div>}
              <button data-i={k} role="option" aria-selected={k === sel} onMouseEnter={() => setSel(k)} onClick={() => choose(it)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] ${k === sel ? 'bg-gray-900 text-white' : 'text-gray-800'}`}>
                <span className="truncate">{it.label}</span>
                {it.hint && <span className={`shrink-0 text-[11.5px] ${k === sel ? 'text-gray-300' : 'text-gray-400'}`}>{it.hint}</span>}
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-3 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div>
      </div>
    </div>
  )
}
