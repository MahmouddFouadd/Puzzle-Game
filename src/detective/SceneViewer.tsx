import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n'

export interface Box { id: string; x: number; y: number; width: number; height: number; label?: string; tone?: 'found' | 'missed' | 'flash' }
interface Props {
  src: string; alt: string; boxes: Box[]
  hint?: { cx: number; cy: number; r: number } | null
  onTap?: (x: number, y: number) => void
  onBoxClick?: (id: string) => void
  overlay?: ReactNode
}
type Pt = { x: number; y: number }

/** Zoom/pan image viewer. Taps report image-relative percentages (0–100). */
export function SceneViewer({ src, alt, boxes, hint, onTap, onBoxClick, overlay }: Props) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const frame = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const [ratio, setRatio] = useState(16 / 10)
  const [full, setFull] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const pointers = useRef(new Map<number, Pt>())
  const gesture = useRef<{ start: Pt; moved: boolean; base: typeof t; dist?: number; mid?: Pt } | null>(null)

  useEffect(() => { setT({ s: 1, x: 0, y: 0 }); setFailed(false) }, [src])
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [full])

  const clamp = useCallback((n: { s: number; x: number; y: number }) => {
    const el = frame.current
    const s = Math.min(5, Math.max(1, n.s))
    if (!el) return { ...n, s }
    const maxX = (el.clientWidth * (s - 1)) / 2, maxY = (el.clientHeight * (s - 1)) / 2
    return { s, x: Math.min(maxX, Math.max(-maxX, n.x)), y: Math.min(maxY, Math.max(-maxY, n.y)) }
  }, [])
  const zoomBy = (f: number) => setT((o) => clamp({ s: o.s * f, x: o.x * f, y: o.y * f }))

  const tapAt = (clientX: number, clientY: number) => {
    const r = inner.current?.getBoundingClientRect()
    if (!r || !onTap) return
    const x = ((clientX - r.left) / r.width) * 100, y = ((clientY - r.top) / r.height) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return
    const id = Date.now() + Math.random()
    setRipples((rs) => [...rs.slice(-3), { id, x, y }])
    window.setTimeout(() => setRipples((rs) => rs.filter((p) => p.id !== id)), 700)
    onTap(x, y)
  }

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 1) gesture.current = { start: pts[0], moved: false, base: t }
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      gesture.current = { start: pts[0], moved: true, base: t, dist: d, mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } }
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()], g = gesture.current
    if (pts.length >= 2 && g.dist) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const f = d / g.dist
      setT(clamp({ s: g.base.s * f, x: g.base.x * f, y: g.base.y * f }))
    } else if (pts.length === 1) {
      const dx = pts[0].x - g.start.x, dy = pts[0].y - g.start.y
      if (Math.hypot(dx, dy) > 8) g.moved = true
      if (g.moved && t.s > 1) setT(clamp({ ...g.base, x: g.base.x + dx, y: g.base.y + dy }))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current
    const wasSingle = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (wasSingle && g && !g.moved) tapAt(e.clientX, e.clientY)
    if (pointers.current.size === 0) gesture.current = null
    else { const p = [...pointers.current.values()][0]; gesture.current = { start: p, moved: true, base: t } }
  }

  const tone = (b: Box) => b.tone === 'missed' ? 'border-[#e5484d] border-dashed bg-[#e5484d]/10' : b.tone === 'flash' ? 'det-found border-[#f5a623] bg-[#f5a623]/25' : 'border-[#2dd4bf] bg-[#2dd4bf]/10'

  return (
    <div className={full ? 'fixed inset-0 z-50 flex flex-col bg-black/95 p-2' : 'relative'}>
      <div ref={frame} className={`relative touch-none select-none overflow-hidden rounded-2xl border border-[#2a3a52] bg-[#060b14] ${full ? 'm-auto w-full max-w-6xl' : 'w-full'}`}
        style={{ aspectRatio: String(ratio), maxHeight: full ? '88vh' : '62vh' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onWheel={(e) => { if (e.ctrlKey || full || t.s > 1) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15) } }}
        role="application" aria-label={ar ? `${alt} – اضغط على أي مكان لفحصه` : `${alt} – tap anywhere to inspect`}>
        <div ref={inner} className="absolute inset-0 origin-center transition-transform duration-75" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>
          {failed ? <div className="grid h-full place-items-center text-sm text-[#9fb0c4]">{ar ? 'الصورة مش متاحة دلوقتي. جرّب تفتحها تاني.' : 'Image unavailable. Please try again.'}</div>
            : <img src={src} alt={alt} draggable={false} className="h-full w-full object-contain" onError={() => setFailed(true)}
                onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setRatio(im.naturalWidth / im.naturalHeight) }} />}
          {boxes.map((b) => (
            <button key={b.id} type="button" aria-label={b.label} title={b.label} onPointerUp={(e) => { e.stopPropagation() }} onClick={(e) => { e.stopPropagation(); onBoxClick?.(b.id) }}
              className={`absolute rounded-md border-2 ${tone(b)}`} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%` }} />
          ))}
          {hint && <span className="pointer-events-none absolute rounded-full border-2 border-dashed border-[#f5c46b] bg-[#f5c46b]/10 bk-pulse"
            style={{ left: `${hint.cx - hint.r}%`, top: `${hint.cy - hint.r * ratio}%`, width: `${hint.r * 2}%`, height: `${hint.r * 2 * ratio}%` }} aria-hidden="true" />}
          {ripples.map((p) => <span key={p.id} className="det-ripple" style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-hidden="true" />)}
        </div>
        {overlay}
      </div>
      <div className={`mt-2 flex items-center justify-center gap-2 ${full ? 'pb-2' : ''}`}>
        <button type="button" className="det-btn-ghost min-h-0 px-3 py-1.5" onClick={() => zoomBy(1.4)} aria-label={ar ? 'تكبير' : 'Zoom in'}>＋</button>
        <button type="button" className="det-btn-ghost min-h-0 px-3 py-1.5" onClick={() => zoomBy(1 / 1.4)} aria-label={ar ? 'تصغير' : 'Zoom out'}>－</button>
        <button type="button" className="det-btn-ghost min-h-0 px-3 py-1.5 text-xs" onClick={() => setT({ s: 1, x: 0, y: 0 })}>{ar ? 'ضبط' : 'Reset'}</button>
        <button type="button" className="det-btn-ghost min-h-0 px-3 py-1.5 text-xs" onClick={() => setFull((v) => !v)}>{full ? (ar ? 'إغلاق' : 'Close') : (ar ? '⛶ ملء الشاشة' : '⛶ Full screen')}</button>
        <span className="text-xs text-[#7d8fa6]" dir="ltr">×{t.s.toFixed(1)}</span>
      </div>
    </div>
  )
}
