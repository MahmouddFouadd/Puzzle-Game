import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useAuth } from '../auth/AuthProvider'
import { detectiveError, listDetectiveCases, startDetectiveSession, type DetectiveCase } from '../detective/api'
import { DetectiveArt } from '../components/GameArt'
import { CATEGORY_LABEL, imageUrl, Stars } from './DetectiveCatalog'

/** Cinematic case preview – no evidence, answers or solution. */
export default function DetectiveCasePreview() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const nav = useNavigate()
  const { session, signInAnonymously } = useAuth()
  const [c, setC] = useState<DetectiveCase | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState(false)
  const [name, setName] = useState(() => { try { return localStorage.getItem('playerName') ?? '' } catch { return '' } })
  useEffect(() => { listDetectiveCases().then((all) => setC(all.find((x) => x.id === id) ?? null)).catch((e) => setError(detectiveError(e, ar))) }, [id, ar, session])

  const start = async () => {
    if (!c) return
    setBusy(true); setError('')
    try {
      if (!session) {
        if (!name.trim()) { setBusy(false); return }
        const err = await signInAnonymously(name.trim())
        if (err) throw new Error(err)
        try { localStorage.setItem('playerName', name.trim()) } catch { /* ignore */ }
      }
      nav(`/detective/session/${await startDetectiveSession(c.id)}`)
    } catch (e) { setError(detectiveError(e, ar)); setBusy(false) }
  }

  if (c === undefined) return <main className="det grid place-items-center"><p role="status">{error || (ar ? 'بنفتح الملف…' : 'Opening the file…')}</p></main>
  if (c === null) return <main className="det grid place-items-center p-6"><div className="det-panel space-y-3 text-center"><p>{ar ? 'القضية دي مش متاحة.' : 'This case is not available.'}</p><Link className="det-btn" to="/detective">{ar ? 'رجوع للقضايا' : 'Back to cases'}</Link></div></main>

  return (
    <main className="det">
      <div className="det-shell space-y-5">
        <Link to="/detective" className="det-btn-ghost min-h-0 py-2 text-sm">{ar ? '→ القضايا' : '← Cases'}</Link>
        <section className="relative overflow-hidden rounded-2xl border border-[#2a3a52]">
          <div className="aspect-video bg-[#0d1626]">
            {c.cover_image_path ? <img src={imageUrl(c.cover_image_path)} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><DetectiveArt className="h-36 w-36" /></div>}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/40 to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 space-y-1 p-4">
            <span className="font-mono text-xs tracking-[.3em] text-[#f5c46b]" dir="ltr">CASE FILE · {c.slug.slice(0, 18).toUpperCase()}</span>
            <h1 className="det-title">{ar ? c.title_ar : c.title}</h1>
          </div>
        </section>

        <section className="det-file space-y-3">
          <div className="flex items-center justify-between"><span className="det-stamp">{ar ? 'سري' : 'Confidential'}</span><Stars n={c.difficulty} /></div>
          <p className="text-[15px] leading-relaxed">{(ar ? c.briefing_ar : c.briefing) || (ar ? c.description_ar : c.description)}</p>
          {(c.objective_ar || c.objective) && <p className="rounded-lg bg-black/5 p-2 text-sm"><b>{ar ? '🎯 مهمتك: ' : '🎯 Your objective: '}</b>{ar ? c.objective_ar : c.objective}</p>}
        </section>

        <section className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
          {[['🗂️', (CATEGORY_LABEL[c.category ?? 'MYSTERY'] ?? ['غموض', 'Mystery'])[ar ? 0 : 1]], ['⏱', `${c.estimated_minutes ?? 15} ${ar ? 'دقيقة' : 'min'}`],
            ['🧭', `${c.stages ?? 0} ${ar ? 'مراحل' : 'stages'}`], ['🖼️', `${c.scenes ?? 0} ${ar ? 'مشاهد' : 'scenes'}`],
            ['🔎', `${c.evidence ?? 0} ${ar ? 'دليل مخفي' : 'hidden clues'}`], ['❓', `${c.questions ?? 0} ${ar ? 'سؤال' : 'questions'}`],
            ['👤', ar ? 'فردي' : 'Solo'], ['🎂', c.age_min ? `${c.age_min}–${c.age_max ?? '+'}` : (ar ? 'لكل الأعمار' : 'All ages')]].map(([i, t]) => (
            <div key={i} className="det-panel !p-3"><div className="text-lg">{i}</div><div className="text-xs text-[#b9c7d8]">{t}</div></div>))}
        </section>

        <button type="button" className="det-btn-ghost w-full" onClick={() => setRules((v) => !v)} aria-expanded={rules}>📘 {ar ? 'طريقة التحقيق' : 'How to investigate'}</button>
        {rules && (
          <ol className="det-panel space-y-2 text-sm text-[#cdd8e5]">
            {(ar ? ['افحص كل مشهد: كبّر وحرّك الصورة، واضغط على أي حاجة شاكك فيها.', 'لو الضغطة قريبة من دليل هيقولك "دافي 🔥". الدليل اللي تلاقيه بيتحفظ في ملفك.',
              'جاوب على أسئلة كل مرحلة. المرحلة الجاية بتتفتح لما تخلّص اللي قبلها، ولكل سؤال محاولة واحدة.', 'اربط الأدلة ببعض في لوحة الأدلة. كل رابط صحيح عليه +10 في التقرير.',
              'التلميحات بتساعدك بس بتخصم نقط. وفي الآخر قدّم استنتاجك واعرف الحل الكامل.']
              : ['Inspect each scene: zoom, pan and tap anything suspicious.', 'Near misses say "warm 🔥". Clues you find are saved to your file.',
                'Answer each stage’s questions – the next stage unlocks when you finish. One attempt per question.', 'Link evidence on the board – each correct link is +10 in the report.',
                'Hints help but cost points. Finally submit your conclusion and see the full solution.']).map((t, i) => <li key={i} className="flex gap-2"><b className="text-[#f5c46b]">{i + 1}.</b>{t}</li>)}
          </ol>
        )}

        {!session && (
          <label className="det-panel block space-y-1"><span className="text-sm">{ar ? 'اسمك كمحقق' : 'Your detective name'}</span>
            <input className="w-full rounded-xl border border-[#2f4462] bg-[#0d1626] px-3 py-2.5 text-white" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" /></label>
        )}
        {error && <p className="det-panel text-[#ff8a8d]" role="alert">{error}</p>}
        <button type="button" className="det-btn w-full text-lg" disabled={busy || (!session && !name.trim())} onClick={() => void start()}>
          🔍 {busy ? '…' : c.resume_session ? (ar ? 'كمّل التحقيق' : 'Resume investigation') : c.completed ? (ar ? 'العب القضية تاني' : 'Play again') : (ar ? 'ابدأ التحقيق' : 'Start investigation')}</button>
        <p className="text-center text-xs text-[#7d8fa6]">{ar ? 'التحقيق الجماعي (غرف وفرق) جاي في التحديث الجاي.' : 'Team investigations (rooms) are coming in the next update.'}</p>
      </div>
    </main>
  )
}
