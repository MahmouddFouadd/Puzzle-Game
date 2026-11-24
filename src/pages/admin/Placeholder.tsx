import { useI18n, type Key } from '../../lib/i18n'
// Honest placeholder: these sections are built in later phases (see roadmap).
export default function Placeholder({ titleKey }: { titleKey: Key }) {
  const { t } = useI18n()
  return <div className="space-y-2"><h2 className="font-display text-3xl">{t(titleKey)}</h2><p className="opacity-70">{t('comingSoon')}</p></div>
}
