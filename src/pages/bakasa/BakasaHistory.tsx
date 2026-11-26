import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { bakasaError, myHistory, type HistoryRow } from '../../bakasa/api'
import { BakasaLogo } from '../../bakasa/ui'

export default function BakasaHistory() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { myHistory().then(setRows).catch((e) => setError(bakasaError(e, ar))) }, [ar])
  return (
    <main className="bakasa"><div className="bk-shell space-y-4">
      <div className="flex items-center justify-between"><Link to="/bakasa" className="bk-btn-ghost">{ar ? 'رجوع' : 'Back'}</Link><BakasaLogo small /></div>
      <h1 className="bk-title text-3xl">{ar ? 'سجل مبارياتي' : 'My matches'}</h1>
      {error && <p role="alert" className="bk-panel">{error}</p>}
      {rows === null && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {rows?.length === 0 && <p className="bk-panel text-center">{ar ? 'لسه ملعبتش أي مباراة أونلاين. يلا اعمل غرفة!' : 'No online matches yet. Create a room!'}</p>}
      <ul className="space-y-3">{rows?.map((r) => (
        <li key={r.room_id} className="bk-panel space-y-2 !p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><div className="truncate font-display text-lg">{r.name}</div><div className="text-xs opacity-70">{new Date(r.created_at).toLocaleString(ar ? 'ar-EG' : 'en-GB')} · <span dir="ltr">{r.code}</span></div></div>
            {r.status !== 'FINISHED' && r.status !== 'CLOSED' && <Link className="bk-btn-ghost min-h-0 py-1.5 text-sm" to={`/bakasa/room/${r.room_id}`}>{ar ? 'افتح' : 'Open'}</Link>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bk-chip bg-white/10">👥 {r.players}</span><span className="bk-chip bg-white/10">🔁 {r.rounds} {ar ? 'جولات' : 'rounds'}</span>
            <span className="bk-chip bg-bk-accent/20 text-bk-accent">🏆 {r.winner} ({r.top_score})</span><span className="bk-chip bg-white/10">⭐ {ar ? 'نقاطي' : 'Me'}: {r.my_score}</span>
            <span className="bk-chip bg-bk-pink/20 text-bk-pink">🕵️ {r.spy_wins}</span><span className="bk-chip bg-bk-lime/20 text-bk-lime">🙋 {r.player_wins}</span>
          </div>
        </li>))}</ul>
    </div></main>
  )
}
