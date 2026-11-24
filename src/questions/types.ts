export type QType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT'
export interface QuestionRow {
  id: string; story_id: string; text: string; type: QType; explanation: string | null; hint: string | null
  difficulty: number; language: 'en' | 'ar'; published: boolean
  question_options: { id: string; position: number; text: string }[]
  accepted_answers: { id: string; answer_text: string; option_id: string | null; is_primary: boolean }[]
}
export interface QuestionDraft {
  id?: string; text: string; type: QType; options: { text: string; correct: boolean }[]; tfAnswer: 'true' | 'false'
  answers: string[]; explanation: string; hint: string; difficulty: number; language: 'en' | 'ar'; published: boolean
}
export interface Piece { id: string; image_id: string; row_idx: number; col_idx: number }
export interface Mapping { question_id: string; piece_id: string; suggested_by_system: boolean; approved: boolean }
export interface Issue { code: string; image?: string; count?: number }
export interface Validation { errors: Issue[]; warnings: Issue[] }
