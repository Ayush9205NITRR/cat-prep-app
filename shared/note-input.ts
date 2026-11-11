// "New note" in the app: decide what the student gave us. Plain rules, no AI.
export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'] as const
export const MAX_FILE_BYTES = 3 * 1024 * 1024 // stays under Vercel's 4.5 MB request limit after base64

const URL_RE = /^(https?:\/\/|www\.)[^\s]+\.[^\s]+$/i

/** A box holding only one URL is a link; anything else is text. */
export function detectKind(input: string): 'link' | 'text' | 'empty' {
  const t = input.trim()
  if (!t) return 'empty'
  return URL_RE.test(t) ? 'link' : 'text'
}

export function normaliseUrl(u: string): string {
  const t = u.trim()
  return /^https?:\/\//i.test(t) ? t : 'https://' + t
}

/** A title when the student leaves it blank. */
export function autoTitle(kind: string, content: string, fileName?: string): string {
  if (kind === 'file' && fileName) return fileName.replace(/\.[a-z0-9]+$/i, '').slice(0, 120)
  if (kind === 'link') { try { const u = new URL(normaliseUrl(content)); return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '').slice(0, 120) } catch { return 'Link' } }
  const first = content.trim().split('\n')[0]
  return first.length > 80 ? first.slice(0, 77) + '…' : first || 'Note'
}
