import { supabase } from '../lib/supabase'

export type BakasaStatus = 'LOBBY' | 'REVEAL' | 'DISCUSSION' | 'VOTING' | 'GUESS' | 'RESULT' | 'FINISHED' | 'CLOSED'

export interface BakasaSettings {
  spies: number; rounds: number; reveal_seconds: number; turn_seconds: number; clue_laps: number
  discussion_seconds: number; voting_seconds: number; guess_seconds: number; final_guess: boolean
  tie_rule: 'REVOTE' | 'SPY_WINS'; allow_vote_change: boolean; category_ids: string[]; min_players: number; max_players: number
}
export const DEFAULT_SETTINGS: BakasaSettings = {
  spies: 1, rounds: 3, reveal_seconds: 15, turn_seconds: 45, clue_laps: 2, discussion_seconds: 300, voting_seconds: 60,
  guess_seconds: 30, final_guess: true, tie_rule: 'REVOTE', allow_vote_change: true, category_ids: [], min_players: 3, max_players: 12
}

export interface BakasaPlayer { user_id: string; nickname: string; avatar: string; seat: number; is_ready: boolean; status: 'ACTIVE' | 'LEFT'; score: number; online: boolean }
export interface BakasaMessage { id: number; user_id: string; body: string; at: string }
export interface BakasaReveal {
  spy_ids: string[]; word_ar: string; word_en: string; accused: string | null; spy_caught: boolean | null
  guess_ar: string | null; guess_en: string | null; guess_correct: boolean | null; winner: 'PLAYERS' | 'SPY' | 'ABANDONED'
  votes: Record<string, number>; score_deltas: Record<string, number>; duration_seconds: number
}
export interface BakasaRound {
  id: string; round_no: number; turn_order: string[]; revote: number; category_ar: string; category_en: string; emoji: string; color: string
  current_turn: string | null; in_round: boolean; accused: string | null; messages: BakasaMessage[]
  votes_cast: number; voters_total: number; my_vote: string | null; reveal: BakasaReveal | null
}
export interface BakasaState {
  me: string; server_now: string
  room: { id: string; code: string; name: string; host_id: string; status: BakasaStatus; settings: BakasaSettings; round_no: number
    phase_ends_at: string | null; turn_ends_at: string | null; notice: string | null; version: number }
  players: BakasaPlayer[]
  round: BakasaRound | null
}
export interface BakasaRole { in_round: boolean; is_spy?: boolean; word_ar?: string; word_en?: string; category_ar?: string; category_en?: string; emoji?: string; color?: string }
export interface BakasaCategory { id: string; key: string; name_ar: string; name_en: string; emoji: string; color: string; position: number; active: boolean }
export interface WordOption { id: string; word_ar: string; word_en: string }
export interface LocalDeck { category_ar: string; category_en: string; emoji: string; color: string; word_id: string; word_ar: string; word_en: string; options: WordOption[] }
export interface HistoryRow { room_id: string; name: string; code: string; created_at: string; status: string; rounds: number; players: number; my_score: number; winner: string; top_score: number; spy_wins: number; player_wins: number }

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const listCategories = async (): Promise<BakasaCategory[]> => {
  const { data, error } = await supabase.from('bakasa_categories').select('*').eq('active', true).order('position')
  if (error) throw new Error(error.message)
  return (data ?? []) as BakasaCategory[]
}
export const createRoom = (name: string, nickname: string, avatar: string, settings: BakasaSettings) =>
  rpc<{ room_id: string; code: string }>('bakasa_create_room', { p_name: name, p_nickname: nickname, p_avatar: avatar, p_settings: settings })
