import { useEffect, useState } from 'react'
import { bandText, estimatePercentile } from '../../shared/insights'
import { api } from '../api'

/** Saved target percentile; null = not set. Shared by /mocks and /mocks/:id. */
export function useTarget() {
  const [t, setT] = useState<number | null | undefined>(undefined)
  useEffect(() => { api.profile().then((r) => setT(r.target_percentile ?? null), () => setT(null)) }, [])
  const save = async (v: number | null) => { const r = await api.setTarget(v); setT(r.target_percentile ?? v) }
  return [t, save] as const
}

export function TargetPicker({ target, onSave }: { target: number | null | undefined; onSave: (v: number | null) => Promise<void> }) {
  const [v, setV] = useState('')
  useEffect(() => { if (target !== undefined) setV(target === null ? '' : String(target)) }, [target])
  const n = v === '' ? null : Number(v)
  const valid = n === null || (n >= 1 && n <= 100)
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
      🎯 Target
      <input type="number" min={1} max={100} step={0.1} value={v} placeholder="99" aria-label="Target percentile"
        onChange={(e) => setV(e.target.value)} onBlur={() => valid && n !== (target ?? null) && onSave(n)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`w-16 rounded-lg border px-2 py-1 text-[12.5px] ${valid ? 'border-gray-200' : 'border-red-400'}`} />
      %ile
    </label>
  )
}

export const pBand = (score: number, max: number, section: string | null) => estimatePercentile(score, max, section)

/** "Est. CAT percentile band: 88–92 → 95–97 reachable", with the target. */
export function PercentileBand({ score, reachable, max, section, target, compact }: { score: number; reachable: number; max: number; section: string | null; target?: number | null; compact?: boolean }) {
  const now = pBand(score, max, section), can = pBand(reachable, max, section)
  if (!now) return null
  const hit = target ? now.estimate >= target : false
  if (compact) return <span className="text-[11.5px] text-gray-500" title="Est. CAT percentile band (rough, from past CAT cut-offs)">Est. %ile <b className="text-gray-800">{bandText(now)}</b> → <b className="text-emerald-700">{bandText(can)}</b></span>
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-violet-700">Est. CAT percentile band</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-gray-900">
        <span className="text-[24px] font-semibold tabular-nums">{bandText(now)}</span>
        <span className="text-[13px] text-gray-500">now →</span>
        <span className="text-[24px] font-semibold tabular-nums text-emerald-700">{bandText(can)}</span>
        <span className="text-[13px] text-gray-500">reachable</span>
        {target ? <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${hit ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{hit ? `✓ at target ${target}` : `Target ${target} · ${Math.max(0, Math.round((target - now.estimate) * 10) / 10)} to go`}</span> : null}
      </div>
      <p className="mt-1 text-[11px] text-gray-500">A rough estimate from past CAT score-vs-percentile cut-offs ({section === 'Full' ? 'full paper' : `${section} section`}). Real percentiles depend on the year and normalisation.</p>
    </div>
  )
}
