import { useState } from 'react'
import type { DetectiveEvidence, DetectiveSuspect, Investigation } from '../api'

const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')
const TONES = ['#f5a623', '#2dd4bf', '#a78bfa', '#f472b6', '#60a5fa']

type Reply = { suspect: string; evidence: string; text: string; contradiction: boolean; matched: boolean }

/**
 * Suspect profiles + interrogation room. Players show a discovered piece of evidence to a suspect and get the
 * case author's reaction; authored contradictions are flagged. Unauthored pairs get a neutral "no reaction".
 */
export function InterrogationPanel({ suspects, extra, confrontations, found, ar, busy, imageUrl, onConfront }: {
  suspects: DetectiveSuspect[]; extra: Investigation['suspects']; confrontations: Investigation['confrontations']; found: DetectiveEvidence[]
  ar: boolean; busy: boolean; imageUrl: (p: string) => string
  onConfront: (suspect: string, evidence: string) => Promise<{ matched: boolean; response?: string; response_ar?: string; reveals_contradiction?: boolean } | null>
}) {
  const [sel, setSel] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [last, setLast] = useState<Reply | null>(null)
  const x = new Map(extra.map((e) => [e.id, e]))
  const ev = new Map(found.map((e) => [e.id, e]))
  const s = suspects.find((v) => v.id === sel) ?? null
  const done = new Set(confrontations.map((c) => `${c.suspect_id}|${c.evidence_id}`))

  const confront = async () => {
    if (!s || !pick) return
    const r = await onConfront(s.id, pick)
    if (!r) return
    setLast({ suspect: s.id, evidence: pick, matched: r.matched, contradiction: !!r.reveals_contradiction,
      text: r.matched ? ((ar ? r.response_ar : r.response) ?? '') : (ar ? 'بصّ للدليل وسكت… مفيش رد فعل مفيد.' : 'Looks at it and says nothing useful.') })
    setPick(null)
  }

  if (!s) return (
    <div className="space-y-3">
      <p className="text-sm text-[#9fb0c4]">{ar ? 'اختار مشتبه به عشان تقرا ملفه وتواجهه بالأدلة اللي لقيتها.' : 'Pick a suspect to read their file and confront them with your evidence.'}</p>
      {suspects.map((v, i) => {
        const e = x.get(v.id); const hits = confrontations.filter((c) => c.suspect_id === v.id)
        return (
          <button key={v.id} type="button" className="flex w-full items-center gap-3 rounded-xl border border-[#2a3a52] bg-[#0f1a2b] p-3 text-start transition hover:border-[#f5a623]" onClick={() => { setSel(v.id); setLast(null) }}>
            {e?.portrait_path ? <img src={imageUrl(e.portrait_path)} alt="" className="h-14 w-14 rounded-full object-cover" />
              : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-lg font-bold text-[#0b1220]" style={{ background: TONES[i % TONES.length] }} aria-hidden="true">{initials(ar ? v.name_ar : v.name)}</span>}
            <div className="min-w-0 flex-1">
              <b className="block">{ar ? v.name_ar : v.name}</b>
              <span className="block truncate text-xs text-[#9fb0c4]">{(ar ? e?.relationship_ar : v.relationship) ?? v.relationship}</span>
              <span className="text-[11px] text-[#7d8fa6]">🗣️ {hits.length} {ar ? 'مواجهات' : 'confrontations'}{hits.some((h) => h.reveals_contradiction) ? (ar ? ' · ⚠️ تناقض' : ' · ⚠️ contradiction') : ''}</span>
            </div>
            <span aria-hidden="true" className="text-[#7d8fa6] rtl:rotate-180">›</span>
          </button>)
      })}
    </div>
  )

  const e = x.get(s.id)
  const mine = confrontations.filter((c) => c.suspect_id === s.id)
  return (
    <div className="space-y-3">
      <button type="button" className="det-btn-ghost min-h-0 px-3 py-1.5 text-sm" onClick={() => { setSel(null); setLast(null) }}>{ar ? '→ كل المشتبه بهم' : '← All suspects'}</button>
      <article className="det-file space-y-2 text-sm">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] opacity-60">{ar ? 'ملف مشتبه به' : 'Suspect file'}</p>
        <h3 className="font-display text-2xl font-bold">{ar ? s.name_ar : s.name}</h3>
        <p className="text-xs opacity-75">{(ar ? e?.relationship_ar : s.relationship) ?? s.relationship}</p>
        <p>{ar ? s.description_ar : s.description}</p>
        {(ar ? e?.motive_ar : e?.motive) && <p><b>{ar ? 'دافع محتمل: ' : 'Possible motive: '}</b>{ar ? e?.motive_ar : e?.motive}</p>}
        {(ar ? (e?.alibi_ar ?? s.alibi) : s.alibi) && <p><b>{ar ? 'أقواله عن مكانه: ' : 'Alibi: '}</b>{ar ? (e?.alibi_ar ?? s.alibi) : s.alibi}</p>}
        {s.statements.map((st) => <blockquote key={st.id} className="border-s-4 border-[#b45309] ps-3 italic">“{ar ? st.statement_ar : st.statement}”</blockquote>)}
      </article>

      <section className="rounded-xl border border-[#2a3a52] bg-[#0b1322] p-3 space-y-3" aria-label={ar ? 'غرفة الاستجواب' : 'Interrogation room'}>
        <h4 className="font-display text-lg font-bold">🗣️ {ar ? 'غرفة الاستجواب' : 'Interrogation room'}</h4>
        {mine.length === 0 && !last && <p className="text-sm text-[#9fb0c4]">{ar ? 'اختار دليل من دفترك ووريه للمشتبه به.' : 'Choose evidence from your notebook and show it.'}</p>}
        <ol className="space-y-2">
          {mine.map((c) => (
            <li key={c.evidence_id} className="space-y-1">
              <p className="text-xs text-[#7d8fa6]">📁 {ar ? ev.get(c.evidence_id)?.public_title_ar : ev.get(c.evidence_id)?.public_title}</p>
              <p className={`rounded-2xl rounded-ss-sm p-2.5 text-sm ${c.reveals_contradiction ? 'bg-[#7f1d1d]/40 ring-1 ring-[#e5484d]' : 'bg-[#14233a]'}`}>“{ar ? c.response_ar : c.response}”
                {c.reveals_contradiction && <span className="mt-1 block text-xs font-bold text-[#ff8a8d]">⚠️ {ar ? 'تناقض مع الأدلة!' : 'Contradicts the evidence!'}</span>}</p>
            </li>))}
          {last && !last.matched && last.suspect === s.id && <li className="rounded-2xl bg-[#14233a] p-2.5 text-sm text-[#9fb0c4]">{last.text}</li>}
        </ol>
        {found.length === 0 ? <p className="text-sm text-[#9fb0c4]">{ar ? 'لسه ما معاكش أدلة تواجهه بيها.' : 'You have no evidence to show yet.'}</p> : (
          <>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={ar ? 'اختار دليل' : 'Choose evidence'}>
              {found.map((f) => <button key={f.id} type="button" role="radio" aria-checked={pick === f.id} aria-pressed={pick === f.id} className="det-chip" onClick={() => setPick(f.id)}>
                {done.has(`${s.id}|${f.id}`) ? '✓ ' : ''}{ar ? f.public_title_ar : f.public_title}</button>)}
            </div>
            <button type="button" className="det-btn w-full" disabled={busy || !pick} onClick={() => void confront()}>{ar ? '🗣️ واجهه بالدليل' : '🗣️ Confront with evidence'}</button>
          </>)}
      </section>
    </div>
  )
}
