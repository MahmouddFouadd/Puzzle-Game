import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import type { BoardLink, DetectiveEvidence, Relation } from './api'

export const RELATIONS: Record<Relation, { ar: string; en: string; color: string }> = {
  SUPPORTS: { ar: 'يدعم', en: 'Supports', color: '#22c55e' }, CONTRADICTS: { ar: 'يناقض', en: 'Contradicts', color: '#e5484d' },
  TEMPORAL: { ar: 'قبله/بعده', en: 'Before/after', color: '#60a5fa' }, CONTEXTUAL: { ar: 'مرتبط بـ', en: 'Related to', color: '#f5a623' },
  UNCERTAIN: { ar: 'غير مؤكد', en: 'Uncertain', color: '#94a3b8' }
}

/** Investigation board: evidence pinned in a circle, player-drawn relationship strings between them. */
export function EvidenceBoard({ evidence, links, onLink, onUnlink, busy }: {
  evidence: DetectiveEvidence[]; links: BoardLink[]; busy: boolean
  onLink: (from: string, to: string, rel: Relation) => void; onUnlink: (from: string, to: string) => void
}) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const [sel, setSel] = useState<string | null>(null)
  const [pair, setPair] = useState<[string, string] | null>(null)
  const W = 360, H = 300, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 46
  const pos = new Map(evidence.map((e, i) => {
    const a = (i / Math.max(1, evidence.length)) * Math.PI * 2 - Math.PI / 2
    return [e.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }]
  }))
  const title = (e: DetectiveEvidence) => (ar ? e.public_title_ar : e.public_title)
  const pick = (id: string) => {
    if (!sel) { setSel(id); return }
    if (sel === id) { setSel(null); return }
    setPair([sel, id]); setSel(null)
  }
  if (evidence.length < 2) return <p className="text-center text-sm text-[#9fb0c4]">{ar ? 'اكتشف دليلين على الأقل عشان تبدأ تربط بينهم.' : 'Discover at least two clues to start linking them.'}</p>
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#9fb0c4]">{ar ? 'اضغط على دليل ثم دليل تاني، واختار نوع العلاقة. الروابط الصحيحة بتتحسب في التقرير (+10 لكل رابط).' : 'Tap one clue then another and choose the relationship. Correct links score +10 each in the report.'}</p>
      <div className="overflow-hidden rounded-xl border border-[#2a3a52] bg-[#1c140c]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ar ? 'لوحة الأدلة' : 'Evidence board'}>
          {links.map((l) => { const a = pos.get(l.from), b = pos.get(l.to); if (!a || !b) return null; const c = RELATIONS[l.relation]
            return <g key={`${l.from}-${l.to}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={l.relation === 'UNCERTAIN' ? '6 5' : undefined} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={c.color} stroke="#1c140c" strokeWidth="3" paintOrder="stroke">{ar ? c.ar : c.en}</text></g> })}
          {evidence.map((e) => { const p = pos.get(e.id)!; const on = sel === e.id
            return (
              <g key={e.id} onClick={() => pick(e.id)} style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-pressed={on} aria-label={title(e)}
                onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') pick(e.id) }}>
                <rect x={p.x - 46} y={p.y - 17} width="92" height="34" rx="6" fill={on ? '#f5a623' : '#f3e6c4'} stroke={on ? '#fff' : '#c9a45c'} strokeWidth="2" transform={`rotate(${(e.importance % 3) - 1} ${p.x} ${p.y})`} />
                <circle cx={p.x} cy={p.y - 17} r="4" fill="#e5484d" />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#2b2416">{title(e).length > 16 ? `${title(e).slice(0, 15)}…` : title(e)}</text>
              </g>) })}
        </svg>
      </div>
      {pair && (
        <div className="det-panel space-y-2" role="dialog" aria-label={ar ? 'نوع العلاقة' : 'Relationship type'}>
          <p className="text-sm">{ar ? 'إيه العلاقة بين' : 'How are'} <b>{title(evidence.find((e) => e.id === pair[0])!)}</b> {ar ? 'و' : 'and'} <b>{title(evidence.find((e) => e.id === pair[1])!)}</b>{ar ? '؟' : ' related?'}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RELATIONS) as Relation[]).map((r) => (
              <button key={r} type="button" disabled={busy} className="det-chip" style={{ borderColor: RELATIONS[r].color, color: RELATIONS[r].color }}
                onClick={() => { onLink(pair[0], pair[1], r); setPair(null) }}>{ar ? RELATIONS[r].ar : RELATIONS[r].en}</button>))}
            <button type="button" className="det-chip" onClick={() => setPair(null)}>{ar ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </div>
      )}
      {links.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {links.map((l) => { const a = evidence.find((e) => e.id === l.from), b = evidence.find((e) => e.id === l.to); if (!a || !b) return null
            return <li key={`${l.from}-${l.to}`} className="flex items-center gap-2 rounded-lg bg-[#14233a] px-3 py-2">
              <span className="flex-1">{title(a)} <b style={{ color: RELATIONS[l.relation].color }}>— {ar ? RELATIONS[l.relation].ar : RELATIONS[l.relation].en} —</b> {title(b)}</span>
              <button type="button" className="text-xs text-[#ff8a8d] underline" disabled={busy} onClick={() => onUnlink(l.from, l.to)}>{ar ? 'شيل' : 'Remove'}</button></li> })}
        </ul>
      )}
    </div>
  )
}
