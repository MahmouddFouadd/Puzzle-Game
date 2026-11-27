import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { myHistory, type HistoryRow } from '../bakasa/api'
import { detectiveHistory, type DetectiveHistoryRow } from '../detective/api'
import { computeStats, mergeRecent, type PlayerStats, type RecentGame } from './recentGames'

export type RecentState = { status: 'loading' | 'guest' | 'ready' | 'error'; games: RecentGame[]; stats: PlayerStats | null }
/** Real history from the existing RPCs (bakasa_my_history, detective_my_history). Guests without a session get nothing, not fake rows. */
export function useRecentGames(): RecentState {
  const { session, loading } = useAuth()
  const [state, setState] = useState<RecentState>({ status: 'loading', games: [], stats: null })
  useEffect(() => {
    if (loading) return
    if (!session) { setState({ status: 'guest', games: [], stats: null }); return }
    let alive = true
    Promise.allSettled([myHistory(), detectiveHistory()]).then(([b, d]) => {
      if (!alive) return
      if (b.status === 'rejected' && d.status === 'rejected') { setState({ status: 'error', games: [], stats: null }); return }
      const bk: HistoryRow[] = b.status === 'fulfilled' ? b.value ?? [] : []
      const dt: DetectiveHistoryRow[] = d.status === 'fulfilled' ? d.value ?? [] : []
      setState({ status: 'ready', games: mergeRecent(bk, dt), stats: computeStats(bk, dt) })
    })
    return () => { alive = false }
  }, [session, loading])
  return state
}
