/** Hotspot rectangles in image-relative percentages (0–100), as stored in detective_evidence. */
export type Rect = { x: number; y: number; width: number; height: number }
export type Pt = { x: number; y: number }
export type Handle = 'nw' | 'ne' | 'sw' | 'se'

export const MIN_SIZE = 2
const r2 = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Rectangle spanned by two drag points, clamped to the image. */
export function fromPoints(a: Pt, b: Pt): Rect {
  const x1 = clamp(Math.min(a.x, b.x), 0, 100), y1 = clamp(Math.min(a.y, b.y), 0, 100)
  const x2 = clamp(Math.max(a.x, b.x), 0, 100), y2 = clamp(Math.max(a.y, b.y), 0, 100)
  return { x: r2(x1), y: r2(y1), width: r2(x2 - x1), height: r2(y2 - y1) }
}

/** Moves a rectangle by (dx, dy) without letting it leave the image. */
export function moveRect(r: Rect, dx: number, dy: number): Rect {
  return { ...r, x: r2(clamp(r.x + dx, 0, 100 - r.width)), y: r2(clamp(r.y + dy, 0, 100 - r.height)) }
}

/** Drags one corner to point p; the opposite corner stays fixed and the size never drops below MIN_SIZE. */
export function resizeRect(r: Rect, handle: Handle, p: Pt): Rect {
  const fixed = { x: handle.includes('w') ? r.x + r.width : r.x, y: handle.startsWith('n') ? r.y + r.height : r.y }
  let px = clamp(p.x, 0, 100), py = clamp(p.y, 0, 100)
  if (Math.abs(px - fixed.x) < MIN_SIZE) px = fixed.x + (handle.includes('w') ? -MIN_SIZE : MIN_SIZE)
  if (Math.abs(py - fixed.y) < MIN_SIZE) py = fixed.y + (handle.startsWith('n') ? -MIN_SIZE : MIN_SIZE)
  return fromPoints(fixed, { x: px, y: py })
}

export const isUsable = (r: Rect) => r.width >= MIN_SIZE && r.height >= MIN_SIZE && r.x >= 0 && r.y >= 0 && r.x + r.width <= 100.001 && r.y + r.height <= 100.001
export const contains = (r: Rect, p: Pt, tol = 0) => p.x >= r.x - tol && p.x <= r.x + r.width + tol && p.y >= r.y - tol && p.y <= r.y + r.height + tol

/** Same rule as the server (detective_inspect): the smallest box containing the point wins, with 1.5% tolerance. */
export function hitTest<T extends Rect>(boxes: T[], p: Pt, tol = 1.5): T | null {
  return boxes.filter((b) => contains(b, p, tol)).sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null
}

/** Pairs of boxes that overlap by more than a sliver: a tap there could find the "wrong" clue. */
export function overlaps<T extends Rect & { id: string }>(boxes: T[], minArea = 4): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
    if (w > 0 && h > 0 && w * h >= minArea) out.push([a.id, b.id])
  }
  return out
}

/** Pointer position inside an element, as image-relative percentages. */
export function toPercent(clientX: number, clientY: number, box: DOMRect): Pt {
  return { x: ((clientX - box.left) / box.width) * 100, y: ((clientY - box.top) / box.height) * 100 }
}
