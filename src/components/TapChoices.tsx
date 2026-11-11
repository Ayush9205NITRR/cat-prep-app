// A list of choices; after a pick it shows which one was right.
export default function TapChoices({ options, picked, answer, onPick }: { options: string[]; picked: number | null; answer?: number; onPick?: (i: number) => void }) {
  return (
    <div className="grid gap-2">
      {options.map((o, i) => {
        const done = picked !== null && answer !== undefined
        const tone = !done
          ? picked === i ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
          : i === answer ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : i === picked ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-100 text-gray-400'
        return (
          <button key={i} disabled={done || !onPick} onClick={() => onPick?.(i)} className={`rounded-lg border px-3 py-2 text-left text-[13px] transition-colors ${tone}`}>
            {o}
            {done && i === answer && <span className="ml-2 text-[11px] font-semibold">✓ right</span>}
            {done && i === picked && i !== answer && <span className="ml-2 text-[11px] font-semibold">your pick</span>}
          </button>
        )
      })}
    </div>
  )
}
