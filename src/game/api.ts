import { supabase } from '../lib/supabase'
import type { AnswerResult, DecisionResult, DrawResult, LeaderRow, TeamState } from './types'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}
// Every critical action carries an idempotency key: a retry with the same key returns the original result.
export const drawCard = (team: string, key: string) => rpc<DrawResult>('draw_card', { p_team: team, p_key: key })
export const drawRescueCard = (team: string, key: string) => rpc<DrawResult>('draw_rescue_card', { p_team: team, p_key: key })
export const submitAnswer = (draw: string, answer: string | null, option: string | null, key: string) =>
  rpc<AnswerResult>('submit_answer', { p_draw: draw, p_answer: answer, p_option: option, p_key: key })
export const decideCard = (draw: string, decision: 'PLACE' | 'DISCARD', key: string) => rpc<DecisionResult>('decide_card', { p_draw: draw, p_decision: decision, p_key: key })
export const getTeamState = (team: string) => rpc<TeamState>('get_team_state', { p_team: team })
export const getLeaderboard = (room: string) => rpc<LeaderRow[]>('get_leaderboard', { p_room: room })
export const heartbeat = (room: string) => rpc<{ team: string | null; captain?: string | null }>('heartbeat', { p_room: room })
export const setTeamState = (team: string, state: 'ABANDONED' | 'DISQUALIFIED' | 'ACTIVE', reason: string) => rpc<void>('set_team_state', { p_team: team, p_state: state, p_reason: reason })
export const adjustScore = (team: string, delta: number, reason: string) => rpc<number>('adjust_score', { p_team: team, p_delta: delta, p_reason: reason })

export async function signedPieceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('story-pieces').createSignedUrl(path, 3600)
  if (error || !data) throw new Error(error?.message ?? 'signed url failed')
  return data.signedUrl
}
