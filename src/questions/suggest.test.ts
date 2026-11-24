import { describe, expect, it } from 'vitest'
import { suggestMappings, tokenize, type SugImage, type SugQuestion } from './suggest'
import { draftPayload, draftProblem, emptyDraft } from './draft'

const mk = (id: string, title: string, n: number): SugImage => ({ id, title, pieceIds: Array.from({ length: n }, (_, i) => `${id}-p${i}`) })
const q = (id: string, text: string): SugQuestion => ({ id, text })

describe('tokenize', () => {
  it('drops stop words and short tokens, handles Arabic prefix and diacritics', () => {
    expect([...tokenize('Which famous river passes through Cairo?')]).toEqual(['river', 'passes', 'through', 'cairo'])
    expect(tokenize('النِّيل').has('نيل')).toBe(true)
  })
})

describe('suggestMappings', () => {
  const images = [mk('cairo', 'Cairo', 4), mk('nile', 'The Nile River', 4)]
  const qs = [q('q1', 'Which river flows through the country?'), q('q2', 'What is the capital Cairo known for?'), q('q3', 'Random question about numbers')]

  it('prefers the image whose title matches the question', () => {
    const s = suggestMappings(qs, images, new Map(), false, 3)
    expect(s.find((x) => x.questionId === 'q1')?.pieceId.startsWith('nile')).toBe(true)
    expect(s.find((x) => x.questionId === 'q2')?.pieceId.startsWith('cairo')).toBe(true)
  })
  it('never puts two questions on one piece unless allowed', () => {
    const many = Array.from({ length: 8 }, (_, i) => q(`m${i}`, 'something about river or Cairo'))
    const s = suggestMappings(many, images, new Map(), false, 9)
    expect(new Set(s.map((x) => x.pieceId)).size).toBe(s.length)
    expect(s).toHaveLength(8)
  })
  it('skips questions when capacity is exhausted', () => {
    const many = Array.from({ length: 10 }, (_, i) => q(`m${i}`, 'text here'))
    expect(suggestMappings(many, images, new Map(), false, 1)).toHaveLength(8)
  })
  it('balances load when multiple questions per piece are allowed', () => {
    const many = Array.from({ length: 16 }, (_, i) => q(`m${i}`, 'text here'))
    const s = suggestMappings(many, images, new Map(), true, 1)
    expect(s).toHaveLength(16)
    const loads = new Map<string, number>(); s.forEach((x) => loads.set(x.pieceId, (loads.get(x.pieceId) ?? 0) + 1))
    expect(Math.max(...loads.values())).toBe(2)
  })
  it('keeps approved assignments and counts them as used', () => {
    const keep = new Map([['q1', 'nile-p0']])
    const s = suggestMappings(qs, images, keep, false, 2)
    expect(s.some((x) => x.questionId === 'q1')).toBe(false)
    expect(s.some((x) => x.pieceId === 'nile-p0')).toBe(false)
  })
  it('is deterministic for a seed', () => {
    expect(suggestMappings(qs, images, new Map(), false, 5)).toEqual(suggestMappings(qs, images, new Map(), false, 5))
  })
})

describe('draft validation', () => {
  it('flags problems the database would reject', () => {
    const d = emptyDraft('en')
    expect(draftProblem(d)).toBe('text')
    d.text = 'Q'; expect(draftProblem(d)).toBe('options')
    d.options = [{ text: 'A', correct: true }, { text: 'B', correct: true }]; expect(draftProblem(d)).toBe('correct')
    d.options[1].correct = false; expect(draftProblem(d)).toBeNull()
    d.type = 'SHORT_TEXT'; d.answers = ['  ']; expect(draftProblem(d)).toBe('answers')
  })
  it('builds a type-specific payload', () => {
    const d = emptyDraft('ar'); d.text = ' Q '; d.type = 'TRUE_FALSE'; d.tfAnswer = 'false'
    expect(draftPayload(d)).toMatchObject({ text: 'Q', type: 'TRUE_FALSE', options: [], answers: ['false'], language: 'ar' })
  })
})
