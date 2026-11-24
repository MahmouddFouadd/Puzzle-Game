import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { listStories } from '../../stories/api'
import { errorKey } from '../../stories/errors'
import type { Story } from '../../stories/types'
import { createRoom, listRooms } from '../../rooms/api'
import type { RoomRow } from '../../rooms/types'
import { teamNamesFromText } from '../../rooms/util'

export default function Rooms() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [rooms, setRooms] = useState<RoomRow[] | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ story: '', teams: 2, members: 4, isPrivate: false, pin: '', adminJoining: false, playersCreate: true, names: '' })
  const [imageCount, setImageCount] = useState(0)

  useEffect(() => {
    listRooms().then(setRooms).catch((e) => { setError(t(errorKey(e))); setRooms([]) })
    listStories().then((all) => {
      const pub = all.filter((s) => s.status === 'PUBLISHED')
      setStories(pub)
      if (pub[0]) setF((x) => ({ ...x, story: pub[0].id }))
    }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!f.story) return
    supabase.from('story_images').select('id', { count: 'exact', head: true }).eq('story_id', f.story).then(({ count }) => {
      const n = count ?? 0
      setImageCount(n)
      setF((x) => ({ ...x, teams: Math.min(Math.max(2, n), Math.max(2, x.teams > n ? n : x.teams)) }))
    })
  }, [f.story])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await createRoom({
        story: f.story, maxTeams: f.teams, maxMembers: f.members, isPrivate: f.isPrivate, pin: f.pin.trim() || null,
        adminJoining: f.adminJoining, playersCreateTeams: f.playersCreate, teamNames: teamNamesFromText(f.names)
      })
      nav(`/admin/rooms/${r.id}`)
    } catch (err) { setError(t(errorKey(err))); setBusy(false) }
  }
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="font-display text-3xl">{t('rooms')}</h2>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {stories.length === 0 ? <p className="opacity-70">{t('noPublishedStories')}</p> : (
        <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">{t('roomStory')}
            <select className="input mt-1" value={f.story} onChange={(e) => set('story', e.target.value)}>
              {stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          <label className="block">{t('maxTeams')}
            <input className="input mt-1" type="number" min={2} max={Math.max(2, imageCount)} value={f.teams} onChange={(e) => set('teams', Math.trunc(Number(e.target.value)) || 2)} />
          </label>
          <label className="block">{t('maxMembers')}
            <input className="input mt-1" type="number" min={1} max={12} value={f.members} onChange={(e) => set('members', Math.trunc(Number(e.target.value)) || 1)} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.isPrivate} onChange={(e) => set('isPrivate', e.target.checked)} />{t('privateRoom')}</label>
          <label className="block">{t('pinLabel')}
            <input className="input mt-1" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} value={f.pin} required={f.isPrivate} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.adminJoining} onChange={(e) => set('adminJoining', e.target.checked)} />{t('adminJoining')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.playersCreate} onChange={(e) => set('playersCreate', e.target.checked)} />{t('playersCreateTeams')}</label>
          <label className="block sm:col-span-2">{t('teamNames')}
            <textarea className="input mt-1" rows={3} value={f.names} onChange={(e) => set('names', e.target.value)} />
          </label>
          <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || !f.story} type="submit">{t('newRoom')}</button></div>
        </form>
      )}
      {rooms === null ? <p role="status">{t('loading')}</p> : rooms.length === 0 ? <p className="opacity-70">{t('noRooms')}</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rooms.map((r) => (
            <li key={r.id}><Link to={`/admin/rooms/${r.id}`} className="card block hover:border-gold-500">
              <div className="font-semibold">{r.code}</div>
              <div className="text-sm opacity-70">{r.settings_snapshot.story.title} · {r.status}</div>
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  )
}
