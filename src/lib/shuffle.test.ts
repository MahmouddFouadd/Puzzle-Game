import { describe, expect, it } from 'vitest'
import { seededShuffle } from './shuffle'

describe('seededShuffle', () => {
  const opts = ['a', 'b', 'c', 'd']
  it('is stable for a seed and keeps every option', () => {
    expect(seededShuffle(opts, 's1:q1')).toEqual(seededShuffle(opts, 's1:q1'))
    expect([...seededShuffle(opts, 's1:q1')].sort()).toEqual(opts)
  })
  it('does not leave the first option on top for most questions', () => {
    const firstStays = Array.from({ length: 400 }, (_, i) => seededShuffle(opts, `session:${i}`)[0] === 'a').filter(Boolean).length
    expect(firstStays).toBeGreaterThan(60)   // about 1 in 4, like a fair shuffle
    expect(firstStays).toBeLessThan(140)
  })
  it('does not mutate the input', () => { const a = [...opts]; seededShuffle(a, 'x'); expect(a).toEqual(opts) })
})
