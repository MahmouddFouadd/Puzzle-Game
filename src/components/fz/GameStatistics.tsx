import { useI18n } from '../../lib/i18n'
import type { PlayerStats } from '../../lib/recentGames'
import { IconDetective, IconPlay, IconStar, IconTrophy } from '../../brand/icons'

/** Only real numbers from finished Bakasa matches and completed Detective cases. Story Puzzle has no personal history yet, which the footnote says. */
export function GameStatistics({ stats }: { stats: PlayerStats | null }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  if (!stats || stats.gamesPlayed === 0) return null
  const items = [
    { Icon: IconPlay, label: ar ? 'مباريات' : 'Games played', value: stats.gamesPlayed, color: 'var(--fz-blue)' },
    { Icon: IconTrophy, label: ar ? 'مرات الفوز' : 'Wins', value: stats.wins, color: 'var(--fz-gold)' },
    { Icon: IconStar, label: ar ? 'مجموع النقط' : 'Total points', value: stats.totalScore, color: 'var(--fz-purple)' },
    ...(stats.bestDetectiveScore !== null ? [{ Icon: IconDetective, label: ar ? 'أعلى نتيجة تحقيق' : 'Best case score', value: stats.bestDetectiveScore, color: 'var(--fz-cyan)' }] : [])
  ]
  return (
    <section className="fz-card p-4 md:p-5" aria-labelledby="fz-stats-h">
      <h2 id="fz-stats-h" className="fz-display mb-3 text-xl">{ar ? 'إحصائياتك' : 'Your stats'}</h2>
      <dl className="grid grid-cols-2 gap-3">
        {items.map(({ Icon, label, value, color }) => (
          <div key={label} className="fz-stat">
            <dt className="fz-muted flex items-center gap-1.5 text-xs font-bold"><span style={{ color }}><Icon size={16} /></span>{label}</dt>
            <dd className="fz-display mt-1 text-3xl" dir="ltr" style={{ textAlign: ar ? 'right' : 'left' }}>{value.toLocaleString('en-US')}</dd>
          </div>
        ))}
      </dl>
      <p className="fz-muted mt-3 text-[11px]">{ar ? 'محسوبة من مباريات بكاسة المنتهية وقضايا المحقق المكتملة.' : 'From finished Bakasa matches and completed Detective cases.'}</p>
    </section>
  )
}
