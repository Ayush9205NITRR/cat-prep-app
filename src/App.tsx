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
import SectionPage from './pages/SectionPage'
import TopicPage from './pages/TopicPage'
import TestPage from './pages/TestPage'
import QuestionEdit from './pages/QuestionEdit'
import Notes from './pages/Notes'
import NotePage from './pages/NotePage'
import CardReview from './pages/CardReview'

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
    `shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${isActive ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-900/5 hover:text-gray-900'}`
  const initial = user.username.slice(0, 1).toUpperCase()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-[13px] font-bold text-white shadow-sm">M</span>
            mbaprep
          </Link>
          <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1">
            <NavLink to="/section/Quant" className={nav}>Quant</NavLink>
            <NavLink to="/section/VARC" className={nav}>VARC</NavLink>
            <NavLink to="/section/DILR" className={nav}>DILR</NavLink>
            <NavLink to="/mocks" className={nav}>Mocks &amp; Tests</NavLink>
            <NavLink to="/connect" className={nav}>Connect Claude</NavLink>
            <button
              className="ml-1 flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-gray-500 hover:bg-gray-900/5 hover:text-gray-900"
              onClick={() => api.logout().finally(() => setUser(null))}
              title={`Logged in as ${user.username}. Click to log out.`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">{initial}</span>
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7">
        <Routes>
          <Route path="/" element={<Navigate to="/section/Quant" replace />} />
          <Route path="/mocks" element={<MocksList />} />
          <Route path="/section/:section" element={<SectionPage />} />
          <Route path="/topic/:topic" element={<TopicPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/mocks/:id" element={<MockPage />} />
          <Route path="/mocks/:id/review" element={<Review />} />
          <Route path="/mocks/:id/resolve" element={<Resolve />} />
          <Route path="/practice" element={<Navigate to="/section/Quant" replace />} />
          <Route path="/practice/session" element={<Navigate to="/section/Quant" replace />} />
          <Route path="/practice/questions/:id" element={<QuestionEdit />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/review" element={<CardReview />} />
          <Route path="/notes/:id" element={<NotePage />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/login" element={<Navigate to={(location.state as any)?.from ?? '/'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
