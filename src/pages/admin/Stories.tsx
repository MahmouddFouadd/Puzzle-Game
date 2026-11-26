import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useI18n } from '../../lib/i18n'
import { createStory, listStories } from '../../stories/api'
import { errorKey } from '../../stories/errors'
import type { Story } from '../../stories/types'
import { setStoryPlayerSelectable, storyAvailability } from '../../rooms/api'

export default function Stories() {
  const { t } = useI18n()
  const { session } = useAuth()
  const nav = useNavigate()
  const [stories, setStories] = useState<Story[] | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [avail, setAvail] = useState<Record<string, boolean>>({})

  useEffect(() => {
    listStories().then(setStories).catch((e) => { setError(t(errorKey(e))); setStories([]) })
    storyAvailability().then(setAvail).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !title.trim()) return
    setBusy(true); setError(null)
    try { const s = await createStory(title.trim(), session.user.id); nav(`/admin/stories/${s.id}`) }
    catch (err) { setError(t(errorKey(err))); setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-3xl">{t('stories')}</h2>
      <form onSubmit={submit} className="card flex gap-2 flex-wrap">
        <input className="input flex-1 min-w-[12rem]" placeholder={t('storyTitle')} aria-label={t('storyTitle')} maxLength={120}
          value={title} onChange={(e) => setTitle(e.target.value)} required />
        <button className="btn-primary" disabled={busy} type="submit">{t('create')}</button>
      </form>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {stories === null ? <p role="status">{t('loading')}</p> : stories.length === 0 ? <p className="opacity-70">{t('noStories')}</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {stories.map((s) => (
            <li key={s.id} className="card flex items-center gap-3 hover:border-gold-500">
              <Link to={`/admin/stories/${s.id}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.title}</div>
                <div className="text-sm opacity-70">{s.status} · {s.language.toUpperCase()}</div>
              </Link>
              {s.status === 'PUBLISHED' && (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs" title="Players may pick this story when they create their own room">
                  <input type="checkbox" className="h-5 w-5 accent-[#c9962b]" checked={!!avail[s.id]}
                    onChange={(e) => { const on = e.target.checked; setAvail((a) => ({ ...a, [s.id]: on })); setStoryPlayerSelectable(s.id, on).catch((err) => { setAvail((a) => ({ ...a, [s.id]: !on })); setError(t(errorKey(err))) }) }} />
                  <span>متاحة لغرف اللاعبين<br /><span className="opacity-60">Player rooms</span></span>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
