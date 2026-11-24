import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'CONTENT_EDITOR' | 'PLAYER'
type UserRow = { id: string; display_name: string; email: string | null; preferred_language: string; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; games_joined: number; roles: Role[] }
const roles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'PLAYER']
const date = (value: string | null) => value ? new Date(value).toLocaleString() : '—'

export default function Users() {
  const { t } = useI18n()
  const [rows, setRows] = useState<UserRow[]>([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error: err } = await supabase.rpc('admin_list_users', { p_search: query || null, p_role: role || null })
    if (err) setError(t('usersLoadError')); else setRows((data ?? []) as UserRow[])
    setLoading(false)
  }, [query, role, t])
  useEffect(() => { const id = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(id) }, [load])
  const changeRole = async (user: UserRow, selected: Role) => {
    const enabled = !user.roles.includes(selected)
    const { error: err } = await supabase.rpc('admin_set_user_role', { p_user: user.id, p_role: selected, p_enabled: enabled })
    if (err) { setError(t('roleError')); return }
    setRows((items) => items.map((item) => item.id === user.id ? { ...item, roles: enabled ? [...new Set([...item.roles, selected])] : item.roles.filter((r) => r !== selected) } : item))
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-3xl">{t('users')}</h2><p className="opacity-70">{rows.length} {t('users')}</p></div><button className="btn-ghost" onClick={() => void load()}>{t('refreshData')}</button></div>
    <div className="card grid gap-3 md:grid-cols-[1fr_220px]"><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchUsers')} /><select className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="">{t('allRoles')}</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {loading ? <p role="status">{t('loading')}</p> : rows.length === 0 ? <div className="card opacity-70">{t('noUsers')}</div> : <div className="grid gap-3">{rows.map((user) => <article className="card" key={user.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{user.display_name}</h3><p className="text-sm opacity-75">{user.email ?? '—'} · {user.email_confirmed_at ? t('verified') : t('unverified')}</p></div><span className="text-sm opacity-70">{user.preferred_language.toUpperCase()}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div><dt className="opacity-60">{t('joined')}</dt><dd>{date(user.created_at)}</dd></div><div><dt className="opacity-60">{t('lastSeen')}</dt><dd>{date(user.last_sign_in_at)}</dd></div><div><dt className="opacity-60">{t('gamesJoined')}</dt><dd>{user.games_joined}</dd></div><div><dt className="opacity-60">{t('roles')}</dt><dd>{user.roles.join(', ') || 'PLAYER'}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2">{roles.map((r) => <button key={r} type="button" className={user.roles.includes(r) ? 'btn-primary' : 'btn-ghost'} onClick={() => void changeRole(user, r)} title={user.roles.includes(r) ? t('revokeRole') : t('grantRole')}>{r}</button>)}</div></article>)}</div>}
  </div>
}