export const previewRoom = (code: string) => rpc<{ found: boolean; room_id?: string; name?: string; status?: BakasaStatus; host?: string; players?: number; max_players?: number; already_member?: boolean }>('bakasa_preview_room', { p_code: code })
export const joinRoom = (code: string, nickname: string, avatar: string) => rpc<{ status: string; room_id?: string }>('bakasa_join_room', { p_code: code, p_nickname: nickname, p_avatar: avatar })
export const loadState = (room: string) => rpc<BakasaState>('bakasa_state', { p_room: room })
export const myRole = (room: string) => rpc<BakasaRole>('bakasa_my_role', { p_room: room })
export const setReady = (room: string, ready: boolean) => rpc<void>('bakasa_set_ready', { p_room: room, p_ready: ready })
export const setAvatar = (room: string, avatar: string) => rpc<void>('bakasa_set_avatar', { p_room: room, p_avatar: avatar })
export const updateSettings = (room: string, name: string, settings: BakasaSettings) => rpc<BakasaSettings>('bakasa_update_settings', { p_room: room, p_name: name, p_settings: settings })
export const transferHost = (room: string, user: string) => rpc<void>('bakasa_transfer_host', { p_room: room, p_user: user })
export const kickPlayer = (room: string, user: string) => rpc<void>('bakasa_kick', { p_room: room, p_user: user })
export const leaveRoom = (room: string) => rpc<void>('bakasa_leave_room', { p_room: room })
export const startRound = (room: string) => rpc<void>('bakasa_start_round', { p_room: room })
export const advance = (room: string, force = false) => rpc<void>('bakasa_advance', { p_room: room, p_force: force })
export const skipTurn = (room: string) => rpc<void>('bakasa_skip_turn', { p_room: room })
export const postClue = (room: string, body: string) => rpc<void>('bakasa_post_clue', { p_room: room, p_body: body })
export const castVote = (room: string, suspect: string) => rpc<void>('bakasa_vote', { p_room: room, p_suspect: suspect })
export const guessOptions = (room: string) => rpc<WordOption[]>('bakasa_guess_options', { p_room: room })
export const spyGuess = (room: string, word: string) => rpc<{ correct: boolean }>('bakasa_spy_guess', { p_room: room, p_word: word })
export const rematch = (room: string) => rpc<void>('bakasa_rematch', { p_room: room })
export const myHistory = () => rpc<HistoryRow[]>('bakasa_my_history')
export const localDeck = (category: string | null) => rpc<LocalDeck>('bakasa_local_deck', { p_category: category })

/** Arabic/English message for a server error code. */
export function bakasaError(e: unknown, ar: boolean): string {
  const m = e instanceof Error ? e.message : String(e)
  const table: Record<string, [string, string]> = {
    not_enough_players: ['محتاجين 3 لاعبين على الأقل عشان نبدأ.', 'At least 3 players are needed to start.'],
    players_not_ready: ['فيه لاعبين لسه مش جاهزين.', 'Some players are not ready yet.'],
    no_words_available: ['مفيش كلمات متاحة في الفئات المختارة. اختار فئة تانية.', 'No words in the selected categories. Pick another category.'],
    not_your_turn: ['مش دورك دلوقتي.', 'It is not your turn.'],
    wrong_phase: ['المرحلة اتغيرت. استنى ثانية.', 'The phase has changed. One moment.'],
    cannot_vote_self: ['مينفعش تصوّت لنفسك!', 'You cannot vote for yourself!'],
    already_voted: ['انت صوّت خلاص.', 'You already voted.'],
    round_in_progress: ['فيه جولة شغالة دلوقتي.', 'A round is in progress.'],
    match_finished: ['المباراة خلصت. ابدأ مباراة جديدة.', 'The match is over. Start a rematch.'],
    forbidden: ['الإجراء ده للمضيف بس.', 'Only the host can do that.'],
    invalid_nickname: ['اكتب اسم من 1 لـ 30 حرف.', 'Enter a name of 1–30 characters.'],
    not_member: ['انت مش في الغرفة دي.', 'You are not in this room.'],
    unauthorized: ['لازم تدخل باسمك الأول.', 'Please enter your name first.']
  }
  for (const [code, [a, en]] of Object.entries(table)) if (m.includes(code)) return ar ? a : en
  if (/fetch|network/i.test(m)) return ar ? 'مشكلة في الاتصال. جرّب تاني.' : 'Connection problem. Try again.'
  return ar ? 'حصلت مشكلة غير متوقعة. جرّب تاني.' : 'Something went wrong. Please try again.'
}
