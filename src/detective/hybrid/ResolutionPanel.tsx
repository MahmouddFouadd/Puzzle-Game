import { useEffect, useState } from 'react'
import { loadResolution, type Resolution } from '../api'
import { EXAM } from './LabPanel'

/**
 * Case resolution for hybrid cases (shown in the final report, only after completion — the RPC refuses earlier).
 * Accusation vs the truth, partial-credit breakdown, key evidence missed, lab coverage, contradictions found, full timeline.
 * Renders nothing for classic cases or older servers.
 */
export function ResolutionPanel({ sessionId, ar, evidenceTitle }: { sessionId: string; ar: boolean; evidenceTitle: (id: string) => string }) {
  const [r, setR] = useState<Resolution | null>(null)
  useEffect(() => { loadResolution(sessionId).then(setR).catch(() => setR(null)) }, [sessionId])
  if (!r) return null
  const v = r.verdict
  const name = (id?: string | null) => { const s = r.suspects?.find((x) => x.id === id); return s ? (ar ? s.name_ar : s.name) : '—' }
  const opt = (list: Array<{ id: string; text: string; text_ar: string }>, id?: string | null) => { const o = list.find((x) => x.id === id); return o ? (ar ? o.text_ar : o.text) : '—' }
  const tl = (k: string) => { const t = r.timeline?.find((x) => x.event_key === k); return t ? (ar ? t.label_ar : t.label) : k }
  const row = (label: string, yours: string, truth: string, ok: boolean) => (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 border-b border-black/10 py-1.5 last:border-0">
      <span aria-hidden="true">{ok ? '✅' : '❌'}</span><b>{label}</b>
      <span /><span className="text-xs">{ar ? 'اتهامك: ' : 'You: '}{yours}</span>
      {!ok && <><span /><span className="text-xs font-semibold text-[#0f766e]">{ar ? 'الحقيقة: ' : 'Truth: '}{truth}</span></>}
    </div>)

  return (
    <div className="space-y-4">
      {v && (
        <section className="det-file space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="det-stamp">{ar ? 'نتيجة الاتهام' : 'Accusation result'}</span>
            {v.breakdown && <b className="font-display text-2xl" dir="ltr">{v.breakdown.total} / {v.breakdown.max}</b>}</div>
          {v.yours ? <>
            {row(ar ? 'القاتل' : 'Killer', name(v.yours.suspect_id), name(v.correct.suspect_id), v.yours.suspect_id === v.correct.suspect_id)}
            {row(ar ? 'الدافع' : 'Motive', opt(v.correct.motive_options, v.yours.motive), opt(v.correct.motive_options, v.correct.motive), v.yours.motive === v.correct.motive)}
            {row(ar ? 'الطريقة' : 'Method', opt(v.correct.method_options, v.yours.method), opt(v.correct.method_options, v.correct.method), v.yours.method === v.correct.method)}
            {v.correct.timeline.length > 0 && row(ar ? 'التسلسل' : 'Sequence', v.yours.timeline.map(tl).join(ar ? ' ← ' : ' → ') || '—', v.correct.timeline.map(tl).join(ar ? ' ← ' : ' → '),
              v.yours.timeline.join('|') === v.correct.timeline.join('|'))}
            <div className="pt-1">
              <b>{ar ? 'الأدلة الحاسمة' : 'Key evidence'}</b>
              <ul className="mt-1 space-y-0.5 text-xs">{v.correct.key_evidence.map((id) => <li key={id}>{v.yours!.evidence.includes(id) ? '✅' : '⬜'} {evidenceTitle(id)}</li>)}
                {v.yours.evidence.filter((id) => !v.correct.key_evidence.includes(id)).map((id) => <li key={id} className="opacity-70">➖ {evidenceTitle(id)} {ar ? '(مش حاسم)' : '(not decisive)'}</li>)}</ul>
            </div>
            {v.breakdown && <p className="text-xs opacity-80">{ar
              ? `القاتل ${v.breakdown.suspect} · الدافع ${v.breakdown.motive} · الطريقة ${v.breakdown.method} · الأدلة ${v.breakdown.evidence} · التسلسل ${v.breakdown.timeline}`
              : `Killer ${v.breakdown.suspect} · Motive ${v.breakdown.motive} · Method ${v.breakdown.method} · Evidence ${v.breakdown.evidence} · Sequence ${v.breakdown.timeline}`}</p>}
          </> : <p>{ar ? 'ما اتقدّمش اتهام.' : 'No accusation was submitted.'}</p>}
        </section>)}

      <section className="grid grid-cols-2 gap-2 text-center text-sm">
        <div className="det-panel !p-3"><div className="text-2xl">🧪</div><b dir="ltr">{r.lab.filter((l) => l.requested).length} / {r.lab.length}</b><div className="text-xs text-[#9fb0c4]">{ar ? 'فحوصات اتطلبت' : 'Lab tests requested'}</div></div>
        <div className="det-panel !p-3"><div className="text-2xl">⚠️</div><b dir="ltr">{r.confrontations.contradictions_found} / {r.confrontations.contradictions_total}</b><div className="text-xs text-[#9fb0c4]">{ar ? 'تناقضات اكتشفتها' : 'Contradictions found'}</div></div>
      </section>

      {r.lab.some((l) => !l.requested) && (
        <section className="det-panel space-y-1 text-sm">
          <h3 className="font-bold">{ar ? '🧪 فحوصات فاتتك' : '🧪 Lab tests you missed'}</h3>
          {r.lab.filter((l) => !l.requested).map((l) => <p key={l.key}>{EXAM[l.exam_type]?.icon} <b>{ar ? l.title_ar : l.title}</b> — {ar ? l.result_ar : l.result}</p>)}
        </section>)}

      {r.timeline?.length > 0 && (
        <section className="det-panel space-y-2">
          <h3 className="font-bold">{ar ? '🕒 الخط الزمني الحقيقي' : '🕒 What really happened'}</h3>
          <ol className="relative space-y-2 border-s-2 border-[#2f4462] ps-4">{r.timeline.map((t) => (
            <li key={t.event_key} className="relative"><span className={`absolute -start-[1.45rem] top-1.5 h-3 w-3 rounded-full ${v?.correct.timeline.includes(t.event_key) ? 'bg-[#e5484d]' : 'bg-[#2dd4bf]'}`} aria-hidden="true" />
              <span className="font-mono text-xs text-[#f5c46b]" dir="ltr">{t.window_key}</span><div className="text-sm">{ar ? t.label_ar : t.label}</div></li>))}</ol>
        </section>)}
    </div>
  )
}
