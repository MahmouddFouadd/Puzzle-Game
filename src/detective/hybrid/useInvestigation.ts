import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadInvestigation, type Investigation } from '../api'

export type SyncState = 'live' | 'polling' | 'offline'

/**
 * Hybrid investigation layers (lab, interrogation, accusation) for a session.
 * - `inv === null` with `classic === true` means the case (or the server) has no hybrid layers: the classic flow is used unchanged.
 * - Never throws into the UI: errors become `error` and the last good data is kept (recovery on the next refresh).
 */
export function useInvestigation(sessionId: string | undefined) {
  const [inv, setInv] = useState<Investigation | null>(null)
  const [classic, setClassic] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (!sessionId) return null
    try {
      const d = await loadInvestigation(sessionId)
      setInv(d); setError(null); setClassic(false)
      return d
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      // the server predates the hybrid layers → behave exactly like before
      if (/get_detective_investigation|function .* does not exist|PGRST202|schema cache/i.test(m)) setClassic(true)
      else setError(e)
      return null
    } finally { setLoading(false) }
  }, [sessionId])
  useEffect(() => { void load() }, [load])
  const hybrid = !!inv && (inv.settings.stages.length > 0 || inv.lab.length > 0 || !!inv.verdict)
  return { inv, hybrid, classic, error, loading, reload: load }
}

/**
 * Live team sync: listens on the private topic detective:<session> for "changed" pings (sent by database triggers,
 * no game data inside) and calls `onChange`, debounced. Falls back to polling every `pollMs` while not connected,
 * and slows polling to a safety net while live. Reconnects with backoff after errors or when the network returns.
 */
export function useDetectiveLive(sessionId: string | undefined, onChange: () => void, pollMs = 4000) {
  const [state, setState] = useState<SyncState>('polling')
  const cb = useRef(onChange); cb.current = onChange
  const timer = useRef<number>()
  const fire = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => cb.current(), 250) }, [])

  useEffect(() => {
    if (!sessionId) return
    let closed = false, retry = 0, retryTimer: number | undefined
    let ch: ReturnType<typeof supabase.channel> | null = null
    const open = async () => {
      if (closed) return
      try { await supabase.realtime.setAuth() } catch { /* anonymous fallback; polling still works */ }
      ch = supabase.channel(`detective:${sessionId}`, { config: { private: true } })
      ch.on('broadcast', { event: 'changed' }, () => fire())
      ch.subscribe((status) => {
        if (closed) return
        if (status === 'SUBSCRIBED') { retry = 0; setState('live'); fire() }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setState(navigator.onLine ? 'polling' : 'offline')
          const old = ch; ch = null
          if (old) void supabase.removeChannel(old)
          retry = Math.min(retry + 1, 6)
          window.clearTimeout(retryTimer)
          retryTimer = window.setTimeout(() => void open(), 1000 * 2 ** retry)
        }
      })
    }
    void open()
    const online = () => { setState('polling'); fire(); if (!ch) { window.clearTimeout(retryTimer); void open() } }
    const offline = () => setState('offline')
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    return () => {
      closed = true; window.clearTimeout(retryTimer); window.clearTimeout(timer.current)
      window.removeEventListener('online', online); window.removeEventListener('offline', offline)
      if (ch) void supabase.removeChannel(ch)
    }
  }, [sessionId, fire])

  // polling: fast while not live, slow safety net while live
  useEffect(() => {
    if (!sessionId) return
    const id = window.setInterval(() => cb.current(), state === 'live' ? pollMs * 5 : pollMs)
    return () => window.clearInterval(id)
  }, [sessionId, state, pollMs])
  return state
}
