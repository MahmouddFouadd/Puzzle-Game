import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useI18n, type Key } from '../../lib/i18n'

const sections: Array<{ path: string; key: Key; end?: boolean }> = [
  { path: '/admin/content-library', key: 'contentLibrary', end: true },
  { path: '/admin/content-library/images', key: 'imageLibrary' },
  { path: '/admin/content-library/questions', key: 'contentQuestionBank' },
  { path: '/admin/content-library/ai', key: 'aiStudio' },
  { path: '/admin/content-library/import', key: 'excelImport' },
  { path: '/admin/content-library/review', key: 'reviewQueue' },
  { path: '/admin/content-library/analytics', key: 'contentAnalytics' },
  { path: '/admin/content-library/categories', key: 'contentCategories' }
]

export default function ContentStudio() {
  const { can } = useAuth()
  const { t } = useI18n()
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-sea-300">Story Puzzle</p>
          <h2 className="font-display text-3xl text-gold-400">{t('contentStudio')}</h2>
        </div>
        <p className="max-w-xl text-sm opacity-75">{t('contentLibrary')} · {t('reviewQueue')} · {t('imageLibrary')}</p>
      </header>
      <nav className="flex gap-2 overflow-x-auto border-b border-parchment-200/15 pb-2" aria-label={t('contentStudio')}>
        {sections.filter((section) => section.key !== 'reviewQueue' || can('content.review')).map((section) => (
          <NavLink key={section.path} to={section.path} end={section.end}
            className={({ isActive }) => `whitespace-nowrap rounded-xl px-3 py-2 text-sm ${isActive ? 'bg-gold-500 text-ink-900 font-semibold' : 'hover:bg-ink-700'}`}>
            {t(section.key)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  )
}
