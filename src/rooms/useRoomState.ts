import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadRoomState } from './api'
import type { RoomState } from './types'

/** Loads the room and keeps it fresh: realtime change events, plus a 5 s poll as a safety net (e.g. after reconnects). */
export function useRoomState(roomId: string | undefined) {
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState<unknown>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (!roomId || busy.current) return
    busy.current = true
    try { setState(await loadRoomState(roomId)); setError(null) } catch (e) { setError(e) } finally { busy.current = false }
  }, [roomId])

  useEffect(() => {
    if (!roomId) return
    void reload()
    const ch = supabase.channel(`room-${roomId}`)
    const watch: [string, string][] = [['rooms', `id=eq.${roomId}`], ['teams', `room_id=eq.${roomId}`], ['team_members', `room_id=eq.${roomId}`],
      ['room_members', `room_id=eq.${roomId}`], ['team_image_assignments', `room_id=eq.${roomId}`]]
    for (const [table, filter] of watch) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => { void reload() })
    ch.subscribe()
    const timer = window.setInterval(() => { void reload() }, 5000)
    return () => { window.clearInterval(timer); void supabase.removeChannel(ch) }
  }, [roomId, reload])

  return { state, error, reload }
}
