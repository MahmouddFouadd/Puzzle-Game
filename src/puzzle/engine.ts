/**
 * Deterministic interlocking-jigsaw engine (pure TypeScript, no DOM).
 *
 * Guarantees (verified in engine.test.ts):
 *  - Every interior edge is generated ONCE and shared by both neighbours (one forward, one reversed),
 *    so neighbouring pieces fit exactly: no gaps, no overlaps.
 *  - Same (width, height, pieceCount, seed) always yields identical geometry.
 *  - All coordinates are in ORIGINAL image pixels.
 *  - Border edges are straight, so the assembled pieces cover exactly the width x height rectangle.
 */

export interface PuzzleSpec { width: number; height: number; pieceCount: number; seed: number }
export interface Pt { x: number; y: number }
export type Cubic = readonly [Pt, Pt, Pt, Pt] // start, control1, control2, end
export interface BBox { x: number; y: number; w: number; h: number }
export interface PieceGeometry {
  row: number
  col: number
  bbox: BBox        // integer pixel box in the original image (includes tabs)
  path: string      // closed SVG path in original-image coordinates
  cubics: readonly Cubic[]
}
export interface PuzzleLayout { rows: number; cols: number; pieces: PieceGeometry[] }

/** Small fast seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick rows x cols with rows*cols === count whose cells are closest to square. */
export function chooseGrid(count: number, width: number, height: number): { rows: number; cols: number } {
  let best = { rows: 1, cols: count }
  let bestScore = Infinity
  for (let rows = 1; rows <= count; rows++) {
    if (count % rows !== 0) continue
    const cols = count / rows
    const score = Math.abs(Math.log(width / cols / (height / rows)))
    if (score < bestScore) { bestScore = score; best = { rows, cols } }
  }
  return best
}

const P = (x: number, y: number): Pt => ({ x, y })
const lineCubic = (a: Pt, b: Pt): Cubic => [a, P(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3), P(a.x + (2 * (b.x - a.x)) / 3, a.y + (2 * (b.y - a.y)) / 3), b]
export const reverseCubics = (cs: readonly Cubic[]): Cubic[] =>
  [...cs].reverse().map(([p0, c1, c2, p1]) => [p1, c2, c1, p0] as const)

/** Local tab shape: [along-edge fraction, perpendicular fraction] for 3 chained cubics (10 points). */
function tabShape(rng: () => number, sign: 1 | -1): [number, number][] {
  const j = (amp: number) => (rng() - 0.5) * 2 * amp
  const t = 0.1 + j(0.015)
  const a = j(0.03), b = j(0.03), c = j(0.03), d = j(0.03), e = j(0.03)
  const pts: [number, number][] = [
    [0, 0], [0.2, a], [0.5 + b + d, -t + c], [0.5 - t + b, t + c],
    [0.5 - 2 * t + b - d, 3 * t + c], [0.5 + 2 * t + b - d, 3 * t + c], [0.5 + t + b, t + c],
    [0.5 + b + d, -t + c], [0.8, e], [1, 0]
  ]
  return pts.map(([l, w]) => [l, w * sign])
}

function edgeCubics(rng: () => number, horizontal: boolean, o: Pt, len: number, depth: number, interior: boolean): Cubic[] {
  // horizontal: runs +x from o, perpendicular = +y. vertical: runs +y from o, perpendicular = +x.
  const at = (l: number, w: number): Pt => horizontal ? P(o.x + l * len, o.y + w * depth) : P(o.x + w * depth, o.y + l * len)
  if (!interior) return [lineCubic(at(0, 0), at(1, 0))]
  const sign: 1 | -1 = rng() < 0.5 ? 1 : -1
  const p = tabShape(rng, sign).map(([l, w]) => at(l, w))
  return [[p[0], p[1], p[2], p[3]], [p[3], p[4], p[5], p[6]], [p[6], p[7], p[8], p[9]]]
}

const f = (n: number) => String(Math.round(n * 1000) / 1000)

function toPath(cubics: readonly Cubic[]): string {
  let d = `M${f(cubics[0][0].x)} ${f(cubics[0][0].y)}`
  for (const [, c1, c2, p1] of cubics) d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p1.x)} ${f(p1.y)}`
  return d + 'Z'
}

/** Sample cubics into a polygon (used for hit-testing, bbox and verification). */
export function flatten(cubics: readonly Cubic[], steps = 14): Pt[] {
  const out: Pt[] = []
  for (const [p0, c1, c2, p1] of cubics) {
    for (let i = 0; i < steps; i++) {
      const t = i / steps, u = 1 - t
      out.push(P(
        u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y))
    }
  }
  return out
}

export function generatePuzzle(spec: PuzzleSpec): PuzzleLayout {
  const { width, height, pieceCount, seed } = spec
  if (!Number.isInteger(pieceCount) || pieceCount < 1) throw new RangeError('pieceCount must be a positive integer')
  if (!(width > 0 && height > 0)) throw new RangeError('width and height must be positive')

  const { rows, cols } = chooseGrid(pieceCount, width, height)
  const cw = width / cols, ch = height / rows
  const depth = Math.min(cw, ch) // tab height scales with the smaller cell side
  const rng = mulberry32(seed)

  // Generation order is fixed => deterministic.
  const h: Cubic[][][] = [] // h[r][c]: horizontal edge on row-line r, spanning column c (left -> right)
  for (let r = 0; r <= rows; r++) {
    h[r] = []
    for (let c = 0; c < cols; c++) h[r][c] = edgeCubics(rng, true, P(c * cw, r * ch), cw, depth, r > 0 && r < rows)
  }
  const v: Cubic[][][] = [] // v[r][c]: vertical edge on column-line c, spanning row r (top -> bottom)
  for (let r = 0; r < rows; r++) {
    v[r] = []
    for (let c = 0; c <= cols; c++) v[r][c] = edgeCubics(rng, false, P(c * cw, r * ch), ch, depth, c > 0 && c < cols)
  }

  const pieces: PieceGeometry[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cubics: Cubic[] = [
        ...h[r][c],                    // top: forward
        ...v[r][c + 1],                // right: forward
        ...reverseCubics(h[r + 1][c]), // bottom: shared edge reversed
        ...reverseCubics(v[r][c])      // left: shared edge reversed
      ]
      const poly = flatten(cubics)
      const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)))
      const x1 = Math.min(width, Math.ceil(Math.max(...xs))), y1 = Math.min(height, Math.ceil(Math.max(...ys)))
      pieces.push({ row: r, col: c, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, path: toPath(cubics), cubics })
    }
  }
  return { rows, cols, pieces }
}

/** Ray-casting point-in-polygon on the flattened piece outline. */
export function pointInPiece(piece: PieceGeometry, pt: Pt): boolean {
  const poly = flatten(piece.cubics)
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Signed polygon area (shoelace) of a piece outline. */
export function pieceArea(piece: PieceGeometry): number {
  const poly = flatten(piece.cubics)
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}
