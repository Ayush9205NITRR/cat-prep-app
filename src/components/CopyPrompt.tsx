import { useState } from 'react'
import { btnGhost } from '../ui'

/** A ready-to-paste Claude prompt with a Copy button. */
export default function CopyPrompt({ title, prompt }: { title: string; prompt: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="text-[13px] font-semibold text-indigo-900">{title}</div>
      <div className="mt-1.5 rounded-lg bg-white px-3 py-2 text-[12.5px] text-gray-800">{prompt}</div>
      <button className={`${btnGhost} mt-2`} onClick={() => navigator.clipboard.writeText(prompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>{copied ? 'Copied' : 'Copy prompt'}</button>
    </div>
  )
}
