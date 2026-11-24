import { useI18n } from '../lib/i18n'
export function LangToggle() {
  const { t, toggle } = useI18n()
  return <button className="btn-ghost" onClick={toggle} type="button">{t('language')}</button>
}
