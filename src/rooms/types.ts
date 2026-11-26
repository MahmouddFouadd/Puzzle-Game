export type RoomStatus = 'WAITING' | 'READY' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'FINISHED' | 'CANCELLED'
export interface SnapshotImage { id: string; position: number; hint: string | null; piece_count: number }
export interface RoomRow {
  id: string; code: string; story_id: string; status: RoomStatus; is_private: boolean; has_pin: boolean
  admin_controlled_joining: boolean; players_can_create_teams: boolean; max_teams: number; max_team_members: number
  settings_snapshot: { story: { id: string; title: string; language: 'en' | 'ar' }; images: SnapshotImage[] }
  countdown_ends_at: string | null; started_at: string | null; finished_at: string | null; created_at: string
  player_hosted?: boolean; created_by?: string | null
}
export interface TeamRow { id: string; room_id: string; name: string; is_ready: boolean; captain_user_id: string | null }
export interface TeamMemberRow { team_id: string; user_id: string; room_id: string; joined_at: string }
export interface RoomMemberRow { room_id: string; user_id: string; display_name: string; status: 'PENDING' | 'ACTIVE' | 'REJECTED' }
export interface AssignmentRow { room_id: string; image_id: string; team_id: string }
export interface RoomState {
  room: RoomRow | null; teams: TeamRow[]; teamMembers: TeamMemberRow[]; roomMembers: RoomMemberRow[]; assignments: AssignmentRow[]
}
export interface JoinResult { status: 'joined' | 'pending' | 'rejected' | 'not_found' | 'closed' | 'bad_pin' | 'too_many_attempts'; room_id?: string }
export interface CreateRoomInput {
  story: string; maxTeams: number; maxMembers: number; isPrivate: boolean; pin: string | null
  adminJoining: boolean; playersCreateTeams: boolean; teamNames: string[]
}
