import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { api, type User } from './api'
import { Loading } from './ui'
import Login from './pages/Login'
import MocksList from './pages/MocksList'
import MockPage from './pages/MockPage'
import Review from './pages/Review'
import Resolve from './pages/Resolve'
import Connect from './pages/Connect'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const location = useLocation()

  useEffect(() => {
    api.me().then((r) => setUser(r.user), () => setUser(null))
    const out = () => setUser(null)
    window.addEventListener('logged-out', out)
    return () => window.removeEventListener('logged-out', out)
  }, [])

  if (user === undefined) return <Loading />
  if (!user)
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    )

  const nav = ({ isActive }: { isActive: boolean }) =>
    `px-2.5 py-1 rounded-md text-[12px] font-medium ${isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="text-[14px] font-semibold tracking-tight">CAT Prep</Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={nav}>Mocks</NavLink>
            <NavLink to="/connect" className={nav}>Connect Claude</NavLink>
            <button
              className="px-2.5 py-1 text-[12px] text-gray-400 hover:text-gray-900"
              onClick={() => api.logout().finally(() => setUser(null))}
              title={`Logged in as ${user.username}`}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<MocksList />} />
          <Route path="/mocks/:id" element={<MockPage />} />
          <Route path="/mocks/:id/review" element={<Review />} />
          <Route path="/mocks/:id/resolve" element={<Resolve />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/login" element={<Navigate to={(location.state as any)?.from ?? '/'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
