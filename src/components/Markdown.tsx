import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

marked.setOptions({ gfm: true, breaks: true })

/** Renders a note's Markdown (headings, lists, tables). Sanitised: no scripts or event handlers. */
export default function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text || '', { async: false }) as string), [text])
  if (!text?.trim()) return <p className="text-[12.5px] italic text-gray-400">Empty.</p>
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
