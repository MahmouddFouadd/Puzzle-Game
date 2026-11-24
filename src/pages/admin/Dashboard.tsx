import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n, type Key } from '../../lib/i18n'

interface Stats {
  total_stories: number; published_stories: number; draft_stories: number; active_rooms: number
  total_users: number; total_teams: number; completed_games: number
  recent_activity: { id: number; action: string; created_at: string }[]
}

const tiles: { field: keyof Omit<Stats, 'recent_activity'>; key: Key }[] = [
  { field: 'total_stories', key: 'totalStories' }, { field: 'published_stories', key: 'publishedStories' },
  { field: 'draft_stories', key: 'draftStories' }, { field: 'active_rooms', key: 'activeRooms' },
  { field: 'total_users', key: 'totalUsers' }, { field: 'total_teams', key: 'totalTeams' },
  { field: 'completed_games', key: 'completedGames' }
]

export default function Dashboard() {
  const { t } = useI18n()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_dashboard_stats').then(({ data, error: err }) => {
      if (err || !data) setError(true); else setStats(data as Stats)
    })
  }, [])

  if (error) return <p role="alert" className="text-danger">{t('loadFailed')}</p>
  if (!stats) return <p role="status">{t('loading')}</p>

  return (
    <div className="space-y-6">
      <h2 className="font-display text-3xl">{t('dashboard')}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((x) => (
          <div key={x.field} className="card">
            <div className="text-3xl font-bold text-gold-400">{stats[x.field]}</div>
            <div className="text-sm opacity-80">{t(x.key)}</div>
          </div>
        ))}
      </div>
      <section className="card">
        <h3 className="font-semibold mb-2">{t('recentActivity')}</h3>
        {stats.recent_activity.length === 0 ? <p className="opacity-70">{t('noActivity')}</p> : (
          <ul className="space-y-1">
            {stats.recent_activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-sm">
                <span>{a.action}</span><time className="opacity-60">{new Date(a.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
