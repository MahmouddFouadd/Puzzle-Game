import { NavLink } from 'react-router-dom'
import { useI18n, type Key } from '../lib/i18n'

const tabs: { suffix: string; key: Key; end?: boolean }[] = [
  { suffix: '', key: 'tabInfo', end: true }, { suffix: '/questions', key: 'tabQuestions' },
  { suffix: '/assign', key: 'tabAssign' }, { suffix: '/rules', key: 'tabRules' }, { suffix: '/publish', key: 'tabPublish' }
]

export function StoryTabs({ storyId }: { storyId: string }) {
  const { t } = useI18n()
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Story">
      {tabs.map((x) => (
        <NavLink key={x.suffix} to={`/admin/stories/${storyId}${x.suffix}`} end={x.end}
          className={({ isActive }) => `rounded-xl px-3 py-2 whitespace-nowrap ${isActive ? 'bg-gold-500 text-ink-900 font-semibold' : 'border border-parchment-200/30 hover:bg-ink-700'}`}>
          {t(x.key)}
        </NavLink>
      ))}
    </nav>
  )
}
