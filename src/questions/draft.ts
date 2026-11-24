import type { QuestionDraft, QuestionRow } from './types'

export function emptyDraft(language: 'en' | 'ar'): QuestionDraft {
  return {
    text: '', type: 'MULTIPLE_CHOICE', options: [{ text: '', correct: true }, { text: '', correct: false }], tfAnswer: 'true',
    answers: [''], explanation: '', hint: '', difficulty: 1, language, published: false
  }
}

export function draftFromRow(r: QuestionRow): QuestionDraft {
  const opts = [...r.question_options].sort((a, b) => a.position - b.position)
  const correctIds = new Set(r.accepted_answers.map((a) => a.option_id).filter(Boolean))
  const primaryFirst = [...r.accepted_answers].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  return {
    id: r.id, text: r.text, type: r.type,
    options: r.type === 'MULTIPLE_CHOICE' ? opts.map((o) => ({ text: o.text, correct: correctIds.has(o.id) })) : emptyDraft(r.language).options,
    tfAnswer: r.type === 'TRUE_FALSE' && r.accepted_answers[0]?.answer_text === 'false' ? 'false' : 'true',
    answers: r.type === 'SHORT_TEXT' ? primaryFirst.map((a) => a.answer_text) : [''],
    explanation: r.explanation ?? '', hint: r.hint ?? '', difficulty: r.difficulty, language: r.language, published: r.published
  }
}

/** Client-side validation mirrors the database rules; the database remains the authority. Returns null when valid. */
export function draftProblem(d: QuestionDraft): 'text' | 'options' | 'correct' | 'answers' | null {
  if (!d.text.trim()) return 'text'
  if (d.type === 'MULTIPLE_CHOICE') {
    if (d.options.length < 2 || d.options.length > 8 || d.options.some((o) => !o.text.trim())) return 'options'
    if (d.options.filter((o) => o.correct).length !== 1) return 'correct'
  }
  if (d.type === 'SHORT_TEXT' && d.answers.filter((a) => a.trim()).length < 1) return 'answers'
  return null
}

export function draftPayload(d: QuestionDraft): Record<string, unknown> {
  return {
    text: d.text.trim(), type: d.type, explanation: d.explanation.trim(), hint: d.hint.trim(), difficulty: d.difficulty,
    language: d.language, published: d.published,
    options: d.type === 'MULTIPLE_CHOICE' ? d.options.map((o) => ({ text: o.text.trim(), correct: o.correct })) : [],
    answers: d.type === 'TRUE_FALSE' ? [d.tfAnswer] : d.type === 'SHORT_TEXT' ? d.answers.map((a) => a.trim()).filter(Boolean) : []
  }
}
