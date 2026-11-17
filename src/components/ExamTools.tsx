import { useEffect, useState } from 'react'
import { initCalc, press } from '../../shared/calculator'

const KEYS = [
  ['MC', 'MR', 'MS', 'M+', 'M−'],
  ['←', 'C', '±', '√', '%'],
  ['7', '8', '9', '÷', '1/x'],
  ['4', '5', '6', '×', ''],
  ['1', '2', '3', '−', ''],
  ['0', '.', '=', '+', ''],
]

/** CAT-style basic calculator + scratchpad in a drawer. Keys typed inside never trigger test shortcuts. */
export default function ExamTools() {
  const [open, setOpen] = useState<null | 'calc' | 'pad'>(null)
  // Small screens: room under the page so the drawer never hides Next / Submit.
  useEffect(() => {
    if (!open || window.innerWidth >= 1280) return
    document.body.style.paddingBottom = '440px'
    return () => { document.body.style.paddingBottom = '' }
  }, [open])
  const [c, setC] = useState(initCalc)
  const [pad, setPad] = useState('')
  return (
    <>
      <div className="flex gap-2">
        <button className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium ${open === 'calc' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`} onClick={() => setOpen(open === 'calc' ? null : 'calc')}>🧮 Calculator</button>
        <button className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium ${open === 'pad' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`} onClick={() => setOpen(open === 'pad' ? null : 'pad')}>✏️ Scratchpad</button>
      </div>
      {open && (
        <div role="dialog" aria-label={open === 'calc' ? 'Calculator' : 'Scratchpad'} className="fixed bottom-3 right-3 z-30 xl:bottom-auto xl:right-2 xl:top-36 xl:w-[236px] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between text-[12.5px] font-semibold text-gray-800">
            {open === 'calc' ? 'Calculator' : 'Scratchpad'}
            <button className="rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={() => setOpen(null)} aria-label="Close">✕</button>
          </div>
          {open === 'calc' ? (
            <>
              <div className="mb-2 rounded-lg bg-gray-900 px-3 py-2 text-right font-mono text-[20px] tabular-nums text-white" aria-live="polite">
                <div className="h-4 text-[10px] text-gray-400">{c.memory ? 'M' : ''}{c.op ? ` ${c.acc} ${c.op}` : ''}</div>{c.display}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {KEYS.flat().map((k, i) => k ? (
                  <button key={i} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setC((x) => press(x, k))}
                    className={`rounded-md py-2 text-[13px] font-medium ${/^[0-9.]$/.test(k) ? 'bg-gray-100 hover:bg-gray-200' : k === '=' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-50 text-gray-700 hover:bg-gray-200'}`}>{k}</button>
                ) : <span key={i} />)}
              </div>
            </>
          ) : (
            <textarea autoFocus value={pad} onChange={(e) => setPad(e.target.value)} rows={10} placeholder="Rough work… (kept until you leave this page)"
              className="w-full rounded-lg border border-gray-200 p-2 font-mono text-[12.5px] focus:border-indigo-400 focus:outline-none" />
          )}
        </div>
      )}
    </>
  )
}
