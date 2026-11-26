import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { boardLink, detectiveError, finishDetective, inspectScene, loadDetectiveSession, saveDetectiveNote, submitDetectiveAnswer, requestDetectiveHint,
  type DetectiveEvidence, type DetectivePayload, type DetectiveQuestion, type HintResult, type Relation } from '../detective/api'
import { SceneViewer } from '../detective/SceneViewer'
import { EvidenceCrop } from '../detective/EvidenceCrop'
import { seededShuffle } from '../lib/shuffle'
import { EvidenceBoard, RELATIONS } from '../detective/Board'
import { imageUrl } from './DetectiveCatalog'
import { PartyBoard, usePartyState } from './DetectiveParty'
import { VoiceBar } from '../voice/VoiceBar'

type Tab = 'questions' | 'evidence' | 'board' | 'suspects' | 'timeline' | 'notes'
const CLASS_LABEL: Record<string, [string, string]> = {
  OBSERVATION: ['ملاحظة', 'Observation'], FACT: ['حقيقة', 'Fact'], INFERENCE: ['استنتاج', 'Inference'], PROBABILITY: ['احتمال', 'Probability'], ASSUMPTION: ['افتراض', 'Assumption']
}

function useElapsed(start: string | undefined, end: string | null | undefined) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (end) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [end])
  if (!start) return '0:00'
  const s = Math.max(0, Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function QuestionCard({ q, found, ar, busy, onSubmit, shuffleSeed }: { shuffleSeed: string; q: DetectiveQuestion; found: DetectiveEvidence[]; ar: boolean; busy: boolean; onSubmit: (q: DetectiveQuestion, a: Record<string, unknown>) => void }) {
  const [opt, setOpt] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [rel, setRel] = useState<{ from: string; to: string; relation: Relation | '' }>({ from: '', to: '', relation: '' })
  const [confirm, setConfirm] = useState(false)
  const a = q.answered
  const isFinal = q.question_type === 'FINAL_CONCLUSION'
  const optLabel = (o: { text: string; text_ar?: string }) => (ar ? o.text_ar || o.text : o.text)
  const answer: Record<string, unknown> | null = q.question_type === 'EVIDENCE_RELATIONSHIP' ? (rel.from && rel.to && rel.relation && rel.from !== rel.to ? rel : null)
    : q.question_type === 'TRUE_FALSE' ? (opt ? { value: opt } : null)
    : q.options.length > 0 ? (opt ? { option_id: opt } : null) : (text.trim() ? { text: text.trim() } : null)
  return (
    <article className={`space-y-3 rounded-xl border p-4 ${isFinal ? 'border-[#f5a623]/60 bg-[#2a1f0c]/60' : 'border-[#2a3a52] bg-[#0f1a2b]'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-relaxed">{isFinal && <span className="det-stamp me-2">{ar ? 'الاستنتاج' : 'Conclusion'}</span>}{ar ? q.prompt_ar : q.prompt}</p>
        <span className="det-chip shrink-0" dir="ltr">+{q.points}</span>
      </div>
      {a ? (
        <div className={`rounded-lg p-3 text-sm ${isFinal ? 'bg-[#f5a623]/10' : a.is_correct ? 'bg-[#22c55e]/15' : 'bg-[#e5484d]/15'}`} role="status">
          {isFinal ? (ar ? '📨 تم تسليم استنتاجك. اعرف النتيجة في التقرير النهائي.' : '📨 Conclusion submitted. See the verdict in the final report.')
            : <><b>{a.is_correct ? (ar ? '✅ إجابة صحيحة' : '✅ Correct') : (ar ? '❌ إجابة غير صحيحة' : '❌ Incorrect')}</b> <span dir="ltr">({a.points_delta > 0 ? '+' : ''}{a.points_delta})</span>
              {!a.is_correct && a.correct_option && <div>{ar ? 'الإجابة الصحيحة: ' : 'Correct answer: '}<b>{optLabel(q.options.find((o) => o.id === a.correct_option) ?? { text: a.correct_option })}</b></div>}
              {(ar ? a.explanation_ar : a.explanation) && <div className="mt-1 text-[#cdd8e5]">💡 {ar ? a.explanation_ar : a.explanation}</div>}</>}
        </div>
      ) : (
        <>
          {q.question_type === 'TRUE_FALSE' && <div className="grid grid-cols-2 gap-2">{[['true', ar ? 'صح' : 'True'], ['false', ar ? 'خطأ' : 'False']].map(([v, l]) => (
            <button key={v} type="button" className="det-btn-ghost" aria-pressed={opt === v} style={opt === v ? { borderColor: '#2dd4bf', background: 'rgba(45,212,191,.15)' } : undefined} onClick={() => setOpt(v)}>{l}</button>))}</div>}
          {q.question_type !== 'TRUE_FALSE' && q.question_type !== 'EVIDENCE_RELATIONSHIP' && q.options.length > 0 && (
            <div role="radiogroup" className="grid gap-2">{seededShuffle(q.options, `${shuffleSeed}:${q.id}`).map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={opt === o.id} onClick={() => setOpt(o.id)}
                className={`rounded-lg border px-3 py-2.5 text-start text-sm transition ${opt === o.id ? 'border-[#2dd4bf] bg-[#2dd4bf]/15' : 'border-[#2f4462] bg-[#14233a] hover:bg-[#1b2e4b]'}`}>{optLabel(o)}</button>))}</div>)}
          {q.question_type !== 'TRUE_FALSE' && q.question_type !== 'EVIDENCE_RELATIONSHIP' && q.options.length === 0 && (
            <input className="w-full rounded-lg border border-[#2f4462] bg-[#0d1626] px-3 py-2.5" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder={ar ? 'اكتب إجابتك…' : 'Type your answer…'} aria-label={ar ? 'إجابتك' : 'Your answer'} />)}
          {q.question_type === 'EVIDENCE_RELATIONSHIP' && (found.length < 2 ? <p className="text-sm text-[#9fb0c4]">{ar ? 'محتاج تكتشف أدلة أكتر عشان تجاوب.' : 'Discover more evidence to answer.'}</p> : (
            <div className="grid gap-2 sm:grid-cols-3">
              {(['from', 'to'] as const).map((k) => (
                <select key={k} className="rounded-lg border border-[#2f4462] bg-[#0d1626] px-2 py-2.5 text-sm" value={rel[k]} onChange={(e) => setRel({ ...rel, [k]: e.target.value })} aria-label={k === 'from' ? (ar ? 'الدليل الأول' : 'First clue') : (ar ? 'الدليل التاني' : 'Second clue')}>
                  <option value="">{k === 'from' ? (ar ? 'الدليل الأول' : 'First clue') : (ar ? 'الدليل التاني' : 'Second clue')}</option>
                  {found.map((e) => <option key={e.id} value={e.id}>{ar ? e.public_title_ar : e.public_title}</option>)}
                </select>))}
              <select className="rounded-lg border border-[#2f4462] bg-[#0d1626] px-2 py-2.5 text-sm" value={rel.relation} onChange={(e) => setRel({ ...rel, relation: e.target.value as Relation })} aria-label={ar ? 'العلاقة' : 'Relationship'}>
                <option value="">{ar ? 'العلاقة' : 'Relationship'}</option>
                {(Object.keys(RELATIONS) as Relation[]).filter((r) => r !== 'UNCERTAIN').map((r) => <option key={r} value={r}>{ar ? RELATIONS[r].ar : RELATIONS[r].en}</option>)}
              </select>
            </div>))}
          {confirm ? (
            <div className="flex items-center gap-2 rounded-lg bg-[#f5a623]/10 p-2 text-sm">
              <span className="flex-1">{ar ? 'متأكد؟ عندك محاولة واحدة بس.' : 'Sure? You only get one attempt.'}</span>
              <button type="button" className="det-btn min-h-0 py-1.5" disabled={busy || !answer} onClick={() => { if (answer) onSubmit(q, answer); setConfirm(false) }}>{ar ? 'أكّد' : 'Confirm'}</button>
              <button type="button" className="det-btn-ghost min-h-0 py-1.5" onClick={() => setConfirm(false)}>{ar ? 'لا' : 'No'}</button>
            </div>
          ) : <button type="button" className="det-btn w-full" disabled={busy || !answer} onClick={() => setConfirm(true)}>{isFinal ? (ar ? '📨 قدّم استنتاجك النهائي' : '📨 Submit final conclusion') : (ar ? 'جاوب' : 'Answer')}</button>}
        </>
      )}
    </article>
  )
}

export default function DetectiveSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const [p, setP] = useState<DetectivePayload | null>(null)
  const [loadError, setLoadError] = useState('')
  const [sceneIdx, setSceneIdx] = useState(0)
  const [tab, setTab] = useState<Tab>('questions')
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warm' | 'info' | 'bad' } | null>(null)
  const [reveal, setReveal] = useState<(DetectiveEvidence & { points?: number }) | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [hint, setHint] = useState<HintResult | null>(null)
  const [hintAsk, setHintAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [intro, setIntro] = useState(false)
  const [note, setNote] = useState('')
  const [online, setOnline] = useState(true)
  const noteTimer = useRef<number>()
  const inspecting = useRef(false)

  const load = useCallback(async () => {
    if (!sessionId) return
    try { const d = await loadDetectiveSession(sessionId); setP(d); setOnline(true); return d } catch (e) { setLoadError(detectiveError(e, ar)); setOnline(false) }
  }, [sessionId, ar])
  useEffect(() => {
    void load().then((d) => {
      if (!d) return
      if (d.progress?.completed_at) { nav(`/detective/report/${sessionId}`, { replace: true }); return }
      setNote(d.note ?? '')
      try { if (!localStorage.getItem(`det-intro-${sessionId}`)) setIntro(true) } catch { setIntro(true) }
    })
  }, [load, nav, sessionId])
  useEffect(() => { const on = () => { void load() }; window.addEventListener('online', on); return () => window.removeEventListener('online', on) }, [load])
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 2200); return () => window.clearTimeout(id) }, [toast])
  const elapsed = useElapsed(p?.progress?.started_at, p?.progress?.completed_at)
  const { s: party } = usePartyState(p?.party?.id, 4000)
  // Team investigations: pull teammates' discoveries/answers; finish together.
  useEffect(() => {
    if (!p?.party || p.party.mode !== 'COOPERATIVE') return
    const id = window.setInterval(() => { void load().then((d) => { if (d?.progress?.completed_at) nav(`/detective/report/${sessionId}`) }) }, 4000)
    return () => window.clearInterval(id)
  }, [p?.party, load, nav, sessionId])

  const found = useMemo(() => (p?.scenes ?? []).flatMap((s) => s.evidence), [p])
  const sceneOf = useMemo(() => new Map((p?.scenes ?? []).flatMap((s) => s.evidence.map((e) => [e.id, s] as const))), [p])
  const scene = p?.scenes[sceneIdx]
  const stage = p?.stages.find((s) => s.current) ?? null
  const finalAnswered = !!p?.questions.find((q) => q.question_type === 'FINAL_CONCLUSION')?.answered
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load() } catch (e) { setToast({ text: detectiveError(e, ar), tone: 'bad' }) } setBusy(false) }

  const tap = async (x: number, y: number) => {
    if (!sessionId || !scene || inspecting.current) return
    inspecting.current = true
    try {
      const r = await inspectScene(sessionId, scene.id, x, y)
      if (r.found && !r.already && r.evidence) {
        setReveal({ ...r.evidence, points: r.points }); setFlash(r.evidence.id); window.setTimeout(() => setFlash(null), 1400)
        if (hint?.kind === 'area') setHint(null)
        await load()
      } else if (r.found && r.already) setToast({ text: ar ? 'الدليل ده في ملفك بالفعل 📁' : 'Already in your file 📁', tone: 'info' })
      else if (r.locked) setToast({ text: ar ? '🔒 فيه حاجة هنا… محتاجة دليل تاني الأول' : '🔒 Something is here… find another clue first', tone: 'info' })
      else if (r.warm) setToast({ text: ar ? 'دافي 🔥 قرّب شوية!' : 'Warm 🔥 you are close!', tone: 'warm' })
      else setToast({ text: ar ? 'مفيش حاجة مهمة هنا' : 'Nothing important here', tone: 'info' })
      setOnline(true)
    } catch (e) { setToast({ text: detectiveError(e, ar), tone: 'bad' }) } finally { inspecting.current = false }
  }
  const askHint = () => run(async () => {
    if (!sessionId) return
    const h = await requestDetectiveHint(sessionId)
    setHint(h)
    if (h.kind === 'area' && h.scene_id) { const i = p?.scenes.findIndex((s) => s.id === h.scene_id) ?? -1; if (i >= 0) setSceneIdx(i) }
  })
  const submit = (q: DetectiveQuestion, a: Record<string, unknown>) => run(async () => { if (sessionId) await submitDetectiveAnswer(sessionId, q.id, a) })
  const finish = () => run(async () => { if (!sessionId) return; await finishDetective(sessionId); nav(`/detective/report/${sessionId}`) })
  const changeNote = (v: string) => {
    setNote(v); window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => { if (sessionId) saveDetectiveNote(sessionId, v).catch(() => setToast({ text: ar ? 'مقدرناش نحفظ الملاحظة' : 'Could not save your note', tone: 'bad' })) }, 800)
  }

  if (!p) return <main className="det grid place-items-center p-6"><div className="det-panel space-y-3 text-center">
    {loadError ? <><p role="alert">{loadError}</p><button className="det-btn" type="button" onClick={() => void load()}>{ar ? 'حاول تاني' : 'Retry'}</button> <Link className="det-btn-ghost" to="/detective">{ar ? 'القضايا' : 'Cases'}</Link></>
      : <p role="status">{ar ? 'بنفتح ملف القضية…' : 'Opening the case file…'}</p>}</div></main>

  const revealScene = reveal ? (p.scenes.find((s) => s.id === (reveal as { scene_id?: string }).scene_id) ?? sceneOf.get(reveal.id) ?? null) : null
  const sceneDone = !!revealScene && revealScene.evidence.length >= revealScene.evidence_total
  const nextScene = revealScene ? p.scenes.findIndex((s) => s.id !== revealScene.id && s.evidence.length < s.evidence_total) : -1
  const stageQs = p.questions.filter((q) => !q.locked)
  const tabs: [Tab, string][] = [['questions', ar ? '❓ الأسئلة' : '❓ Questions'], ['evidence', `${ar ? '📁 الأدلة' : '📁 Evidence'} ${p.stats.found}`], ['board', ar ? '🧷 اللوحة' : '🧷 Board'],
    ['suspects', ar ? '👥 الأشخاص' : '👥 People'], ['timeline', ar ? '🕒 الأحداث' : '🕒 Timeline'], ['notes', ar ? '📝 ملاحظات' : '📝 Notes']]

  return (
    <main className="det">
      <div className="det-shell space-y-4 !pb-10">
        <header className="det-panel space-y-3 !p-3">
          <div className="flex items-center gap-2">
            <Link to="/detective" className="det-btn-ghost min-h-0 px-3 py-1.5 text-sm" aria-label={ar ? 'خروج (التقدم محفوظ)' : 'Exit (progress is saved)'}>✕</Link>
            <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{ar ? p.case.title_ar : p.case.title}</h1>
            <span className="det-chip" dir="ltr">⏱ {elapsed}</span>
            <span className="det-chip text-[#f5c46b]" dir="ltr">★ {p.progress?.score ?? 0}</span>
          </div>
          <ol className="flex items-center gap-1.5" aria-label={ar ? 'مراحل التحقيق' : 'Investigation stages'}>
            {p.stages.map((s) => {
              const done = s.unlocked && !s.current && p.questions.filter((q) => q.stage_id === s.id).every((q) => q.answered)
              return <li key={s.id} className={`flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-bold ${s.current ? 'bg-[#f5a623] text-[#1a1203]' : done ? 'bg-[#2dd4bf]/20 text-[#5eead4]' : 'bg-[#14233a] text-[#6b7f98]'}`}>
                {done ? '✓ ' : !s.unlocked ? '🔒 ' : ''}{ar ? s.title_ar : s.title}</li>
            })}
          </ol>
          <div className="flex items-center justify-between gap-2 text-xs text-[#9fb0c4]">
            <span>🔎 {ar ? `الأدلة: ${p.stats.found} من ${p.stats.total}` : `Evidence: ${p.stats.found} of ${p.stats.total}`}</span>
            {!online && <span className="text-[#ff8a8d]" role="status">{ar ? 'انقطع الاتصال… بنحاول نرجعك' : 'Offline… reconnecting'}</span>}
            <button type="button" className="det-btn-ghost min-h-0 px-3 py-1.5 text-xs" onClick={() => setHintAsk(true)} disabled={busy}>💡 {ar ? 'تلميح' : 'Hint'} ({p.hints_used.length})</button>
          </div>
        </header>

        {party && <PartyBoard s={party} compact />}
        {party && party.party.status !== 'CLOSED' && <VoiceBar kind="detective" roomId={party.party.id} selfId={party.me} names={Object.fromEntries(party.members.map((m) => [m.user_id, m.nickname]))} />}
        {hintAsk && (
          <div className="det-panel flex items-center gap-2 text-sm" role="dialog">
            <span className="flex-1">{ar ? 'التلميح بيخصم من نقطك (2–3 نقط). تحب تاخد تلميح؟' : 'A hint costs 2–3 points. Take one?'}</span>
            <button type="button" className="det-btn min-h-0 py-1.5" onClick={() => { setHintAsk(false); void askHint() }}>{ar ? 'أيوه' : 'Yes'}</button>
            <button type="button" className="det-btn-ghost min-h-0 py-1.5" onClick={() => setHintAsk(false)}>{ar ? 'لا' : 'No'}</button>
          </div>
        )}
        {hint && <div className="det-file text-sm" role="status"><b>💡 {ar ? 'تلميح:' : 'Hint:'}</b> {hint.kind === 'text' ? (ar ? hint.text_ar : hint.text) : (ar ? 'دوّر في المنطقة اللي عليها دايرة صفرا في الصورة.' : 'Search the area circled in yellow.')}
          <button type="button" className="ms-2 underline" onClick={() => setHint(null)}>{ar ? 'إخفاء' : 'Hide'}</button></div>}

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label={ar ? 'المشاهد' : 'Scenes'}>
          {p.scenes.map((s, i) => (
            <button key={s.id} type="button" onClick={() => setSceneIdx(i)} aria-pressed={i === sceneIdx}
              className={`relative w-28 shrink-0 overflow-hidden rounded-xl border-2 text-start transition ${i === sceneIdx ? 'border-[#f5a623]' : 'border-transparent opacity-70'}`}>
              <img src={imageUrl(s.image_path)} alt="" loading="lazy" className="aspect-video w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
              <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold">{ar ? s.title_ar : s.title} · {s.evidence.length}/{s.evidence_total}</span>
            </button>))}
        </nav>

        {scene && (
          <section className="space-y-2">
            {(ar ? scene.introduction_ar : scene.introduction) && <p className="text-sm text-[#b9c7d8]">{ar ? scene.introduction_ar : scene.introduction}</p>}
            <SceneViewer src={imageUrl(scene.image_path)} alt={ar ? scene.title_ar : scene.title}
              boxes={scene.evidence.map((e) => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height, label: ar ? e.public_title_ar : e.public_title, tone: flash === e.id ? 'flash' : 'found' }))}
              hint={hint?.kind === 'area' && hint.scene_id === scene.id ? { cx: hint.cx!, cy: hint.cy!, r: hint.r! } : null}
              onTap={(x, y) => void tap(x, y)} onBoxClick={(id) => { const e = found.find((f) => f.id === id); if (e) setReveal(e) }}
              overlay={<div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2 text-[11px] font-bold">
                <span className="rounded-full bg-black/65 px-2.5 py-1 backdrop-blur">{ar ? `المشهد ${sceneIdx + 1} / ${p.scenes.length}` : `Scene ${sceneIdx + 1} / ${p.scenes.length}`}</span>
                <span className={`rounded-full px-2.5 py-1 backdrop-blur ${scene.evidence.length >= scene.evidence_total ? 'bg-[#0f766e]/85' : 'bg-black/65'}`}>🔎 {scene.evidence.length} / {scene.evidence_total}{scene.evidence.length >= scene.evidence_total ? ' ✓' : ''}</span>
              </div>} />
            <p className="text-center text-xs text-[#7d8fa6]">{ar ? '🔍 كبّر الصورة واضغط على أي حاجة شاكك فيها' : '🔍 Zoom in and tap anything suspicious'}</p>
          </section>
        )}

        <section className="det-panel space-y-3 !p-3">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#0d1626] p-1" role="tablist">
            {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="det-tab" onClick={() => setTab(k)}>{l}</button>)}
          </div>

          {tab === 'questions' && (
            <div className="space-y-3" role="tabpanel">
              {stage && <p className="text-sm text-[#9fb0c4]">{ar ? `المرحلة الحالية: ${stage.title_ar}` : `Current stage: ${stage.title}`}</p>}
              {stageQs.map((q) => <QuestionCard key={q.id} shuffleSeed={p.session.id} q={q} found={found} ar={ar} busy={busy} onSubmit={(qq, a) => void submit(qq, a)} />)}
              {p.questions.some((q) => q.locked) && <p className="rounded-lg bg-[#14233a] p-3 text-center text-sm text-[#9fb0c4]">🔒 {ar ? `${p.questions.filter((q) => q.locked).length} أسئلة هتتفتح لما تخلّص المرحلة الحالية` : `${p.questions.filter((q) => q.locked).length} questions unlock after this stage`}</p>}
              {finalAnswered && <button type="button" className="det-btn w-full text-lg" disabled={busy} onClick={() => void finish()}>🗂️ {ar ? 'اقفل القضية واعرف الحل' : 'Close the case & reveal the solution'}</button>}
            </div>
          )}
          {tab === 'evidence' && (
            <div className="space-y-2" role="tabpanel">
              {found.length === 0 && <p className="text-center text-sm text-[#9fb0c4]">{ar ? 'لسه ما لقيتش أدلة. افحص الصور!' : 'No evidence yet. Inspect the scenes!'}</p>}
              {found.map((e) => (
                <button key={e.id} type="button" className="det-file flex w-full items-start gap-3 text-start" onClick={() => setReveal(e)}>
                  {sceneOf.get(e.id) && <EvidenceCrop src={imageUrl(sceneOf.get(e.id)!.image_path)} box={e} maxW={84} maxH={64} round="rounded-lg" className="mt-0.5 ring-2 ring-[#c9a45c]/60" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><b>{ar ? e.public_title_ar : e.public_title}</b><span className="shrink-0 rounded bg-black/10 px-1.5 text-[11px]">{(CLASS_LABEL[e.classification] ?? [e.classification, e.classification])[ar ? 0 : 1]}</span></div>
                    <p className="line-clamp-2 text-sm">{ar ? e.public_description_ar : e.public_description}</p>
                    <span className="text-[11px] opacity-70">📍 {ar ? sceneOf.get(e.id)?.title_ar : sceneOf.get(e.id)?.title}</span>
                  </div>
                </button>))}
              {p.scenes.map((s) => s.evidence_total > s.evidence.length && <p key={s.id} className="text-xs text-[#7d8fa6]">❔ {ar ? `${s.evidence_total - s.evidence.length} أدلة لسه مخفية في "${s.title_ar}"` : `${s.evidence_total - s.evidence.length} hidden clues left in "${s.title}"`}</p>)}
            </div>
          )}
          {tab === 'board' && <div role="tabpanel"><EvidenceBoard evidence={found} links={p.board} busy={busy}
            onLink={(a, b, r) => void run(() => boardLink(sessionId!, a, b, r))} onUnlink={(a, b) => void run(() => boardLink(sessionId!, a, b, 'UNCERTAIN', true))} /></div>}
          {tab === 'suspects' && (
            <div className="space-y-3" role="tabpanel">
              {p.suspects.length === 0 && <p className="text-sm text-[#9fb0c4]">{ar ? 'مفيش أشخاص في القضية دي.' : 'No people in this case.'}</p>}
              {p.suspects.map((s) => (
                <article key={s.id} className="rounded-xl border border-[#2a3a52] bg-[#0f1a2b] p-3 space-y-2">
                  <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#14233a] text-xl" aria-hidden="true">🧑</span>
                    <div><b>{ar ? s.name_ar : s.name}</b><div className="text-xs text-[#9fb0c4]">{ar ? s.description_ar : s.description}</div></div></div>
                  {s.alibi && <p className="text-sm"><span className="text-[#9fb0c4]">{ar ? 'أقواله عن مكانه: ' : 'Alibi: '}</span>{s.alibi}</p>}
                  {s.statements.map((st) => <blockquote key={st.id} className="border-s-4 border-[#f5a623] ps-3 text-sm italic">“{ar ? st.statement_ar : st.statement}”</blockquote>)}
                </article>))}
            </div>
          )}
          {tab === 'timeline' && (
            <ol className="relative space-y-3 border-s-2 border-[#2f4462] ps-4" role="tabpanel">
              {p.timeline.map((t) => <li key={t.id} className="relative"><span className="absolute -start-[1.45rem] top-1.5 h-3 w-3 rounded-full bg-[#2dd4bf]" aria-hidden="true" />
                <span className="font-mono text-xs text-[#f5c46b]" dir="ltr">{t.window_key}</span><div className="text-sm">{ar ? t.label_ar : t.label}</div></li>)}
              {p.timeline.length === 0 && <li className="text-sm text-[#9fb0c4]">{ar ? 'مفيش خط زمني للقضية دي.' : 'No timeline for this case.'}</li>}
            </ol>
          )}
          {tab === 'notes' && (
            <div role="tabpanel" className="space-y-1">
              <textarea className="h-40 w-full rounded-xl border border-[#2f4462] bg-[#f3e6c4] p-3 text-[#2b2416]" maxLength={5000} value={note} onChange={(e) => changeNote(e.target.value)}
                placeholder={ar ? 'اكتب نظريتك وملاحظاتك هنا… بتتحفظ تلقائي' : 'Write your theory and notes… saved automatically'} aria-label={ar ? 'ملاحظاتي' : 'My notes'} />
            </div>
          )}
        </section>
      </div>

      {toast && <div className={`fixed inset-x-0 bottom-6 z-40 mx-auto w-fit rounded-full px-4 py-2 text-sm font-semibold shadow-xl ${toast.tone === 'warm' ? 'bg-[#f5a623] text-[#1a1203]' : toast.tone === 'bad' ? 'bg-[#e5484d]' : 'bg-[#14233a]'}`} role="status">{toast.text}</div>}

      {reveal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => setReveal(null)}>
          <div className="det-file bk-pop w-full max-w-sm space-y-2" onClick={(e) => e.stopPropagation()}>
            {typeof reveal.points === 'number' && <div className="flex items-center justify-between"><span className="det-stamp">{ar ? 'تم اكتشاف دليل جديد!' : 'New evidence found!'}</span><b className="det-points text-[#0f766e]" dir="ltr">+{reveal.points}</b></div>}
            {revealScene && <div className="flex justify-center"><div className="det-lens"><EvidenceCrop src={imageUrl(revealScene.image_path)} box={reveal} maxW={300} maxH={170} /></div></div>}
            <h2 className="font-display text-2xl font-bold">🔎 {ar ? reveal.public_title_ar : reveal.public_title}</h2>
            <p>{ar ? reveal.public_description_ar : reveal.public_description}</p>
            <p className="text-xs">{ar ? 'التصنيف: ' : 'Type: '}<b>{(CLASS_LABEL[reveal.classification] ?? [reveal.classification, reveal.classification])[ar ? 0 : 1]}</b> · {ar ? 'الأهمية' : 'Importance'} {'●'.repeat(reveal.importance)}</p>
            <p className="text-xs opacity-75">{typeof reveal.points === 'number' ? (ar ? '✓ تمت إضافة الدليل إلى دفتر التحقيق. معناه الكامل هيظهر في التقرير النهائي.' : '✓ Added to your evidence notebook. Its full meaning is explained in the final report.') : (ar ? '📁 من دفتر التحقيق' : '📁 From your evidence notebook')}</p>
            {sceneDone && typeof reveal.points === 'number' && (
              <p className="rounded-xl bg-[#0f766e]/15 p-2 text-center text-sm font-bold text-[#0f766e]" role="status">🎉 {ar ? `لقيت كل أدلة "${revealScene?.title_ar}"!` : `You found every clue in "${revealScene?.title}"!`}</p>
            )}
            {sceneDone && typeof reveal.points === 'number' && nextScene >= 0
              ? <button type="button" className="det-btn w-full" autoFocus onClick={() => { setReveal(null); setSceneIdx(nextScene) }}>{ar ? 'المشهد التالي ←' : 'Next scene →'}</button>
              : <button type="button" className="det-btn w-full" onClick={() => setReveal(null)} autoFocus>{typeof reveal.points === 'number' ? (ar ? 'كمّل البحث 🔍' : 'Keep searching 🔍') : (ar ? 'تمام' : 'OK')}</button>}
          </div>
        </div>
      )}

      {intro && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#05080f]/95 p-4" role="dialog" aria-modal="true">
          <div className="bk-pop w-full max-w-md space-y-4 text-center">
            <p className="text-sm tracking-[.3em] text-[#2dd4bf]">{ar ? 'المحققون، أمامكم قضية جديدة' : 'Detectives, a new case awaits'}</p>
            <h2 className="det-title">{ar ? p.case.title_ar : p.case.title}</h2>
            <div className="det-file space-y-2 text-start text-sm">
              <p>{(ar ? p.case.briefing_ar : p.case.briefing) || (ar ? p.case.description_ar : p.case.description)}</p>
              {(ar ? p.case.objective_ar : p.case.objective) && <p><b>🎯 </b>{ar ? p.case.objective_ar : p.case.objective}</p>}
            </div>
            <ul className="grid grid-cols-3 gap-2 text-xs text-[#b9c7d8]">
              <li className="det-panel !p-2">🖼️ {p.scenes.length} {ar ? 'مشاهد' : 'scenes'}</li><li className="det-panel !p-2">🔎 {p.stats.total} {ar ? 'أدلة' : 'clues'}</li><li className="det-panel !p-2">🧭 {p.stages.length} {ar ? 'مراحل' : 'stages'}</li>
            </ul>
            <p className="text-sm text-[#9fb0c4]">{ar ? 'كل صورة، وكل تفصيلة، وكل معلومة قد تساعدك في الوصول للحقيقة.' : 'Every image, every detail, every fact could lead you to the truth.'}</p>
            <button type="button" className="det-btn w-full text-lg" autoFocus onClick={() => { setIntro(false); try { localStorage.setItem(`det-intro-${sessionId}`, '1') } catch { /* ignore */ } }}>🔍 {ar ? 'ابدأ التحقيق' : 'Start investigating'}</button>
          </div>
        </div>
      )}
    </main>
  )
}
