import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { FzMark, FzWordmark } from '../../brand/Logo'
import { IconSettings } from '../../brand/icons'
import { Avatar } from '../../bakasa/ui'
import { DesktopNav } from './MainNavigation'
import { usePlayerIdentity } from '../ArcadeChrome'

/** App header: logo, desktop navigation, language, settings and the player's avatar/name (profile). No notification bell: there is no notification feature yet. */
export function BrandHeader() {
  const { lang, toggle } = useI18n()
  const ar = lang === 'ar'
  const { name, avatar } = usePlayerIdentity()
  return (
    <header className="fz-header">
      <div className="mx-auto flex h-16 max-w-[var(--fz-content-max)] items-center gap-3 px-4 md:px-8">
        <Link to="/" className="fz-focus flex shrink-0 items-center gap-2.5 rounded-xl" aria-label={ar ? 'فريندز زون – الرئيسية' : 'Friends Zone – Home'}>
          <FzMark size={38} />
          <FzWordmark lang={lang} size={ar ? 24 : 21} className="hidden min-[380px]:inline-flex" />
        </Link>
        <div className="flex-1" />
        <DesktopNav />
        <div className="flex items-center gap-2">
          <button type="button" className="fz-icon-btn text-sm font-extrabold" onClick={toggle} aria-label={ar ? 'Switch to English' : 'التحويل للعربية'} lang={ar ? 'en' : 'ar'}>{ar ? 'EN' : 'ع'}</button>
          <Link to="/me#settings" className="fz-icon-btn" aria-label={ar ? 'الإعدادات' : 'Settings'}><IconSettings size={20} /></Link>
          <Link to="/me" className="fz-focus flex items-center gap-2 rounded-full" aria-label={ar ? `ملفي: ${name || 'لاعب'}` : `My profile: ${name || 'Player'}`}>
            <span className="rounded-full p-[2px]" style={{ background: 'var(--fz-grad-zone)' }}><span className="block rounded-full bg-fz-navy p-[2px]"><Avatar avatar={avatar} size={34} /></span></span>
            <span className="hidden max-w-[9rem] truncate text-sm font-bold lg:inline">{name || (ar ? 'لاعب' : 'Player')}</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
