import type { Rect } from './hotspotGeometry'

/** Close-up of a clue: shows just the hotspot region of the scene image (with a little margin),
 *  like looking through the detective's magnifier. Pure CSS, so it costs no extra download. */
export function EvidenceCrop({ src, box, maxW, maxH, ratio = 16 / 9, round = 'rounded-xl', className = '' }: { src: string; box: Rect; maxW: number; maxH: number; ratio?: number; round?: string; className?: string }) {
  const pad = 0.18
  const x = Math.max(0, box.x - box.width * pad), y = Math.max(0, box.y - box.height * pad)
  const w = Math.min(100 - x, box.width * (1 + 2 * pad)), h = Math.min(100 - y, box.height * (1 + 2 * pad))
  const aspect = (w / h) * ratio
  const W = Math.min(maxW, maxH * aspect), H = W / aspect
  return (
    <div className={`relative shrink-0 overflow-hidden bg-black ${round} ${className}`} style={{ width: W, height: H }} aria-hidden="true">
      <img src={src} alt="" draggable={false} loading="lazy" className="absolute max-w-none"
        style={{ width: `${(100 / w) * 100}%`, height: `${(100 / h) * 100}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` }} />
      <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(0,0,0,.55)]" />
    </div>
  )
}
