import { NavLink } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { IconBakasa, IconDetective, IconHome, IconProfile, IconStory } from '../../brand/icons'
import type { ComponentType } from 'react'

export type NavItem = { to: string; label: [string, string]; Icon: ComponentType<{ size?: number }>; end?: boolean }
/** One navigation model for the bottom bar (mobile) and the header links (desktop). Every target is an existing route. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: ['الرئيسية', 'Home'], Icon: IconHome, end: true },
  { to: '/game/story', label: ['القصص', 'Story'], Icon: IconStory },
  { to: '/detective', label: ['المحقق', 'Detective'], Icon: IconDetective },
  { to: '/bakasa', label: ['بكاسة', 'Bakasa'], Icon: IconBakasa },
  { to: '/me', label: ['ملفي', 'Profile'], Icon: IconProfile }
]

export function DesktopNav() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  return (
    <nav aria-label={ar ? 'التنقل الرئيسي' : 'Main navigation'} className="hidden items-center gap-1 lg:flex">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="fz-nav-link"><Icon size={18} />{ar ? label[0] : label[1]}</NavLink>
      ))}
    </nav>
  )
}

export function BottomNav() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  return (
    <nav className="fz-bottom-nav" aria-label={ar ? 'التنقل' : 'Navigation'}>
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink to={to} end={end} className="fz-bottom-link">
              <span className="fz-bottom-ico" aria-hidden="true"><Icon size={22} /></span>{ar ? label[0] : label[1]}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
