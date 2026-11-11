import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { btnGhost, btnPrimary } from '../ui'

/** "Start a test" → 5, 10 or 15 questions from a section, an area or a topic. */
export default function StartTest({ scope, label = 'Start a test', small }: { scope: { section?: string; area?: string; topic?: string }; label?: string; small?: boolean }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const go = (n: number) => nav(`/test?count=${n}${Object.entries(scope).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v!)}`).join('')}`)
  if (!open) return <button className={small ? btnGhost : btnPrimary} onClick={() => setOpen(true)}>{label}</button>
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
      <span className="px-2 text-[12px] text-gray-500">Questions:</span>
      {[5, 10, 15].map((n) => <button key={n} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-gray-800 hover:bg-gray-900 hover:text-white" onClick={() => go(n)}>{n}</button>)}
      <button className="px-2 text-[12px] text-gray-400 hover:text-gray-700" onClick={() => setOpen(false)} aria-label="Cancel">✕</button>
    </div>
  )
}
