import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { detectiveError, detectiveHistory, type DetectiveHistoryRow } from '../detective/api'
import { Stars } from './DetectiveCatalog'

export default function DetectiveHistory() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [rows, setRows] = useState<DetectiveHistoryRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { detectiveHistory().then(setRows).catch((e) => setError(detectiveError(e, ar))) }, [ar])
  const mins = (s: number | null) => (s === null ? '—' : `${Math.max(1, Math.round(s / 60))} ${ar ? 'د' : 'min'}`)
  return (
    <main className="det"><div className="det-shell space-y-4">
      <Link to="/detective" className="det-btn-ghost min-h-0 py-2 text-sm">{ar ? '→ القضايا' : '← Cases'}</Link>
      <h1 className="det-title">{ar ? 'تحقيقاتي' : 'My investigations'}</h1>
      {error && <p className="det-panel text-[#ff8a8d]" role="alert">{error}</p>}
      {rows === null && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {rows?.length === 0 && <div className="det-panel space-y-3 text-center"><p>{ar ? 'لسه ما بدأتش أي تحقيق.' : 'No investigations yet.'}</p><Link className="det-btn" to="/detective">{ar ? 'اختار قضية' : 'Pick a case'}</Link></div>}
      <ul className="space-y-3">{rows?.map((r) => (
        <li key={r.session_id} className="det-panel flex items-center gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2"><b className="truncate">{ar ? r.title_ar : r.title}</b><Stars n={r.difficulty} /></div>
            <div className="text-xs text-[#9fb0c4]">{new Date(r.started_at).toLocaleString(ar ? 'ar-EG' : 'en-GB')} · 🔎 {r.found}/{r.total} · ⏱ {mins(r.duration_seconds)}</div>
          </div>
          <span className="font-display text-xl text-[#f5c46b]">{r.score}</span>
          {r.completed_at ? <Link className="det-btn-ghost min-h-0 py-2 text-sm" to={`/detective/report/${r.session_id}`}>{ar ? 'التقرير' : 'Report'}</Link>
            : <Link className="det-btn min-h-0 py-2 text-sm" to={`/detective/session/${r.session_id}`}>{ar ? 'كمّل' : 'Resume'}</Link>}
        </li>))}</ul>
    </div></main>
  )
}
