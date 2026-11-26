import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { detectiveError, listDetectiveCases, type DetectiveCase } from '../detective/api'
import { DetectiveArt } from '../components/GameArt'
import { TabBar } from '../components/ArcadeChrome'

export const CATEGORY_LABEL: Record<string, [string, string]> = {
  MYSTERY: ['غموض', 'Mystery'], MISSING_OBJECT: ['شيء مفقود', 'Missing object'], UNUSUAL_INCIDENT: ['حادثة غريبة', 'Unusual incident'],
  HISTORICAL: ['لغز تاريخي', 'Historical'], LOGIC: ['تحقيق منطقي', 'Logic'], EDUCATIONAL: ['لغز تعليمي', 'Educational']
}
export const imageUrl = (p: string | null | undefined) => (!p ? '' : p.startsWith('http') ? p : `/${p.replace(/^\//, '')}`)
export const Stars = ({ n }: { n: number }) => <span aria-label={`${n}/5`} className="tracking-tight text-[#f5c46b]">{'★'.repeat(n)}<span className="text-white/20">{'★'.repeat(Math.max(0, 5 - n))}</span></span>

export default function DetectiveCatalog() {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [cases, setCases] = useState<DetectiveCase[] | null>(null)
  const [error, setError] = useState('')
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [status, setStatus] = useState<'all' | 'done' | 'new'>('all')
  useEffect(() => { listDetectiveCases().then(setCases).catch((e) => setError(detectiveError(e, ar))) }, [ar])
  const categories = useMemo(() => [...new Set((cases ?? []).map((c) => c.category ?? 'MYSTERY'))], [cases])
  const shown = (cases ?? []).filter((c) => (difficulty === null || (difficulty === 1 ? c.difficulty <= 2 : difficulty === 3 ? c.difficulty === 3 : c.difficulty >= 4))
    && (category === null || (c.category ?? 'MYSTERY') === category)
    && (status === 'all' || (status === 'done' ? c.completed : !c.completed)))

  return (
    <main className="det">
      <div className="det-shell space-y-5">
        <header className="flex items-center justify-between">
          <Link to="/" className="det-btn-ghost min-h-0 py-2 text-sm">{ar ? 'الرئيسية' : 'Home'}</Link>
          <Link to="/detective/history" className="det-btn-ghost min-h-0 py-2 text-sm">🗂️ {ar ? 'تحقيقاتي' : 'My investigations'}</Link>
        </header>
        <section className="det-panel relative overflow-hidden">
          <DetectiveArt className="absolute -bottom-4 h-36 w-36 opacity-90 ltr:-right-2 rtl:-left-2" />
          <p className="text-xs font-bold uppercase tracking-[.3em] text-[#2dd4bf]">Detective Mode</p>
          <h1 className="det-title mt-1">{ar ? 'المحقق' : 'The Detective'}</h1>
          <p className="mt-1 max-w-[65%] text-sm text-[#b9c7d8]">{ar ? 'كل تفصيلة ممكن تكون دليل! افحص الصور، اجمع الأدلة، واربطها لحد ما توصل للحقيقة.' : 'Every detail could be a clue! Inspect the scenes, collect evidence and connect it until you reach the truth.'}</p>
        </section>

        <section className="space-y-2" aria-label={ar ? 'تصفية' : 'Filters'}>
          <div className="flex flex-wrap gap-2">
            {([[null, ar ? 'كل المستويات' : 'All levels'], [1, ar ? 'سهل' : 'Easy'], [3, ar ? 'متوسط' : 'Medium'], [4, ar ? 'صعب' : 'Hard']] as const).map(([v, l]) => (
              <button key={String(v)} type="button" className="det-chip" aria-pressed={difficulty === v} onClick={() => setDifficulty(v)}>{l}</button>))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="det-chip" aria-pressed={category === null} onClick={() => setCategory(null)}>{ar ? 'كل الأنواع' : 'All types'}</button>
            {categories.map((c) => <button key={c} type="button" className="det-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{(CATEGORY_LABEL[c] ?? [c, c])[ar ? 0 : 1]}</button>)}
            <span className="mx-1 w-px bg-[#2f4462]" aria-hidden="true" />
            {([['all', ar ? 'الكل' : 'All'], ['new', ar ? 'لم تُحل' : 'Unsolved'], ['done', ar ? 'محلولة' : 'Solved']] as const).map(([v, l]) => (
              <button key={v} type="button" className="det-chip" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>))}
          </div>
        </section>

        {error && <p className="det-panel text-[#ff8a8d]" role="alert">{error}</p>}
        {cases === null && !error && <p role="status">{ar ? 'بنفتح أرشيف القضايا…' : 'Opening the case archive…'}</p>}
        {cases !== null && shown.length === 0 && <p className="det-panel text-center text-sm">{cases.length === 0 ? (ar ? 'لا توجد قضايا منشورة بعد.' : 'No published cases yet.') : (ar ? 'مفيش قضايا بالفلاتر دي.' : 'No cases match these filters.')}</p>}

        <ul className="grid gap-4 sm:grid-cols-2">
          {shown.map((c, i) => (
            <li key={c.id}>
              <Link to={`/detective/case/${c.id}`} className="group block overflow-hidden rounded-2xl border border-[#2a3a52] bg-[#111b2d] transition hover:border-[#2dd4bf]/60">
                <div className="relative aspect-video bg-[#0d1626]">
                  {c.cover_image_path ? <img src={imageUrl(c.cover_image_path)} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    : <div className="grid h-full place-items-center"><DetectiveArt className="h-28 w-28" /></div>}
                  <span className="absolute top-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] tracking-widest text-[#f5c46b] ltr:left-2 rtl:right-2" dir="ltr">CASE #{String(i + 101).padStart(3, '0')}</span>
                  {c.completed && <span className="det-stamp absolute bottom-2 bg-black/40 ltr:right-2 rtl:left-2">{ar ? 'محلولة' : 'Solved'}</span>}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#9fb0c4]">
                    <span>{(CATEGORY_LABEL[c.category ?? 'MYSTERY'] ?? ['غموض', 'Mystery'])[ar ? 0 : 1]}</span><Stars n={c.difficulty} />
                  </div>
                  <h2 className="font-display text-xl font-bold text-white">{ar ? c.title_ar : c.title}</h2>
                  <p className="line-clamp-2 text-sm text-[#b9c7d8]">{ar ? c.description_ar : c.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="det-chip">⏱ {c.estimated_minutes ?? 15} {ar ? 'د' : 'min'}</span>
                    <span className="det-chip">🖼️ {c.scenes ?? 0}</span><span className="det-chip">🔎 {c.evidence ?? 0} {ar ? 'دليل' : 'clues'}</span>
                    <span className="det-chip">🧭 {c.stages ?? 0} {ar ? 'مراحل' : 'stages'}</span>
                    {typeof c.best_score === 'number' && <span className="det-chip text-[#f5c46b]">🏆 {c.best_score}</span>}
                    {c.resume_session && <span className="det-chip text-[#5eead4]">▶ {ar ? 'كمّل' : 'Resume'}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <TabBar />
    </main>
  )
}
