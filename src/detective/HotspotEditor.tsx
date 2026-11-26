import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fromPoints, hitTest, isUsable, moveRect, overlaps, resizeRect, toPercent, type Handle, type Pt, type Rect } from './hotspotGeometry'

export type EditorScene = { id: string; position: number; title: string; title_ar: string; image_path: string }
export type EditorEvidence = Rect & {
  id: string; scene_id: string; evidence_key: string; internal_title: string; public_title: string; public_title_ar: string
  public_description: string | null; public_description_ar: string | null; admin_explanation_ar: string | null
  classification: string; importance: number
}
type Draft = EditorEvidence & { isNew?: boolean; dirty?: boolean }
type Drag = { kind: 'new' | 'move' | 'resize'; start: Pt; orig?: Rect; id?: string; handle?: Handle; current?: Rect }

const CLASSES = ['FACT', 'OBSERVATION', 'INFERENCE', 'PROBABILITY', 'ASSUMPTION'] as const
const CLASS_AR: Record<string, string> = { FACT: 'حقيقة', OBSERVATION: 'ملاحظة', INFERENCE: 'استنتاج', PROBABILITY: 'احتمال', ASSUMPTION: 'افتراض' }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
const src = (p: string) => (p.startsWith('http') ? p : `/${p.replace(/^\//, '')}`)

/** Visual hotspot editor: drag on the scene to draw a clue, drag a box to move it, drag a corner to resize it.
 *  Boxes are stored as image-relative percentages, so they stay accurate on every screen size and zoom level. */
