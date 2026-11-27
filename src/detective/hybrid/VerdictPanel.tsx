import { useEffect, useState } from 'react'
import type { DetectiveEvidence, DetectivePayload, Investigation, VerdictInput, VerdictOption } from '../api'

type Draft = { suspect: string; motive: string; method: string; evidence: string[]; timeline: string[]; explanation: string }
const empty: Draft = { suspect: '', motive: '', method: '', evidence: [], timeline: [], explanation: '' }

/**
 * Final accusation. Every team member can prepare it (draft kept on this device); only the captain submits.
 * After submission it is read-only and shows what was sent — never whether it was right (that comes with the resolution).
 */
export function VerdictPanel({ sessionId, verdict, captain, suspects, timeline, found, ar, busy, onSubmit }: {
  sessionId: string; verdict: NonNullable<Investigation['verdict']>; captain: boolean; suspects: DetectivePayload['suspects']; timeline: DetectivePayload['timeline']
  found: DetectiveEvidence[]; ar: boolean; busy: boolean; onSubmit: (v: VerdictInput) => void
}) {
  const key = `det-verdict-${sessionId}`
  const [d, setD] = useState<Draft>(() => { try { return { ...empty, ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return empty } })
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(d)) } catch { /* private mode */ } }, [key, d])
  const sub = verdict.submitted
  const evName = (id: string) => { const e = found.find((f) => f.id === id); return e ? (ar ? e.public_title_ar : e.public_title) : '—' }
  const tl = (k: string) => { const t = timeline.find((x) => x.event_key === k); return t ? (ar ? t.label_ar : t.label) : k }
  const opt = (list: VerdictOption[], id: string) => { const o = list.find((x) => x.id === id); return o ? (ar ? o.text_ar : o.text) : '—' }

  if (sub) return (
    <div className="space-y-3">
      <div className="det-file space-y-2 text-sm">
        <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.2em] opacity-60">{ar ? 'ملف الاتهام' : 'Accusation file'}</p><span className="det-stamp">{ar ? 'اتقدّم' : 'Submitted'}</span></div>
        <p><b>{ar ? 'المتهم: ' : 'Accused: '}</b>{(() => { const s = suspects.find((x) => x.id === sub.suspect_id); return s ? (ar ? s.name_ar : s.name) : '—' })()}</p>
        <p><b>{ar ? 'الدافع: ' : 'Motive: '}</b>{opt(verdict.motive_options, sub.motive)}</p>
        <p><b>{ar ? 'الطريقة: ' : 'Method: '}</b>{opt(verdict.method_options, sub.method)}</p>
        <p><b>{ar ? 'الأدلة: ' : 'Evidence: '}</b>{sub.evidence.map(evName).join('، ')}</p>
        {sub.timeline.length > 0 && <p><b>{ar ? 'التسلسل: ' : 'Sequence: '}</b>{sub.timeline.map(tl).join(ar ? ' ← ' : ' → ')}</p>}
        {sub.explanation && <p className="italic">“{sub.explanation}”</p>}
      </div>
      <p className="text-center text-sm text-[#9fb0c4]">{ar ? 'النتيجة والحل الحقيقي هيظهروا بعد ما القضية تتقفل.' : 'The result and the real solution appear once the case is closed.'}</p>
    </div>
  )

  const toggleEv = (id: string) => setD((v) => ({ ...v, evidence: v.evidence.includes(id) ? v.evidence.filter((x) => x !== id) : v.evidence.length >= verdict.evidence_max ? v.evidence : [...v.evidence, id] }))
  const toggleTl = (k: string) => setD((v) => ({ ...v, timeline: v.timeline.includes(k) ? v.timeline.filter((x) => x !== k) : v.timeline.length >= 12 ? v.timeline : [...v.timeline, k] }))
  const ready = !!d.suspect && !!d.motive && !!d.method && d.evidence.length > 0
  const step = (n: number, label: string, ok: boolean) => <h4 className="flex items-center gap-2 font-bold"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${ok ? 'bg-[#2dd4bf] text-[#0b1220]' : 'bg-[#14233a] text-[#9fb0c4]'}`}>{ok ? '✓' : n}</span>{label}</h4>

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#9fb0c4]">{captain ? (ar ? 'جهّز الاتهام وقدّمه. عندك محاولة واحدة بس.' : 'Prepare and submit the accusation. You get one attempt.') : (ar ? 'تقدر تجهّز الاتهام وتناقشه مع فريقك، لكن قائد الفريق بس هو اللي يقدّمه.' : 'You can prepare and discuss it, but only the team captain submits.')}</p>
      <section className="space-y-2">{step(1, ar ? 'مين القاتل؟' : 'Who did it?', !!d.suspect)}
        <div className="grid gap-2 sm:grid-cols-3">{suspects.map((s) => <button key={s.id} type="button" aria-pressed={d.suspect === s.id} className="det-chip justify-center !py-2.5 text-sm" onClick={() => setD({ ...d, suspect: s.id })}>{ar ? s.name_ar : s.name}</button>)}</div></section>
      <section className="space-y-2">{step(2, ar ? 'الدافع' : 'Motive', !!d.motive)}
        <div className="grid gap-1.5">{verdict.motive_options.map((o) => <button key={o.id} type="button" aria-pressed={d.motive === o.id} className="det-chip !justify-start !py-2 text-start text-sm" onClick={() => setD({ ...d, motive: o.id })}>{ar ? o.text_ar : o.text}</button>)}</div></section>
      <section className="space-y-2">{step(3, ar ? 'الطريقة' : 'Method', !!d.method)}
        <div className="grid gap-1.5">{verdict.method_options.map((o) => <button key={o.id} type="button" aria-pressed={d.method === o.id} className="det-chip !justify-start !py-2 text-start text-sm" onClick={() => setD({ ...d, method: o.id })}>{ar ? o.text_ar : o.text}</button>)}</div></section>
      <section className="space-y-2">{step(4, ar ? `أقوى الأدلة (حتى ${verdict.evidence_max})` : `Strongest evidence (up to ${verdict.evidence_max})`, d.evidence.length > 0)}
        {found.length === 0 ? <p className="text-sm text-[#9fb0c4]">{ar ? 'لسه ما لقيتش أدلة.' : 'No evidence found yet.'}</p> :
          <div className="flex flex-wrap gap-1.5">{found.map((e) => <button key={e.id} type="button" aria-pressed={d.evidence.includes(e.id)} className="det-chip" onClick={() => toggleEv(e.id)}>{ar ? e.public_title_ar : e.public_title}</button>)}</div>}</section>
      {verdict.timeline_events > 0 && (
        <section className="space-y-2">{step(5, ar ? `تسلسل الجريمة (اختار ${verdict.timeline_events} أحداث بالترتيب)` : `Sequence of the crime (pick ${verdict.timeline_events} events in order)`, d.timeline.length === verdict.timeline_events)}
          <div className="flex flex-wrap gap-1.5">{timeline.map((t) => { const i = d.timeline.indexOf(t.event_key); return (
            <button key={t.event_key} type="button" aria-pressed={i >= 0} className="det-chip text-start" onClick={() => toggleTl(t.event_key)}>
              {i >= 0 && <b className="grid h-5 w-5 place-items-center rounded-full bg-[#2dd4bf] text-[11px] text-[#0b1220]">{i + 1}</b>}{ar ? t.label_ar : t.label}</button>) })}</div>
          {timeline.length < verdict.timeline_events && <p className="text-xs text-[#7d8fa6]">{ar ? 'فيه أحداث لسه مخفية. لاقي أدلة أكتر عشان تكشفها.' : 'Some events are still hidden. Find more evidence to reveal them.'}</p>}</section>)}
      <section className="space-y-2">{step(6, ar ? 'تفسيرك (اختياري)' : 'Your explanation (optional)', !!d.explanation.trim())}
        <textarea className="h-24 w-full rounded-xl border border-[#2f4462] bg-[#0d1626] p-3 text-sm" maxLength={2000} value={d.explanation} onChange={(e) => setD({ ...d, explanation: e.target.value })}
          placeholder={ar ? 'إزاي الأدلة بتثبت كلامك؟ وإيه اللي بيكذّب أقوالهم؟' : 'How does the evidence prove it? Which statements does it contradict?'} aria-label={ar ? 'التفسير' : 'Explanation'} /></section>
      {captain ? (confirm ? (
        <div className="flex items-center gap-2 rounded-xl bg-[#f5a623]/10 p-3 text-sm" role="alertdialog">
          <span className="flex-1">{ar ? 'متأكد؟ الاتهام مايتغيرش بعد ما يتقدّم.' : 'Sure? The accusation cannot be changed after submitting.'}</span>
          <button type="button" className="det-btn min-h-0 py-1.5" disabled={busy} onClick={() => { setConfirm(false); onSubmit({ suspect: d.suspect, motive: d.motive, method: d.method, evidence: d.evidence, timeline: d.timeline, explanation: d.explanation }) }}>{ar ? 'قدّم' : 'Submit'}</button>
          <button type="button" className="det-btn-ghost min-h-0 py-1.5" onClick={() => setConfirm(false)}>{ar ? 'لا' : 'No'}</button>
        </div>) : <button type="button" className="det-btn w-full text-lg" disabled={busy || !ready} onClick={() => setConfirm(true)}>⚖️ {ar ? 'قدّم الاتهام' : 'Submit the accusation'}</button>)
        : <p className="rounded-xl bg-[#14233a] p-3 text-center text-sm">👑 {ar ? 'مستني قائد الفريق يقدّم الاتهام' : 'Waiting for the team captain to submit'}</p>}
    </div>
  )
}
