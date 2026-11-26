import { useI18n } from '../lib/i18n'
import type { LeaderRow } from './types'

const MEDALS = ['🥇', '🥈', '🥉']

/** Live ranking during play; a podium plus the full table once the room has finished. */
export function Scoreboard({ rows, myTeam, finished }: { rows: LeaderRow[]; myTeam: string; finished: boolean }) {
  const { t } = useI18n()
  const top = rows.slice(0, 3)
  // Podium order: 2nd, 1st, 3rd.
  const podium = [top[1], top[0], top[2]]
  const heights = ['h-20', 'h-28', 'h-14']
  const colors = ['#cfd6e0', '#e0b34a', '#d08a4e']
  return (
    <section className="story-panel space-y-4" aria-label={finished ? t('finalResults') : t('leaderboard')}>
      <h3 className="font-display text-xl text-gold-400">{finished ? t('finalResults') : t('leaderboard')}</h3>
      {finished && top.length > 0 && (
        <div className="podium" aria-hidden="true">
          {podium.map((row, i) => (
            <div key={row?.team ?? i} className="flex flex-col items-center gap-1">
              {row && <>
                <span className="text-3xl pop-in">{MEDALS[i === 1 ? 0 : i === 0 ? 1 : 2]}</span>
                <span className={`max-w-full truncate text-sm font-semibold ${row.team === myTeam ? 'text-gold-400' : ''}`}>{row.name}</span>
                <div className={`podium-step w-full ${heights[i]}`} style={{ background: colors[i] }}>
                  <div className="font-display text-xl">{row.score}</div>
                </div>
              </>}
            </div>
          ))}
        </div>
      )}
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const pct = r.total ? Math.round((r.revealed / r.total) * 100) : 0
          const mine = r.team === myTeam
          return (
            <li key={r.team} className={`rounded-xl border p-3 ${mine ? 'border-gold-400 bg-gold-500/10' : 'border-parchment-200/10 bg-ink-900/40'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-7 text-center text-lg">{i < 3 ? MEDALS[i] : r.rank ?? i + 1}</span>
                  <span className="truncate font-semibold">{r.name}</span>
                  {r.state === 'COMPLETED' && <span className="text-ok" aria-label={t('completedMsg')}>✓</span>}
                </span>
                <span className="font-display text-lg text-gold-400">{r.score}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.revealed}>
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-12 text-end text-xs opacity-70" dir="ltr">{r.revealed}/{r.total}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
