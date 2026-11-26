import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useI18n, type Key } from '../../lib/i18n'
import { StoryLogo } from '../../components/StoryArt'

const nav: { to: string; key: Key; perm: string; icon: string; end?: boolean }[] = [
  { to: '/admin', key: 'dashboard', perm: 'report.view', icon: '📊', end: true },
  { to: '/admin/stories', key: 'stories', perm: 'story.manage', icon: '📚' },
  { to: '/admin/bakasa', key: 'bakasaAdmin', perm: 'story.manage', icon: '🕵️' },
  { to: '/admin/detective', key: 'detectiveStudio', perm: 'story.manage', icon: '🔍' },
  { to: '/admin/content-library', key: 'contentStudio', perm: 'story.manage', icon: '🗂️' },
  { to: '/admin/puzzle-lab', key: 'puzzleLab', perm: 'story.manage', icon: '🧩' },
  { to: '/admin/rooms', key: 'rooms', perm: 'room.manage', icon: '🎮' },
  { to: '/admin/users', key: 'users', perm: 'user.manage', icon: '👥' },
  { to: '/admin/reports', key: 'reports', perm: 'report.view', icon: '📈' },
  { to: '/admin/settings', key: 'platformSettings', perm: '*', icon: '⚙️' }
]

export default function AdminLayout() {
  const { can, signOut, session } = useAuth()
  const { t, lang, toggle } = useI18n()
  const ar = lang === 'ar'
  const email = session?.user.email ?? ''
  return (
    <div className="admin-arcade min-h-screen md:flex">
      <aside className="border-b border-white/10 bg-[#0e0e15]/95 p-3 backdrop-blur md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-e">
        <Link to="/admin" className="mb-4 flex items-center gap-2 rounded-2xl p-2 hover:bg-white/5">
          <StoryLogo className="h-11 w-11" />
          <div className="min-w-0"><div className="truncate text-lg font-extrabold text-white">{t('appName')}</div><div className="text-[11px] font-semibold uppercase tracking-widest text-[#a78bfa]">{ar ? 'لوحة التحكم' : 'Control center'}</div></div>
        </Link>
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Admin">
          {nav.filter((n) => can(n.perm)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-[#8b5cf6] text-white shadow-[0_8px_24px_rgba(139,92,246,.35)]' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}>
              <span className="text-base" aria-hidden="true">{n.icon}</span>{t(n.key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 hidden space-y-2 rounded-2xl border border-white/10 bg-white/[.03] p-3 md:block">
          <p className="text-[11px] uppercase tracking-widest text-white/40">{ar ? 'افتح اللعبة' : 'Open the games'}</p>
          <div className="grid grid-cols-3 gap-1.5 text-center text-lg">
            <a href="/join" target="_blank" rel="noreferrer" className="rounded-xl bg-[#3b82f6]/20 py-2 hover:bg-[#3b82f6]/30" title={ar ? 'أحجية الحكاية' : 'Story Puzzle'}>🧩</a>
            <a href="/bakasa" target="_blank" rel="noreferrer" className="rounded-xl bg-[#ff6a3d]/20 py-2 hover:bg-[#ff6a3d]/30" title={ar ? 'بكاسة' : 'Bakasa'}>🕵️</a>
            <a href="/detective" target="_blank" rel="noreferrer" className="rounded-xl bg-[#14b8a6]/20 py-2 hover:bg-[#14b8a6]/30" title={ar ? 'المحقق' : 'Detective'}>🔍</a>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 md:mt-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white">{(email[0] ?? 'A').toUpperCase()}</span>
          <span className="hidden min-w-0 flex-1 truncate text-xs text-white/60 md:block" dir="ltr">{email}</span>
          <button className="ar-icon h-9 w-9 text-xs font-bold" type="button" onClick={toggle}>{ar ? 'EN' : 'ع'}</button>
          <button className="ar-icon h-9 w-9" type="button" onClick={() => void signOut()} aria-label={t('signOut')} title={t('signOut')}>⎋</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8"><Outlet /></main>
    </div>
  )
}
