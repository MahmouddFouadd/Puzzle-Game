export type DetectiveQuestionType =
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_SELECT'
  | 'TRUE_FALSE'
  | 'SHORT_TEXT'
  | 'EVIDENCE_IDENTIFICATION'
  | 'EVIDENCE_COMPARISON'
  | 'EVIDENCE_RELATIONSHIP'
  | 'EVENT_ORDERING'
  | 'SUSPECT_SELECTION'
  | 'CONTRADICTION_IDENTIFICATION'
  | 'CONFIDENCE'
  | 'FINAL_CONCLUSION'

export type EvidenceState = 'HIDDEN' | 'LOCKED' | 'AVAILABLE' | 'DISCOVERED' | 'INSPECTED' | 'ANALYZED'
export type ReasoningConfidence = 'FACT' | 'INFERENCE' | 'PROBABILITY' | 'ASSUMPTION'

export interface UnlockRule {
  requiredEvidenceIds?: string[]
  requiredQuestionIds?: string[]
  requiredStageIds?: string[]
  minimumDiscoveries?: number
  manual?: boolean
}

export interface EvidenceProgress {
  id: string
  state: EvidenceState
}

export interface DetectiveQuestion {
  id: string
  type: DetectiveQuestionType
  points: number
  penalty: number
  answerKey?: unknown
  acceptedAlternatives?: unknown[]
  unlockRule?: UnlockRule
}

export interface SubmissionEvaluation {
  correct: boolean
  points: number
  reason: 'CORRECT' | 'WRONG' | 'LOCKED' | 'ALREADY_SUBMITTED'
}

export function isUnlocked(rule: UnlockRule | null | undefined, context: {
  evidence: ReadonlySet<string>
  questions: ReadonlySet<string>
  stages: ReadonlySet<string>
  discoveryCount: number
  manualUnlocks?: ReadonlySet<string>
}, resourceId?: string): boolean {
  if (!rule) return true
  if (rule.manual && (!resourceId || !context.manualUnlocks?.has(resourceId))) return false
  if ((rule.requiredEvidenceIds ?? []).some((id) => !context.evidence.has(id))) return false
  if ((rule.requiredQuestionIds ?? []).some((id) => !context.questions.has(id))) return false
  if ((rule.requiredStageIds ?? []).some((id) => !context.stages.has(id))) return false
  if (rule.minimumDiscoveries !== undefined && context.discoveryCount < rule.minimumDiscoveries) return false
  return true
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function matchesAnswer(answer: unknown, key: unknown, alternatives: readonly unknown[]): boolean {
  if (Array.isArray(key)) {
    const actual = Array.isArray(answer) ? answer.map(normalized).sort() : [normalized(answer)]
    const expected = key.map(normalized).sort()
    return actual.length === expected.length && actual.every((value, index) => value === expected[index])
  }
  const candidate = normalized(answer)
  return [key, ...alternatives].some((accepted) => normalized(accepted) === candidate)
}

export function evaluateSubmission(question: DetectiveQuestion, answer: unknown, context: {
  unlocked: boolean
  submittedQuestionIds: ReadonlySet<string>
}): SubmissionEvaluation {
  if (!context.unlocked) return { correct: false, points: 0, reason: 'LOCKED' }
  if (context.submittedQuestionIds.has(question.id)) return { correct: false, points: 0, reason: 'ALREADY_SUBMITTED' }
  const correct = matchesAnswer(answer, question.answerKey, question.acceptedAlternatives ?? [])
  return { correct, points: correct ? question.points : question.penalty, reason: correct ? 'CORRECT' : 'WRONG' }
}