export function HotspotEditor({ scene, items, published, onSaved }: { scene: EditorScene; items: EditorEvidence[]; published: boolean; onSaved: () => Promise<void> | void }) {
  const [drafts, setDrafts] = useState<Draft[]>(items)
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [probe, setProbe] = useState<{ p: Pt; hit: string | null } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [ratio, setRatio] = useState(16 / 9)
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => { setDrafts(items); setSelected(null); setProbe(null) }, [items, scene.id])
  const sel = drafts.find((d) => d.id === selected) ?? null
  const clash = useMemo(() => overlaps(drafts), [drafts])
  const pt = (e: React.PointerEvent) => toPercent(e.clientX, e.clientY, frame.current!.getBoundingClientRect())
  const patch = (id: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p, dirty: true } : d)))

  const onDown = (e: React.PointerEvent, id?: string, handle?: Handle) => {
    e.stopPropagation(); e.preventDefault()
    frame.current?.setPointerCapture(e.pointerId)
    const p = pt(e)
    if (preview) { const hit = hitTest(drafts, p); setProbe({ p, hit: hit?.id ?? null }); return }
    if (id) {
      setSelected(id)
      const d = drafts.find((x) => x.id === id)!
      setDrag({ kind: handle ? 'resize' : 'move', start: p, orig: { x: d.x, y: d.y, width: d.width, height: d.height }, id, handle })
    } else setDrag({ kind: 'new', start: p, current: fromPoints(p, p) })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const p = pt(e)
    if (drag.kind === 'new') setDrag({ ...drag, current: fromPoints(drag.start, p) })
    else if (drag.kind === 'move' && drag.orig && drag.id) patch(drag.id, moveRect(drag.orig, p.x - drag.start.x, p.y - drag.start.y))
    else if (drag.kind === 'resize' && drag.orig && drag.id && drag.handle) patch(drag.id, resizeRect(drag.orig, drag.handle, p))
  }
  const onUp = () => {
    if (drag?.kind === 'new' && drag.current && isUsable(drag.current)) {
      const id = `new-${Date.now().toString(36)}`
      const d: Draft = { ...drag.current, id, scene_id: scene.id, evidence_key: '', internal_title: '', public_title: '', public_title_ar: '', public_description: '', public_description_ar: '',
        admin_explanation_ar: '', classification: 'OBSERVATION', importance: 3, isNew: true, dirty: true }
      setDrafts((ds) => [...ds, d]); setSelected(id)
    }
    setDrag(null)
  }
  const nudge = (e: React.KeyboardEvent) => {
    if (!sel || preview) return
    const step = e.shiftKey ? 2 : 0.5
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault(); patch(sel.id, moveRect(sel, d[0], d[1]))
  }

  const save = async (d: Draft) => {
    if (!d.public_title_ar.trim() && !d.public_title.trim()) { setMsg({ ok: false, text: 'اكتب اسم الدليل الأول · Give the clue a name first.' }); return }
    if (!isUsable(d)) { setMsg({ ok: false, text: 'المساحة صغيرة جدًا · The box is too small.' }); return }
    setBusy(true); setMsg(null)
    const title = d.public_title.trim() || d.public_title_ar.trim()
    const row = {
      scene_id: scene.id, evidence_key: d.evidence_key.trim() || slug(d.public_title) || `clue_${Date.now().toString(36)}`, internal_title: title,
      public_title: title, public_title_ar: d.public_title_ar.trim() || title, public_description: d.public_description?.trim() || d.public_description_ar?.trim() || null,
      public_description_ar: d.public_description_ar?.trim() || null, admin_explanation_ar: d.admin_explanation_ar?.trim() || null,
      classification: d.classification, importance: d.importance, x: d.x, y: d.y, width: d.width, height: d.height
    }
    const r = d.isNew ? await supabase.from('detective_evidence').insert(row).select('id').single() : await supabase.from('detective_evidence').update(row).eq('id', d.id).select('id').single()
    setBusy(false)
    if (r.error) { setMsg({ ok: false, text: r.error.message }); return }
    setMsg({ ok: true, text: 'اتحفظ ✓ · Saved' }); setSelected(r.data.id); await onSaved()
  }
  const remove = async (d: Draft) => {
    if (d.isNew) { setDrafts((ds) => ds.filter((x) => x.id !== d.id)); setSelected(null); return }
    if (!window.confirm(`Delete "${d.public_title_ar || d.public_title}"?`)) return
    setBusy(true)
    const r = await supabase.from('detective_evidence').delete().eq('id', d.id)
    setBusy(false)
    if (r.error) setMsg({ ok: false, text: r.error.message.includes('foreign key') ? 'الدليل ده مستخدم في أسئلة أو روابط. شيله منها الأول · This clue is used by questions or links.' : r.error.message })
    else { setSelected(null); await onSaved() }
  }

  const live = drag?.kind === 'new' ? drag.current : null
  const probeHit = probe?.hit ? drafts.find((d) => d.id === probe.hit) : null
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="inline-flex overflow-hidden rounded-xl border border-parchment-200/20">
            <button type="button" className={`px-3 py-1.5 ${!preview ? 'bg-gold-500 text-ink-900' : ''}`} onClick={() => { setPreview(false); setProbe(null) }}>✏️ تحرير · Edit</button>
            <button type="button" className={`px-3 py-1.5 ${preview ? 'bg-gold-500 text-ink-900' : ''}`} onClick={() => { setPreview(true); setSelected(null) }}>🔍 معاينة كلاعب · Player preview</button>
          </div>
          <span className="opacity-70">{preview ? 'اضغط على الصورة زي اللاعب: الأدلة مخفية.' : 'اسحب على الصورة لتحديد دليل جديد · اسحب المربع لتحريكه · اسحب الركن لتكبيره · الأسهم للتحريك الدقيق'}</span>
        </div>
        {published && <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-sm">⚠️ القضية منشورة: أي تعديل هيظهر للاعبين فورًا. · This case is live: changes reach players immediately.</p>}
        <div ref={frame} tabIndex={0} onKeyDown={nudge} role="application" aria-label={`Hotspot editor – ${scene.title}`}
          className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-2xl border border-parchment-200/20 bg-black outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          style={{ aspectRatio: String(ratio) }} onPointerDown={(e) => onDown(e)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <img src={src(scene.image_path)} alt={scene.title} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth) setRatio(im.naturalWidth / im.naturalHeight) }} />
          {!preview && drafts.map((d) => {
            const on = d.id === selected, bad = clash.some(([a, b]) => a === d.id || b === d.id)
            return (
              <div key={d.id} onPointerDown={(e) => onDown(e, d.id)}
                className={`absolute cursor-move rounded-md border-2 ${on ? 'border-gold-400 bg-gold-400/20' : bad ? 'border-amber-400 border-dashed bg-amber-400/10' : 'border-teal-300 bg-teal-300/10'}`}
                style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.width}%`, height: `${d.height}%` }}>
                <span className="pointer-events-none absolute -top-6 start-0 max-w-[16rem] truncate rounded bg-black/75 px-1.5 text-xs text-white">{d.public_title_ar || d.public_title || 'دليل جديد'}{d.dirty ? ' •' : ''}</span>
                {on && (['nw', 'ne', 'sw', 'se'] as Handle[]).map((h) => (
                  <span key={h} onPointerDown={(e) => onDown(e, d.id, h)} aria-hidden="true"
                    className={`absolute h-4 w-4 rounded-full border-2 border-white bg-gold-500 ${h[0] === 'n' ? '-top-2' : '-bottom-2'} ${h[1] === 'w' ? '-left-2' : '-right-2'} ${h === 'nw' || h === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`} />
                ))}
              </div>
            )
          })}
          {live && <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-gold-400 bg-gold-400/15" style={{ left: `${live.x}%`, top: `${live.y}%`, width: `${live.width}%`, height: `${live.height}%` }} />}
          {preview && probe && (
            <>
              {probeHit && <div className="det-found pointer-events-none absolute rounded-md border-2 border-[#f5a623] bg-[#f5a623]/25" style={{ left: `${probeHit.x}%`, top: `${probeHit.y}%`, width: `${probeHit.width}%`, height: `${probeHit.height}%` }} />}
              <span className="det-ripple" style={{ left: `${probe.p.x}%`, top: `${probe.p.y}%` }} />
            </>
          )}
        </div>
        {preview && probe && <p className="text-sm" role="status">{probeHit ? `🔎 اللاعب هيلاقي: ${probeHit.public_title_ar || probeHit.public_title}` : '… مفيش دليل هنا'}</p>}
        {clash.length > 0 && !preview && <p className="text-sm text-amber-300">⚠️ فيه مربعات متداخلة ({clash.length}). الضغطة في الجزء المشترك بتلاقي الدليل الأصغر. · Overlapping boxes: a tap in the shared area finds the smaller clue.</p>}
      </div>

      <aside className="card space-y-3">
        <h3 className="font-display text-xl">أدلة المشهد ({drafts.filter((d) => !d.isNew).length})</h3>
        <ul className="max-h-40 space-y-1 overflow-auto text-sm">
          {drafts.map((d) => (
            <li key={d.id}><button type="button" onClick={() => { setSelected(d.id); setPreview(false) }}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-start ${d.id === selected ? 'bg-gold-500/20' : 'hover:bg-white/5'}`}>
              <span className="truncate">{d.public_title_ar || d.public_title || 'دليل جديد'}</span><span className="text-xs opacity-60">{CLASS_AR[d.classification]}{d.dirty ? ' •' : ''}</span></button></li>
          ))}
          {drafts.length === 0 && <li className="opacity-60">اسحب على الصورة عشان تضيف أول دليل.</li>}
        </ul>
        {sel ? (
          <form className="space-y-2 border-t border-parchment-200/15 pt-3" onSubmit={(e) => { e.preventDefault(); void save(sel) }}>
            <label className="block text-sm">اسم الدليل (عربي)<input className="input mt-1" dir="rtl" value={sel.public_title_ar} maxLength={160} onChange={(e) => patch(sel.id, { public_title_ar: e.target.value })} required /></label>
            <label className="block text-sm">Title (English)<input className="input mt-1" value={sel.public_title} maxLength={160} onChange={(e) => patch(sel.id, { public_title: e.target.value })} /></label>
            <label className="block text-sm">وصف يظهر للاعب لما يلاقيه<textarea className="input mt-1 min-h-20" dir="rtl" value={sel.public_description_ar ?? ''} onChange={(e) => patch(sel.id, { public_description_ar: e.target.value })} /></label>
            <label className="block text-sm">Description (English)<textarea className="input mt-1 min-h-16" value={sel.public_description ?? ''} onChange={(e) => patch(sel.id, { public_description: e.target.value })} /></label>
            <label className="block text-sm">شرح الإجابة (يظهر في التقرير بعد الحل)<textarea className="input mt-1 min-h-16" dir="rtl" value={sel.admin_explanation_ar ?? ''} onChange={(e) => patch(sel.id, { admin_explanation_ar: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">النوع<select className="input mt-1" value={sel.classification} onChange={(e) => patch(sel.id, { classification: e.target.value })}>{CLASSES.map((c) => <option key={c} value={c}>{CLASS_AR[c]} · {c}</option>)}</select></label>
              <label className="block text-sm">الأهمية<select className="input mt-1" value={sel.importance} onChange={(e) => patch(sel.id, { importance: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)} {n >= 4 ? '(+10)' : '(+5)'}</option>)}</select></label>
            </div>
            <label className="block text-sm">Key<input className="input mt-1 font-mono text-xs" dir="ltr" value={sel.evidence_key} placeholder="auto" onChange={(e) => patch(sel.id, { evidence_key: e.target.value.replace(/[^a-z0-9_-]/gi, '') })} /></label>
            <p className="text-xs opacity-60" dir="ltr">x {sel.x}% · y {sel.y}% · {sel.width}% × {sel.height}%</p>
            {msg && <p className={`text-sm ${msg.ok ? 'text-teal-300' : 'text-danger'}`} role="status">{msg.text}</p>}
            <div className="flex gap-2"><button className="btn-primary flex-1" disabled={busy || !sel.dirty}>{busy ? '…' : sel.isNew ? 'إضافة الدليل' : 'حفظ'}</button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => void remove(sel)}>{sel.isNew ? 'إلغاء' : 'حذف'}</button></div>
          </form>
        ) : <p className="border-t border-parchment-200/15 pt-3 text-sm opacity-70">اختار دليل من الصورة أو القائمة عشان تعدّله.</p>}
      </aside>
    </div>
  )
}
