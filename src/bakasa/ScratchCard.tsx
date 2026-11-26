import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n'
import { playSound } from './ui'

/**
 * Scratch-off card: a foil layer drawn on a canvas covers the content; the player scratches it with a
 * finger or mouse. Once ~55% is cleared the foil fades away. A button reveals it without scratching.
 */
export function ScratchCard({ children, onReveal, height = 300 }: { children: ReactNode; onReveal?: () => void; height?: number }) {
  const { lang } = useI18n()
  const ar = lang === 'ar'
  const canvas = useRef<HTMLCanvasElement>(null)
  const [done, setDone] = useState(false)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const moves = useRef(0)
  const revealed = useRef(false)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth, h = c.clientHeight
    c.width = w * dpr; c.height = h * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#c9ccd6'); g.addColorStop(0.45, '#f4f5f9'); g.addColorStop(0.55, '#aeb3c2'); g.addColorStop(1, '#e3e6ee')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 0.18
    for (let i = 0; i < 260; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#7c8196'; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2) }
    ctx.globalAlpha = 1
    ctx.fillStyle = '#5b5f73'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.round(w / 12)}px Cairo, sans-serif`
    ctx.fillText(ar ? 'اخربش هنا 👆' : 'Scratch here 👆', w / 2, h / 2 - 14)
    ctx.font = `${Math.round(w / 24)}px Cairo, sans-serif`
    ctx.fillText(ar ? 'خبّي الشاشة عن الباقيين 🤫' : 'Hide the screen from others 🤫', w / 2, h / 2 + 24)
  }, [ar])

  const finish = () => {
    if (revealed.current) return
    revealed.current = true; setDone(true); playSound('reveal'); onReveal?.()
  }
  const cleared = () => {
    const c = canvas.current; const ctx = c?.getContext('2d')
    if (!c || !ctx) return 0
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    let clear = 0, total = 0
    for (let i = 3; i < data.length; i += 4 * 24) { total++; if (data[i] < 40) clear++ }
    return total ? clear / total : 0
  }
  const scratch = (x: number, y: number) => {
    const c = canvas.current; const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    const from = last.current ?? { x, y }
    ctx.moveTo(from.x, from.y); ctx.lineTo(x, y); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.fill()
    last.current = { x, y }
    if (++moves.current % 8 === 0 && cleared() > 0.55) finish()
  }
  const pt = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-3xl" style={{ height }}>
        <div className="absolute inset-0">{children}</div>
        <canvas ref={canvas} aria-hidden={done} className={`absolute inset-0 h-full w-full touch-none rounded-3xl transition-opacity duration-500 ${done ? 'pointer-events-none opacity-0' : 'cursor-crosshair'}`}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; last.current = null; scratch(pt(e).x, pt(e).y) }}
          onPointerMove={(e) => { if (drawing.current) scratch(pt(e).x, pt(e).y) }}
          onPointerUp={() => { drawing.current = false; last.current = null; if (cleared() > 0.55) finish() }} />
      </div>
      {!done && <button type="button" className="mx-auto block text-xs underline opacity-70" onClick={finish}>{ar ? 'اكشف من غير خربشة' : 'Reveal without scratching'}</button>}
    </div>
  )
}
