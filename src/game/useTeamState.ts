import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getLeaderboard, getTeamState, heartbeat } from './api'
import type { LeaderRow, TeamState } from './types'

/** Authoritative state comes from the database. Realtime events and a poll only trigger a refresh; a heartbeat keeps presence/failover alive. */
export function useTeamState(roomId: string, teamId: string) {
  const [state, setState] = useState<TeamState | null>(null)
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [error, setError] = useState<unknown>(null)
  const [online, setOnline] = useState(true)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const [s, b] = await Promise.all([getTeamState(teamId), getLeaderboard(roomId)])
      setState(s); setBoard(b); setError(null); setOnline(true)
    } catch (e) { setError(e); setOnline(false) } finally { busy.current = false }
  }, [roomId, teamId])

  useEffect(() => {
    void reload()
    const ch = supabase.channel(`game-${teamId}`)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` }, () => { void reload() })
    ch.subscribe()
    const poll = window.setInterval(() => { void reload() }, 4000)
    const beat = window.setInterval(() => { void heartbeat(roomId).catch(() => undefined) }, 10000)
    void heartbeat(roomId).catch(() => undefined)
    const onOnline = () => { void reload() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onOnline)
    return () => {
      window.clearInterval(poll); window.clearInterval(beat); window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onOnline); void supabase.removeChannel(ch)
    }
  }, [roomId, teamId, reload])

  return { state, board, error, online, reload }
}
