import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import type { RecentGame } from '../../lib/recentGames'
import type { RecentState } from '../../lib/useRecentGames'
import { IconBakasa, IconDetective, IconForward, IconPlay, IconResults, IconStory, IconTrophy } from '../../brand/icons'
import { EmptyState } from './EmptyState'
import { FzLoader } from '../../brand/Logo'

const MODE = {
  story: { Icon: IconStory, color: 'var(--fz-mode-story)', name: ['القصص', 'Story'] },
  detective: { Icon: IconDetective, color: 'var(--fz-mode-detective)', name: ['المحقق', 'Detective'] },
  bakasa: { Icon: IconBakasa, color: 'var(--fz-mode-bakasa)', name: ['بكاسة', 'Bakasa'] }
} as const

export function RecentGameRow({ g, ar }: { g: RecentGame; ar: boolean }) {
  const m = MODE[g.mode]
  const date = new Date(g.at).toLocaleDateString(ar ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' })
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${m.color} 22%, transparent)`, color: m.color }} aria-hidden="true"><m.Icon size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{ar ? g.titleAr : g.title}</span>
        <span className="fz-muted block truncate text-xs">{ar ? m.name[0] : m.name[1]} · {date}{g.detail ? ` · ${ar ? g.detail.ar : g.detail.en}` : ''}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {g.score !== null && <b className="text-sm" style={{ color: 'var(--fz-gold)' }} dir="ltr">{g.score} {ar ? 'نقطة' : 'pts'}</b>}
        {g.won && <span className="fz-chip !py-0.5 !text-[11px]" style={{ color: 'var(--fz-gold)' }}><IconTrophy size={12} />{ar ? 'فوز' : 'Win'}</span>}
        {g.action === 'continue' && <span className="fz-chip !py-0.5 !text-[11px]" style={{ color: 'var(--fz-cyan)' }}><IconPlay size={12} />{ar ? 'كمّل' : 'Continue'}</span>}
        {g.action === 'result' && <span className="fz-chip !py-0.5 !text-[11px]"><IconResults size={12} />{ar ? 'النتيجة' : 'Result'}</span>}
      </span>
    </>
  )
  const cls = 'flex items-center gap-3 rounded-2xl p-3 transition'
  return g.href ? <Link to={g.href} className={`${cls} fz-focus hover:bg-white/5`}>{inner}</Link> : <div className={cls}>{inner}</div>
}

export function RecentGamesSection({ state }: { state: RecentState }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  return (
    <section className="fz-card p-4 md:p-5" aria-labelledby="fz-recent-h">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="fz-recent-h" className="fz-display text-xl">{ar ? 'آخر ألعابك' : 'Recent games'}</h2>
        {state.games.length > 0 && <Link to="/bakasa/history" className="fz-focus fz-muted inline-flex items-center gap-1 rounded-lg text-sm font-bold hover:text-white">{ar ? 'سجل بكاسة' : 'Bakasa history'}<IconForward size={16} /></Link>}
      </div>
      {state.status === 'loading' && <div className="grid place-items-center py-8"><FzLoader size={48} label={ar ? 'بنحمّل' : 'Loading'} /></div>}
      {state.status === 'error' && <p className="fz-muted py-6 text-center text-sm" role="alert">{ar ? 'مقدرناش نجيب آخر ألعابك دلوقتي.' : 'Could not load your recent games right now.'}</p>}
      {(state.status === 'guest' || (state.status === 'ready' && state.games.length === 0)) && (
        <EmptyState Icon={IconPlay} title={ar ? 'لسه مالعبتش أي مباراة' : 'No games yet'}
          text={ar ? 'أول ما تلعب بكاسة أو تحل قضية، هتلاقي مبارياتك ونتايجك هنا.' : 'Play Bakasa or solve a case and your matches and results will show up here.'} />
      )}
      {state.games.length > 0 && <ul className="-mx-1 divide-y divide-white/5">{state.games.map((g) => <li key={g.id}><RecentGameRow g={g} ar={ar} /></li>)}</ul>}
    </section>
  )
}
