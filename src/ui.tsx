import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Card and colours follow the Game Changer dashboard style.
export const CHART = { danger: '#D97757', warning: '#D9A441', success: '#4C9A7A', accent: '#4F46E5', muted: '#9CA3AF', grid: '#E5E7EB' }

export function Card({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
          <div className="text-[13px] font-semibold tracking-tight text-gray-900">{title}</div>
          {aside && <div className="text-[11px] text-gray-400">{aside}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

export const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
export const btnPrimary = `${btn} bg-gray-900 text-white hover:bg-gray-700`
export const btnGhost = `${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`
export const inputCls =
  'bg-white border border-gray-200 rounded-md px-2 py-1.5 text-[12px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-400'

export function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[12px] text-gray-500 hover:text-gray-900">
      ← {children}
    </Link>
  )
}

export function Loading() {
  return <div className="py-16 text-center text-[12px] text-gray-400">Loading…</div>
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{children}</div>
}

export const optionLabel = (i: number) => `(${String.fromCharCode(97 + i)})`

export function fmtSeconds(s: number | null | undefined) {
  if (s === null || s === undefined) return '—'
  const m = Math.floor(Math.abs(s) / 60)
  const r = Math.abs(s) % 60
  return `${s < 0 ? '−' : ''}${m}:${String(r).padStart(2, '0')}`
}
