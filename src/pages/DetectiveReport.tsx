import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { detectiveError, detectiveReport, startDetectiveSession, type DetectiveReport } from '../detective/api'
import { SceneViewer } from '../detective/SceneViewer'
import { RELATIONS } from '../detective/Board'
import { imageUrl } from './DetectiveCatalog'

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return }
    const start = performance.now(); let raf = 0
    const step = (t: number) => { const k = Math.min(1, (t - start) / 1200); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{v}</>
}

/** Final investigation report: verdict, stats, solution, evidence-by-evidence explanation. */
export default function DetectiveReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const [r, setR] = useState<DetectiveReport | null>(null)
  const [error, setError] = useState('')
  const [sceneIdx, setSceneIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (sessionId) detectiveReport(sessionId).then(setR).catch((e) => setError(detectiveError(e, ar))) }, [sessionId, ar])
  useEffect(() => { const id = window.setTimeout(() => setRevealed(true), 900); return () => window.clearTimeout(id) }, [r])
  const evTitle = useMemo(() => new Map((r?.evidence ?? []).map((e) => [e.id, ar ? e.title_ar : e.title])), [r, ar])

  if (!r) return <main className="det grid place-items-center p-6"><div className="det-panel space-y-3 text-center">
    {error ? <><p role="alert">{error}</p><Link className="det-btn" to={sessionId ? `/detective/session/${sessionId}` : '/detective'}>{ar ? 'ارجع للتحقيق' : 'Back to the investigation'}</Link></> : <p role="status">{ar ? 'بنكتب تقرير التحقيق…' : 'Writing the investigation report…'}</p>}
  </div></main>

  const accuracy = r.inspections ? Math.round((r.hits / r.inspections) * 100) : 0
  const minutes = Math.max(1, Math.round(r.duration_seconds / 60))
  const solved = r.conclusion_correct === true
  const badges: [boolean, string, string, string][] = [
    [solved, '🏅', 'حلّ القضية', 'Case solved'], [r.evidence_found === r.evidence_total, '🔎', 'عين الصقر: كل الأدلة', 'Eagle eye: all clues'],
    [r.hints_used === 0, '🧠', 'بدون تلميحات', 'No hints'], [accuracy >= 60 && r.inspections >= r.evidence_found, '🎯', 'فحص دقيق', 'Precise inspector'],
    [r.questions_correct === r.questions_total, '💯', 'كل الإجابات صح', 'Perfect answers'], [minutes <= r.case.estimated_minutes, '⚡', 'محقق سريع', 'Quick detective'],
    [r.your_links.some((l) => l.correct), '🧷', 'ربط الأدلة', 'Connected the clues']
  ]
  const scenes = r.scenes
  const scene = scenes[sceneIdx]
  const optText = (opts: DetectiveReport['questions'][number]['options'], id: unknown) => { const o = opts.find((x) => x.id === id); return o ? (ar ? o.text_ar || o.text : o.text) : String(id ?? '—') }
  const answerText = (q: DetectiveReport['questions'][number], a: Record<string, unknown> | null) => {
    if (!a) return ar ? 'لم تجب' : 'Not answered'
    if ('option_id' in a) return optText(q.options, a.option_id)
    if ('value' in a) return a.value === 'true' ? (ar ? 'صح' : 'True') : (ar ? 'خطأ' : 'False')
    if ('from' in a) return `${evTitle.get(String(a.from)) ?? '?'} — ${(RELATIONS as Record<string, { ar: string; en: string }>)[String(a.relation)]?.[ar ? 'ar' : 'en'] ?? a.relation} — ${evTitle.get(String(a.to)) ?? '?'}`
    return String(a.text ?? a.answer ?? '—')
  }
  const playAgain = async () => { setBusy(true); try { nav(`/detective/session/${await startDetectiveSession(r.case.id)}`) } catch (e) { setError(detectiveError(e, ar)); setBusy(false) } }

  return (
    <main className="det">
      <div className="det-shell space-y-5">
        <section className="det-panel relative overflow-hidden text-center">
          <p className="font-mono text-xs tracking-[.3em] text-[#2dd4bf]">{ar ? 'تقرير التحقيق' : 'INVESTIGATION REPORT'}</p>
          <h1 className="det-title mt-1">{ar ? r.case.title_ar : r.case.title}</h1>
          <div className={`my-3 transition duration-700 ${revealed ? 'scale-100 opacity-100' : 'scale-150 opacity-0'}`}>
            <span className="det-stamp !text-base" style={solved ? { borderColor: '#22c55e', color: '#4ade80' } : undefined}>{solved ? (ar ? 'تم حل القضية' : 'Case solved') : (ar ? 'الاستنتاج غير صحيح' : 'Wrong conclusion')}</span>
          </div>
          <div className="font-display text-6xl font-black text-[#f5c46b]"><CountUp to={r.score} /></div>
          <p className="text-sm text-[#9fb0c4]">{ar ? 'نقطة' : 'points'}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">{badges.filter((b) => b[0]).map(([, i, a, e]) => <span key={e} className="det-chip bk-pop !text-sm text-[#f5c46b]">{i} {ar ? a : e}</span>)}</div>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[['🔎', ar ? 'الأدلة المكتشفة' : 'Evidence found', `${r.evidence_found}/${r.evidence_total}`], ['🎯', ar ? 'دقة الفحص' : 'Inspection accuracy', `${accuracy}%`],
            ['❓', ar ? 'إجابات صحيحة' : 'Correct answers', `${r.questions_correct}/${r.questions_total}`], ['💡', ar ? 'تلميحات' : 'Hints', `${r.hints_used} (${r.hint_penalty})`],
            ['⏱', ar ? 'الوقت' : 'Time', `${minutes} ${ar ? 'د' : 'min'}`], ['🧷', ar ? 'روابط صحيحة' : 'Correct links', `${r.your_links.filter((l) => l.correct).length}/${r.relations.length}`]].map(([i, l, v]) => (
            <div key={l} className="det-panel !p-3 text-center"><div className="text-xl">{i}</div><div className="font-display text-xl font-bold" dir="ltr">{v}</div><div className="text-[11px] text-[#9fb0c4]">{l}</div></div>))}
        </section>
        {Object.keys(r.breakdown).length > 0 && (
          <section className="det-panel space-y-1 text-sm">
            <h2 className="font-bold">{ar ? 'تفاصيل النقاط' : 'Score breakdown'}</h2>
            {Object.entries(r.breakdown).map(([k, v]) => <div key={k} className="flex justify-between"><span>{({ DISCOVERY: ar ? 'اكتشاف أدلة' : 'Discoveries', DETECTIVE_ANSWER: ar ? 'الإجابات' : 'Answers', HINT: ar ? 'التلميحات' : 'Hints', LINK_BONUS: ar ? 'ربط الأدلة' : 'Linking clues' } as Record<string, string>)[k] ?? k}</span><b dir="ltr" className={v < 0 ? 'text-[#ff8a8d]' : 'text-[#5eead4]'}>{v > 0 ? '+' : ''}{v}</b></div>)}
          </section>
        )}

        {r.solution && (
          <section className="det-file space-y-2">
            <span className="det-stamp">{ar ? 'الحل الرسمي' : 'Official solution'}</span>
            <p className="font-display text-xl font-bold">{ar ? r.solution.reveal_ar : r.solution.reveal}</p>
            {(ar ? r.solution.explanation_ar : r.solution.explanation) && <p className="text-sm leading-relaxed">{ar ? r.solution.explanation_ar : r.solution.explanation}</p>}
            {Array.isArray(r.solution.alternatives) && r.solution.alternatives.length > 0 && (
              <div className="space-y-1 border-t border-black/10 pt-2 text-sm"><b>{ar ? 'نظريات تانية… وليه مش صح:' : 'Other theories… and why they fail:'}</b>
                {r.solution.alternatives.map((a, i) => <p key={i}>• {ar ? a.ar ?? a.hypothesis_ar ?? a.hypothesis : a.en ?? a.hypothesis}{(ar ? a.why_wrong_ar : a.why_wrong_en) ? ` — ${ar ? a.why_wrong_ar : a.why_wrong_en}` : ''}</p>)}</div>)}
          </section>
        )}

        {scene && (
          <section className="space-y-2">
            <h2 className="font-bold">{ar ? 'خريطة الأدلة' : 'Evidence map'} <span className="text-xs font-normal text-[#9fb0c4]">{ar ? '(الأخضر: لقيته · الأحمر: فاتك)' : '(green: found · red: missed)'}</span></h2>
            <div className="flex gap-2 overflow-x-auto">{scenes.map((s, i) => <button key={s.id} type="button" className="det-chip" aria-pressed={i === sceneIdx} onClick={() => setSceneIdx(i)}>{ar ? s.title_ar : s.title}</button>)}</div>
            <SceneViewer src={imageUrl(scene.image_path)} alt={ar ? scene.title_ar : scene.title}
              boxes={r.evidence.filter((e) => e.scene_id === scene.id).map((e) => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height, label: ar ? e.title_ar : e.title, tone: e.found ? 'found' : 'missed' }))} />
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-bold">{ar ? 'كل دليل… وإيه اللي بيثبته' : 'Each clue… and what it shows'}</h2>
          {r.evidence.map((e) => (
            <article key={e.id} className={`rounded-xl border p-3 text-sm ${e.found ? 'border-[#2dd4bf]/40 bg-[#0f1a2b]' : 'border-[#e5484d]/40 bg-[#1f1116]'}`}>
              <div className="flex items-center justify-between gap-2"><b>{e.found ? '✅' : '❌'} {ar ? e.title_ar : e.title}</b><span className="text-[11px] text-[#9fb0c4]">{'●'.repeat(e.importance)}</span></div>
              <p className="text-[#cdd8e5]"><span className="text-[#9fb0c4]">{ar ? 'اللي باين: ' : 'Observed: '}</span>{ar ? e.description_ar : e.description}</p>
              {e.explanation && <p className="text-[#cdd8e5]"><span className="text-[#9fb0c4]">{ar ? 'بيدعم: ' : 'Supports: '}</span>{e.explanation}</p>}
            </article>))}
        </section>

        {(r.relations.length > 0 || r.your_links.length > 0) && (
          <section className="det-panel space-y-2 text-sm">
            <h2 className="font-bold">{ar ? 'الروابط بين الأدلة' : 'Links between clues'}</h2>
            {r.relations.map((x, i) => <p key={i}>{x.found_by_you ? '✅' : '▫️'} <b>{evTitle.get(x.from)}</b> <span style={{ color: RELATIONS[x.type]?.color }}>— {ar ? RELATIONS[x.type]?.ar : RELATIONS[x.type]?.en} —</span> <b>{evTitle.get(x.to)}</b>{x.explanation ? `: ${x.explanation}` : ''}</p>)}
            {r.your_links.filter((l) => !l.correct).map((l, i) => <p key={`w${i}`} className="text-[#ff8a8d]">✖ {ar ? 'رابطك:' : 'Your link:'} {evTitle.get(l.from)} — {ar ? RELATIONS[l.relation].ar : RELATIONS[l.relation].en} — {evTitle.get(l.to)}</p>)}
          </section>
        )}

        {r.statements.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">{ar ? 'أقوال الأشخاص' : 'Statements'}</h2>
            {r.statements.map((s, i) => (
              <article key={i} className="det-panel space-y-1 !p-3 text-sm">
                <div className="flex items-center justify-between"><b>{ar ? s.suspect_ar : s.suspect}</b>
                  <span className={`det-chip ${s.truth === 'FALSE' ? '!text-[#ff8a8d]' : s.truth === 'TRUE' ? '!text-[#4ade80]' : ''}`}>{({ TRUE: ar ? 'صادق' : 'True', FALSE: ar ? 'غير صحيح' : 'False', INCOMPLETE: ar ? 'ناقص' : 'Incomplete', UNREVIEWED: '—' } as Record<string, string>)[s.truth]}</span></div>
                <p className="italic">“{ar ? s.statement_ar : s.statement}”</p>
                {s.explanation && <p className="text-[#9fb0c4]">{s.explanation}</p>}
                {s.contradicted_by?.length > 0 && <p className="text-xs text-[#ff8a8d]">{ar ? 'يناقضه: ' : 'Contradicted by: '}{s.contradicted_by.map((id) => evTitle.get(id) ?? '?').join('، ')}</p>}
              </article>))}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-bold">{ar ? 'مراجعة الأسئلة' : 'Question review'}</h2>
          {r.questions.map((q, i) => (
            <article key={i} className="det-panel space-y-1 !p-3 text-sm">
              <p className="font-semibold">{q.is_correct ? '✅' : q.is_correct === false ? '❌' : '▫️'} {ar ? q.prompt_ar : q.prompt}</p>
              <p><span className="text-[#9fb0c4]">{ar ? 'إجابتك: ' : 'Your answer: '}</span>{answerText(q, q.your_answer)}</p>
              {!q.is_correct && <p><span className="text-[#9fb0c4]">{ar ? 'الصحيح: ' : 'Correct: '}</span>{answerText(q, q.answer_key)}</p>}
              {(ar ? q.explanation_ar : q.explanation) && <p className="text-[#cdd8e5]">💡 {ar ? q.explanation_ar : q.explanation}</p>}
            </article>))}
        </section>

        {error && <p className="det-panel text-[#ff8a8d]" role="alert">{error}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" className="det-btn" disabled={busy} onClick={() => void playAgain()}>🔁 {ar ? 'العب القضية تاني' : 'Play again'}</button>
          <Link className="det-btn-ghost" to="/detective">🗂️ {ar ? 'قضية تانية' : 'Next case'}</Link>
          <Link className="det-btn-ghost" to="/detective/history">📜 {ar ? 'تحقيقاتي' : 'My investigations'}</Link>
        </div>
      </div>
    </main>
  )
}
