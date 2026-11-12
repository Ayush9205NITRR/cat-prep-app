import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, type User } from '../api'
import { btnPrimary, ErrorNote, inputCls } from '../ui'

const GOOGLE_ERRORS: Record<string, string> = {
  google_off: 'Google sign-in is not set up yet. Use a username and password.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_state: 'Google sign-in expired. Try again.',
  google_failed: 'Google sign-in failed. Try again.',
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** The public reviewer account (also printed by the seed and in the README). */
const REVIEWER = { username: 'reviewer', password: 'cat-review-2026' }

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const from = (useLocation().state as any)?.from ?? '/'
  // Set when Claude's connector sent the student here to log in before clicking Allow.
  const nextParam = new URLSearchParams(window.location.search).get('next')
  const next = nextParam && nextParam.startsWith('/oauth/authorize?') && !nextParam.includes('//') ? nextParam : null
  const signup = mode === 'signup'
  const [google, setGoogle] = useState<boolean | null>(null) // null = still checking
  // Google is the main way in; the password form is folded away (reviewers use it for the demo account).
  const [withPassword, setWithPassword] = useState(false)

  useEffect(() => {
    fetch('/api/auth?action=providers').then((r) => r.json()).then((d) => setGoogle(Boolean(d.google)), () => setGoogle(false))
    const err = new URLSearchParams(window.location.search).get('error')
    if (err) setError(GOOGLE_ERRORS[err] ?? 'Google sign-in failed. Try again.')
  }, [])

  async function reviewerLogin() {
    setBusy(true); setError('')
    try {
      const r = await api.login(REVIEWER.username, REVIEWER.password)
      if (next) return window.location.assign(next) // connecting Claude: back to the Allow page
      onLogin(r.user)
      navigate('/section/Quant', { replace: true })
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = signup ? await api.signup(username, password) : await api.login(username, password)
      if (next) return window.location.assign(next) // server page: full load
      onLogin(r.user)
      navigate(signup ? '/connect' : from === '/login' ? '/' : from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const showForm = !google || withPassword
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[20px] font-bold text-white shadow-lg shadow-indigo-500/20">M</div>
          <h1 className="text-[22px] font-semibold tracking-tight">mbaprep</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {next ? 'Log in to connect Claude to your account.' : 'Mocks, practice and notes. Claude reads your uploads, you check them here.'}
          </p>
        </div>
        {google === null ? <div className="h-[132px] rounded-2xl border border-gray-200/70 bg-white/60" /> : <form onSubmit={submit} className="rounded-2xl border border-gray-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_8px_24px_-12px_rgba(16,24,40,0.12)]">
          {google && (
            <a href={next ? `/api/google?next=${encodeURIComponent(next)}` : '/api/google'} className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-gray-300 bg-white py-2.5 text-[14px] font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 active:scale-[0.99]">
              <GoogleIcon /> Continue with Google
            </a>
          )}
          {google && !showForm && error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          {google && !showForm && (
            <button type="button" className="mt-4 w-full text-center text-[12px] text-gray-500 hover:text-gray-900" onClick={() => { setWithPassword(true); setError('') }}>
              Use a username and password instead
            </button>
          )}
          {showForm && (
            <>
              {google && <div className="my-4 flex items-center gap-3 text-[11px] text-gray-400"><div className="h-px flex-1 bg-gray-200" /> or <div className="h-px flex-1 bg-gray-200" /></div>}
              <label className="mb-1 block text-[12px] font-medium text-gray-700" htmlFor="u">Username or email</label>
              <input id="u" className={`${inputCls} mb-3 w-full py-2`} autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
              <label className="mb-1 block text-[12px] font-medium text-gray-700" htmlFor="p">Password</label>
              <input id="p" type="password" className={`${inputCls} mb-1 w-full py-2`} autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="mb-4 text-[11px] text-gray-400">{signup ? 'Password: at least 8 characters. Your email works as a username.' : '\u00a0'}</div>
              {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
              <button className={`${btnPrimary} w-full py-2.5`} disabled={busy || !username || !password}>
                {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
              </button>
              <button type="button" className="mt-3 w-full text-center text-[12px] text-gray-500 hover:text-gray-900" onClick={() => { setMode(signup ? 'login' : 'signup'); setError('') }}>
                {signup ? 'Have an account? Log in' : 'New here? Create an account'}
              </button>
            </>
          )}
        </form>}
        {/* For the people reviewing this assignment: one click into the pre-filled account (its login is public by design). */}
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-center">
          <div className="text-[13px] font-semibold text-indigo-900">Reviewing this app?</div>
          <div className="mt-0.5 text-[12px] text-indigo-800/80">A demo account with every feature already filled in.</div>
          <button type="button" disabled={busy} onClick={reviewerLogin}
            className="mt-3 w-full rounded-xl bg-indigo-600 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50">
            {busy ? 'Opening…' : next ? 'Use the demo account' : 'Open the demo account'}
          </button>
          <div className="mt-2 text-[11.5px] text-indigo-800/70">or log in with <code className="rounded bg-white/70 px-1">{REVIEWER.username}</code> / <code className="rounded bg-white/70 px-1">{REVIEWER.password}</code></div>
        </div>
      </div>
    </div>
  )
}
