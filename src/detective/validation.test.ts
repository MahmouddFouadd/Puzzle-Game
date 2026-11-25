import { describe, expect, it } from 'vitest'
import { evaluateSubmission, isUnlocked } from './validation'

describe('detective unlock rules', () => {
  const base = { evidence: new Set<string>(), questions: new Set<string>(), stages: new Set<string>(), discoveryCount: 0 }

  it('keeps evidence locked until dependencies are satisfied', () => {
    expect(isUnlocked({ requiredEvidenceIds: ['e1'], minimumDiscoveries: 2 }, base, 'e2')).toBe(false)
    expect(isUnlocked({ requiredEvidenceIds: ['e1'], minimumDiscoveries: 2 }, { ...base, evidence: new Set(['e1']), discoveryCount: 2 }, 'e2')).toBe(true)
  })

  it('requires explicit manual unlocks for manual rules', () => {
    expect(isUnlocked({ manual: true }, base, 'e1')).toBe(false)
    expect(isUnlocked({ manual: true }, { ...base, manualUnlocks: new Set(['e1']) }, 'e1')).toBe(true)
  })
})

describe('detective answer evaluation', () => {
  const q = { id: 'q1', type: 'SHORT_TEXT' as const, points: 10, penalty: -10, answerKey: 'open door', acceptedAlternatives: ['the open door'] }

  it('accepts configured alternatives and applies configured points', () => {
    expect(evaluateSubmission(q, 'the open door', { unlocked: true, submittedQuestionIds: new Set() })).toEqual({ correct: true, points: 10, reason: 'CORRECT' })
    expect(evaluateSubmission(q, 'window', { unlocked: true, submittedQuestionIds: new Set() })).toEqual({ correct: false, points: -10, reason: 'WRONG' })
  })

  it('does not score locked or repeated submissions', () => {
    expect(evaluateSubmission(q, 'open door', { unlocked: false, submittedQuestionIds: new Set() }).reason).toBe('LOCKED')
    expect(evaluateSubmission(q, 'open door', { unlocked: true, submittedQuestionIds: new Set(['q1']) }).reason).toBe('ALREADY_SUBMITTED')
  })

  it('compares multiple-select answers as an order-independent set', () => {
    const multi = { id: 'q2', type: 'MULTIPLE_SELECT' as const, points: 15, penalty: -10, answerKey: ['door', 'key'] }
    expect(evaluateSubmission(multi, ['key', 'door'], { unlocked: true, submittedQuestionIds: new Set() }).correct).toBe(true)
    expect(evaluateSubmission(multi, ['door'], { unlocked: true, submittedQuestionIds: new Set() }).correct).toBe(false)
  })
})
