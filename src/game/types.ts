export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT'
export interface CardView {
  draw_id: string; state: 'DRAWN' | 'ANSWER_CORRECT'; kind: 'NORMAL' | 'RECYCLED' | 'RESCUE'; cycle: number; attempts: number
  drawn_at: string; time_limit_seconds: number | null
  question: { id: string; text: string; type: QuestionType; hint: string | null; options: { id: string; text: string }[] }
}
export interface PieceView { id: string; row: number; col: number; x: number; y: number; w: number; h: number; mask: string }
export interface TeamState {
  team: { id: string; name: string; state: 'ACTIVE' | 'COMPLETED' | 'ABANDONED' | 'DISQUALIFIED'; captain: string | null; score: number; rank: number | null; completed_at: string | null }
  room: { id: string; status: string }
  image: { id: string; position: number; width: number; height: number } | null
  progress: { revealed: number; total: number }
  pieces: PieceView[]
  card: CardView | null
  cards_left: number
  recovery: 'NONE' | 'RESCUE_AVAILABLE' | 'STUCK'
}
export interface LeaderRow { team: string; name: string; state: string; score: number; rank: number | null; completed_at: string | null; revealed: number; total: number }
export interface AnswerResult { correct: boolean; final: boolean; retry?: boolean; attempts_left?: number; timeout?: boolean; points?: number; explanation?: string | null; correct_answer?: string; score: number }
export interface DecisionResult { result: string; points: number; score: number; piece: PieceView | null; completed: boolean; rank: number | null }
export type DrawResult = { status: 'drawn'; card: CardView } | { status: 'deck_empty'; recovery: 'rescue' | 'none' }
