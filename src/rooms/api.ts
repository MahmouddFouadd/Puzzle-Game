import { supabase } from '../lib/supabase'
import type { CreateRoomInput, JoinResult, RoomRow, RoomState } from './types'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}
function rows<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message)
  return r.data ?? []
}

export async function listRooms(): Promise<RoomRow[]> {
  return rows(await supabase.from('rooms').select('*').order('created_at', { ascending: false })) as RoomRow[]
}
export async function loadRoomState(roomId: string): Promise<RoomState> {
  const [room, teams, teamMembers, roomMembers, assignments] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('teams').select('*').eq('room_id', roomId).order('name'),
    supabase.from('team_members').select('*').eq('room_id', roomId).order('joined_at'),
    supabase.from('room_members').select('*').eq('room_id', roomId),
    supabase.from('team_image_assignments').select('*').eq('room_id', roomId)
  ])
  if (room.error) throw new Error(room.error.message)
  return {
    room: (room.data as RoomRow | null) ?? null, teams: rows(teams) as RoomState['teams'], teamMembers: rows(teamMembers) as RoomState['teamMembers'],
    roomMembers: rows(roomMembers) as RoomState['roomMembers'], assignments: rows(assignments) as RoomState['assignments']
  }
}

export const createRoom = (i: CreateRoomInput) => rpc<{ id: string; code: string }>('create_room', {
  p_story: i.story, p_max_teams: i.maxTeams, p_max_members: i.maxMembers, p_private: i.isPrivate, p_pin: i.pin,
  p_admin_joining: i.adminJoining, p_players_create_teams: i.playersCreateTeams, p_team_names: i.teamNames
})
export const previewRoom = (code: string) => rpc<{ found: boolean; status?: string; needs_pin?: boolean; language?: string; title?: string | null }>('room_preview', { p_code: code })
export const joinRoom = (code: string, pin: string | null, name: string) => rpc<JoinResult>('join_room', { p_code: code, p_pin: pin, p_name: name })
export const resolveMember = (room: string, user: string, approve: boolean) => rpc<void>('resolve_member', { p_room: room, p_user: user, p_approve: approve })
export const createTeam = (room: string, name: string) => rpc<string>('create_team', { p_room: room, p_name: name })
export const joinTeam = (team: string) => rpc<void>('join_team', { p_team: team })
export const leaveTeam = (team: string) => rpc<void>('leave_team', { p_team: team })
export const setTeamCaptain = (team: string, user: string) => rpc<void>('set_team_captain', { p_team: team, p_user: user })
export const selectImage = (team: string, image: string) => rpc<void>('select_image', { p_team: team, p_image: image })
export const setTeamReady = (team: string, ready: boolean) => rpc<void>('set_team_ready', { p_team: team, p_ready: ready })
export const startGame = (room: string, override: boolean) => rpc<void>('start_game', { p_room: room, p_override: override })
export const advanceRoom = (room: string) => rpc<string>('advance_room', { p_room: room })
export const setRoomStatus = (room: string, action: 'pause' | 'resume' | 'end' | 'cancel') => rpc<void>('set_room_status', { p_room: room, p_action: action })
export const removePlayer = (room: string, user: string) => rpc<void>('remove_player', { p_room: room, p_user: user })
