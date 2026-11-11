import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, type User } from '../api'
import { btnPrimary, ErrorNote, inputCls } from '../ui'

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const from = (useLocation().state as any)?.from ?? '/'
  const signup = mode === 'signup'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = signup ? await api.signup(username, password) : await api.login(username, password)
      onLogin(r.user)
      navigate(signup ? '/connect' : from === '/login' ? '/' : from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-[18px] font-semibold tracking-tight">CAT Prep</div>
        <div className="mb-5 text-[12px] text-gray-500">
          {signup ? 'Create your account. Then connect Claude and send it your first mock.' : 'Mock analysis. Claude reads your mock, you check it here.'}
        </div>
        <label className="mb-1 block text-[12px] font-medium text-gray-700" htmlFor="u">Username</label>
        <input id="u" className={`${inputCls} mb-3 w-full py-2`} autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label className="mb-1 block text-[12px] font-medium text-gray-700" htmlFor="p">Password</label>
        <input
          id="p"
          type="password"
          className={`${inputCls} mb-1 w-full py-2`}
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="mb-4 text-[11px] text-gray-400">{signup ? 'At least 8 characters. Username: letters, numbers, dot, dash or underscore.' : ' '}</div>
        {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
        <button className={`${btnPrimary} w-full py-2`} disabled={busy || !username || !password}>
          {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
        </button>
        <button
          type="button"
          className="mt-3 w-full text-center text-[12px] text-gray-500 hover:text-gray-900"
          onClick={() => { setMode(signup ? 'login' : 'signup'); setError('') }}
        >
          {signup ? 'Have an account? Log in' : 'New here? Create an account'}
        </button>
      </form>
    </div>
  )
}
