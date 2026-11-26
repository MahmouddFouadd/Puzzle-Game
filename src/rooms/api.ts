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

// ---------- player-hosted rooms: title-only story cards ----------
export type StoryCard = { id: string; title: string; language: 'en' | 'ar'; cover_url: string | null }
export const listSelectableStories = () => rpc<StoryCard[]>('list_selectable_stories', {})
export const playerCreateRoom = (story: string, name: string, teams: number) => rpc<{ id: string; code: string }>('player_create_room', { p_story: story, p_name: name, p_team_count: teams })
export const playerSetRoomStory = (room: string, story: string) => rpc<{ title: string }>('player_set_room_story', { p_room: room, p_story: story })
export const setStoryPlayerSelectable = (story: string, enabled: boolean) => rpc<void>('set_story_player_selectable', { p_story: story, p_enabled: enabled })
export async function storyAvailability(): Promise<Record<string, boolean>> {
  const r = await supabase.from('story_player_availability').select('story_id,enabled')
  if (r.error) throw new Error(r.error.message)
  return Object.fromEntries((r.data ?? []).map((x) => [x.story_id as string, !!x.enabled]))
}
/** Error codes from the player-room RPCs as Arabic/English text. */
export function hostError(e: unknown, ar: boolean): string {
  const m = e instanceof Error ? e.message : String(e)
  const t: Record<string, [string, string]> = {
    story_not_available: ['القصة دي مش متاحة دلوقتي. اختار قصة تانية.', 'That story is not available. Pick another one.'],
    too_many_open_rooms: ['عندك ٣ غرف مفتوحة بالفعل. اقفل واحدة الأول.', 'You already have 3 open rooms. Close one first.'],
    story_too_small: ['القصة دي صورها أقل من عدد الفرق الموجودة.', 'This story has fewer pictures than the teams in the room.'],
    room_locked: ['اللعبة بدأت، مينفعش تغيّر القصة.', 'The game has started; the story is locked.'],
    invalid_team_count: ['عدد الفرق مش مناسب للقصة دي.', 'That team count does not fit this story.'],
    invalid_name: ['اكتب اسم من ١ لـ ٤٠ حرف.', 'Enter a name of 1–40 characters.'],
    teams_not_ready: ['لسه فيه فرق مش جاهزة.', 'Some teams are not ready yet.'],
    not_enough_teams: ['محتاجين فريقين على الأقل.', 'At least two teams are needed.'],
    teams_without_image: ['كل فريق لازم يختار صورة.', 'Every team must pick a picture.'],
    empty_team: ['فيه فريق فاضي.', 'A team has no players.'],
    forbidden: ['مش مسموح لك بالخطوة دي.', 'You are not allowed to do that.']
  }
  for (const [code, [a, b]] of Object.entries(t)) if (m.includes(code)) return ar ? a : b
  return ar ? 'حصلت مشكلة. جرّب تاني.' : 'Something went wrong. Please try again.'
}
