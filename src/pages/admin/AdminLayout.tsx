import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useI18n, type Key } from '../../lib/i18n'
import { LangToggle } from '../../components/LangToggle'

const nav: { to: string; key: Key; perm: string; end?: boolean }[] = [
  { to: '/admin', key: 'dashboard', perm: 'report.view', end: true },
  { to: '/admin/stories', key: 'stories', perm: 'story.manage' },
  { to: '/admin/puzzle-lab', key: 'puzzleLab', perm: 'story.manage' },
  { to: '/admin/rooms', key: 'rooms', perm: 'room.manage' },
  { to: '/admin/users', key: 'users', perm: 'user.manage' },
  { to: '/admin/reports', key: 'reports', perm: 'report.view' }
]

export default function AdminLayout() {
  const { can, signOut } = useAuth()
  const { t } = useI18n()
  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-e border-parchment-200/15 p-3">
        <h1 className="font-display text-2xl text-gold-400 mb-3">{t('appName')}</h1>
        <nav className="flex md:flex-col gap-1 overflow-x-auto" aria-label="Admin">
          {nav.filter((n) => can(n.perm)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `rounded-xl px-3 py-2 whitespace-nowrap ${isActive ? 'bg-gold-500 text-ink-900 font-semibold' : 'hover:bg-ink-700'}`}>
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-3 flex gap-2">
          <LangToggle />
          <button className="btn-ghost" type="button" onClick={() => void signOut()}>{t('signOut')}</button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8"><Outlet /></main>
    </div>
  )
}
