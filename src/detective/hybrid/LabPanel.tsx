import { useEffect, useRef, useState } from 'react'
import type { DetectiveEvidence, LabProcedure } from '../api'

export const EXAM: Record<string, { icon: string; ar: string; en: string }> = {
  DNA: { icon: '🧬', ar: 'بصمة وراثية', en: 'DNA' },
  BLOOD: { icon: '🩸', ar: 'تحليل دم', en: 'Blood analysis' },
  FINGERPRINT: { icon: '🖐️', ar: 'بصمات', en: 'Fingerprints' },
  WEAPON: { icon: '🔪', ar: 'فحص سلاح', en: 'Weapon exam' },
  TOXICOLOGY: { icon: '⚗️', ar: 'سموم', en: 'Toxicology' },
  TIME_OF_DEATH: { icon: '🕰️', ar: 'طب شرعي', en: 'Medical examiner' },
  DIGITAL: { icon: '💻', ar: 'أدلة رقمية', en: 'Digital evidence' },
  DOCUMENT: { icon: '📄', ar: 'فحص مستندات', en: 'Document exam' },
  OTHER: { icon: '🔬', ar: 'فحص', en: 'Examination' }
}

function useCountdown(until: string | null, serverOffset: number) {
  const [now, setNow] = useState(Date.now())
  const previousUntil = useRef<string | null>(until)
  const previousValue = useRef<number | undefined>(undefined)
  if (previousUntil.current !== until) {
    previousUntil.current = until
    previousValue.current = undefined
  }
  useEffect(() => { if (!until) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [until])
  if (!until) return 0
  const raw = Math.max(0, Math.ceil((Date.parse(until) - (now + serverOffset)) / 1000))
  const value = previousValue.current === undefined ? raw : Math.min(previousValue.current, raw)
  previousValue.current = value
  return value
}

function ReportDoc({ p, ar }: { p: LabProcedure; ar: boolean }) {
  const r = (p.report ?? {}) as { sample_ids?: string[]; findings_ar?: string[]; findings?: string[]; limitations_ar?: string; limitations?: string }
  const findings = (ar ? r.findings_ar : r.findings) ?? r.findings_ar ?? []
  const limits = (ar ? r.limitations_ar : r.limitations) ?? r.limitations_ar
  return (
    <div className="det-file det-found space-y-2 text-sm" role="document" aria-label={ar ? `تقرير ${p.title_ar}` : `${p.title} report`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] opacity-60">{ar ? 'المعمل الجنائي – وثيقة خيالية للعبة' : 'Forensic lab – fictional game document'}</p>
          <h4 className="font-display text-lg font-bold">{EXAM[p.exam_type]?.icon} {ar ? p.title_ar : p.title}</h4>
        </div>
        <span className="det-stamp shrink-0">{ar ? 'النتيجة' : 'Result'}</span>
      </div>
      {!!r.sample_ids?.length && <p className="font-mono text-xs" dir="ltr">{r.sample_ids.join(' · ')}</p>}
      <p className="font-semibold">{ar ? p.result_ar : p.result}</p>
      {findings.length > 0 && <ul className="list-disc space-y-0.5 ps-5">{findings.map((f) => <li key={f}>{f}</li>)}</ul>}
      {limits && <p className="rounded-lg bg-black/5 p-2 text-xs"><b>{ar ? 'حدود النتيجة: ' : 'Limitations: '}</b>{limits}</p>}
    </div>
  )
}

function LabCard({ p, sample, ar, busy, offset, onRequest, onReady }: { p: LabProcedure; sample: DetectiveEvidence | null; ar: boolean; busy: boolean; offset: number; onRequest: () => void; onReady: () => void }) {
  const left = useCountdown(p.status === 'PENDING' ? p.ready_at : null, offset)
  const pending = p.status === 'PENDING'
  useEffect(() => { if (pending && left === 0) { const id = window.setTimeout(onReady, 600); return () => window.clearTimeout(id) } }, [pending, left, onReady])
  const [open, setOpen] = useState(false)
  const ex = EXAM[p.exam_type] ?? EXAM.OTHER
  return (
    <article className="rounded-xl border border-[#2a3a52] bg-[#0f1a2b] p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#14233a] text-2xl" aria-hidden="true">{ex.icon}</span>
        <div className="min-w-0 flex-1">
          <b className="block truncate">{ar ? p.title_ar : p.title}</b>
          <span className="text-xs text-[#9fb0c4]">{ar ? ex.ar : ex.en}{sample ? ` · ${ar ? 'العينة' : 'Sample'}: ${ar ? sample.public_title_ar : sample.public_title}` : ''}</span>
        </div>
        {p.status === 'READY' && <span className="det-chip !border-[#2dd4bf] text-[#5eead4]">✓ {ar ? 'جاهز' : 'Ready'}</span>}
      </div>
      {p.status === null && (p.available
        ? <button type="button" className="det-btn w-full" disabled={busy} onClick={onRequest}>🧪 {ar ? 'ابعت للمعمل' : 'Send to the lab'}</button>
        : <p className="rounded-lg bg-[#14233a] p-2 text-center text-xs text-[#9fb0c4]">🔒 {ar ? 'محتاج عينة تانية من مسرح الجريمة قبل الفحص ده.' : 'Another sample from the scene is needed first.'}</p>)}
      {p.status === 'PENDING' && (
        <div className="flex items-center gap-3 rounded-lg bg-[#14233a] p-2.5 text-sm" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2dd4bf] border-t-transparent" aria-hidden="true" />
          <span className="flex-1">{ar ? 'العينة في المعمل…' : 'Sample in the lab…'}</span>
          <span className="font-mono text-[#5eead4]" dir="ltr">{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '…'}</span>
        </div>)}
      {p.status === 'READY' && (open ? <ReportDoc p={p} ar={ar} /> :
        <button type="button" className="det-btn-ghost w-full" onClick={() => setOpen(true)}>📄 {ar ? 'افتح التقرير' : 'Open the report'}</button>)}
    </article>
  )
}

/** Forensic lab: examinations unlock as their samples are found; results come back as fictional lab documents. */
export function LabPanel({ lab, found, ar, busy, serverNow, onRequest, onRefresh }: { lab: LabProcedure[]; found: DetectiveEvidence[]; ar: boolean; busy: boolean; serverNow: string; onRequest: (id: string) => void; onRefresh: () => void }) {
  const offset = Date.parse(serverNow) - Date.now()
  const byId = new Map(found.map((e) => [e.id, e]))
  const ready = lab.filter((p) => p.status === 'READY').length
  if (lab.length === 0) return <p className="rounded-xl bg-[#14233a] p-4 text-center text-sm text-[#9fb0c4]">🧪 {ar ? 'لسه مفيش عينات. لما تلاقي أدلة في مسرح الجريمة، الفحوصات بتاعتها هتظهر هنا.' : 'No samples yet. Examinations appear here as you find evidence at the scene.'}</p>
  return (
    <div className="space-y-3">
      <p className="text-sm text-[#9fb0c4]">{ar ? `اختار الفحص المناسب لكل عينة. التقارير الجاهزة: ${ready} من ${lab.length}` : `Choose the right examination for each sample. Reports ready: ${ready} of ${lab.length}`}</p>
      {lab.map((p) => <LabCard key={p.id} p={p} ar={ar} busy={busy} offset={offset} sample={p.evidence_id ? byId.get(p.evidence_id) ?? null : null} onRequest={() => onRequest(p.id)} onReady={onRefresh} />)}
    </div>
  )
}
