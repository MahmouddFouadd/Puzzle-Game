import { describe, expect, it } from 'vitest'
import { chooseGrid, generatePuzzle, pieceArea, pointInPiece } from './engine'

const cases = [
  { width: 800, height: 600, pieceCount: 12 }, { width: 1600, height: 900, pieceCount: 16 },
  { width: 1000, height: 1000, pieceCount: 20 }, { width: 600, height: 900, pieceCount: 12 },
  { width: 1200, height: 800, pieceCount: 30 }, { width: 900, height: 900, pieceCount: 4 },
  { width: 1000, height: 700, pieceCount: 13 } // prime => single strip, still valid
]

describe('chooseGrid', () => {
  it('uses exactly pieceCount cells', () => { for (const c of cases) { const g = chooseGrid(c.pieceCount, c.width, c.height); expect(g.rows * g.cols).toBe(c.pieceCount) } })
  it('prefers near-square cells', () => expect(chooseGrid(12, 1600, 900)).toEqual({ rows: 3, cols: 4 }))
  it('adapts to portrait images', () => expect(chooseGrid(12, 600, 900)).toEqual({ rows: 4, cols: 3 }))
})

describe('generatePuzzle', () => {
  it('is deterministic for the same seed and differs for another seed', () => {
    const a = generatePuzzle({ width: 800, height: 600, pieceCount: 12, seed: 7 })
    const b = generatePuzzle({ width: 800, height: 600, pieceCount: 12, seed: 7 })
    const c = generatePuzzle({ width: 800, height: 600, pieceCount: 12, seed: 8 })
    expect(a.pieces.map((p) => p.path)).toEqual(b.pieces.map((p) => p.path))
    expect(a.pieces.map((p) => p.path)).not.toEqual(c.pieces.map((p) => p.path))
  })

  it('rejects invalid input', () => {
    expect(() => generatePuzzle({ width: 0, height: 10, pieceCount: 4, seed: 1 })).toThrow()
    expect(() => generatePuzzle({ width: 10, height: 10, pieceCount: 0, seed: 1 })).toThrow()
    expect(() => generatePuzzle({ width: 10, height: 10, pieceCount: 2.5, seed: 1 })).toThrow()
  })

  for (const spec of cases) {
    for (const seed of [1, 42, 2024, 99999]) {
      it(`covers the image exactly: ${spec.width}x${spec.height}, ${spec.pieceCount} pieces, seed ${seed}`, () => {
        const layout = generatePuzzle({ ...spec, seed })
        expect(layout.pieces).toHaveLength(spec.pieceCount)

        // 1) Areas sum to the image area => no gaps, no overlaps (shared edges cancel exactly).
        const total = layout.pieces.reduce((s, p) => s + pieceArea(p), 0)
        expect(Math.abs(total - spec.width * spec.height) / (spec.width * spec.height)).toBeLessThan(1e-9)

        // 2) Every sample pixel belongs to exactly one piece (catches self-intersecting tabs).
        for (let y = 0.37; y < spec.height; y += spec.height / 37) {
          for (let x = 0.41; x < spec.width; x += spec.width / 41) {
            const hits = layout.pieces.filter((p) => pointInPiece(p, { x, y })).length
            expect(hits).toBe(1)
          }
        }

        // 3) Boxes stay inside the image and contain real area.
        for (const p of layout.pieces) {
          expect(p.bbox.x).toBeGreaterThanOrEqual(0); expect(p.bbox.y).toBeGreaterThanOrEqual(0)
          expect(p.bbox.x + p.bbox.w).toBeLessThanOrEqual(spec.width); expect(p.bbox.y + p.bbox.h).toBeLessThanOrEqual(spec.height)
          expect(p.bbox.w).toBeGreaterThan(0); expect(p.bbox.h).toBeGreaterThan(0)
        }
      })
    }
  }

  it('interior neighbours share the identical edge (tab of one = blank of the other)', () => {
    const { pieces, cols } = generatePuzzle({ width: 800, height: 600, pieceCount: 12, seed: 5 })
    const top = pieces[0], below = pieces[cols]
    // top piece's bottom edge (last third of its cubics' left+bottom) == below piece's top edge, reversed
    const topOfBelow = below.cubics.slice(0, 3)
    const bottomOfTop = top.cubics.slice(4, 7)   // piece (0,0): top=1 border cubic, right=3, bottom=3
    expect(bottomOfTop[0][0]).toEqual(topOfBelow[2][3])   // start of reversed = end of forward
    expect(bottomOfTop[0][1]).toEqual(topOfBelow[2][2])   // control points swap
    expect(bottomOfTop[1][1]).toEqual(topOfBelow[1][2])
    expect(bottomOfTop[2][3]).toEqual(topOfBelow[0][0])   // end of reversed = start of forward
  })
})
