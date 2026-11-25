import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { discoverEvidence, loadDetectiveSession, submitDetectiveAnswer, type DetectivePayload } from '../detective/api'
import { useI18n } from '../lib/i18n'

export default function DetectiveSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { lang } = useI18n()
  const [payload, setPayload] = useState<DetectivePayload | null>(null)
  const [scene, setScene] = useState(0)
  const [found, setFound] = useState<Set<string>>(new Set())
  const [answer, setAnswer] = useState<Record<string, unknown>>({})
  const [result, setResult] = useState<{ is_correct: boolean; points_delta: number; score?: number; explanation?: string | null; explanation_ar?: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (sessionId) loadDetectiveSession(sessionId).then(setPayload).catch((e: Error) => setError(e.message)) }, [sessionId])
  const current = payload?.scenes[scene]
  const questions = useMemo(() => payload?.questions.filter((q) => !q.stage_id || q.stage_id === payload.stages[Math.min(scene, payload.stages.length - 1)]?.id) ?? [], [payload, scene])
  const inspect = async (id: string) => {
    if (!sessionId || found.has(id)) return
    try { await discoverEvidence(sessionId, id); setFound((old) => new Set(old).add(id)) } catch (e) { setError((e as Error).message) }
  }
  const submit = async (questionId: string) => {
    if (!sessionId) return
    setBusy(true); setResult(null); setError('')
    try { setResult(await submitDetectiveAnswer(sessionId, questionId, answer)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  if (error && !payload) return <main className="p-6"><p className="card text-danger" role="alert">{error}</p></main>
  if (!payload || !current) return <main className="p-6" role="status">{lang === 'ar' ? 'جارٍ فتح ملف القضية…' : 'Opening case file…'}</main>
  return <main className="min-h-screen bg-ink-900 p-4 md:p-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.25em] text-gold-400">{payload.case.slug}</p><h1 className="font-display text-3xl">{lang === 'ar' ? payload.case.title_ar : payload.case.title}</h1></div><div className="card py-2"><span className="text-sm opacity-70">{lang === 'ar' ? 'النقاط' : 'Score'}</span> <strong className="text-gold-400">{result?.score ?? payload.progress?.score ?? 0}</strong></div></header>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="card space-y-4"><div className="flex flex-wrap gap-2">{payload.scenes.map((item, i) => <button key={item.id} className={i === scene ? 'btn-primary' : 'btn-ghost'} onClick={() => setScene(i)}>{i + 1}. {lang === 'ar' ? item.title_ar : item.title}</button>)}</div>
          <div className="relative overflow-hidden rounded-xl border border-parchment-200/20 bg-ink-900"><img className="block aspect-video w-full object-cover" src={current.image_path.startsWith('http') ? current.image_path : `/${current.image_path.replace(/^\//, '')}`} alt={lang === 'ar' ? current.title_ar : current.title} />{current.evidence.map((item) => <button key={item.id} aria-label={lang === 'ar' ? item.public_title_ar : item.public_title} title={lang === 'ar' ? item.public_title_ar : item.public_title} onClick={() => void inspect(item.id)} className={`absolute rounded-lg border-2 ${found.has(item.id) ? 'border-ok bg-ok/30' : 'border-gold-400 bg-gold-400/20 hover:bg-gold-400/40'}`} style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%` }} />)}</div>
          <p className="text-sm opacity-75">{lang === 'ar' ? current.introduction_ar : current.introduction}</p>
          <div className="grid gap-2 sm:grid-cols-2">{current.evidence.map((item) => <button key={item.id} className={`rounded-xl border p-3 text-start ${found.has(item.id) ? 'border-ok bg-ok/10' : 'border-parchment-200/15 hover:border-gold-400'}`} onClick={() => void inspect(item.id)}><strong>{lang === 'ar' ? item.public_title_ar : item.public_title}</strong><span className="mt-1 block text-xs opacity-70">{found.has(item.id) ? (lang === 'ar' ? 'تم اكتشافه' : 'Discovered') : (lang === 'ar' ? 'اضغط للفحص' : 'Tap to inspect')}</span></button>)}</div>
        </section>
        <aside className="space-y-5"><section className="card"><h2 className="font-display text-2xl">{lang === 'ar' ? 'دفتر المحقق' : 'Investigator notebook'}</h2><p className="mt-2 text-sm opacity-75">{lang === 'ar' ? `${found.size} أدلة مكتشفة` : `${found.size} clues discovered`}</p><div className="mt-4 space-y-2">{payload.suspects.map((s) => <div key={s.id} className="rounded-xl border border-parchment-200/10 p-3"><strong>{lang === 'ar' ? s.name_ar : s.name}</strong><p className="text-sm opacity-70">{lang === 'ar' ? s.description_ar : s.description}</p>{s.statements.map((st) => <p key={st.id} className="mt-2 text-xs opacity-70">“{lang === 'ar' ? st.statement_ar : st.statement}”</p>)}</div>)}</div></section>
          {questions.map((q) => <section key={q.id} className="card space-y-3"><p className="text-xs uppercase tracking-widest text-gold-400">{q.question_type}</p><h2 className="font-semibold">{lang === 'ar' ? q.prompt_ar : q.prompt}</h2>{q.options.map((option) => <label key={option.id} className="flex gap-2 rounded-lg border border-parchment-200/15 p-2"><input type="radio" name={q.id} onChange={() => setAnswer({ option_id: option.id })} />{option.text}</label>)}{q.question_type === 'FINAL_CONCLUSION' && <input className="input" value={String(answer.text ?? '')} onChange={(e) => setAnswer({ text: e.target.value })} placeholder={lang === 'ar' ? 'اكتب استنتاجك' : 'Write your conclusion'} />}<button className="btn-primary w-full" disabled={busy} onClick={() => void submit(q.id)}>{lang === 'ar' ? 'إرسال الإجابة' : 'Submit answer'}</button>{result && <p className={result.is_correct ? 'text-ok' : 'text-danger'} role="status">{result.is_correct ? (lang === 'ar' ? 'إجابة صحيحة' : 'Correct') : (lang === 'ar' ? 'إجابة غير صحيحة' : 'Not quite')} · {result.points_delta} {lang === 'ar' ? 'نقطة' : 'points'}{(lang === 'ar' ? result.explanation_ar : result.explanation) && <span className="block text-sm opacity-80">{lang === 'ar' ? result.explanation_ar : result.explanation}</span>}</p>}</section>)}
        </aside>
      </div>
      {error && <p className="card text-danger" role="alert">{error}</p>}
    </div>
  </main>
}
