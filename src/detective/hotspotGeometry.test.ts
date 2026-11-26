import { describe, expect, it } from 'vitest'
import { fromPoints, hitTest, isUsable, moveRect, overlaps, resizeRect } from './hotspotGeometry'

describe('hotspot geometry', () => {
  it('builds a rectangle from a drag in any direction and clamps to the image', () => {
    expect(fromPoints({ x: 30, y: 40 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 20, height: 20 })
    expect(fromPoints({ x: -5, y: 90 }, { x: 20, y: 120 })).toEqual({ x: 0, y: 90, width: 20, height: 10 })
  })
  it('moves inside the image only', () => {
    expect(moveRect({ x: 90, y: 5, width: 8, height: 10 }, 10, -10)).toEqual({ x: 92, y: 0, width: 8, height: 10 })
  })
  it('resizes from a corner keeping the opposite corner fixed, never below the minimum', () => {
    const r = { x: 10, y: 10, width: 20, height: 20 }
    expect(resizeRect(r, 'se', { x: 50, y: 40 })).toEqual({ x: 10, y: 10, width: 40, height: 30 })
    expect(resizeRect(r, 'nw', { x: 0, y: 5 })).toEqual({ x: 0, y: 5, width: 30, height: 25 })
    const tiny = resizeRect(r, 'se', { x: 10.5, y: 10.2 })
    expect(tiny.width).toBeGreaterThanOrEqual(2); expect(tiny.height).toBeGreaterThanOrEqual(2)
  })
  it('validates usable boxes', () => {
    expect(isUsable({ x: 0, y: 0, width: 1, height: 10 })).toBe(false)
    expect(isUsable({ x: 95, y: 0, width: 10, height: 10 })).toBe(false)
    expect(isUsable({ x: 5, y: 5, width: 10, height: 10 })).toBe(true)
  })
  it('hit-tests like the server: smallest containing box wins, with tolerance', () => {
    const big = { id: 'big', x: 0, y: 0, width: 50, height: 50 }, small = { id: 'small', x: 10, y: 10, width: 5, height: 5 }
    expect(hitTest([big, small], { x: 12, y: 12 })?.id).toBe('small')
    expect(hitTest([big, small], { x: 40, y: 40 })?.id).toBe('big')
    expect(hitTest([small], { x: 16, y: 16 })?.id).toBe('small')
    expect(hitTest([small], { x: 30, y: 30 })).toBeNull()
  })
  it('reports meaningful overlaps only', () => {
    const a = { id: 'a', x: 0, y: 0, width: 10, height: 10 }, b = { id: 'b', x: 9, y: 9, width: 10, height: 10 }, c = { id: 'c', x: 5, y: 5, width: 10, height: 10 }
    expect(overlaps([a, b])).toEqual([])
    expect(overlaps([a, c])).toEqual([['a', 'c']])
  })
})
